from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole
from alarm.gateways.mqtt import default_mqtt_gateway
from alarm.mqtt.config import encrypt_mqtt_password, normalize_mqtt_connection, prepare_runtime_mqtt_connection
from alarm.mqtt.manager import MqttClientUnavailable, MqttNotConfigured, MqttNotReachable
from alarm.serializers import (
    HomeAssistantAlarmEntitySettingsSerializer,
    HomeAssistantAlarmEntitySettingsUpdateSerializer,
    MqttConnectionSettingsSerializer,
    MqttConnectionSettingsUpdateSerializer,
    MqttTestConnectionSerializer,
)
from alarm.state_machine.settings import get_setting_json
from alarm.use_cases.settings_profile import ensure_active_settings_profile
from alarm.models import AlarmSettingsEntry
from alarm.settings_registry import ALARM_PROFILE_SETTINGS_BY_KEY
from alarm.mqtt import status_store
from alarm.mqtt.ha_alarm import publish_discovery


mqtt_gateway = default_mqtt_gateway


def _get_profile():
    return ensure_active_settings_profile()


def _get_mqtt_connection_value(profile):
    return normalize_mqtt_connection(get_setting_json(profile, "mqtt_connection") or {})


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


class MqttStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Best-effort: ensure the gateway has the persisted settings applied so status reflects reality.
        profile = _get_profile()
        settings_obj = _get_mqtt_connection_value(profile)
        mqtt_gateway.apply_settings(settings=prepare_runtime_mqtt_connection(settings_obj))
        status_obj = mqtt_gateway.get_status().as_dict()
        entity_settings = _get_ha_alarm_entity_value(profile)
        status_obj["alarm_entity"] = {
            "enabled": bool(entity_settings.get("enabled")),
            "ha_entity_id": entity_settings.get("ha_entity_id"),
            "entity_name": entity_settings.get("entity_name"),
            **status_store.read_status(),
        }
        return Response(status_obj, status=status.HTTP_200_OK)


class MqttSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        profile = _get_profile()
        value = _get_mqtt_connection_value(profile)
        return Response(MqttConnectionSettingsSerializer(value).data, status=status.HTTP_200_OK)

    def patch(self, request):
        profile = _get_profile()
        current = _get_mqtt_connection_value(profile)
        serializer = MqttConnectionSettingsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        changes = dict(serializer.validated_data)

        if "password" in changes:
            changes["password"] = encrypt_mqtt_password(changes.get("password"))
        else:
            # Preserve existing password token if not provided.
            changes["password"] = current.get("password", "")

        merged = dict(current)
        merged.update(changes)

        definition = ALARM_PROFILE_SETTINGS_BY_KEY["mqtt_connection"]
        AlarmSettingsEntry.objects.update_or_create(
            profile=profile,
            key="mqtt_connection",
            defaults={"value": merged, "value_type": definition.value_type},
        )

        # Best-effort: refresh gateway connection state based on stored config.
        mqtt_gateway.apply_settings(settings=prepare_runtime_mqtt_connection(merged))

        return Response(MqttConnectionSettingsSerializer(merged).data, status=status.HTTP_200_OK)


class MqttTestConnectionView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        serializer = MqttTestConnectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        settings_obj = serializer.validated_data
        try:
            mqtt_gateway.test_connection(settings=settings_obj)
        except MqttClientUnavailable as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED)
        except MqttNotConfigured as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except MqttNotReachable as exc:
            return Response(
                {"detail": "MQTT broker is not reachable.", "error": exc.error},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as exc:
            return Response(
                {"detail": "Failed to test MQTT connection.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"ok": True}, status=status.HTTP_200_OK)


class HomeAssistantAlarmEntitySettingsView(APIView):
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


class MqttPublishDiscoveryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        profile = _get_profile()
        settings_obj = _get_mqtt_connection_value(profile)
        mqtt_gateway.apply_settings(settings=prepare_runtime_mqtt_connection(settings_obj))
        publish_discovery(force=True)
        return Response({"ok": True}, status=status.HTTP_200_OK)
