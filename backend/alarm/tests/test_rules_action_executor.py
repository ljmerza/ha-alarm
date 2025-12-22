from __future__ import annotations

from datetime import datetime, timezone as dt_timezone

from django.test import TestCase

from alarm.models import Rule
from alarm.rules.action_executor import execute_actions


class _Snapshot:
    def __init__(self, state: str):
        self.current_state = state


class _AlarmServices:
    def __init__(self):
        self.calls = []
        self._state = "disarmed"

    def get_current_snapshot(self, *, process_timers: bool):
        self.calls.append(("get_current_snapshot", process_timers))
        return _Snapshot(self._state)

    def disarm(self, *, user=None, code=None, reason: str = ""):
        self.calls.append(("disarm", user, reason))
        self._state = "disarmed"

    def arm(self, *, target_state: str, user=None, code=None, reason: str = ""):
        self.calls.append(("arm", target_state, user, reason))
        self._state = target_state

    def trigger(self, *, user=None, reason: str = ""):
        self.calls.append(("trigger", user, reason))
        self._state = "triggered"


class _HA:
    def __init__(self):
        self.calls = []

    def call_service(self, *, domain: str, service: str, target=None, service_data=None, timeout_seconds: float = 5.0) -> None:
        self.calls.append((domain, service, target, service_data, timeout_seconds))


class ActionExecutorTests(TestCase):
    def test_execute_actions_reports_invalid_and_unsupported(self):
        rule = Rule.objects.create(name="R", kind="trigger", enabled=True, priority=0, schema_version=1, definition={})
        alarm_services = _AlarmServices()
        ha = _HA()
        now = datetime(2025, 1, 1, tzinfo=dt_timezone.utc)

        result = execute_actions(
            rule=rule,
            actions=[None, {"type": "nope"}, {"type": "alarm_arm"}],
            now=now,
            alarm_services=alarm_services,
            ha=ha,
        )
        self.assertEqual(result["timestamp"], now.isoformat())
        self.assertEqual(result["actions"][0]["error"], "invalid_action")
        self.assertEqual(result["actions"][1]["error"], "unsupported_action")
        self.assertEqual(result["actions"][2]["error"], "missing_mode")

    def test_execute_actions_calls_alarm_and_ha(self):
        rule = Rule.objects.create(name="R", kind="trigger", enabled=True, priority=0, schema_version=1, definition={})
        alarm_services = _AlarmServices()
        ha = _HA()
        now = datetime(2025, 1, 1, tzinfo=dt_timezone.utc)

        result = execute_actions(
            rule=rule,
            actions=[
                {"type": "alarm_arm", "mode": "armed_home"},
                {"type": "ha_call_service", "domain": "light", "service": "turn_on", "target": {"entity_id": "light.kitchen"}},
                {"type": "alarm_trigger"},
                {"type": "alarm_disarm"},
            ],
            now=now,
            alarm_services=alarm_services,
            ha=ha,
        )
        self.assertEqual(result["alarm_state_before"], "disarmed")
        self.assertEqual(result["alarm_state_after"], "disarmed")
        self.assertEqual(len(ha.calls), 1)
        self.assertEqual(ha.calls[0][0], "light")
        self.assertEqual(ha.calls[0][1], "turn_on")

    def test_execute_actions_ha_call_service_requires_domain_and_service(self):
        rule = Rule.objects.create(name="R", kind="trigger", enabled=True, priority=0, schema_version=1, definition={})
        alarm_services = _AlarmServices()
        ha = _HA()
        now = datetime(2025, 1, 1, tzinfo=dt_timezone.utc)
        result = execute_actions(rule=rule, actions=[{"type": "ha_call_service", "domain": 1}], now=now, alarm_services=alarm_services, ha=ha)
        self.assertEqual(result["actions"][0]["error"], "missing_domain_or_service")

