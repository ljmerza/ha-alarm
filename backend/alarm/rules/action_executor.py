from __future__ import annotations

from typing import Any, Protocol

from alarm import home_assistant, services
from alarm.models import Rule


class AlarmServices(Protocol):
    def get_current_snapshot(self, *, process_timers: bool): ...
    def disarm(self, *, user=None, code=None, reason: str = ""): ...
    def arm(self, *, target_state: str, user=None, code=None, reason: str = ""): ...
    def trigger(self, *, user=None, reason: str = ""): ...


class HomeAssistantGateway(Protocol):
    def call_service(
        self,
        *,
        domain: str,
        service: str,
        target: dict[str, Any] | None = None,
        service_data: dict[str, Any] | None = None,
    ) -> None: ...


def execute_actions(
    *,
    rule: Rule,
    actions: list[dict[str, Any]],
    now,
    actor_user=None,
    alarm_services: AlarmServices = services,
    ha: HomeAssistantGateway = home_assistant,
) -> dict[str, Any]:
    snapshot_before = alarm_services.get_current_snapshot(process_timers=True)
    alarm_state_before = snapshot_before.current_state
    action_results: list[dict[str, Any]] = []
    error_messages: list[str] = []

    for action in actions:
        if not isinstance(action, dict):
            action_results.append({"ok": False, "error": "invalid_action"})
            continue
        action_type = action.get("type")
        if action_type == "alarm_disarm":
            try:
                alarm_services.disarm(user=actor_user, reason=f"rule:{rule.id}")
                action_results.append({"ok": True, "type": "alarm_disarm"})
            except Exception as exc:  # pragma: no cover - defensive
                action_results.append({"ok": False, "type": "alarm_disarm", "error": str(exc)})
                error_messages.append(str(exc))
            continue

        if action_type == "alarm_arm":
            mode = action.get("mode")
            if not isinstance(mode, str):
                action_results.append({"ok": False, "type": "alarm_arm", "error": "missing_mode"})
                continue
            try:
                alarm_services.arm(target_state=mode, user=actor_user, reason=f"rule:{rule.id}")
                action_results.append({"ok": True, "type": "alarm_arm", "mode": mode})
            except Exception as exc:
                action_results.append({"ok": False, "type": "alarm_arm", "mode": mode, "error": str(exc)})
                error_messages.append(str(exc))
            continue

        if action_type == "alarm_trigger":
            try:
                alarm_services.trigger(user=actor_user, reason=f"rule:{rule.id}")
                action_results.append({"ok": True, "type": "alarm_trigger"})
            except Exception as exc:
                action_results.append({"ok": False, "type": "alarm_trigger", "error": str(exc)})
                error_messages.append(str(exc))
            continue

        if action_type == "ha_call_service":
            domain = action.get("domain")
            service_name = action.get("service")
            target = action.get("target")
            service_data = action.get("service_data")
            if not isinstance(domain, str) or not isinstance(service_name, str):
                action_results.append({"ok": False, "type": "ha_call_service", "error": "missing_domain_or_service"})
                continue
            try:
                ha.call_service(
                    domain=domain,
                    service=service_name,
                    target=target if isinstance(target, dict) else None,
                    service_data=service_data if isinstance(service_data, dict) else None,
                )
                action_results.append(
                    {"ok": True, "type": "ha_call_service", "domain": domain, "service": service_name}
                )
            except Exception as exc:
                action_results.append(
                    {
                        "ok": False,
                        "type": "ha_call_service",
                        "domain": domain,
                        "service": service_name,
                        "error": str(exc),
                    }
                )
                error_messages.append(str(exc))
            continue

        action_results.append({"ok": False, "type": str(action_type), "error": "unsupported_action"})

    snapshot_after = alarm_services.get_current_snapshot(process_timers=True)
    return {
        "alarm_state_before": alarm_state_before,
        "alarm_state_after": snapshot_after.current_state,
        "actions": action_results,
        "errors": error_messages,
        "timestamp": now.isoformat(),
    }
