from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


def _import_client():
    try:
        from homeassistant_api import Client as HomeAssistantClient  # type: ignore
    except ImportError:
        try:
            from homeassistant_api.client import Client as HomeAssistantClient  # type: ignore
        except ImportError:
            return None
    return HomeAssistantClient


@dataclass(frozen=True)
class HomeAssistantStatus:
    configured: bool
    reachable: bool
    base_url: str | None = None
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "configured": self.configured,
            "reachable": self.reachable,
            "base_url": self.base_url,
            "error": self.error,
        }


def _ha_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _build_url(path: str) -> str:
    base = (settings.HOME_ASSISTANT_URL or "").rstrip("/")
    return f"{base}{path}"


def _get_client():
    client_cls = _import_client()
    if not client_cls:
        return None
    base_url = (settings.HOME_ASSISTANT_URL or "").strip()
    token = (settings.HOME_ASSISTANT_TOKEN or "").strip()
    if not base_url or not token:
        return None
    return client_cls(base_url, token)


def get_status(*, timeout_seconds: float = 2.0) -> HomeAssistantStatus:
    base_url = (settings.HOME_ASSISTANT_URL or "").strip()
    token = (settings.HOME_ASSISTANT_TOKEN or "").strip()
    if not base_url or not token:
        return HomeAssistantStatus(configured=False, reachable=False, base_url=base_url or None)

    client = _get_client()
    if client is not None:
        try:
            client.get_config()
            return HomeAssistantStatus(configured=True, reachable=True, base_url=base_url)
        except Exception as exc:
            client_error = str(exc)
    else:
        client_error = None

    url = _build_url("/api/")
    request = Request(url, headers=_ha_headers(token), method="GET")
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            content_type = (response.headers.get("Content-Type") or "").lower()
            if 200 <= response.status < 300:
                if "application/json" not in content_type:
                    return HomeAssistantStatus(
                        configured=True,
                        reachable=False,
                        base_url=base_url,
                        error=f"Unexpected content-type from Home Assistant: {content_type or 'unknown'}",
                    )
                return HomeAssistantStatus(configured=True, reachable=True, base_url=base_url)
            return HomeAssistantStatus(
                configured=True,
                reachable=False,
                base_url=base_url,
                error=f"Unexpected status: {response.status}",
            )
    except HTTPError as exc:
        return HomeAssistantStatus(
            configured=True,
            reachable=False,
            base_url=base_url,
            error=f"HTTP {exc.code}",
        )
    except URLError as exc:
        return HomeAssistantStatus(
            configured=True,
            reachable=False,
            base_url=base_url,
            error=str(exc.reason),
        )
    except Exception as exc:  # pragma: no cover - defensive
        return HomeAssistantStatus(
            configured=True,
            reachable=False,
            base_url=base_url,
            error=str(exc) if client_error is None else f"{exc}; client_error={client_error}",
        )


def list_entities(*, timeout_seconds: float = 5.0) -> list[dict[str, Any]]:
    base_url = (settings.HOME_ASSISTANT_URL or "").strip()
    token = (settings.HOME_ASSISTANT_TOKEN or "").strip()
    if not base_url or not token:
        return []

    client = _get_client()
    if client is not None:
        try:
            states = client.get_states()
        except Exception:
            # Fall back to raw HTTP below.
            states = None
        if states is not None:
            entities: list[dict[str, Any]] = []
            for item in states:
                entity_id = getattr(item, "entity_id", None)
                state = getattr(item, "state", None)
                attributes = getattr(item, "attributes", None)
                last_changed = getattr(item, "last_changed", None)
                if not isinstance(entity_id, str) or not isinstance(state, str):
                    continue
                if not isinstance(attributes, dict):
                    attributes = {}
                domain = entity_id.split(".", 1)[0] if "." in entity_id else "unknown"
                entities.append(
                    {
                        "entity_id": entity_id,
                        "domain": domain,
                        "state": state,
                        "name": attributes.get("friendly_name") or entity_id,
                        "device_class": attributes.get("device_class"),
                        "unit_of_measurement": attributes.get("unit_of_measurement"),
                        "last_changed": last_changed,
                    }
                )
            return entities

    url = _build_url("/api/states")
    request = Request(url, headers=_ha_headers(token), method="GET")
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            content_type = (response.headers.get("Content-Type") or "").lower()
            raw = response.read().decode("utf-8")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"Home Assistant returned non-JSON response (content-type: {content_type or 'unknown'})."
            ) from exc
    except HTTPError as exc:
        raise RuntimeError(f"Home Assistant returned HTTP {exc.code}.") from exc
    except URLError as exc:
        raise RuntimeError(f"Home Assistant request failed: {exc.reason}") from exc
    if not isinstance(payload, list):
        return []

    entities: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        entity_id = item.get("entity_id")
        state = item.get("state")
        attributes = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
        if not isinstance(entity_id, str) or not isinstance(state, str):
            continue

        domain = entity_id.split(".", 1)[0] if "." in entity_id else "unknown"
        entities.append(
            {
                "entity_id": entity_id,
                "domain": domain,
                "state": state,
                "name": attributes.get("friendly_name") or entity_id,
                "device_class": attributes.get("device_class"),
                "unit_of_measurement": attributes.get("unit_of_measurement"),
                "last_changed": item.get("last_changed"),
            }
        )
    return entities


def call_service(
    *,
    domain: str,
    service: str,
    target: dict[str, Any] | None = None,
    service_data: dict[str, Any] | None = None,
    timeout_seconds: float = 5.0,
) -> None:
    base_url = (settings.HOME_ASSISTANT_URL or "").strip()
    token = (settings.HOME_ASSISTANT_TOKEN or "").strip()
    if not base_url or not token:
        raise RuntimeError("Home Assistant is not configured.")

    payload: dict[str, Any] = {}
    if target:
        payload["target"] = target
    if service_data:
        payload["service_data"] = service_data

    client = _get_client()
    if client is not None:
        try:
            client.call_service(domain, service, **payload)
            return
        except Exception:
            # Fall back to raw HTTP below.
            pass

    url = _build_url(f"/api/services/{domain}/{service}")
    request = Request(url, headers=_ha_headers(token), method="POST", data=json.dumps(payload).encode("utf-8"))
    with urlopen(request, timeout=timeout_seconds) as response:
        if not (200 <= response.status < 300):
            raise RuntimeError(f"Unexpected status: {response.status}")
