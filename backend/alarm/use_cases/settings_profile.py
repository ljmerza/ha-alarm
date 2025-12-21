from __future__ import annotations

from alarm.models import AlarmSettingsProfile, AlarmState


def ensure_active_settings_profile(*, timezone_name: str | None = None) -> AlarmSettingsProfile:
    profile = AlarmSettingsProfile.objects.filter(is_active=True).first()
    if profile:
        return profile
    existing = AlarmSettingsProfile.objects.first()
    if existing:
        existing.is_active = True
        existing.save(update_fields=["is_active"])
        return existing
    return AlarmSettingsProfile.objects.create(
        name="Default",
        is_active=True,
        delay_time=60,
        arming_time=60,
        trigger_time=120,
        disarm_after_trigger=False,
        code_arm_required=True,
        available_arming_states=[
            AlarmState.ARMED_AWAY,
            AlarmState.ARMED_HOME,
            AlarmState.ARMED_NIGHT,
            AlarmState.ARMED_VACATION,
        ],
        state_overrides={},
        audio_visual_settings={
            "beep_enabled": True,
            "countdown_display_enabled": True,
            "color_coding_enabled": True,
        },
        sensor_behavior={
            "warn_on_open_sensors": True,
            "auto_bypass_enabled": False,
            "force_arm_enabled": True,
        },
    )

