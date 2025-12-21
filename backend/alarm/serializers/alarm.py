from __future__ import annotations

from rest_framework import serializers

from alarm.models import AlarmEvent, AlarmSettingsProfile, AlarmStateSnapshot


class AlarmStateSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlarmStateSnapshot
        fields = (
            "id",
            "current_state",
            "previous_state",
            "target_armed_state",
            "settings_profile",
            "entered_at",
            "exit_at",
            "last_transition_reason",
            "last_transition_by",
            "timing_snapshot",
        )


class AlarmSettingsProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlarmSettingsProfile
        fields = (
            "id",
            "name",
            "is_active",
            "delay_time",
            "arming_time",
            "trigger_time",
            "disarm_after_trigger",
            "code_arm_required",
            "available_arming_states",
            "state_overrides",
            "audio_visual_settings",
            "sensor_behavior",
            "created_at",
            "updated_at",
        )


class AlarmEventSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(allow_null=True, read_only=True)
    code_id = serializers.IntegerField(allow_null=True, read_only=True)
    sensor_id = serializers.IntegerField(allow_null=True, read_only=True)

    class Meta:
        model = AlarmEvent
        fields = (
            "id",
            "event_type",
            "state_from",
            "state_to",
            "timestamp",
            "user_id",
            "code_id",
            "sensor_id",
            "metadata",
        )

