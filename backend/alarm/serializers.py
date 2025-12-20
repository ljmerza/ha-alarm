from __future__ import annotations

from rest_framework import serializers

from .models import AlarmEvent, AlarmSettingsProfile, AlarmStateSnapshot, Sensor, Zone


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


class SensorSerializer(serializers.ModelSerializer):
    zone_id = serializers.IntegerField(source="zone_id", read_only=True)
    entity_id = serializers.CharField(allow_blank=True, required=False)
    current_state = serializers.SerializerMethodField()
    last_triggered = serializers.SerializerMethodField()

    class Meta:
        model = Sensor
        fields = (
            "id",
            "name",
            "zone_id",
            "entity_id",
            "is_active",
            "is_entry_point",
            "current_state",
            "last_triggered",
        )

    def get_current_state(self, obj: Sensor) -> str:
        return "unknown"

    def get_last_triggered(self, obj: Sensor):
        return None


class ZoneSerializer(serializers.ModelSerializer):
    sensors = SensorSerializer(many=True, read_only=True)
    is_bypassed = serializers.SerializerMethodField()
    bypassed_until = serializers.SerializerMethodField()

    class Meta:
        model = Zone
        fields = (
            "id",
            "name",
            "is_active",
            "entry_delay_override",
            "active_states",
            "sensors",
            "is_bypassed",
            "bypassed_until",
        )

    def get_is_bypassed(self, obj: Zone) -> bool:
        return False

    def get_bypassed_until(self, obj: Zone):
        return None


class AlarmEventSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source="user_id", allow_null=True, read_only=True)
    code_id = serializers.IntegerField(source="code_id", allow_null=True, read_only=True)
    zone_id = serializers.IntegerField(source="zone_id", allow_null=True, read_only=True)
    sensor_id = serializers.IntegerField(source="sensor_id", allow_null=True, read_only=True)

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
            "zone_id",
            "sensor_id",
            "metadata",
        )


class ZoneCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Zone
        fields = (
            "id",
            "name",
            "is_active",
            "entry_delay_override",
            "active_states",
        )


class SensorCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sensor
        fields = (
            "id",
            "name",
            "zone",
            "entity_id",
            "is_active",
            "is_entry_point",
        )

    def validate_entity_id(self, value: str) -> str:
        entity_id = (value or "").strip()
        if not entity_id:
            raise serializers.ValidationError("entity_id is required.")
        if "." not in entity_id:
            raise serializers.ValidationError("Invalid entity_id.")
        if Sensor.objects.filter(entity_id=entity_id).exists():
            raise serializers.ValidationError("This entity_id is already mapped.")
        return entity_id
