from __future__ import annotations

from django.core.paginator import Paginator
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from . import home_assistant
from . import rules_engine
from .use_cases import alarm_actions
from .use_cases.entity_sync import sync_entities_from_home_assistant
from .use_cases.sensor_context import sensor_detail_serializer_context, sensor_list_serializer_context
from .gateways.home_assistant import default_home_assistant_gateway
from .models import AlarmEvent, AlarmSettingsProfile, AlarmState, Entity, Rule, Sensor
from .serializers import (
    AlarmEventSerializer,
    AlarmSettingsProfileSerializer,
    AlarmStateSnapshotSerializer,
    EntitySerializer,
    RuleSerializer,
    RuleUpsertSerializer,
    SensorSerializer,
    SensorCreateSerializer,
    SensorUpdateSerializer,
)


class AlarmStateView(APIView):
    def get(self, request):
        snapshot = services.get_current_snapshot(process_timers=True)
        return Response(AlarmStateSnapshotSerializer(snapshot).data)


class HomeAssistantStatusView(APIView):
    def get(self, request):
        status_obj = default_home_assistant_gateway.get_status()
        return Response(status_obj.as_dict(), status=status.HTTP_200_OK)


class HomeAssistantEntitiesView(APIView):
    def get(self, request):
        try:
            default_home_assistant_gateway.ensure_available()
            entities = default_home_assistant_gateway.list_entities()
        except home_assistant.HomeAssistantNotConfigured:
            return Response(
                {"detail": "Home Assistant is not configured."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except home_assistant.HomeAssistantNotReachable as exc:
            return Response(
                {"detail": "Home Assistant is not reachable.", "error": exc.error},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as exc:
            return Response(
                {"detail": "Failed to fetch Home Assistant entities.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"data": entities}, status=status.HTTP_200_OK)


class EntitiesView(APIView):
    def get(self, request):
        queryset = Entity.objects.all().order_by("entity_id")
        return Response(EntitySerializer(queryset, many=True).data, status=status.HTTP_200_OK)


class EntitySyncView(APIView):
    def post(self, request):
        try:
            default_home_assistant_gateway.ensure_available()
            items = default_home_assistant_gateway.list_entities()
        except home_assistant.HomeAssistantNotConfigured:
            return Response(
                {"detail": "Home Assistant is not configured."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except home_assistant.HomeAssistantNotReachable as exc:
            return Response(
                {"detail": "Home Assistant is not reachable.", "error": exc.error},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as exc:
            return Response(
                {"detail": "Failed to fetch Home Assistant entities.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        result = sync_entities_from_home_assistant(items=items)
        return Response(result, status=status.HTTP_200_OK)


class RulesView(APIView):
    def get(self, request):
        kind = request.query_params.get("kind")
        enabled = request.query_params.get("enabled")
        queryset = Rule.objects.all()
        if kind:
            queryset = queryset.filter(kind=kind)
        if enabled in {"true", "false"}:
            queryset = queryset.filter(enabled=(enabled == "true"))
        queryset = queryset.order_by("-priority", "id")
        return Response(RuleSerializer(queryset, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = RuleUpsertSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        rule = serializer.save(created_by=request.user)
        return Response(RuleSerializer(rule).data, status=status.HTTP_201_CREATED)


class RuleDetailView(APIView):
    def get(self, request, rule_id: int):
        rule = Rule.objects.get(pk=rule_id)
        return Response(RuleSerializer(rule).data, status=status.HTTP_200_OK)

    def patch(self, request, rule_id: int):
        rule = Rule.objects.get(pk=rule_id)
        serializer = RuleUpsertSerializer(rule, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        rule = serializer.save()
        return Response(RuleSerializer(rule).data, status=status.HTTP_200_OK)

    def delete(self, request, rule_id: int):
        Rule.objects.filter(pk=rule_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RuleRunView(APIView):
    def post(self, request):
        result = rules_engine.run_rules(actor_user=request.user)
        return Response(result.as_dict(), status=status.HTTP_200_OK)


class RuleSimulateView(APIView):
    def post(self, request):
        entity_states = request.data.get("entity_states") if isinstance(request.data, dict) else None
        if entity_states is None:
            entity_states = {}
        if not isinstance(entity_states, dict):
            return Response({"detail": "entity_states must be an object."}, status=status.HTTP_400_BAD_REQUEST)

        cleaned: dict[str, str] = {}
        for key, value in entity_states.items():
            if not isinstance(key, str):
                continue
            if not isinstance(value, str):
                continue
            entity_id = key.strip()
            if not entity_id:
                continue
            cleaned[entity_id] = value

        assume_for_seconds = request.data.get("assume_for_seconds") if isinstance(request.data, dict) else None
        if assume_for_seconds is not None and not isinstance(assume_for_seconds, int):
            return Response(
                {"detail": "assume_for_seconds must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = rules_engine.simulate_rules(
            entity_states=cleaned,
            assume_for_seconds=assume_for_seconds,
        )
        return Response(result, status=status.HTTP_200_OK)


class AlarmSettingsView(APIView):
    def get(self, request):
        profile = AlarmSettingsProfile.objects.filter(is_active=True).first()
        if not profile:
            return Response(
                {"detail": "No active alarm settings profile."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(AlarmSettingsProfileSerializer(profile).data)


class SensorsView(APIView):
    def get(self, request):
        sensors = Sensor.objects.all()
        context = sensor_list_serializer_context(sensors=list(sensors), prefer_home_assistant_live_state=True)
        return Response(SensorSerializer(sensors, many=True, context=context).data)

    def post(self, request):
        serializer = SensorCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sensor = serializer.save()
        return Response(SensorSerializer(sensor).data, status=status.HTTP_201_CREATED)


class SensorDetailView(APIView):
    def get(self, request, sensor_id: int):
        sensor = Sensor.objects.get(pk=sensor_id)
        context = sensor_detail_serializer_context(sensor=sensor, prefer_home_assistant_live_state=True)
        return Response(SensorSerializer(sensor, context=context).data)

    def patch(self, request, sensor_id: int):
        sensor = Sensor.objects.get(pk=sensor_id)
        serializer = SensorUpdateSerializer(sensor, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        sensor = serializer.save()
        context = sensor_detail_serializer_context(sensor=sensor, prefer_home_assistant_live_state=False)
        return Response(SensorSerializer(sensor, context=context).data, status=status.HTTP_200_OK)

    def delete(self, request, sensor_id: int):
        sensor = Sensor.objects.get(pk=sensor_id)
        sensor.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        try:
            snapshot = alarm_actions.arm_alarm(
                user=request.user,
                target_state=target_state,
                raw_code=raw_code,
            )
        except alarm_actions.InvalidTargetState as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except alarm_actions.CodeRequired as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except alarm_actions.InvalidCode as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(AlarmStateSnapshotSerializer(snapshot).data)


class DisarmAlarmView(APIView):
    def post(self, request):
        raw_code = request.data.get("code")
        try:
            snapshot = alarm_actions.disarm_alarm(user=request.user, raw_code=raw_code)
        except alarm_actions.CodeRequired as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except alarm_actions.InvalidCode as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(AlarmStateSnapshotSerializer(snapshot).data)


class CancelArmingView(APIView):
    def post(self, request):
        snapshot = services.cancel_arming(user=request.user)
        return Response(AlarmStateSnapshotSerializer(snapshot).data)
