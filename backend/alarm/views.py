from __future__ import annotations

from django.core.paginator import Paginator
from django.db.models import Max
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from . import home_assistant
from . import rules_engine
from .models import AlarmEvent, AlarmEventType, AlarmSettingsProfile, AlarmState, Entity, Rule, RuleEntityRef, Sensor
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
        try:
            entities = home_assistant.list_entities()
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

        now = timezone.now()
        imported = 0
        updated = 0
        try:
            items = home_assistant.list_entities()
        except Exception as exc:
            return Response(
                {"detail": "Failed to fetch Home Assistant entities.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        for item in items:
            entity_id = item.get("entity_id")
            domain = item.get("domain")
            name = item.get("name")
            if not isinstance(entity_id, str) or "." not in entity_id:
                continue
            if not isinstance(domain, str) or not domain:
                domain = entity_id.split(".", 1)[0]
            if not isinstance(name, str) or not name:
                name = entity_id

            last_changed_raw = item.get("last_changed")
            last_changed = parse_datetime(last_changed_raw) if isinstance(last_changed_raw, str) else None

            defaults = {
                "domain": domain,
                "name": name,
                "device_class": item.get("device_class") if isinstance(item.get("device_class"), str) else None,
                "last_state": item.get("state") if isinstance(item.get("state"), str) else None,
                "last_changed": last_changed,
                "last_seen": now,
                "attributes": {
                    "unit_of_measurement": item.get("unit_of_measurement"),
                },
                "source": "home_assistant",
            }

            obj, created = Entity.objects.update_or_create(entity_id=entity_id, defaults=defaults)
            imported += 1 if created else 0
            updated += 0 if created else 1

        return Response(
            {"imported": imported, "updated": updated, "timestamp": now},
            status=status.HTTP_200_OK,
        )


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
        entity_ids = [s.entity_id for s in sensors if s.entity_id]
        entity_state_by_entity_id: dict[str, str | None] = {}
        if entity_ids:
            entity_state_by_entity_id.update(
                Entity.objects.filter(entity_id__in=entity_ids).values_list("entity_id", "last_state")
            )

        used_entity_ids_in_rules = set(
            RuleEntityRef.objects.filter(rule__enabled=True).values_list("entity__entity_id", flat=True)
        )

        status_obj = home_assistant.get_status()
        if status_obj.configured and status_obj.reachable:
            try:
                for item in home_assistant.list_entities():
                    entity_id = item.get("entity_id")
                    state = item.get("state")
                    if isinstance(entity_id, str) and entity_id:
                        entity_state_by_entity_id[entity_id] = state if isinstance(state, str) else None
            except Exception:
                # Fall back to DB-backed states when HA can't be queried live.
                pass

        last_triggered_by_sensor_id = dict(
            AlarmEvent.objects.filter(
                event_type=AlarmEventType.SENSOR_TRIGGERED,
                sensor__in=sensors,
            )
            .values("sensor_id")
            .annotate(last_ts=Max("timestamp"))
            .values_list("sensor_id", "last_ts")
        )

        return Response(
            SensorSerializer(
                sensors,
                many=True,
                context={
                    "entity_state_by_entity_id": entity_state_by_entity_id,
                    "last_triggered_by_sensor_id": last_triggered_by_sensor_id,
                    "used_entity_ids_in_rules": used_entity_ids_in_rules,
                },
            ).data
        )

    def post(self, request):
        serializer = SensorCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sensor = serializer.save()
        return Response(SensorSerializer(sensor).data, status=status.HTTP_201_CREATED)


class SensorDetailView(APIView):
    def get(self, request, sensor_id: int):
        sensor = Sensor.objects.get(pk=sensor_id)
        entity_state_by_entity_id: dict[str, str | None] = {}
        if sensor.entity_id:
            last_state = (
                Entity.objects.filter(entity_id=sensor.entity_id)
                .values_list("last_state", flat=True)
                .first()
            )
            entity_state_by_entity_id[sensor.entity_id] = last_state

        status_obj = home_assistant.get_status()
        if status_obj.configured and status_obj.reachable and sensor.entity_id:
            try:
                for item in home_assistant.list_entities():
                    entity_id = item.get("entity_id")
                    if entity_id != sensor.entity_id:
                        continue
                    state = item.get("state")
                    entity_state_by_entity_id[sensor.entity_id] = state if isinstance(state, str) else None
                    break
            except Exception:
                pass

        last_triggered_by_sensor_id = dict(
            AlarmEvent.objects.filter(
                event_type=AlarmEventType.SENSOR_TRIGGERED,
                sensor=sensor,
            )
            .values("sensor_id")
            .annotate(last_ts=Max("timestamp"))
            .values_list("sensor_id", "last_ts")
        )

        used_entity_ids_in_rules = set(
            RuleEntityRef.objects.filter(rule__enabled=True).values_list("entity__entity_id", flat=True)
        )

        return Response(
            SensorSerializer(
                sensor,
                context={
                    "entity_state_by_entity_id": entity_state_by_entity_id,
                    "last_triggered_by_sensor_id": last_triggered_by_sensor_id,
                    "used_entity_ids_in_rules": used_entity_ids_in_rules,
                },
            ).data
        )

    def patch(self, request, sensor_id: int):
        sensor = Sensor.objects.get(pk=sensor_id)
        serializer = SensorUpdateSerializer(sensor, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        sensor = serializer.save()
        entity_state_by_entity_id: dict[str, str | None] = {}
        if sensor.entity_id:
            last_state = (
                Entity.objects.filter(entity_id=sensor.entity_id)
                .values_list("last_state", flat=True)
                .first()
            )
            entity_state_by_entity_id[sensor.entity_id] = last_state

        last_triggered_by_sensor_id = dict(
            AlarmEvent.objects.filter(
                event_type=AlarmEventType.SENSOR_TRIGGERED,
                sensor=sensor,
            )
            .values("sensor_id")
            .annotate(last_ts=Max("timestamp"))
            .values_list("sensor_id", "last_ts")
        )

        used_entity_ids_in_rules = set(
            RuleEntityRef.objects.filter(rule__enabled=True).values_list("entity__entity_id", flat=True)
        )

        return Response(
            SensorSerializer(
                sensor,
                context={
                    "entity_state_by_entity_id": entity_state_by_entity_id,
                    "last_triggered_by_sensor_id": last_triggered_by_sensor_id,
                    "used_entity_ids_in_rules": used_entity_ids_in_rules,
                },
            ).data,
            status=status.HTTP_200_OK,
        )

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
            except services.InvalidCodeError as exc:
                services.record_failed_code(
                    user=request.user,
                    action="arm",
                    metadata={"target_state": target_state},
                )
                return Response(
                    {"detail": str(exc) or "Invalid code."},
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
        except services.InvalidCodeError as exc:
            services.record_failed_code(user=request.user, action="disarm")
            return Response(
                {"detail": str(exc) or "Invalid code."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        snapshot = services.disarm(user=request.user, code=code_obj)
        services.record_code_used(user=request.user, code=code_obj, action="disarm")
        return Response(AlarmStateSnapshotSerializer(snapshot).data)


class CancelArmingView(APIView):
    def post(self, request):
        snapshot = services.cancel_arming(user=request.user)
        return Response(AlarmStateSnapshotSerializer(snapshot).data)
