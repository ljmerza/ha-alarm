from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import Q


class AlarmState(models.TextChoices):
    DISARMED = "disarmed", "Disarmed"
    ARMING = "arming", "Arming"
    ARMED_HOME = "armed_home", "Armed home"
    ARMED_AWAY = "armed_away", "Armed away"
    ARMED_NIGHT = "armed_night", "Armed night"
    ARMED_VACATION = "armed_vacation", "Armed vacation"
    PENDING = "pending", "Pending"
    TRIGGERED = "triggered", "Triggered"


class AlarmEventType(models.TextChoices):
    ARMED = "armed", "Armed"
    DISARMED = "disarmed", "Disarmed"
    PENDING = "pending", "Pending"
    TRIGGERED = "triggered", "Triggered"
    CODE_USED = "code_used", "Code used"
    SENSOR_TRIGGERED = "sensor_triggered", "Sensor triggered"
    FAILED_CODE = "failed_code", "Failed code"
    STATE_CHANGED = "state_changed", "State changed"


class AlarmSystem(models.Model):
    name = models.CharField(max_length=150)
    timezone = models.CharField(max_length=64, default=settings.TIME_ZONE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:  # pragma: no cover - simple representation
        return self.name


class AlarmSettingsProfile(models.Model):
    name = models.CharField(max_length=150, unique=True)
    is_active = models.BooleanField(default=False)
    delay_time = models.PositiveIntegerField(default=60)
    arming_time = models.PositiveIntegerField(default=60)
    trigger_time = models.PositiveIntegerField(default=120)
    disarm_after_trigger = models.BooleanField(default=False)
    code_arm_required = models.BooleanField(default=True)
    available_arming_states = models.JSONField(default=list, blank=True)
    state_overrides = models.JSONField(default=dict, blank=True)
    audio_visual_settings = models.JSONField(default=dict, blank=True)
    sensor_behavior = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["is_active"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - simple representation
        return self.name


class AlarmStateSnapshot(models.Model):
    current_state = models.CharField(max_length=32, choices=AlarmState.choices)
    previous_state = models.CharField(
        max_length=32, choices=AlarmState.choices, null=True, blank=True
    )
    target_armed_state = models.CharField(
        max_length=32, choices=AlarmState.choices, null=True, blank=True
    )
    settings_profile = models.ForeignKey(
        AlarmSettingsProfile,
        on_delete=models.PROTECT,
        related_name="state_snapshots",
    )
    entered_at = models.DateTimeField()
    exit_at = models.DateTimeField(null=True, blank=True)
    last_transition_reason = models.CharField(max_length=64, blank=True)
    last_transition_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="alarm_transitions",
    )
    timing_snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["current_state"]),
            models.Index(fields=["exit_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - simple representation
        return f"{self.current_state} ({self.entered_at})"


class Zone(models.Model):
    name = models.CharField(max_length=150, unique=True)
    is_active = models.BooleanField(default=True)
    entry_delay_override = models.PositiveIntegerField(null=True, blank=True)
    active_states = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["is_active"])]

    def __str__(self) -> str:  # pragma: no cover - simple representation
        return self.name


class Sensor(models.Model):
    name = models.CharField(max_length=150)
    zone = models.ForeignKey(Zone, on_delete=models.PROTECT, related_name="sensors")
    entity_id = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    is_entry_point = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["zone", "name"], name="sensors_zone_name"),
        ]
        indexes = [
            models.Index(fields=["zone", "is_active"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - simple representation
        return f"{self.zone_id}:{self.name}"


class AlarmEvent(models.Model):
    event_type = models.CharField(max_length=32, choices=AlarmEventType.choices)
    state_from = models.CharField(
        max_length=32, choices=AlarmState.choices, null=True, blank=True
    )
    state_to = models.CharField(
        max_length=32, choices=AlarmState.choices, null=True, blank=True
    )
    timestamp = models.DateTimeField()
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="alarm_events",
    )
    code = models.ForeignKey(
        "accounts.UserCode",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="alarm_events",
    )
    zone = models.ForeignKey(
        Zone,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="alarm_events",
    )
    sensor = models.ForeignKey(
        Sensor,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="alarm_events",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["event_type", "timestamp"]),
            models.Index(fields=["state_to"]),
            models.Index(fields=["timestamp"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(timestamp__isnull=False),
                name="alarm_events_timestamp_not_null",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - simple representation
        return f"{self.event_type}:{self.timestamp}"
