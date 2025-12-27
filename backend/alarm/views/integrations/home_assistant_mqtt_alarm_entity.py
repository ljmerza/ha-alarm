from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole
from alarm.gateways.mqtt import default_mqtt_gateway
from alarm.integrations.home_assistant import mqtt_alarm_entity_status_store
from alarm.integrations.home_assistant.mqtt_alarm_entity import publish_discovery
from alarm.models import AlarmSettingsEntry
from alarm.mqtt.config import normalize_mqtt_connection, prepare_runtime_mqtt_connection
from alarm.serializers import (
    HomeAssistantAlarmEntitySettingsSerializer,
    HomeAssistantAlarmEntitySettingsUpdateSerializer,
)
from alarm.settings_registry import ALARM_PROFILE_SETTINGS_BY_KEY
from alarm.state_machine.settings import get_setting_json
from alarm.use_cases.settings_profile import ensure_active_settings_profile


mqtt_gateway = default_mqtt_gateway


def _get_profile():
    return ensure_active_settings_profile()


def _get_ha_alarm_entity_value(profile):
    raw = get_setting_json(profile, "home_assistant_alarm_entity") or {}
    default = ALARM_PROFILE_SETTINGS_BY_KEY["home_assistant_alarm_entity"].default
    if not isinstance(default, dict):
        default = {}
    if not isinstance(raw, dict):
        raw = {}
    merged = dict(default)
    merged.update(raw)
    return merged


def _get_mqtt_connection_value(profile):
    return normalize_mqtt_connection(get_setting_json(profile, "mqtt_connection") or {})


def _mqtt_enabled(profile) -> bool:
    conn = _get_mqtt_connection_value(profile)
    return bool(conn.get("enabled") and conn.get("host"))


class HomeAssistantMqttAlarmEntityStatusView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        profile = _get_profile()
        entity = _get_ha_alarm_entity_value(profile)
        return Response(
            {
                "settings": HomeAssistantAlarmEntitySettingsSerializer(entity).data,
                "status": mqtt_alarm_entity_status_store.read_status(),
            },
            status=status.HTTP_200_OK,
        )


class HomeAssistantMqttAlarmEntitySettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        profile = _get_profile()
        value = _get_ha_alarm_entity_value(profile)
        return Response(HomeAssistantAlarmEntitySettingsSerializer(value).data, status=status.HTTP_200_OK)

    def patch(self, request):
        profile = _get_profile()
        current = _get_ha_alarm_entity_value(profile)

        serializer = HomeAssistantAlarmEntitySettingsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        merged = dict(current)
        merged.update(dict(serializer.validated_data))

        if merged.get("enabled") and not _mqtt_enabled(profile):
            return Response(
                {"detail": "MQTT must be enabled and configured before enabling the Home Assistant MQTT alarm entity."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        definition = ALARM_PROFILE_SETTINGS_BY_KEY["home_assistant_alarm_entity"]
        AlarmSettingsEntry.objects.update_or_create(
            profile=profile,
            key="home_assistant_alarm_entity",
            defaults={"value": merged, "value_type": definition.value_type},
        )

        if merged.get("enabled"):
            # If the user just enabled the entity, or if they changed the name and want HA updated,
            # publish discovery and push an immediate state/availability update.
            if ("enabled" in serializer.validated_data) or (
                merged.get("also_rename_in_home_assistant") and "entity_name" in serializer.validated_data
            ):
                publish_discovery(force=True)

        return Response(HomeAssistantAlarmEntitySettingsSerializer(merged).data, status=status.HTTP_200_OK)


class HomeAssistantMqttAlarmEntityPublishDiscoveryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        profile = _get_profile()
        if not _mqtt_enabled(profile):
            return Response(
                {"detail": "MQTT must be enabled and configured before publishing discovery."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        settings_obj = _get_mqtt_connection_value(profile)
        mqtt_gateway.apply_settings(settings=prepare_runtime_mqtt_connection(settings_obj))
        publish_discovery(force=True)
        return Response({"ok": True}, status=status.HTTP_200_OK)
