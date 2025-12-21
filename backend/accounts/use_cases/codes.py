from __future__ import annotations

from django.db.models import QuerySet

from accounts.models import User, UserCode
from accounts.policies import is_admin
from config.domain_exceptions import ForbiddenError, NotFoundError, ValidationError


class Forbidden(ForbiddenError):
    pass


class NotFound(NotFoundError):
    pass


class ReauthRequired(ValidationError):
    pass


class ReauthFailed(ForbiddenError):
    pass


def assert_admin(*, user: User) -> None:
    if not is_admin(user):
        raise Forbidden("Forbidden.")


def assert_admin_reauth(*, user: User, reauth_password: str | None) -> None:
    if not reauth_password:
        raise ReauthRequired("Re-authentication required.")
    if not user.check_password(reauth_password):
        raise ReauthFailed("Re-authentication failed.")


def resolve_list_target_user(*, actor_user: User, requested_user_id: str | None) -> User:
    if requested_user_id and is_admin(actor_user):
        target_user = User.objects.filter(id=requested_user_id).first()
        if not target_user:
            raise NotFound("User not found.")
        return target_user
    return actor_user


def list_codes_for_user(*, user: User) -> QuerySet[UserCode]:
    return (
        UserCode.objects.select_related("user")
        .prefetch_related("allowed_states")
        .filter(user=user)
        .order_by("-created_at")
    )


def resolve_create_target_user(*, actor_user: User, requested_user_id: str | None) -> User:
    assert_admin(user=actor_user)
    target_user_id = requested_user_id or str(actor_user.id)
    target_user = User.objects.filter(id=target_user_id).first()
    if not target_user:
        raise NotFound("User not found.")
    return target_user


def get_code_for_read(*, actor_user: User, code_id: int) -> UserCode:
    code = (
        UserCode.objects.select_related("user")
        .prefetch_related("allowed_states")
        .filter(id=code_id)
        .first()
    )
    if not code:
        raise NotFound("Not found.")
    if not is_admin(actor_user) and code.user_id != actor_user.id:
        raise Forbidden("Forbidden.")
    return code


def get_code_for_admin_update(*, actor_user: User, code_id: int) -> UserCode:
    assert_admin(user=actor_user)
    code = (
        UserCode.objects.select_related("user")
        .prefetch_related("allowed_states")
        .filter(id=code_id)
        .first()
    )
    if not code:
        raise NotFound("Not found.")
    return code
