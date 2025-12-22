from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import APIView

from alarm.serializers import AlarmSettingsProfileSerializer
from alarm.use_cases.settings_profile import ensure_active_settings_profile


class AlarmSettingsView(APIView):
    def get(self, request):
        profile = ensure_active_settings_profile()
        return Response(AlarmSettingsProfileSerializer(profile).data)
