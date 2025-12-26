from __future__ import annotations

import json
import logging
import ssl
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, TypedDict
from urllib.parse import urlparse

from django.conf import settings as django_settings
from django.db import close_old_connections
from django.utils import timezone as dj_timezone


class ZwavejsGatewayError(RuntimeError):
    pass


class ZwavejsNotConfigured(ZwavejsGatewayError):
    pass


class ZwavejsNotReachable(ZwavejsGatewayError):
    def __init__(self, error: str | None = None):
        self.error = error
        super().__init__(error or "Z-Wave JS server is not reachable.")


class ZwavejsClientUnavailable(ZwavejsGatewayError):
    pass


class ZwavejsNotConnected(ZwavejsGatewayError):
    pass


class ZwavejsCommandNotAllowed(ZwavejsGatewayError):
    pass


class ZwavejsCommandValidationError(ZwavejsGatewayError):
    pass


class ZwavejsCommandError(ZwavejsGatewayError):
    pass


class ZwavejsConnectionSettings(TypedDict, total=False):
    enabled: bool
    ws_url: str
    api_token: str
    connect_timeout_seconds: float
    reconnect_min_seconds: int
    reconnect_max_seconds: int


@dataclass(frozen=True)
class ZwavejsConnectionStatus:
    configured: bool
    enabled: bool
    connected: bool
    last_connect_at: datetime | None = None
    last_disconnect_at: datetime | None = None
    last_error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "configured": self.configured,
            "enabled": self.enabled,
            "connected": self.connected,
            "last_connect_at": self.last_connect_at.isoformat() if self.last_connect_at else None,
            "last_disconnect_at": self.last_disconnect_at.isoformat() if self.last_disconnect_at else None,
            "last_error": self.last_error,
        }


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_configured(settings_obj: ZwavejsConnectionSettings) -> bool:
    ws_url = (settings_obj.get("ws_url") or "").strip()
    if not ws_url:
        return False
    parsed = urlparse(ws_url)
    return parsed.scheme in {"ws", "wss"} and bool(parsed.hostname)


def _is_testing_disabled() -> bool:
    # Mirror the HA approach (ADR 0010): disable external integration during tests by default.
    return bool(getattr(django_settings, "IS_TESTING", False)) and not bool(
        getattr(django_settings, "ALLOW_ZWAVEJS_IN_TESTS", False)
    )


def _import_websocket_client():
    try:
        import websocket  # type: ignore[import-not-found]

        return websocket
    except Exception:
        return None


def _validate_ws_url(ws_url: str) -> None:
    parsed = urlparse(ws_url)
    if parsed.scheme not in {"ws", "wss"}:
        raise ZwavejsNotConfigured("Z-Wave JS ws_url must start with ws:// or wss://.")
    if not parsed.hostname:
        raise ZwavejsNotConfigured("Z-Wave JS ws_url must include a hostname.")


def _backoff_seconds(*, attempt: int, min_seconds: int, max_seconds: int) -> float:
    if min_seconds < 0:
        min_seconds = 0
    if max_seconds < 0:
        max_seconds = 0
    if max_seconds and min_seconds and max_seconds < min_seconds:
        max_seconds = min_seconds

    # Exponential backoff, capped.
    sleep_s = float(min_seconds) * (2 ** min(attempt, 10))
    return float(min(max_seconds or sleep_s, max(min_seconds, sleep_s)))


