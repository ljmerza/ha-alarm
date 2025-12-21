from __future__ import annotations

from django.utils import timezone

from alarm.models import AlarmState, AlarmStateSnapshot, Sensor

from .constants import ARMED_STATES
from .events import record_state_event
from .settings import get_active_settings_profile
from .timing import base_timing


def get_snapshot_for_update() -> AlarmStateSnapshot:
    snapshot = AlarmStateSnapshot.objects.select_for_update().first()
    if snapshot:
        return snapshot
    profile = get_active_settings_profile()
    now = timezone.now()
    return AlarmStateSnapshot.objects.create(
        current_state=AlarmState.DISARMED,
        previous_state=None,
        target_armed_state=None,
        settings_profile=profile,
        entered_at=now,
        exit_at=None,
        last_transition_reason="bootstrap",
        timing_snapshot=base_timing(profile).as_dict(),
    )


def transition(
    *,
    snapshot: AlarmStateSnapshot,
    state_to: str,
    now,
    user=None,
    code=None,
    sensor: Sensor | None = None,
    reason: str = "",
    exit_at=None,
    update_previous: bool = True,
    metadata: dict | None = None,
) -> AlarmStateSnapshot:
    state_from = snapshot.current_state
    snapshot.current_state = state_to
    if update_previous:
        snapshot.previous_state = state_from
    snapshot.entered_at = now
    snapshot.exit_at = exit_at
    snapshot.last_transition_reason = reason
    snapshot.last_transition_by = user
    snapshot.save(
        update_fields=[
            "current_state",
            "previous_state",
            "entered_at",
            "exit_at",
            "last_transition_reason",
            "last_transition_by",
        ]
    )
    record_state_event(
        snapshot=snapshot,
        state_from=state_from,
        state_to=state_to,
        user=user,
        code=code,
        sensor=sensor,
        metadata=metadata,
        timestamp=now,
    )
    return snapshot


def set_previous_armed_state(snapshot: AlarmStateSnapshot) -> None:
    if snapshot.current_state in ARMED_STATES:
        snapshot.previous_state = snapshot.current_state
    elif snapshot.current_state == AlarmState.ARMING and snapshot.target_armed_state:
        snapshot.previous_state = snapshot.target_armed_state

