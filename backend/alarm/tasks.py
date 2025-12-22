from __future__ import annotations

from dataclasses import dataclass

from celery import shared_task
from django.contrib.auth import get_user_model
from django.core.cache import cache

from alarm.gateways.home_assistant import default_home_assistant_gateway
from alarm.models import AlarmSettingsProfile
from alarm.state_machine.settings import get_setting_json

ha_gateway = default_home_assistant_gateway


@dataclass(frozen=True)
class _NotifyConfig:
    enabled: bool
    service: str
    cooldown_seconds: int
    states: set[str]


def _parse_notify_config(raw: object) -> _NotifyConfig:
    if not isinstance(raw, dict):
        return _NotifyConfig(enabled=False, service="notify.notify", cooldown_seconds=0, states=set())
    enabled = bool(raw.get("enabled", False))
    service = raw.get("service") if isinstance(raw.get("service"), str) else "notify.notify"
    cooldown_seconds_raw = raw.get("cooldown_seconds", 0)
    try:
        cooldown_seconds = max(0, int(cooldown_seconds_raw))
    except (TypeError, ValueError):
        cooldown_seconds = 0
    states_raw = raw.get("states", [])
    normalized: set[str] = set()
    if isinstance(states_raw, list):
        for item in states_raw:
            if isinstance(item, str) and item:
                normalized.add(item)
    return _NotifyConfig(
        enabled=enabled,
        service=service.strip() or "notify.notify",
        cooldown_seconds=cooldown_seconds,
        states=normalized,
    )


def _split_service(service: str) -> tuple[str, str] | None:
    if not service or "." not in service:
        return None
    domain, service_name = service.split(".", 1)
    domain = domain.strip()
    service_name = service_name.strip()
    if not domain or not service_name:
        return None
    return domain, service_name


def _format_title_and_message(*, state_from: str | None, state_to: str, user_display: str | None) -> tuple[str, str]:
    prefix = "Alarm"
    if state_to == "triggered":
        title = "ALARM TRIGGERED"
        message = "Alarm triggered."
    elif state_to == "pending":
        title = "Entry delay started"
        message = "Entry delay started."
    elif state_to == "arming":
        title = "Exit delay started"
        message = "Exit delay started."
    elif state_to == "disarmed":
        title = "Alarm disarmed"
        message = "Alarm disarmed."
    elif state_to.startswith("armed_"):
        mode = state_to.replace("armed_", "").replace("_", " ").title()
        title = f"Alarm armed ({mode})"
        message = f"Alarm armed ({mode})."
    else:
        title = f"{prefix} state changed"
        message = f"Alarm state changed to {state_to}."

    if user_display:
        message = f"{message} By {user_display}."
    if state_from:
        message = f"{message} ({state_from} → {state_to})"
    return title, message


@shared_task(bind=True, autoretry_for=(), retry_backoff=False)
def send_home_assistant_state_change_notification(
    self,
    *,
    event_id: int,
    settings_profile_id: int,
    state_from: str | None,
    state_to: str,
    occurred_at_iso: str,
    user_id: str | None = None,
) -> dict[str, object]:
    try:
        profile = AlarmSettingsProfile.objects.get(id=settings_profile_id)
    except AlarmSettingsProfile.DoesNotExist:
        return {"ok": False, "skipped": True, "reason": "missing_settings_profile", "event_id": event_id}

    cfg = _parse_notify_config(get_setting_json(profile, "home_assistant_notify"))
    if not cfg.enabled:
        return {"ok": True, "skipped": True, "reason": "disabled", "event_id": event_id}

    if state_to not in cfg.states:
        return {
            "ok": True,
            "skipped": True,
            "reason": "state_not_selected",
            "event_id": event_id,
            "state_to": state_to,
        }

    if cfg.cooldown_seconds > 0:
        cooldown_key = f"ha_notify:{settings_profile_id}:{state_to}"
        if not cache.add(cooldown_key, "1", timeout=cfg.cooldown_seconds):
            return {"ok": True, "skipped": True, "reason": "cooldown", "event_id": event_id, "state_to": state_to}

    service_tuple = _split_service(cfg.service) or ("notify", "notify")
    domain, service = service_tuple

    user_display: str | None = None
    if user_id:
        User = get_user_model()
        user = User.objects.filter(id=user_id).only("email", "display_name").first()
        if user:
            user_display = getattr(user, "display_name", None) or getattr(user, "email", None) or None

    title, message = _format_title_and_message(state_from=state_from, state_to=state_to, user_display=user_display)

    try:
        ha_gateway.call_service(
            domain=domain,
            service=service,
            service_data={
                "title": title,
                "message": message,
                "data": {
                    "event_id": event_id,
                    "occurred_at": occurred_at_iso,
                    "state_from": state_from,
                    "state_to": state_to,
                },
            },
        )
    except Exception as exc:
        return {
            "ok": False,
            "skipped": False,
            "reason": "call_failed",
            "event_id": event_id,
            "error": str(exc),
        }

    return {"ok": True, "skipped": False, "event_id": event_id, "state_to": state_to}
