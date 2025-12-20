from __future__ import annotations

from django.urls import reverse
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from accounts.models import UserCode
from alarm.models import AlarmSettingsProfile, AlarmState


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
