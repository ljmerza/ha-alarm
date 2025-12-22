from __future__ import annotations

from django.test import TestCase

from accounts.models import Role, User, UserRoleAssignment
from accounts.use_cases.onboarding import OnboardingAlreadyCompleted, complete_onboarding, onboarding_required
from alarm.models import AlarmSettingsProfile, AlarmStateSnapshot, AlarmSystem


class OnboardingUseCaseTests(TestCase):
    def test_onboarding_required_true_on_empty_db(self):
        self.assertTrue(onboarding_required())

    def test_complete_onboarding_creates_admin_and_system(self):
        result = complete_onboarding(
            email="admin@example.com",
            password="pass",
            home_name="Home",
            timezone_name="UTC",
        )
        self.assertEqual(result.user.email, "admin@example.com")
        self.assertTrue(User.objects.filter(email="admin@example.com").exists())
        self.assertTrue(AlarmSystem.objects.filter(name="Home").exists())

        role = Role.objects.get(slug="admin")
        self.assertTrue(UserRoleAssignment.objects.filter(user=result.user, role=role).exists())
        self.assertTrue(AlarmSettingsProfile.objects.filter(is_active=True).exists())
        self.assertTrue(AlarmStateSnapshot.objects.exists())

    def test_complete_onboarding_raises_after_completed(self):
        complete_onboarding(
            email="admin@example.com",
            password="pass",
            home_name="Home",
            timezone_name="UTC",
        )
        with self.assertRaises(OnboardingAlreadyCompleted):
            complete_onboarding(
                email="admin2@example.com",
                password="pass",
                home_name="Home2",
                timezone_name="UTC",
            )

