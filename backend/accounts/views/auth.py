from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import LoginSerializer, UserSerializer
from accounts.use_cases import auth as auth_uc


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        result = auth_uc.login(request=request, email=email, password=password)
        return Response(
            {
                "user": UserSerializer(result.user).data,
                "accessToken": result.token.key,
                "refreshToken": result.token.key,
                "requires2FA": False,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    def post(self, request):
        auth_uc.logout(user=request.user)
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
        token = auth_uc.refresh_token(refresh=refresh)
        return Response(
            {"accessToken": token.key, "refreshToken": token.key},
            status=status.HTTP_200_OK,
        )
