from __future__ import annotations

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token

from alarm.models import AlarmSettingsProfile, AlarmStateSnapshot, Sensor

from .models import User, UserCode
from .policies import is_admin
from .serializers import (
    LoginSerializer,
    OnboardingSerializer,
    UserCodeCreateSerializer,
    UserCodeSerializer,
    UserCodeUpdateSerializer,
    UserSerializer,
)
from .use_cases import onboarding as onboarding_uc
from .use_cases import codes as codes_uc


class OnboardingView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {"onboarding_required": onboarding_uc.onboarding_required()},
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = OnboardingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        home_name = serializer.validated_data["home_name"]

        try:
            result = onboarding_uc.complete_onboarding(
                email=email,
                password=password,
                home_name=home_name,
                timezone_name=settings.TIME_ZONE,
            )
        except onboarding_uc.OnboardingAlreadyCompleted as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(result.as_dict(), status=status.HTTP_201_CREATED)


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
        if not is_admin(request.user):
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
        user_id = request.query_params.get("user_id")
        try:
            target_user = codes_uc.resolve_list_target_user(actor_user=request.user, requested_user_id=user_id)
        except codes_uc.NotFound as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        codes = codes_uc.list_codes_for_user(user=target_user)
        return Response(UserCodeSerializer(codes, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        reauth_password = request.data.get("reauth_password")
        try:
            codes_uc.assert_admin(user=request.user)
        except codes_uc.Forbidden as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        try:
            codes_uc.assert_admin_reauth(user=request.user, reauth_password=reauth_password)
        except codes_uc.ReauthRequired as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except codes_uc.ReauthFailed as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)

        try:
            target_user = codes_uc.resolve_create_target_user(
                actor_user=request.user,
                requested_user_id=request.data.get("user_id"),
            )
        except codes_uc.NotFound as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

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
        try:
            code = codes_uc.get_code_for_read(actor_user=request.user, code_id=code_id)
        except codes_uc.NotFound as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except codes_uc.Forbidden as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        return Response(UserCodeSerializer(code).data, status=status.HTTP_200_OK)

    def patch(self, request, code_id: int):
        reauth_password = request.data.get("reauth_password")
        try:
            codes_uc.assert_admin(user=request.user)
        except codes_uc.Forbidden as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        try:
            codes_uc.assert_admin_reauth(user=request.user, reauth_password=reauth_password)
        except codes_uc.ReauthRequired as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except codes_uc.ReauthFailed as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)

        try:
            code = codes_uc.get_code_for_admin_update(actor_user=request.user, code_id=code_id)
        except codes_uc.NotFound as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        serializer = UserCodeUpdateSerializer(instance=code, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        code = serializer.save()
        code = (
            UserCode.objects.select_related("user")
            .prefetch_related("allowed_states")
            .get(id=code.id)
        )
        return Response(UserCodeSerializer(code).data, status=status.HTTP_200_OK)
