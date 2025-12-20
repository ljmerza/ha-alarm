from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.contrib.auth.hashers import check_password
from django.db import models, transaction
from django.utils import timezone

from accounts.models import UserCode

from .models import (
    AlarmEvent,
    AlarmEventType,
    AlarmSettingsProfile,
    AlarmState,
    AlarmStateSnapshot,
    Sensor,
    Zone,
)


ARMED_STATES = {
    AlarmState.ARMED_HOME,
    AlarmState.ARMED_AWAY,
    AlarmState.ARMED_NIGHT,
    AlarmState.ARMED_VACATION,
}


class TransitionError(RuntimeError):
    pass


class CodeRequiredError(TransitionError):
    pass


class InvalidCodeError(TransitionError):
    pass


@dataclass(frozen=True)
class TimingSnapshot:
    delay_time: int
    arming_time: int
    trigger_time: int

    def as_dict(self) -> dict[str, int]:
        return {
            "delay_time": self.delay_time,
            "arming_time": self.arming_time,
            "trigger_time": self.trigger_time,
        }


def get_active_settings_profile() -> AlarmSettingsProfile:
    profile = AlarmSettingsProfile.objects.filter(is_active=True).first()
    if not profile:
        raise TransitionError("No active alarm settings profile.")
    return profile


def _base_timing(profile: AlarmSettingsProfile) -> TimingSnapshot:
    return TimingSnapshot(
        delay_time=profile.delay_time,
        arming_time=profile.arming_time,
        trigger_time=profile.trigger_time,
    )


def _resolve_timing(profile: AlarmSettingsProfile, target_state: str) -> TimingSnapshot:
    timing = _base_timing(profile)
    overrides = profile.state_overrides or {}
    if isinstance(overrides, dict):
        override = overrides.get(target_state) or {}
        if isinstance(override, dict):
            timing = TimingSnapshot(
                delay_time=override.get("delay_time", timing.delay_time),
                arming_time=override.get("arming_time", timing.arming_time),
                trigger_time=override.get("trigger_time", timing.trigger_time),
            )
    return timing


def _apply_zone_delay(timing: TimingSnapshot, zone: Zone | None) -> TimingSnapshot:
    if zone and zone.entry_delay_override is not None:
        return TimingSnapshot(
            delay_time=zone.entry_delay_override,
            arming_time=timing.arming_time,
            trigger_time=timing.trigger_time,
        )
    return timing


def _event_type_for_state(state: str) -> str:
    if state == AlarmState.DISARMED:
        return AlarmEventType.DISARMED
    if state in ARMED_STATES:
        return AlarmEventType.ARMED
    if state == AlarmState.PENDING:
        return AlarmEventType.PENDING
    if state == AlarmState.TRIGGERED:
        return AlarmEventType.TRIGGERED
    return AlarmEventType.STATE_CHANGED


def _record_state_event(
    *,
    snapshot: AlarmStateSnapshot,
    state_from: str | None,
    state_to: str,
    user=None,
    code=None,
    zone: Zone | None = None,
    sensor: Sensor | None = None,
    metadata: dict | None = None,
    timestamp=None,
) -> AlarmEvent:
    return AlarmEvent.objects.create(
        event_type=_event_type_for_state(state_to),
        state_from=state_from,
        state_to=state_to,
        timestamp=timestamp or timezone.now(),
        user=user,
        code=code,
        zone=zone,
        sensor=sensor,
        metadata=metadata or {},
    )


def _record_sensor_event(sensor: Sensor, timestamp=None) -> AlarmEvent:
    return AlarmEvent.objects.create(
        event_type=AlarmEventType.SENSOR_TRIGGERED,
        state_from=None,
        state_to=None,
        timestamp=timestamp or timezone.now(),
        zone=sensor.zone,
        sensor=sensor,
        metadata={"is_entry_point": sensor.is_entry_point},
    )


def record_failed_code(*, user, action: str, metadata: dict | None = None, timestamp=None) -> AlarmEvent:
    return AlarmEvent.objects.create(
        event_type=AlarmEventType.FAILED_CODE,
        state_from=None,
        state_to=None,
        timestamp=timestamp or timezone.now(),
        user=user,
        code=None,
        zone=None,
        sensor=None,
        metadata={"action": action, **(metadata or {})},
    )


