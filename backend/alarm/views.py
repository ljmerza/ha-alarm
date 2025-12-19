from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import AlarmState
from .serializers import AlarmStateSnapshotSerializer


class AlarmStateView(APIView):
    def get(self, request):
        snapshot = services.get_current_snapshot(process_timers=True)
        return Response(AlarmStateSnapshotSerializer(snapshot).data)


class ArmAlarmView(APIView):
    def post(self, request):
        target_state = request.data.get("target_state")
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
        snapshot = services.arm(target_state=target_state, user=request.user)
        return Response(AlarmStateSnapshotSerializer(snapshot).data)


class DisarmAlarmView(APIView):
    def post(self, request):
        snapshot = services.disarm(user=request.user)
        return Response(AlarmStateSnapshotSerializer(snapshot).data)


class CancelArmingView(APIView):
    def post(self, request):
        snapshot = services.cancel_arming(user=request.user)
        return Response(AlarmStateSnapshotSerializer(snapshot).data)
