from __future__ import annotations

from rest_framework import serializers

from alarm.models import Rule, RuleEntityRef
from alarm.use_cases.rule_entity_refs import sync_rule_entity_refs


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
        entity_ids_by_rule_id = self.context.get("entity_ids_by_rule_id")
        if isinstance(entity_ids_by_rule_id, dict):
            value = entity_ids_by_rule_id.get(obj.id)
            if isinstance(value, (list, tuple, set)):
                return sorted({str(x) for x in value if str(x).strip()})

        prefetched = getattr(obj, "_prefetched_objects_cache", {}) or {}
        if "entity_refs" in prefetched:
            entity_ids: set[str] = set()
            for ref in obj.entity_refs.all():
                entity = getattr(ref, "entity", None)
                entity_id = getattr(entity, "entity_id", "") if entity is not None else ""
                entity_id = (entity_id or "").strip()
                if entity_id:
                    entity_ids.add(entity_id)
            return sorted(entity_ids)

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

    def create(self, validated_data):
        entity_ids = validated_data.pop("entity_ids", [])
        rule = super().create(validated_data)
        sync_rule_entity_refs(rule=rule, entity_ids=entity_ids)
        return rule

    def update(self, instance, validated_data):
        entity_ids = validated_data.pop("entity_ids", None)
        rule = super().update(instance, validated_data)
        if entity_ids is not None:
            sync_rule_entity_refs(rule=rule, entity_ids=entity_ids)
        return rule
