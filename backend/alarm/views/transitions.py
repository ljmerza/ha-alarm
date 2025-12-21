from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from alarm import services
from alarm.serializers import AlarmStateSnapshotSerializer
from alarm.use_cases import alarm_actions


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

