from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from accounts.models import Role, User, UserRoleAssignment
from alarm import services as alarm_services
from alarm.models import AlarmSystem
from alarm.use_cases.settings_profile import ensure_active_settings_profile
from config.domain_exceptions import ConflictError


class OnboardingError(RuntimeError):
    pass


class OnboardingAlreadyCompleted(ConflictError):
    pass


def onboarding_required() -> bool:
    return not User.objects.exists() and not AlarmSystem.objects.exists()


@dataclass(frozen=True)
class OnboardingResult:
    user: User
    alarm_system: AlarmSystem

    def as_dict(self) -> dict[str, str]:
        return {
            "user_id": str(self.user.id),
            "email": self.user.email,
            "home_name": self.alarm_system.name,
            "timezone": self.alarm_system.timezone,
        }


def complete_onboarding(*, email: str, password: str, home_name: str, timezone_name: str) -> OnboardingResult:
    if not onboarding_required():
        raise OnboardingAlreadyCompleted("Onboarding is already completed.")

    with transaction.atomic():
        if not onboarding_required():
            raise OnboardingAlreadyCompleted("Onboarding is already completed.")

        user = User.objects.create_superuser(
            email=email,
            password=password,
            timezone=timezone_name,
            onboarding_completed_at=timezone.now(),
        )
        role, _ = Role.objects.get_or_create(
            slug="admin",
            defaults={
                "name": "Admin",
                "description": "Full administrative access",
            },
        )
        UserRoleAssignment.objects.get_or_create(
            user=user,
            role=role,
            defaults={"assigned_by": user},
        )
        alarm_system = AlarmSystem.objects.create(
            name=home_name,
            timezone=timezone_name,
        )
        ensure_active_settings_profile(timezone_name=timezone_name)
        alarm_services.get_current_snapshot(process_timers=False)

    return OnboardingResult(user=user, alarm_system=alarm_system)
