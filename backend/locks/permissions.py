from __future__ import annotations

from rest_framework.permissions import BasePermission

from accounts.policies import is_admin


class IsAdminRole(BasePermission):
    message = "Forbidden."

    def has_permission(self, request, view) -> bool:
        return is_admin(request.user)


class IsAdminOrSelf(BasePermission):
    message = "Forbidden."

    def has_permission(self, request, view) -> bool:
        if is_admin(request.user):
            return True
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj) -> bool:
        if is_admin(request.user):
            return True
        owner_id = getattr(obj, "user_id", None) or getattr(obj, "user", None) and getattr(obj.user, "id", None)
        return owner_id == getattr(request.user, "id", None)
