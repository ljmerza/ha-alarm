from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdminRole
from accounts.serializers import UserSerializer


class CurrentUserView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


class UsersView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        users = User.objects.order_by("email")
        return Response(UserSerializer(users, many=True).data, status=status.HTTP_200_OK)
