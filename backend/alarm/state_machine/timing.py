from __future__ import annotations

from dataclasses import dataclass

from alarm.models import AlarmSettingsProfile, AlarmStateSnapshot


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


def base_timing(profile: AlarmSettingsProfile) -> TimingSnapshot:
    return TimingSnapshot(
        delay_time=profile.delay_time,
        arming_time=profile.arming_time,
        trigger_time=profile.trigger_time,
    )


def resolve_timing(profile: AlarmSettingsProfile, target_state: str) -> TimingSnapshot:
    timing = base_timing(profile)
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


def timing_from_snapshot(snapshot: AlarmStateSnapshot) -> TimingSnapshot:
    timing = base_timing(snapshot.settings_profile)
    if snapshot.timing_snapshot:
        timing = TimingSnapshot(
            delay_time=snapshot.timing_snapshot.get("delay_time", timing.delay_time),
            arming_time=snapshot.timing_snapshot.get("arming_time", timing.arming_time),
            trigger_time=snapshot.timing_snapshot.get("trigger_time", timing.trigger_time),
        )
    return timing

