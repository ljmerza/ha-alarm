from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from alarm import home_assistant
from alarm.gateways.home_assistant import default_home_assistant_gateway


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

