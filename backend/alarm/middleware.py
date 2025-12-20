from __future__ import annotations

from urllib.parse import parse_qs

from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework.authtoken.models import Token


@database_sync_to_async
def _get_user_for_token(token_key: str):
    try:
        token = Token.objects.select_related("user").get(key=token_key)
    except Token.DoesNotExist:
        return AnonymousUser()
    return token.user


class QueryStringTokenAuthMiddleware(BaseMiddleware):
    """
    Authenticate a Channels websocket connection using `?token=<key>`.
    """

    async def __call__(self, scope, receive, send):
        query_string = (scope.get("query_string") or b"").decode("utf-8")
        token_key = parse_qs(query_string).get("token", [None])[0]
        if token_key:
            scope["user"] = await _get_user_for_token(token_key)
        return await super().__call__(scope, receive, send)
