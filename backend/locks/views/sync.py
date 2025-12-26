from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from alarm.gateways.home_assistant import (
    HomeAssistantNotConfigured,
    HomeAssistantNotReachable,
    default_home_assistant_gateway,
)

from locks.use_cases import lock_sync

ha_gateway = default_home_assistant_gateway


class AvailableLocksView(APIView):
    """
    Fetch available lock entities from Home Assistant.

    GET /api/locks/available/
    Returns list of lock entities the user can select from.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            ha_gateway.ensure_available()
        except HomeAssistantNotConfigured as exc:
            return Response(
                {"detail": str(exc) or "Home Assistant is not configured."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except HomeAssistantNotReachable as exc:
            return Response(
                {"detail": "Home Assistant is not reachable.", "error": exc.error},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            locks = lock_sync.fetch_available_locks(ha_gateway=ha_gateway)
        except Exception as exc:
            return Response(
                {"detail": "Failed to fetch locks from Home Assistant.", "error": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"data": locks}, status=status.HTTP_200_OK)
