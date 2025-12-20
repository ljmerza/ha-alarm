from __future__ import annotations

from rest_framework import serializers

from .models import (
    AlarmEvent,
    AlarmSettingsProfile,
    AlarmStateSnapshot,
    Entity,
    Rule,
    RuleEntityRef,
    Sensor,
)


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
    entity_id = serializers.CharField(allow_blank=True, required=False)
    current_state = serializers.SerializerMethodField()
    last_triggered = serializers.SerializerMethodField()

    class Meta:
        model = Sensor
        fields = (
            "id",
            "name",
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

class AlarmEventSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source="user_id", allow_null=True, read_only=True)
    code_id = serializers.IntegerField(source="code_id", allow_null=True, read_only=True)
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
            "sensor_id",
            "metadata",
        )

class SensorCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sensor
        fields = (
            "id",
            "name",
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


class SensorUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sensor
        fields = (
            "id",
            "name",
            "is_active",
            "is_entry_point",
        )


class EntitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Entity
        fields = (
            "id",
            "entity_id",
            "domain",
            "name",
            "device_class",
            "last_state",
            "last_changed",
            "last_seen",
            "attributes",
            "source",
            "created_at",
            "updated_at",
        )


class RuleSerializer(serializers.ModelSerializer):
    entity_ids = serializers.SerializerMethodField()

    class Meta:
        model = Rule
        fields = (
            "id",
            "name",
            "kind",
            "enabled",
            "priority",
            "schema_version",
            "definition",
            "cooldown_seconds",
            "created_by",
            "created_at",
            "updated_at",
            "entity_ids",
        )

    def get_entity_ids(self, obj: Rule) -> list[str]:
        return list(
            RuleEntityRef.objects.filter(rule=obj)
            .select_related("entity")
            .values_list("entity__entity_id", flat=True)
        )


class RuleUpsertSerializer(serializers.ModelSerializer):
    entity_ids = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = Rule
        fields = (
            "id",
            "name",
            "kind",
            "enabled",
            "priority",
            "schema_version",
            "definition",
            "cooldown_seconds",
            "entity_ids",
        )

    def validate_definition(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("definition must be an object.")
        return value

    def validate_entity_ids(self, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for raw in value:
            entity_id = (raw or "").strip()
            if not entity_id:
                continue
            if "." not in entity_id:
                raise serializers.ValidationError(f"Invalid entity_id: {entity_id}")
            cleaned.append(entity_id)
        return sorted(set(cleaned))

    def _sync_entity_refs(self, rule: Rule, entity_ids: list[str]) -> None:
        entities: list[Entity] = []
        for entity_id in entity_ids:
            domain = entity_id.split(".", 1)[0]
            entity, _ = Entity.objects.get_or_create(
                entity_id=entity_id,
                defaults={
                    "domain": domain,
                    "name": entity_id,
                    "attributes": {},
                },
            )
            entities.append(entity)

        RuleEntityRef.objects.filter(rule=rule).exclude(entity__in=entities).delete()
        existing = set(
            RuleEntityRef.objects.filter(rule=rule, entity__in=entities).values_list(
                "entity_id", flat=True
            )
        )
        RuleEntityRef.objects.bulk_create(
            [RuleEntityRef(rule=rule, entity=e) for e in entities if e.id not in existing],
            ignore_conflicts=True,
        )

    def create(self, validated_data):
        entity_ids = validated_data.pop("entity_ids", [])
        rule = super().create(validated_data)
        self._sync_entity_refs(rule, entity_ids)
        return rule

    def update(self, instance, validated_data):
        entity_ids = validated_data.pop("entity_ids", None)
        rule = super().update(instance, validated_data)
        if entity_ids is not None:
            self._sync_entity_refs(rule, entity_ids)
        return rule
