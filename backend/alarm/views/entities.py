from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from alarm import home_assistant
from alarm.gateways.home_assistant import default_home_assistant_gateway
from alarm.models import Entity
from alarm.serializers import EntitySerializer
from alarm.use_cases.entity_sync import sync_entities_from_home_assistant


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

