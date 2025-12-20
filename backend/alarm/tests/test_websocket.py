from __future__ import annotations

import asyncio

from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase
from rest_framework.authtoken.models import Token

from accounts.models import User
from config.asgi import application


class AlarmWebSocketTests(TransactionTestCase):
    def test_websocket_requires_token(self):
        async def run():
            communicator = WebsocketCommunicator(application, "/ws/alarm/")
            try:
                connected, _ = await communicator.connect()
                self.assertFalse(connected)
            finally:
                await communicator.disconnect()

        asyncio.run(run())

    def test_websocket_connects_with_token(self):
        user = User.objects.create_user(email="ws@example.com", password="pass")
        token = Token.objects.create(user=user)

        async def run():
            communicator = WebsocketCommunicator(application, f"/ws/alarm/?token={token.key}")
            try:
                connected, _ = await communicator.connect()
                self.assertTrue(connected)
            finally:
                await communicator.disconnect()

        asyncio.run(run())