class ZwavejsConnectionManager:
    """
    Minimal Z-Wave JS Server connection manager (v1).

    - Keeps a best-effort long-lived WebSocket connection when enabled.
    - Provides a separate `test_connection` for onboarding validation.
    - Avoids hard dependency on `websocket-client` at import time; reports a clear error if missing.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._settings: ZwavejsConnectionSettings = {}
        self._connected = False
        self._last_connect_at: datetime | None = None
        self._last_disconnect_at: datetime | None = None
        self._last_error: str | None = None
        self._logger = logging.getLogger(__name__)
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._ws_app = None
        self._send_lock = threading.Lock()
        self._pending_results: dict[str, dict[str, Any]] = {}
        self._pending_cond = threading.Condition(self._lock)
        self._waiting_message_ids: set[str] = set()
        self._home_id: int | None = None

    def get_status(self) -> ZwavejsConnectionStatus:
        with self._lock:
            settings_obj = dict(self._settings)
            return ZwavejsConnectionStatus(
                configured=_is_configured(settings_obj),
                enabled=bool(settings_obj.get("enabled")),
                connected=self._connected,
                last_connect_at=self._last_connect_at,
                last_disconnect_at=self._last_disconnect_at,
                last_error=self._last_error,
            )

    def apply_settings(self, *, settings_obj: ZwavejsConnectionSettings) -> None:
        with self._lock:
            if dict(self._settings) == dict(settings_obj):
                return
            self._settings = dict(settings_obj)

        if not settings_obj.get("enabled"):
            self._disconnect()
            return
        if not _is_configured(settings_obj):
            self._set_error("Z-Wave JS is enabled but ws_url is not configured.")
            self._disconnect()
            return
        if _is_testing_disabled():
            self._set_error("Z-Wave JS integration is disabled during tests.")
            self._disconnect()
            return

        self._ensure_thread_running()

    def ensure_connected(self, *, timeout_seconds: float = 5.0) -> None:
        deadline = time.time() + float(timeout_seconds)
        while time.time() < deadline:
            status = self.get_status()
            if status.connected:
                return
            time.sleep(0.05)
        raise ZwavejsNotReachable("Timed out waiting for Z-Wave JS connection.")

    def get_home_id(self) -> int | None:
        with self._lock:
            return self._home_id

    def test_connection(self, *, settings_obj: ZwavejsConnectionSettings, timeout_seconds: float | None = None) -> None:
        if _is_testing_disabled():
            raise ZwavejsNotReachable("Z-Wave JS integration is disabled during tests.")

        if not _is_configured(settings_obj):
            raise ZwavejsNotConfigured("Z-Wave JS ws_url is required and must start with ws:// or wss://.")

        websocket = _import_websocket_client()
        if websocket is None:
            raise ZwavejsClientUnavailable("WebSocket client library not installed (missing `websocket-client`).")

        ws_url = (settings_obj.get("ws_url") or "").strip()
        _validate_ws_url(ws_url)

        timeout = float(timeout_seconds or settings_obj.get("connect_timeout_seconds") or 5)
        try:
            ws = websocket.create_connection(
                ws_url,
                timeout=timeout,
                enable_multithread=True,
                sslopt={"cert_reqs": ssl.CERT_REQUIRED} if ws_url.startswith("wss://") else None,
            )
        except Exception as exc:
            raise ZwavejsNotReachable(str(exc)) from exc

        try:
            # zwave-js-server sends a `version` message immediately after connect.
            ws.settimeout(timeout)
            ws.recv()
        except Exception as exc:
            raise ZwavejsNotReachable(str(exc)) from exc
        finally:
            try:
                ws.close()
            except Exception:
                pass

    def _set_error(self, error: str | None) -> None:
        with self._lock:
            self._last_error = error

    def _disconnect(self) -> None:
        self._stop_event.set()
        thread = None
        ws_app = None
        with self._lock:
            thread = self._thread
            ws_app = self._ws_app
            self._thread = None
            self._ws_app = None
            self._pending_results.clear()
            self._waiting_message_ids.clear()
            was_connected = self._connected
            self._connected = False
            self._last_disconnect_at = _now() if was_connected else self._last_disconnect_at

        if ws_app is not None:
            try:
                ws_app.close()
            except Exception:
                pass
        if thread is not None and thread.is_alive():
            thread.join(timeout=2)
        self._stop_event.clear()

    def _ensure_thread_running(self) -> None:
        websocket = _import_websocket_client()
        if websocket is None:
            self._set_error("WebSocket client library not installed (missing `websocket-client`).")
            self._disconnect()
            return

        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop_event.clear()
            thread = threading.Thread(target=self._run_loop, name="zwavejs-connection", daemon=True)
            self._thread = thread
        thread.start()

    def _run_loop(self) -> None:
        websocket = _import_websocket_client()
        if websocket is None:
            return

        attempt = 0
        while not self._stop_event.is_set():
            with self._lock:
                settings_obj = dict(self._settings)
            if not settings_obj.get("enabled"):
                return

            ws_url = (settings_obj.get("ws_url") or "").strip()
            if not ws_url:
                self._set_error("Z-Wave JS ws_url is not configured.")
                return
            try:
                _validate_ws_url(ws_url)
            except ZwavejsNotConfigured as exc:
                self._set_error(str(exc))
                return

            reconnect_min = int(settings_obj.get("reconnect_min_seconds") or 1)
            reconnect_max = int(settings_obj.get("reconnect_max_seconds") or 30)
            timeout = float(settings_obj.get("connect_timeout_seconds") or 5)

            def on_open(_ws):
                with self._lock:
                    self._connected = True
                    self._last_connect_at = _now()
                    self._last_error = None

                # Initialize and start listening so the server streams state/events.
                try:
                    # Use schemaVersion 14 so we can use node.get_value and controller.get_state.
                    self._send_no_wait({"command": "initialize", "schemaVersion": 14})
                    self._send_no_wait({"command": "start_listening"})
                except Exception as exc:
                    self._logger.warning("Z-Wave JS init/listen send failed: %s: %s", exc.__class__.__name__, str(exc))

            def on_message(_ws, message: str):
                try:
                    data = json.loads(message)
                except Exception:
                    return
                if not isinstance(data, dict):
                    return
                if data.get("type") == "version":
                    home_id = data.get("homeId")
                    if isinstance(home_id, int):
                        with self._lock:
                            self._home_id = home_id
                    return
                if data.get("type") == "result":
                    message_id = data.get("messageId")
                    if isinstance(message_id, str):
                        with self._pending_cond:
                            if message_id in self._waiting_message_ids:
                                self._pending_results[message_id] = data
                                self._pending_cond.notify_all()
                    return
                if data.get("type") == "event":
                    self._handle_event(data)
                    return

            def on_error(_ws, error):
                self._set_error(str(error))

            def on_close(_ws, close_status_code, close_msg):
                with self._lock:
                    self._connected = False
                    self._last_disconnect_at = _now()
                    if close_msg:
                        self._last_error = str(close_msg)

            ws_app = websocket.WebSocketApp(
                ws_url,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
            )

            with self._lock:
                self._ws_app = ws_app

            try:
                # Some websocket-client versions include `reconnect` arg; tolerate both.
                try:
                    ws_app.run_forever(
                        ping_interval=30,
                        ping_timeout=10,
                        sslopt={"cert_reqs": ssl.CERT_REQUIRED} if ws_url.startswith("wss://") else None,
                        reconnect=0,
                    )
                except TypeError:
                    ws_app.run_forever(
                        ping_interval=30,
                        ping_timeout=10,
                        sslopt={"cert_reqs": ssl.CERT_REQUIRED} if ws_url.startswith("wss://") else None,
                    )
            except Exception as exc:
                self._set_error(str(exc))
            finally:
                with self._lock:
                    self._ws_app = None
                    self._connected = False
                    self._last_disconnect_at = _now()

            if self._stop_event.is_set():
                return

            time.sleep(_backoff_seconds(attempt=attempt, min_seconds=reconnect_min, max_seconds=reconnect_max))
            attempt += 1

    def _send_no_wait(self, body: dict[str, Any]) -> None:
        ws_app = None
        with self._lock:
            ws_app = self._ws_app
        if ws_app is None:
            raise ZwavejsNotConnected("Not connected to Z-Wave JS server.")

        payload = dict(body)
        payload["messageId"] = str(uuid.uuid4())
        text = json.dumps(payload)
        with self._send_lock:
            ws_app.send(text)

    def _send_command(self, body: dict[str, Any], *, timeout_seconds: float = 5.0) -> dict[str, Any]:
        ws_app = None
        connected = False
        with self._lock:
            ws_app = self._ws_app
            connected = self._connected
        if ws_app is None or not connected:
            raise ZwavejsNotConnected("Not connected to Z-Wave JS server.")

        message_id = str(uuid.uuid4())
        payload = dict(body)
        payload["messageId"] = message_id
        text = json.dumps(payload)

        with self._pending_cond:
            self._waiting_message_ids.add(message_id)

        with self._send_lock:
            try:
                ws_app.send(text)
            except Exception as exc:
                with self._pending_cond:
                    self._waiting_message_ids.discard(message_id)
                raise ZwavejsCommandError(str(exc)) from exc

        deadline = time.time() + float(timeout_seconds)
        with self._pending_cond:
            while time.time() < deadline:
                if message_id in self._pending_results:
                    self._waiting_message_ids.discard(message_id)
                    return self._pending_results.pop(message_id)
                remaining = max(0.0, deadline - time.time())
                self._pending_cond.wait(timeout=min(0.2, remaining))

            self._waiting_message_ids.discard(message_id)
        raise ZwavejsCommandError("Timed out waiting for command result.")

    def controller_get_state(self, *, timeout_seconds: float = 5.0) -> dict[str, Any]:
        result = self._send_command({"command": "controller.get_state"}, timeout_seconds=timeout_seconds)
        if not bool(result.get("success", True)):
            raise ZwavejsCommandError(str(result.get("error") or "controller.get_state failed."))
        out = result.get("result")
        return out if isinstance(out, dict) else {}

    def node_get_defined_value_ids(self, *, node_id: int, timeout_seconds: float = 5.0) -> list[dict[str, Any]]:
        result = self._send_command({"command": "node.get_defined_value_ids", "nodeId": node_id}, timeout_seconds=timeout_seconds)
        if not bool(result.get("success", True)):
            raise ZwavejsCommandError(str(result.get("error") or "node.get_defined_value_ids failed."))
        out = result.get("result")
        ids = out.get("valueIds") if isinstance(out, dict) else None
        return ids if isinstance(ids, list) else []

    def node_get_value_metadata(self, *, node_id: int, value_id: dict[str, Any], timeout_seconds: float = 5.0) -> dict[str, Any]:
        result = self._send_command(
            {"command": "node.get_value_metadata", "nodeId": node_id, "valueId": value_id},
            timeout_seconds=timeout_seconds,
        )
        if not bool(result.get("success", True)):
            raise ZwavejsCommandError(str(result.get("error") or "node.get_value_metadata failed."))
        out = result.get("result")
        meta = out.get("metadata") if isinstance(out, dict) else None
        return meta if isinstance(meta, dict) else {}

    def node_get_value(self, *, node_id: int, value_id: dict[str, Any], timeout_seconds: float = 5.0) -> object:
        result = self._send_command(
            {"command": "node.get_value", "nodeId": node_id, "valueId": value_id},
            timeout_seconds=timeout_seconds,
        )
        if not bool(result.get("success", True)):
            raise ZwavejsCommandError(str(result.get("error") or "node.get_value failed."))
        out = result.get("result")
        return out.get("value") if isinstance(out, dict) and "value" in out else None

    def _handle_event(self, data: dict[str, Any]) -> None:
        """
        Best-effort: translate node value updates into Entity.last_state updates.
        """

        event_obj = data.get("event")
        if not isinstance(event_obj, dict):
            return
        if event_obj.get("source") != "node":
            return

        node_id = event_obj.get("nodeId")
        if not isinstance(node_id, int):
            return

        args = event_obj.get("args")
        value_id = None
        if isinstance(args, dict) and isinstance(args.get("valueId"), dict):
            value_id = args.get("valueId")
        elif isinstance(event_obj.get("valueId"), dict):
            value_id = event_obj.get("valueId")
        if not isinstance(value_id, dict):
            return

        # Try a few common shapes for the updated value.
        value = None
        if isinstance(args, dict) and "newValue" in args:
            value = args.get("newValue")
        elif isinstance(args, dict) and "value" in args:
            value = args.get("value")
        elif "value" in event_obj:
            value = event_obj.get("value")

        # Avoid DB writes for events without a value.
        if value is None:
            return

        home_id = self.get_home_id() or 0
        entity_id = build_zwavejs_entity_id(home_id=home_id, node_id=node_id, value_id=value_id)
        domain = infer_entity_domain(value=value)
        last_state = normalize_entity_state(value=value)

        from alarm.models import Entity  # local import to avoid import cycles

        close_old_connections()
        now = dj_timezone.now()
        Entity.objects.update_or_create(
            entity_id=entity_id,
            defaults={
                "domain": domain,
                "name": entity_id,
                "last_state": last_state,
                "last_changed": now,
                "last_seen": now,
                "attributes": {
                    "zwavejs": {
                        "home_id": home_id,
                        "node_id": node_id,
                        "value_id": value_id,
                        "event": event_obj.get("event"),
                    }
                },
                "source": "zwavejs",
            },
        )


def build_zwavejs_entity_id(*, home_id: int, node_id: int, value_id: dict[str, Any]) -> str:
    command_class = value_id.get("commandClass")
    endpoint = value_id.get("endpoint", 0)
    prop = value_id.get("property")
    prop_key = value_id.get("propertyKey", "-")
    return f"zwavejs:{home_id}:{node_id}:{endpoint}:{command_class}:{prop}:{prop_key}"


def normalize_entity_state(*, value: object) -> str | None:
    if isinstance(value, bool):
        return "on" if value else "off"
    if value is None:
        return None
    return str(value)


def infer_entity_domain(*, value: object) -> str:
    if isinstance(value, bool):
        return "binary_sensor"
    if isinstance(value, (int, float)):
        return "sensor"
    return "sensor"

    # Commands (v1 API): validation/allowlist now; transport later.
    def lock(self, *, node_id: int) -> None:
        self._ensure_command_allowed("lock")
        if not isinstance(node_id, int) or node_id <= 0:
            raise ZwavejsCommandValidationError("node_id must be a positive integer.")
        raise ZwavejsCommandValidationError("lock/unlock are not implemented yet; use set_value with the correct valueId.")

    def unlock(self, *, node_id: int) -> None:
        self._ensure_command_allowed("unlock")
        if not isinstance(node_id, int) or node_id <= 0:
            raise ZwavejsCommandValidationError("node_id must be a positive integer.")
        raise ZwavejsCommandValidationError("lock/unlock are not implemented yet; use set_value with the correct valueId.")

    def set_value(
        self,
        *,
        node_id: int,
        endpoint: int,
        command_class: int,
        property: str | int,
        value: object,
        property_key: str | int | None = None,
    ) -> None:
        self._ensure_command_allowed("set_value")
        if not isinstance(node_id, int) or node_id <= 0:
            raise ZwavejsCommandValidationError("node_id must be a positive integer.")
        if not isinstance(endpoint, int) or endpoint < 0:
            raise ZwavejsCommandValidationError("endpoint must be an integer >= 0.")
        if not isinstance(command_class, int) or command_class <= 0:
            raise ZwavejsCommandValidationError("command_class must be a positive integer.")
        if not isinstance(property, (str, int)):
            raise ZwavejsCommandValidationError("property must be a string or number.")
        if isinstance(property, str) and not property.strip():
            raise ZwavejsCommandValidationError("property must be a non-empty string.")
        # `value` is intentionally untyped; zwave-js-server accepts multiple types.
        with self._lock:
            timeout = float(self._settings.get("connect_timeout_seconds") or 5)

        value_id: dict[str, Any] = {
            "commandClass": command_class,
            "endpoint": endpoint,
            "property": property,
        }
        if property_key is not None:
            value_id["propertyKey"] = property_key

        result = self._send_command(
            {
                "command": "node.set_value",
                "nodeId": node_id,
                "valueId": value_id,
                "value": value,
            },
            timeout_seconds=timeout,
        )
        if not bool(result.get("success", True)):
            raise ZwavejsCommandError(str(result.get("error") or "Command failed."))

    def _ensure_command_allowed(self, command: str) -> None:
        allowed = {"lock", "unlock", "set_value"}
        if command not in allowed:
            raise ZwavejsCommandNotAllowed(f"Command not allowed: {command}")


zwavejs_connection_manager = ZwavejsConnectionManager()
