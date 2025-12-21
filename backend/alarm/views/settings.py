from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from alarm.models import AlarmSettingsProfile
from alarm.serializers import AlarmSettingsProfileSerializer


class AlarmSettingsView(APIView):
    def get(self, request):
        profile = AlarmSettingsProfile.objects.filter(is_active=True).first()
        if not profile:
            return Response(
                {"detail": "No active alarm settings profile."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(AlarmSettingsProfileSerializer(profile).data)