def record_code_used(*, user, code: UserCode, action: str, metadata: dict | None = None, timestamp=None) -> AlarmEvent:
    now = timestamp or timezone.now()
    UserCode.objects.filter(id=code.id).update(
        uses_count=models.F("uses_count") + 1,
        last_used_at=now,
    )
    return AlarmEvent.objects.create(
        event_type=AlarmEventType.CODE_USED,
        state_from=None,
        state_to=None,
        timestamp=now,
        user=user,
        code=code,
        zone=None,
        sensor=None,
        metadata={"action": action, **(metadata or {})},
    )


def validate_user_code(*, user, raw_code: str) -> UserCode:
    if raw_code is None:
        raise CodeRequiredError("Code is required.")
    raw_code = str(raw_code).strip()
    if len(raw_code) < 4 or len(raw_code) > 8:
        raise InvalidCodeError("Invalid code.")

    candidates = UserCode.objects.filter(user=user, is_active=True)
    for candidate in candidates:
        if check_password(raw_code, candidate.code_hash):
            return candidate
    raise InvalidCodeError("Invalid code.")


def _get_snapshot_for_update() -> AlarmStateSnapshot:
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
        timing_snapshot=_base_timing(profile).as_dict(),
    )


def _transition(
    *,
    snapshot: AlarmStateSnapshot,
    state_to: str,
    now,
    user=None,
    code=None,
    zone: Zone | None = None,
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
    snapshot.save(update_fields=[
        "current_state",
        "previous_state",
        "entered_at",
        "exit_at",
        "last_transition_reason",
        "last_transition_by",
    ])
    _record_state_event(
        snapshot=snapshot,
        state_from=state_from,
        state_to=state_to,
        user=user,
        code=code,
        zone=zone,
        sensor=sensor,
        metadata=metadata,
        timestamp=now,
    )
    return snapshot


def _set_previous_armed_state(snapshot: AlarmStateSnapshot) -> None:
    if snapshot.current_state in ARMED_STATES:
        snapshot.previous_state = snapshot.current_state
    elif snapshot.current_state == AlarmState.ARMING and snapshot.target_armed_state:
        snapshot.previous_state = snapshot.target_armed_state


@transaction.atomic
def arm(*, target_state: str, user=None, code=None, reason: str = "arm") -> AlarmStateSnapshot:
    if target_state not in ARMED_STATES:
        raise TransitionError("Target state must be an armed state.")
    profile = get_active_settings_profile()
    snapshot = _get_snapshot_for_update()
    if snapshot.current_state != AlarmState.DISARMED:
        raise TransitionError("Alarm can only be armed from disarmed state.")

    timing = _resolve_timing(profile, target_state)
    now = timezone.now()
    snapshot.settings_profile = profile
    snapshot.target_armed_state = target_state
    snapshot.timing_snapshot = timing.as_dict()
    snapshot.save(update_fields=["settings_profile", "target_armed_state", "timing_snapshot"])

    exit_at = now + timedelta(seconds=timing.arming_time)
    return _transition(
        snapshot=snapshot,
        state_to=AlarmState.ARMING,
        now=now,
        user=user,
        code=code,
        reason=reason,
        exit_at=exit_at,
    )


@transaction.atomic
def cancel_arming(*, user=None, code=None, reason: str = "cancel_arming") -> AlarmStateSnapshot:
    snapshot = _get_snapshot_for_update()
    if snapshot.current_state != AlarmState.ARMING:
        raise TransitionError("Alarm is not currently arming.")
    now = timezone.now()
    snapshot.target_armed_state = None
    snapshot.timing_snapshot = {}
    snapshot.save(update_fields=["target_armed_state", "timing_snapshot"])
    return _transition(
        snapshot=snapshot,
        state_to=AlarmState.DISARMED,
        now=now,
        user=user,
        code=code,
        reason=reason,
    )


@transaction.atomic
def disarm(*, user=None, code=None, reason: str = "disarm") -> AlarmStateSnapshot:
    snapshot = _get_snapshot_for_update()
    if snapshot.current_state == AlarmState.DISARMED:
        return snapshot
    now = timezone.now()
    snapshot.target_armed_state = None
    snapshot.timing_snapshot = {}
    snapshot.save(update_fields=["target_armed_state", "timing_snapshot"])
    return _transition(
        snapshot=snapshot,
        state_to=AlarmState.DISARMED,
        now=now,
        user=user,
        code=code,
        reason=reason,
    )


@transaction.atomic
def sensor_triggered(*, sensor: Sensor, user=None, reason: str = "sensor_triggered") -> AlarmStateSnapshot:
    snapshot = _get_snapshot_for_update()
    now = timezone.now()
    _record_sensor_event(sensor, timestamp=now)

    if snapshot.current_state in {AlarmState.PENDING, AlarmState.TRIGGERED}:
        return snapshot

    if snapshot.current_state not in ARMED_STATES and snapshot.current_state != AlarmState.ARMING:
        return snapshot

    _set_previous_armed_state(snapshot)
    snapshot.save(update_fields=["previous_state"])

    timing = _base_timing(snapshot.settings_profile)
    if snapshot.timing_snapshot:
        timing = TimingSnapshot(
            delay_time=snapshot.timing_snapshot.get("delay_time", timing.delay_time),
            arming_time=snapshot.timing_snapshot.get("arming_time", timing.arming_time),
            trigger_time=snapshot.timing_snapshot.get("trigger_time", timing.trigger_time),
        )

    if sensor.is_entry_point:
        timing = _apply_zone_delay(timing, sensor.zone)
        snapshot.timing_snapshot = timing.as_dict()
        snapshot.save(update_fields=["timing_snapshot"])
        exit_at = now + timedelta(seconds=timing.delay_time)
        return _transition(
            snapshot=snapshot,
            state_to=AlarmState.PENDING,
            now=now,
            user=user,
            reason=reason,
            exit_at=exit_at,
            update_previous=False,
            sensor=sensor,
            zone=sensor.zone,
        )

    exit_at = now + timedelta(seconds=timing.trigger_time)
    return _transition(
        snapshot=snapshot,
        state_to=AlarmState.TRIGGERED,
        now=now,
        user=user,
        reason=reason,
        exit_at=exit_at,
        update_previous=False,
        sensor=sensor,
        zone=sensor.zone,
    )


@transaction.atomic
def timer_expired(*, reason: str = "timer_expired") -> AlarmStateSnapshot:
    snapshot = _get_snapshot_for_update()
    if not snapshot.exit_at:
        return snapshot
    now = timezone.now()
    if snapshot.exit_at > now:
        return snapshot

    timing = _base_timing(snapshot.settings_profile)
    if snapshot.timing_snapshot:
        timing = TimingSnapshot(
            delay_time=snapshot.timing_snapshot.get("delay_time", timing.delay_time),
            arming_time=snapshot.timing_snapshot.get("arming_time", timing.arming_time),
            trigger_time=snapshot.timing_snapshot.get("trigger_time", timing.trigger_time),
        )

    if snapshot.current_state == AlarmState.ARMING:
        target_state = snapshot.target_armed_state
        if target_state not in ARMED_STATES:
            raise TransitionError("Missing target armed state for arming timer.")
        snapshot.exit_at = None
        snapshot.save(update_fields=["exit_at"])
        return _transition(
            snapshot=snapshot,
            state_to=target_state,
            now=now,
            reason=reason,
            exit_at=None,
        )

    if snapshot.current_state == AlarmState.PENDING:
        exit_at = now + timedelta(seconds=timing.trigger_time)
        return _transition(
            snapshot=snapshot,
            state_to=AlarmState.TRIGGERED,
            now=now,
            reason=reason,
            exit_at=exit_at,
            update_previous=False,
        )

    if snapshot.current_state == AlarmState.TRIGGERED:
        snapshot.exit_at = None
        snapshot.save(update_fields=["exit_at"])
        if snapshot.settings_profile.disarm_after_trigger:
            snapshot.target_armed_state = None
            snapshot.timing_snapshot = {}
            snapshot.save(update_fields=["target_armed_state", "timing_snapshot"])
            return _transition(
                snapshot=snapshot,
                state_to=AlarmState.DISARMED,
                now=now,
                reason=reason,
            )
        return_state = snapshot.previous_state if snapshot.previous_state in ARMED_STATES else AlarmState.DISARMED
        return _transition(
            snapshot=snapshot,
            state_to=return_state,
            now=now,
            reason=reason,
        )

    return snapshot


def get_current_snapshot(*, process_timers: bool = True) -> AlarmStateSnapshot:
    if process_timers:
        return timer_expired(reason="read_state")
    with transaction.atomic():
        return _get_snapshot_for_update()
