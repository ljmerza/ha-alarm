from __future__ import annotations

from accounts.models import User, UserCode
from alarm.models import AlarmSettingsProfile, AlarmStateSnapshot, Sensor


def compute_setup_status(*, user: User) -> dict:
    has_active_settings_profile = AlarmSettingsProfile.objects.filter(is_active=True).exists()
    has_alarm_snapshot = AlarmStateSnapshot.objects.exists()
    has_alarm_code = UserCode.objects.filter(user=user, is_active=True).exists()
    has_sensors = Sensor.objects.exists()
    home_assistant_connected = False

    setup_required = not (has_alarm_code and has_active_settings_profile and has_alarm_snapshot)

    return {
        "onboarding_required": False,
        "setup_required": setup_required,
        "requirements": {
            "has_active_settings_profile": has_active_settings_profile,
            "has_alarm_snapshot": has_alarm_snapshot,
            "has_alarm_code": has_alarm_code,
            "has_sensors": has_sensors,
            "home_assistant_connected": home_assistant_connected,
        },
    }

