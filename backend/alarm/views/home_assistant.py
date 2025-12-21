from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from alarm.gateways.home_assistant import (
    HomeAssistantNotConfigured,
    HomeAssistantNotReachable,
    default_home_assistant_gateway,
)


class HomeAssistantStatusView(APIView):
    def get(self, request):
        status_obj = default_home_assistant_gateway.get_status()
        return Response(status_obj.as_dict(), status=status.HTTP_200_OK)


class HomeAssistantEntitiesView(APIView):
    def get(self, request):
        try:
            default_home_assistant_gateway.ensure_available()
        except HomeAssistantNotConfigured as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except HomeAssistantNotReachable as exc:
            return Response(
                {"detail": "Home Assistant is not reachable.", "error": exc.error},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        try:
            entities = default_home_assistant_gateway.list_entities()
        except Exception as exc:
            return Response(
                {"detail": "Failed to fetch Home Assistant entities.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"data": entities}, status=status.HTTP_200_OK)
