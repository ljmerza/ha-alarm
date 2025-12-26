from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from typing import Any, TypedDict


class MqttGatewayError(RuntimeError):
    pass


class MqttNotConfigured(MqttGatewayError):
    pass


class MqttNotReachable(MqttGatewayError):
    def __init__(self, error: str | None = None):
        self.error = error
        super().__init__(error or "MQTT broker is not reachable.")


class MqttClientUnavailable(MqttGatewayError):
    pass


class MqttPublishError(MqttGatewayError):
    pass


class MqttSubscribeError(MqttGatewayError):
    pass


class MqttConnectionSettings(TypedDict, total=False):
    enabled: bool
    host: str
    port: int
    username: str
    password: str
    use_tls: bool
    tls_insecure: bool
    client_id: str
    keepalive_seconds: int
    connect_timeout_seconds: float


@dataclass(frozen=True)
class MqttConnectionStatus:
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


def _is_configured(settings: MqttConnectionSettings) -> bool:
    return bool(settings.get("host")) and bool(settings.get("port"))


class MqttConnectionManager:
    """
    Minimal MQTT connection manager (v1).

    - Keeps a best-effort long-lived connection when enabled.
    - Provides a separate `test_connection` for onboarding validation.
    - Avoids hard dependency on `paho-mqtt` at import time; reports a clear status error if missing.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._client = None
        self._settings: MqttConnectionSettings = {}
        self._connected = False
        self._last_connect_at: datetime | None = None
        self._last_disconnect_at: datetime | None = None
        self._last_error: str | None = None
        self._subscriptions: dict[str, tuple[int, callable]] = {}
        self._on_connect_hooks: list[callable] = []
        self._logger = logging.getLogger(__name__)

    def get_status(self) -> MqttConnectionStatus:
        with self._lock:
            settings = dict(self._settings)
            return MqttConnectionStatus(
                configured=_is_configured(settings),
                enabled=bool(settings.get("enabled")),
                connected=self._connected,
                last_connect_at=self._last_connect_at,
                last_disconnect_at=self._last_disconnect_at,
                last_error=self._last_error,
            )

    def apply_settings(self, *, settings: MqttConnectionSettings) -> None:
        with self._lock:
            if dict(self._settings) == dict(settings):
                return
            self._settings = dict(settings)

        if not settings.get("enabled"):
            self._disconnect()
            return
        if not _is_configured(settings):
            self._set_error("MQTT is enabled but host/port are not configured.")
            self._disconnect()
            return
        self._connect(settings=settings)

    def test_connection(self, *, settings: MqttConnectionSettings, timeout_seconds: float | None = None) -> None:
        if not _is_configured(settings):
            raise MqttNotConfigured("MQTT host and port are required.")

        mqtt = self._import_paho()
        if mqtt is None:
            raise MqttClientUnavailable("MQTT client library not installed (missing `paho-mqtt`).")

        timeout = float(timeout_seconds or settings.get("connect_timeout_seconds") or 5)
        connected_evt = threading.Event()
        result: dict[str, Any] = {"rc": None, "error": None}

        client = self._build_client(mqtt=mqtt, settings=settings)

        def on_connect(_client, _userdata, _flags, rc, _properties=None):
            result["rc"] = rc
            connected_evt.set()

        def on_disconnect(_client, _userdata, rc, _properties=None):
            # ignore for test
            pass

        client.on_connect = on_connect
        client.on_disconnect = on_disconnect

        try:
            client.connect_async(settings.get("host", ""), int(settings.get("port", 1883)), int(settings.get("keepalive_seconds", 30)))
            client.loop_start()
            if not connected_evt.wait(timeout=timeout):
                raise MqttNotReachable("Timed out connecting to MQTT broker.")
            rc = result["rc"]
            try:
                rc_int = int(getattr(rc, "value", rc))
            except Exception:
                rc_int = 1
            if rc_int != 0:
                raise MqttNotReachable(f"MQTT connect failed (rc={rc_int}).")
        finally:
            try:
                client.disconnect()
            except Exception:
                pass
            try:
                client.loop_stop()
            except Exception:
                pass

    def _set_error(self, error: str | None) -> None:
        with self._lock:
            self._last_error = error

    def _disconnect(self) -> None:
        with self._lock:
            client = self._client
            self._client = None
            was_connected = self._connected
            self._connected = False
            self._last_disconnect_at = _now() if was_connected else self._last_disconnect_at

        if client is None:
            return
        try:
            client.disconnect()
        except Exception:
            pass
        try:
            client.loop_stop()
        except Exception:
            pass

    def _connect(self, *, settings: MqttConnectionSettings) -> None:
        mqtt = self._import_paho()
        if mqtt is None:
            self._set_error("MQTT client library not installed (missing `paho-mqtt`).")
            self._disconnect()
            return

        client = self._build_client(mqtt=mqtt, settings=settings)

        def on_connect(_client, _userdata, _flags, rc, _properties=None):
            try:
                rc_int = int(getattr(rc, "value", rc))
            except Exception:
                rc_int = 1
            if rc_int == 0:
                with self._lock:
                    self._connected = True
                    self._last_connect_at = _now()
                    self._last_error = None
                self._resubscribe()
                self._run_on_connect_hooks()
            else:
                with self._lock:
                    self._connected = False
                    self._last_error = f"MQTT connect failed (rc={rc_int})."

        def on_disconnect(_client, _userdata, rc, _properties=None):
            with self._lock:
                self._connected = False
                self._last_disconnect_at = _now()
                try:
                    rc_int = int(getattr(rc, "value", rc))
                except Exception:
                    rc_int = 1
                if rc_int != 0:
                    self._last_error = f"MQTT disconnected (rc={rc_int})."

        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        client.on_message = self._on_message

        # Replace any existing client
        self._disconnect()
        with self._lock:
            self._client = client

        try:
            client.connect_async(
                settings.get("host", ""),
                int(settings.get("port", 1883)),
                int(settings.get("keepalive_seconds", 30)),
            )
            client.loop_start()
        except Exception as exc:
            self._set_error(str(exc))
            self._disconnect()

    @staticmethod
    def _import_paho():
        try:
            import paho.mqtt.client as mqtt  # type: ignore[import-not-found]

            return mqtt
        except Exception:
            return None

    @staticmethod
    def _build_client(*, mqtt, settings: MqttConnectionSettings):
        client_id = str(settings.get("client_id") or "cubxi-alarm")
        try:
            client = mqtt.Client(client_id=client_id)
        except TypeError:
            client = mqtt.Client()

        username = settings.get("username") or ""
        password = settings.get("password") or ""
        if username or password:
            client.username_pw_set(username, password)

        if settings.get("use_tls"):
            client.tls_set()
            if settings.get("tls_insecure"):
                client.tls_insecure_set(True)

        # Best-effort HA availability support via LWT.
        try:
            client.will_set("cubxi_alarm/alarm/availability", payload="offline", qos=0, retain=True)
        except Exception:
            pass
        return client

    def publish(self, *, topic: str, payload: str, qos: int = 0, retain: bool = False) -> None:
        with self._lock:
            client = self._client
            connected = self._connected
        if client is None or not connected:
            raise MqttNotReachable("MQTT is not connected.")
        try:
            client.publish(topic, payload=payload, qos=qos, retain=retain)
        except Exception as exc:
            raise MqttPublishError(str(exc)) from exc

    def subscribe(self, *, topic: str, qos: int = 0, callback) -> None:
        """
        Register a subscription callback.

        The subscription will be (re)applied on every connect.
        """
        with self._lock:
            self._subscriptions[topic] = (int(qos), callback)
            client = self._client
            connected = self._connected
        if client is not None and connected:
            try:
                client.subscribe(topic, qos=qos)
            except Exception as exc:
                raise MqttSubscribeError(str(exc)) from exc

    def register_on_connect(self, callback) -> None:
        with self._lock:
            self._on_connect_hooks.append(callback)

    def _resubscribe(self) -> None:
        with self._lock:
            client = self._client
            subs = dict(self._subscriptions)
        if client is None:
            return
        for topic, (qos, _cb) in subs.items():
            try:
                client.subscribe(topic, qos=qos)
            except Exception as exc:
                self._logger.warning("MQTT subscribe failed for %s: %s", topic, exc)

    def _run_on_connect_hooks(self) -> None:
        with self._lock:
            hooks = list(self._on_connect_hooks)

        def _run():
            for hook in hooks:
                try:
                    hook()
                except Exception as exc:
                    self._logger.warning("MQTT on_connect hook failed: %s", exc)

        threading.Thread(target=_run, daemon=True).start()

    def _on_message(self, _client, _userdata, msg) -> None:
        topic = getattr(msg, "topic", "")
        payload_bytes = getattr(msg, "payload", b"")
        try:
            payload = payload_bytes.decode("utf-8", errors="replace")
        except Exception:
            payload = str(payload_bytes)

        with self._lock:
            entry = self._subscriptions.get(topic)
        if not entry:
            return
        _qos, callback = entry
        try:
            callback(topic=topic, payload=payload)
        except Exception as exc:
            self._logger.warning("MQTT message handler failed for %s: %s", topic, exc)


mqtt_connection_manager = MqttConnectionManager()
