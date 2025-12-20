from __future__ import annotations

from django.core.paginator import Paginator
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from . import home_assistant
from .models import AlarmEvent, AlarmSettingsProfile, AlarmState, Sensor, Zone
from .serializers import (
    AlarmEventSerializer,
    AlarmSettingsProfileSerializer,
    AlarmStateSnapshotSerializer,
    SensorSerializer,
    SensorCreateSerializer,
    ZoneSerializer,
    ZoneCreateSerializer,
)


class AlarmStateView(APIView):
    def get(self, request):
        snapshot = services.get_current_snapshot(process_timers=True)
        return Response(AlarmStateSnapshotSerializer(snapshot).data)


class HomeAssistantStatusView(APIView):
    def get(self, request):
        status_obj = home_assistant.get_status()
        return Response(status_obj.as_dict(), status=status.HTTP_200_OK)


class HomeAssistantEntitiesView(APIView):
    def get(self, request):
        status_obj = home_assistant.get_status()
        if not status_obj.configured:
            return Response(
                {"detail": "Home Assistant is not configured."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not status_obj.reachable:
            return Response(
                {"detail": "Home Assistant is not reachable.", "error": status_obj.error},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        entities = home_assistant.list_entities()
        return Response({"data": entities}, status=status.HTTP_200_OK)


class AlarmSettingsView(APIView):
    def get(self, request):
        profile = AlarmSettingsProfile.objects.filter(is_active=True).first()
        if not profile:
            return Response(
                {"detail": "No active alarm settings profile."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(AlarmSettingsProfileSerializer(profile).data)


class ZonesView(APIView):
    def get(self, request):
        zones = Zone.objects.prefetch_related("sensors").all()
        return Response(ZoneSerializer(zones, many=True).data)

    def post(self, request):
        serializer = ZoneCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        zone = serializer.save()
        return Response(ZoneSerializer(zone).data, status=status.HTTP_201_CREATED)


class SensorsView(APIView):
    def get(self, request):
        sensors = Sensor.objects.select_related("zone").all()
        return Response(SensorSerializer(sensors, many=True).data)

    def post(self, request):
        data = dict(request.data)
        if not data.get("zone"):
            zone, _ = Zone.objects.get_or_create(name="Unassigned", defaults={"is_active": True})
            data["zone"] = zone.id
        serializer = SensorCreateSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        sensor = serializer.save()
        return Response(SensorSerializer(sensor).data, status=status.HTTP_201_CREATED)


class AlarmEventsView(APIView):
    def get(self, request):
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))
        ordering = request.query_params.get("ordering", "-timestamp")
        if ordering not in {"timestamp", "-timestamp"}:
            ordering = "-timestamp"

        queryset = AlarmEvent.objects.all().order_by(ordering)
        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page)

        return Response(
            {
                "data": AlarmEventSerializer(page_obj.object_list, many=True).data,
                "total": paginator.count,
                "page": page_obj.number,
                "page_size": page_size,
                "total_pages": paginator.num_pages,
                "has_next": page_obj.has_next(),
                "has_previous": page_obj.has_previous(),
                "timestamp": timezone.now(),
            }
        )


class ArmAlarmView(APIView):
    def post(self, request):
        target_state = request.data.get("target_state")
        raw_code = request.data.get("code")
        if target_state not in {
            AlarmState.ARMED_HOME,
            AlarmState.ARMED_AWAY,
            AlarmState.ARMED_NIGHT,
            AlarmState.ARMED_VACATION,
        }:
            return Response(
                {"detail": "Invalid target_state."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = services.get_active_settings_profile()
        code_obj = None
        if profile.code_arm_required or raw_code is not None:
            if not raw_code:
                services.record_failed_code(
                    user=request.user,
                    action="arm",
                    metadata={"target_state": target_state, "reason": "missing"},
                )
                return Response(
                    {"detail": "Code is required to arm."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                code_obj = services.validate_user_code(user=request.user, raw_code=raw_code)
            except services.InvalidCodeError:
                services.record_failed_code(
                    user=request.user,
                    action="arm",
                    metadata={"target_state": target_state},
                )
                return Response(
                    {"detail": "Invalid code."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

        snapshot = services.arm(target_state=target_state, user=request.user, code=code_obj)
        if code_obj is not None:
            services.record_code_used(
                user=request.user,
                code=code_obj,
                action="arm",
                metadata={"target_state": target_state},
            )
        return Response(AlarmStateSnapshotSerializer(snapshot).data)


class DisarmAlarmView(APIView):
    def post(self, request):
        raw_code = request.data.get("code")
        if not raw_code:
            services.record_failed_code(
                user=request.user,
                action="disarm",
                metadata={"reason": "missing"},
            )
            return Response(
                {"detail": "Code is required to disarm."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            code_obj = services.validate_user_code(user=request.user, raw_code=raw_code)
        except services.InvalidCodeError:
            services.record_failed_code(user=request.user, action="disarm")
            return Response(
                {"detail": "Invalid code."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        snapshot = services.disarm(user=request.user, code=code_obj)
        services.record_code_used(user=request.user, code=code_obj, action="disarm")
        return Response(AlarmStateSnapshotSerializer(snapshot).data)


class CancelArmingView(APIView):
    def post(self, request):
        snapshot = services.cancel_arming(user=request.user)
        return Response(AlarmStateSnapshotSerializer(snapshot).data)
