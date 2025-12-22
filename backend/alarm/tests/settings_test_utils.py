from __future__ import annotations

from alarm.models import AlarmSettingsEntry, AlarmSettingsProfile
from alarm.settings_registry import ALARM_PROFILE_SETTINGS_BY_KEY


def set_profile_setting(profile: AlarmSettingsProfile, key: str, value):
    definition = ALARM_PROFILE_SETTINGS_BY_KEY[key]
    AlarmSettingsEntry.objects.update_or_create(
        profile=profile,
        key=key,
        defaults={"value_type": definition.value_type, "value": value},
    )
    if hasattr(profile, "_settings_cache"):
        delattr(profile, "_settings_cache")


def set_profile_settings(profile: AlarmSettingsProfile, **values):
    for key, value in values.items():
        set_profile_setting(profile, key, value)

