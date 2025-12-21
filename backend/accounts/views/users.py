from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.policies import is_admin
from accounts.serializers import UserSerializer


class CurrentUserView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


class UsersView(APIView):
    def get(self, request):
        if not is_admin(request.user):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        users = User.objects.order_by("email")
        return Response(UserSerializer(users, many=True).data, status=status.HTTP_200_OK)

