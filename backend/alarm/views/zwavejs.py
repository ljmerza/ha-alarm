from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminRole
from alarm.gateways.zwavejs import default_zwavejs_gateway
from alarm.models import AlarmSettingsEntry
from alarm.serializers import (
    ZwavejsConnectionSettingsSerializer,
    ZwavejsConnectionSettingsUpdateSerializer,
    ZwavejsSetValueSerializer,
    ZwavejsTestConnectionSerializer,
)
from alarm.settings_registry import ALARM_PROFILE_SETTINGS_BY_KEY
from alarm.state_machine.settings import get_setting_json
from alarm.use_cases.settings_profile import ensure_active_settings_profile
from alarm.zwavejs.config import (
    encrypt_zwavejs_api_token,
    normalize_zwavejs_connection,
    prepare_runtime_zwavejs_connection,
)
from alarm.zwavejs.manager import ZwavejsNotConfigured, ZwavejsNotReachable
from alarm.use_cases.entity_sync_zwavejs import sync_entities_from_zwavejs


zwavejs_gateway = default_zwavejs_gateway


def _get_profile():
    return ensure_active_settings_profile()


def _get_zwavejs_connection_value(profile):
    return normalize_zwavejs_connection(get_setting_json(profile, "zwavejs_connection") or {})


class ZwavejsStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Best-effort: apply persisted settings so status reflects reality.
        profile = _get_profile()
        settings_obj = _get_zwavejs_connection_value(profile)
        zwavejs_gateway.apply_settings(settings_obj=prepare_runtime_zwavejs_connection(settings_obj))
        return Response(zwavejs_gateway.get_status().as_dict(), status=status.HTTP_200_OK)


class ZwavejsSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        profile = _get_profile()
        value = _get_zwavejs_connection_value(profile)
        return Response(ZwavejsConnectionSettingsSerializer(value).data, status=status.HTTP_200_OK)

    def patch(self, request):
        profile = _get_profile()
        current = _get_zwavejs_connection_value(profile)
        serializer = ZwavejsConnectionSettingsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        changes = dict(serializer.validated_data)

        if "api_token" in changes:
            changes["api_token"] = encrypt_zwavejs_api_token(changes.get("api_token"))
        else:
            # Preserve existing token if not provided.
            changes["api_token"] = current.get("api_token", "")

        merged = dict(current)
        merged.update(changes)

        definition = ALARM_PROFILE_SETTINGS_BY_KEY["zwavejs_connection"]
        AlarmSettingsEntry.objects.update_or_create(
            profile=profile,
            key="zwavejs_connection",
            defaults={"value": merged, "value_type": definition.value_type},
        )

        # Best-effort: refresh gateway connection state based on stored config.
        zwavejs_gateway.apply_settings(settings_obj=prepare_runtime_zwavejs_connection(merged))

        return Response(ZwavejsConnectionSettingsSerializer(merged).data, status=status.HTTP_200_OK)


class ZwavejsTestConnectionView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        serializer = ZwavejsTestConnectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        settings_obj = serializer.validated_data

        try:
            zwavejs_gateway.test_connection(settings_obj=settings_obj, timeout_seconds=settings_obj.get("connect_timeout_seconds"))
        except ZwavejsNotConfigured as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ZwavejsNotReachable as exc:
            return Response(
                {"detail": "Z-Wave JS server is not reachable.", "error": exc.error},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as exc:
            return Response(
                {"detail": "Failed to test Z-Wave JS connection.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"ok": True}, status=status.HTTP_200_OK)


class ZwavejsEntitySyncView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        profile = _get_profile()
        settings_obj = _get_zwavejs_connection_value(profile)
        if not settings_obj.get("enabled"):
            return Response({"detail": "Z-Wave JS is disabled."}, status=status.HTTP_400_BAD_REQUEST)
        if not settings_obj.get("ws_url"):
            return Response({"detail": "Z-Wave JS ws_url is required."}, status=status.HTTP_400_BAD_REQUEST)

        zwavejs_gateway.apply_settings(settings_obj=prepare_runtime_zwavejs_connection(settings_obj))
        try:
            zwavejs_gateway.ensure_connected(timeout_seconds=float(settings_obj.get("connect_timeout_seconds") or 5))
        except ZwavejsNotReachable as exc:
            return Response(
                {"detail": "Z-Wave JS server is not reachable.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as exc:
            return Response(
                {"detail": "Failed to connect to Z-Wave JS server.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            result = sync_entities_from_zwavejs(zwavejs=zwavejs_gateway)
        except Exception as exc:
            return Response(
                {"detail": "Failed to sync Z-Wave JS entities.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(result, status=status.HTTP_200_OK)


class ZwavejsSetValueView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        serializer = ZwavejsSetValueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        profile = _get_profile()
        settings_obj = _get_zwavejs_connection_value(profile)
        if not settings_obj.get("enabled"):
            return Response({"detail": "Z-Wave JS is disabled."}, status=status.HTTP_400_BAD_REQUEST)
        if not settings_obj.get("ws_url"):
            return Response({"detail": "Z-Wave JS ws_url is required."}, status=status.HTTP_400_BAD_REQUEST)

        zwavejs_gateway.apply_settings(settings_obj=prepare_runtime_zwavejs_connection(settings_obj))
        try:
            zwavejs_gateway.ensure_connected(timeout_seconds=float(settings_obj.get("connect_timeout_seconds") or 5))
        except ZwavejsNotReachable as exc:
            return Response(
                {"detail": "Z-Wave JS server is not reachable.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as exc:
            return Response(
                {"detail": "Failed to connect to Z-Wave JS server.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            zwavejs_gateway.set_value(
                node_id=int(payload["node_id"]),
                endpoint=int(payload.get("endpoint") or 0),
                command_class=int(payload["command_class"]),
                property=payload["property"],
                property_key=payload.get("property_key"),
                value=payload["value"],
            )
        except Exception as exc:
            return Response(
                {"detail": "Failed to set Z-Wave value.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"ok": True}, status=status.HTTP_200_OK)
