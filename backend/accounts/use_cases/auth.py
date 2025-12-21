from __future__ import annotations

from dataclasses import dataclass

from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from rest_framework.authtoken.models import Token

from accounts.models import User


class AuthError(RuntimeError):
    pass


class InvalidCredentials(AuthError):
    pass


class InvalidRefreshToken(AuthError):
    pass


@dataclass(frozen=True)
class LoginResult:
    user: User
    token: Token


def login(*, request, email: str, password: str) -> LoginResult:
    user = authenticate(request, username=email, password=password)
    if not user:
        raise InvalidCredentials("Invalid credentials.")
    token, _ = Token.objects.get_or_create(user=user)
    update_last_login(None, user)
    return LoginResult(user=user, token=token)


def refresh_token(*, refresh: str) -> Token:
    token = Token.objects.filter(key=refresh).first()
    if not token:
        raise InvalidRefreshToken("Invalid refresh token.")
    return token


def logout(*, user: User) -> None:
    Token.objects.filter(user=user).delete()

