from __future__ import annotations

from unittest.mock import patch

from django.test import TestCase, override_settings

from accounts.models import User
from alarm.models import AlarmSettingsProfile, AlarmState
from alarm.state_machine import transitions
from alarm.tests.settings_test_utils import set_profile_settings


class HomeAssistantStateChangeNotificationsTests(TestCase):
    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def test_sends_notification_when_enabled_and_state_selected(self):
        user = User.objects.create_user(email="notify@example.com", password="pass")
        profile = AlarmSettingsProfile.objects.create(name="Default", is_active=True)
        set_profile_settings(
            profile,
            delay_time=0,
            arming_time=0,
            trigger_time=0,
            code_arm_required=False,
            home_assistant_notify={
                "enabled": True,
                "service": "notify.notify",
                "cooldown_seconds": 0,
                "states": [AlarmState.DISARMED],
            },
        )

        with patch("alarm.tasks.ha_gateway") as mock_gateway:
            with self.captureOnCommitCallbacks(execute=True):
                transitions.arm(target_state=AlarmState.ARMED_AWAY, user=user)
                transitions.disarm(user=user)

        mock_gateway.call_service.assert_called_once()
        kwargs = mock_gateway.call_service.call_args.kwargs
        self.assertEqual(kwargs["domain"], "notify")
        self.assertEqual(kwargs["service"], "notify")
        self.assertIn("service_data", kwargs)
        self.assertEqual(kwargs["service_data"]["data"]["state_to"], AlarmState.DISARMED)

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True)
    def test_skips_notification_when_state_not_selected(self):
        user = User.objects.create_user(email="notify2@example.com", password="pass")
        profile = AlarmSettingsProfile.objects.create(name="Default", is_active=True)
        set_profile_settings(
            profile,
            delay_time=0,
            arming_time=0,
            trigger_time=0,
            code_arm_required=False,
            home_assistant_notify={
                "enabled": True,
                "service": "notify.notify",
                "cooldown_seconds": 0,
                "states": [],
            },
        )

        with patch("alarm.tasks.ha_gateway") as mock_gateway:
            with self.captureOnCommitCallbacks(execute=True):
                transitions.arm(target_state=AlarmState.ARMED_AWAY, user=user)
                transitions.disarm(user=user)

        mock_gateway.call_service.assert_not_called()

