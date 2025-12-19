from __future__ import annotations

from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from alarm.models import AlarmSettingsProfile, AlarmState


class AlarmApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="api@example.com", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        AlarmSettingsProfile.objects.create(
            name="Default",
            is_active=True,
            delay_time=5,
            arming_time=5,
            trigger_time=5,
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

    def test_arm_to_arming(self):
        url = reverse("alarm-arm")
        response = self.client.post(url, data={"target_state": AlarmState.ARMED_AWAY})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["current_state"], AlarmState.ARMING)
