from __future__ import annotations

from rest_framework import serializers

from .models import AlarmStateSnapshot


class AlarmStateSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlarmStateSnapshot
        fields = (
            "current_state",
            "previous_state",
            "target_armed_state",
            "entered_at",
            "exit_at",
            "last_transition_reason",
            "timing_snapshot",
        )
