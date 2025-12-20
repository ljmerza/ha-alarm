from __future__ import annotations

from django.utils import timezone
from django.urls import reverse
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from accounts.models import UserCode
from alarm.models import AlarmSettingsProfile, AlarmState, Entity, Rule, Sensor


class AlarmApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="api@example.com", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.code_value = "1234"
        self.code = UserCode.objects.create(
            user=self.user,
            code_hash=make_password(self.code_value),
            label="Test Code",
            code_type=UserCode.CodeType.PERMANENT,
            pin_length=len(self.code_value),
            is_active=True,
        )
        AlarmSettingsProfile.objects.create(
            name="Default",
            is_active=True,
            delay_time=5,
            arming_time=5,
            trigger_time=5,
            code_arm_required=True,
        )

    def test_get_state_bootstraps(self):
        url = reverse("alarm-state")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["current_state"], AlarmState.DISARMED)

    def test_arm_requires_valid_state(self):
        url = reverse("alarm-arm")
        response = self.client.post(url, data={"target_state": "invalid"})
        self.assertEqual(response.status_code, 400)

    def test_arm_requires_code_when_configured(self):
        url = reverse("alarm-arm")
        response = self.client.post(url, data={"target_state": AlarmState.ARMED_AWAY})
        self.assertEqual(response.status_code, 400)

    def test_arm_rejects_invalid_code(self):
        url = reverse("alarm-arm")
        response = self.client.post(
            url,
            data={"target_state": AlarmState.ARMED_AWAY, "code": "9999"},
        )
        self.assertEqual(response.status_code, 401)

    def test_arm_to_arming(self):
        url = reverse("alarm-arm")
        response = self.client.post(
            url,
            data={"target_state": AlarmState.ARMED_AWAY, "code": self.code_value},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["current_state"], AlarmState.ARMING)

    def test_disarm_requires_code(self):
        url = reverse("alarm-disarm")
        response = self.client.post(url, data={})
        self.assertEqual(response.status_code, 400)

    def test_disarm_rejects_invalid_code(self):
        url = reverse("alarm-disarm")
        response = self.client.post(url, data={"code": "9999"})
        self.assertEqual(response.status_code, 401)

    def test_temporary_code_not_active_yet_is_rejected(self):
        url = reverse("alarm-disarm")
        self.code.code_type = UserCode.CodeType.TEMPORARY
        self.code.start_at = timezone.now() + timezone.timedelta(hours=1)
        self.code.save(update_fields=["code_type", "start_at"])

        response = self.client.post(url, data={"code": self.code_value})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Code is not active yet.")

    def test_update_sensor(self):
        sensor = Sensor.objects.create(
            name="Front Door",
            entity_id="binary_sensor.front_door",
            is_active=True,
            is_entry_point=True,
        )

        url = reverse("alarm-sensor-detail", args=[sensor.id])
        response = self.client.patch(url, data={"is_entry_point": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["is_entry_point"], False)

        sensor.refresh_from_db()
        self.assertEqual(sensor.is_entry_point, False)

    def test_rules_crud(self):
        url = reverse("alarm-rules")
        payload = {
            "name": "Trigger if door open",
            "kind": "trigger",
            "enabled": True,
            "priority": 10,
            "schema_version": 1,
            "definition": {"when": {"op": "entity_state", "entity_id": "binary_sensor.front_door", "equals": "on"}},
            "entity_ids": ["binary_sensor.front_door"],
        }
        response = self.client.post(url, data=payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], payload["name"])
        self.assertEqual(response.data["kind"], payload["kind"])
        self.assertEqual(response.data["entity_ids"], ["binary_sensor.front_door"])

        self.assertTrue(Rule.objects.filter(id=response.data["id"]).exists())
        self.assertTrue(Entity.objects.filter(entity_id="binary_sensor.front_door").exists())

        detail_url = reverse("alarm-rule-detail", args=[response.data["id"]])
        response = self.client.patch(detail_url, data={"enabled": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["enabled"], False)

        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, 204)

    def test_rules_run_endpoint_fires_immediate_rule(self):
        AlarmSettingsProfile.objects.all().delete()
        AlarmSettingsProfile.objects.create(
            name="Default",
            is_active=True,
            delay_time=5,
            arming_time=0,
            trigger_time=5,
            code_arm_required=False,
        )

        Entity.objects.create(
            entity_id="binary_sensor.front_door",
            domain="binary_sensor",
            name="Front door",
            last_state="on",
        )

        Rule.objects.create(
            name="Disarm when door is on",
            kind="disarm",
            enabled=True,
            priority=1,
            schema_version=1,
            cooldown_seconds=None,
            definition={
                "when": {"op": "entity_state", "entity_id": "binary_sensor.front_door", "equals": "on"},
                "then": [{"type": "alarm_disarm"}],
            },
        )

        # Put alarm into an armed state so disarm changes something.
        from alarm import services

        services.arm(target_state=AlarmState.ARMED_AWAY, user=self.user)
        snapshot = services.timer_expired()
        self.assertEqual(snapshot.current_state, AlarmState.ARMED_AWAY)

        url = reverse("alarm-rules-run")
        response = self.client.post(url, data={}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data["evaluated"], 1)
        self.assertGreaterEqual(response.data["fired"], 1)

        snapshot = services.get_current_snapshot(process_timers=False)
        self.assertEqual(snapshot.current_state, AlarmState.DISARMED)

    def test_rules_simulate_endpoint(self):
        Rule.objects.create(
            name="Match door on",
            kind="trigger",
            enabled=True,
            priority=1,
            schema_version=1,
            definition={
                "when": {"op": "entity_state", "entity_id": "binary_sensor.front_door", "equals": "on"},
                "then": [{"type": "alarm_trigger"}],
            },
        )

        url = reverse("alarm-rules-simulate")
        response = self.client.post(
            url,
            data={"entity_states": {"binary_sensor.front_door": "on"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["evaluated"], 1)
        self.assertEqual(response.data["summary"]["matched"], 1)
