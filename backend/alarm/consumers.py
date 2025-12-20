from __future__ import annotations

from channels.generic.websocket import AsyncJsonWebsocketConsumer


class AlarmConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or getattr(user, "is_anonymous", True):
            await self.close(code=4401)
            return
        await self.accept()

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

