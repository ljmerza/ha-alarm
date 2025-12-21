from __future__ import annotations

from alarm.models import AlarmSettingsProfile

from .errors import TransitionError


def get_active_settings_profile() -> AlarmSettingsProfile:
    profile = AlarmSettingsProfile.objects.filter(is_active=True).first()
    if not profile:
        raise TransitionError("No active alarm settings profile.")
    return profile

