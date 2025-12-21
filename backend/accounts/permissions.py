from __future__ import annotations

from rest_framework.permissions import BasePermission

from accounts.policies import is_admin


class IsAdminRole(BasePermission):
    message = "Forbidden."

    def has_permission(self, request, view) -> bool:
        return is_admin(request.user)

