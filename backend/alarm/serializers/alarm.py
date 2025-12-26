from __future__ import annotations

from rest_framework import serializers

from alarm.models import AlarmEvent, AlarmSettingsProfile, AlarmStateSnapshot
from alarm.mqtt.config import mask_mqtt_connection
from alarm.state_machine.settings import get_setting_bool, get_setting_int, get_setting_json, list_profile_setting_entries


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


class AlarmSettingsProfileMetaSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlarmSettingsProfile
        fields = (
            "id",
            "name",
            "is_active",
            "created_at",
            "updated_at",
        )


class AlarmSettingsProfileSerializer(serializers.Serializer):
    """
    Back-compat read shape: materialized from row-based settings entries.
    """

    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    delay_time = serializers.IntegerField(read_only=True)
    arming_time = serializers.IntegerField(read_only=True)
    trigger_time = serializers.IntegerField(read_only=True)
    disarm_after_trigger = serializers.BooleanField(read_only=True)
    code_arm_required = serializers.BooleanField(read_only=True)
    available_arming_states = serializers.JSONField(read_only=True)
    state_overrides = serializers.JSONField(read_only=True)
    audio_visual_settings = serializers.JSONField(read_only=True)
    sensor_behavior = serializers.JSONField(read_only=True)
    home_assistant_notify = serializers.JSONField(read_only=True)
    mqtt_connection = serializers.JSONField(read_only=True)
    home_assistant_alarm_entity = serializers.JSONField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def to_representation(self, instance: AlarmSettingsProfile):
        meta = AlarmSettingsProfileMetaSerializer(instance).data
        meta.update(
            {
                "delay_time": get_setting_int(instance, "delay_time"),
                "arming_time": get_setting_int(instance, "arming_time"),
                "trigger_time": get_setting_int(instance, "trigger_time"),
                "disarm_after_trigger": get_setting_bool(instance, "disarm_after_trigger"),
                "code_arm_required": get_setting_bool(instance, "code_arm_required"),
                "available_arming_states": get_setting_json(instance, "available_arming_states") or [],
                "state_overrides": get_setting_json(instance, "state_overrides") or {},
                "audio_visual_settings": get_setting_json(instance, "audio_visual_settings") or {},
                "sensor_behavior": get_setting_json(instance, "sensor_behavior") or {},
                "home_assistant_notify": get_setting_json(instance, "home_assistant_notify") or {},
                "mqtt_connection": mask_mqtt_connection(get_setting_json(instance, "mqtt_connection") or {}),
                "home_assistant_alarm_entity": get_setting_json(instance, "home_assistant_alarm_entity") or {},
            }
        )
        return meta


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


class AlarmSettingsEntrySerializer(serializers.Serializer):
    key = serializers.CharField()
    name = serializers.CharField(read_only=True)
    value_type = serializers.CharField(read_only=True)
    value = serializers.JSONField()
    description = serializers.CharField(read_only=True)


class AlarmSettingsProfileDetailSerializer(serializers.Serializer):
    profile = AlarmSettingsProfileMetaSerializer()
    entries = AlarmSettingsEntrySerializer(many=True)

    def to_representation(self, instance: AlarmSettingsProfile):
        return {
            "profile": AlarmSettingsProfileMetaSerializer(instance).data,
            "entries": list_profile_setting_entries(instance),
        }


class AlarmSettingsProfileUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False)

    class EntryUpdateSerializer(serializers.Serializer):
        key = serializers.CharField()
        value = serializers.JSONField()

    entries = EntryUpdateSerializer(many=True, required=False)
