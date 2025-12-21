from __future__ import annotations

from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User, UserCode
from alarm.models import AlarmSettingsProfile, AlarmState, AlarmStateSnapshot


class SetupStatusApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="setup@example.com", password="pass")
        self.client.force_authenticate(self.user)
        AlarmSettingsProfile.objects.create(name="Default", is_active=True)
        profile = AlarmSettingsProfile.objects.get(is_active=True)
        AlarmStateSnapshot.objects.create(
            current_state=AlarmState.DISARMED,
            previous_state=None,
            target_armed_state=None,
            settings_profile=profile,
            entered_at=timezone.now(),
            exit_at=None,
            last_transition_reason="bootstrap",
            last_transition_by=None,
            timing_snapshot={},
        )

    def test_setup_not_required_when_no_codes(self):
        url = reverse("onboarding-setup-status")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["setup_required"])
        self.assertFalse(response.data["requirements"]["has_alarm_code"])

    def test_setup_not_required_when_code_exists(self):
        UserCode.objects.create(
            user=self.user,
            code_hash="not-used-here",
            label="Test",
            code_type=UserCode.CodeType.PERMANENT,
            pin_length=4,
            is_active=True,
        )
        url = reverse("onboarding-setup-status")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["setup_required"])
        self.assertTrue(response.data["requirements"]["has_alarm_code"])

    def test_setup_required_when_missing_alarm_snapshot(self):
        AlarmStateSnapshot.objects.all().delete()
        url = reverse("onboarding-setup-status")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["setup_required"])
        self.assertFalse(response.data["requirements"]["has_alarm_snapshot"])
