from __future__ import annotations

import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class AlarmConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or getattr(user, "is_anonymous", True):
            logger.info("WS connect: rejected anonymous user")
            await self.close(code=4401)
            return
        logger.info("WS connect: accepted user_id=%s", getattr(user, "id", None))
        await self.accept()

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def disconnect(self, code):
        user = self.scope.get("user")
        logger.info("WS disconnect: code=%s user_id=%s", code, getattr(user, "id", None) if user else None)
