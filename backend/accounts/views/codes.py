from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserCode
from accounts.serializers import UserCodeCreateSerializer, UserCodeSerializer, UserCodeUpdateSerializer
from accounts.use_cases import codes as codes_uc


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
