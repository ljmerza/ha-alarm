from __future__ import annotations

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token

from alarm import services as alarm_services
from alarm.models import AlarmSettingsProfile, AlarmState, AlarmStateSnapshot, AlarmSystem, Sensor

from .models import Role, User, UserCode, UserRoleAssignment
from .serializers import (
    LoginSerializer,
    OnboardingSerializer,
    UserCodeCreateSerializer,
    UserCodeSerializer,
    UserCodeUpdateSerializer,
    UserSerializer,
)


def _is_admin(user: User) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    return user.role_assignments.filter(role__slug="admin").exists()


def _ensure_active_settings_profile() -> AlarmSettingsProfile:
    profile = AlarmSettingsProfile.objects.filter(is_active=True).first()
    if profile:
        return profile
    existing = AlarmSettingsProfile.objects.first()
    if existing:
        existing.is_active = True
        existing.save(update_fields=["is_active"])
        return existing
    return AlarmSettingsProfile.objects.create(
        name="Default",
        is_active=True,
        delay_time=60,
        arming_time=60,
        trigger_time=120,
        disarm_after_trigger=False,
        code_arm_required=True,
        available_arming_states=[
            AlarmState.ARMED_AWAY,
            AlarmState.ARMED_HOME,
            AlarmState.ARMED_NIGHT,
            AlarmState.ARMED_VACATION,
        ],
        state_overrides={},
        audio_visual_settings={
            "beep_enabled": True,
            "countdown_display_enabled": True,
            "color_coding_enabled": True,
        },
        sensor_behavior={
            "warn_on_open_sensors": True,
            "auto_bypass_enabled": False,
            "force_arm_enabled": True,
        },
    )


def _onboarding_required() -> bool:
    return not User.objects.exists() and not AlarmSystem.objects.exists()


class OnboardingView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {"onboarding_required": _onboarding_required()},
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = OnboardingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        home_name = serializer.validated_data["home_name"]

        if not _onboarding_required():
            return Response(
                {"detail": "Onboarding is already completed."},
                status=status.HTTP_409_CONFLICT,
            )

        with transaction.atomic():
            if not _onboarding_required():
                return Response(
                    {"detail": "Onboarding is already completed."},
                    status=status.HTTP_409_CONFLICT,
                )
            user = User.objects.create_superuser(
                email=email,
                password=password,
                timezone=settings.TIME_ZONE,
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
                timezone=settings.TIME_ZONE,
            )
            _ensure_active_settings_profile()
            alarm_services.get_current_snapshot(process_timers=False)

        return Response(
            {
                "user_id": str(user.id),
                "email": user.email,
                "home_name": alarm_system.name,
                "timezone": alarm_system.timezone,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        user = authenticate(request, username=email, password=password)
        if not user:
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        token, _ = Token.objects.get_or_create(user=user)
        update_last_login(None, user)
        return Response(
            {
                "user": UserSerializer(user).data,
                "accessToken": token.key,
                "refreshToken": token.key,
                "requires2FA": False,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    def post(self, request):
        token = Token.objects.filter(user=request.user).first()
        if token:
            token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RefreshTokenView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        refresh = request.data.get("refresh")
        if not refresh:
            return Response(
                {"detail": "Missing refresh token."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        token = Token.objects.filter(key=refresh).first()
        if not token:
            return Response(
                {"detail": "Invalid refresh token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return Response(
            {"accessToken": token.key, "refreshToken": token.key},
            status=status.HTTP_200_OK,
        )


class CurrentUserView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


class UsersView(APIView):
    def get(self, request):
        if not _is_admin(request.user):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        users = User.objects.order_by("email")
        return Response(UserSerializer(users, many=True).data, status=status.HTTP_200_OK)


class SetupStatusView(APIView):
    def get(self, request):
        has_active_settings_profile = AlarmSettingsProfile.objects.filter(is_active=True).exists()
        has_alarm_snapshot = AlarmStateSnapshot.objects.exists()
        has_alarm_code = UserCode.objects.filter(user=request.user, is_active=True).exists()
        has_sensors = Sensor.objects.exists()
        home_assistant_connected = False

        setup_required = not (has_alarm_code and has_active_settings_profile and has_alarm_snapshot)

        return Response(
            {
                "onboarding_required": False,
                "setup_required": setup_required,
                "requirements": {
                    "has_active_settings_profile": has_active_settings_profile,
                    "has_alarm_snapshot": has_alarm_snapshot,
                    "has_alarm_code": has_alarm_code,
                    "has_sensors": has_sensors,
                    "home_assistant_connected": home_assistant_connected,
                },
            },
            status=status.HTTP_200_OK,
        )


class CodesView(APIView):
    def get(self, request):
        target_user = request.user
        user_id = request.query_params.get("user_id")
        if user_id and _is_admin(request.user):
            target_user = User.objects.filter(id=user_id).first()
            if not target_user:
                return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        codes = (
            UserCode.objects.select_related("user")
            .prefetch_related("allowed_states")
            .filter(user=target_user)
            .order_by("-created_at")
        )
        return Response(UserCodeSerializer(codes, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        if not _is_admin(request.user):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        reauth_password = request.data.get("reauth_password")
        if not reauth_password:
            return Response({"detail": "Re-authentication required."}, status=status.HTTP_400_BAD_REQUEST)
        if not request.user.check_password(reauth_password):
            return Response({"detail": "Re-authentication failed."}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.data.get("user_id") or str(request.user.id)
        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = UserCodeCreateSerializer(
            data=request.data,
            context={"request": request, "target_user": target_user},
        )
        serializer.is_valid(raise_exception=True)
        code = serializer.save()
        code = (
            UserCode.objects.select_related("user")
            .prefetch_related("allowed_states")
            .get(id=code.id)
        )
        return Response(UserCodeSerializer(code).data, status=status.HTTP_201_CREATED)


class CodeDetailView(APIView):
    def get(self, request, code_id: int):
        code = (
            UserCode.objects.select_related("user")
            .prefetch_related("allowed_states")
            .filter(id=code_id)
            .first()
        )
        if not code:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _is_admin(request.user) and code.user_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        return Response(UserCodeSerializer(code).data, status=status.HTTP_200_OK)

    def patch(self, request, code_id: int):
        code = (
            UserCode.objects.select_related("user")
            .prefetch_related("allowed_states")
            .filter(id=code_id)
            .first()
        )
        if not code:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _is_admin(request.user):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        reauth_password = request.data.get("reauth_password")
        if not reauth_password:
            return Response({"detail": "Re-authentication required."}, status=status.HTTP_400_BAD_REQUEST)
        if not request.user.check_password(reauth_password):
            return Response({"detail": "Re-authentication failed."}, status=status.HTTP_403_FORBIDDEN)

        serializer = UserCodeUpdateSerializer(instance=code, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        code = serializer.save()
        code = (
            UserCode.objects.select_related("user")
            .prefetch_related("allowed_states")
            .get(id=code.id)
        )
        return Response(UserCodeSerializer(code).data, status=status.HTTP_200_OK)
