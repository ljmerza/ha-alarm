from __future__ import annotations

import asyncio

from channels.testing import WebsocketCommunicator
from django.test import Client
from django.test import TransactionTestCase
from rest_framework.authtoken.models import Token

from accounts.models import User
from config.asgi import application


class AlarmWebSocketTests(TransactionTestCase):
    def test_websocket_requires_auth(self):
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

    def test_websocket_connects_with_session_cookie(self):
        user = User.objects.create_user(email="wssession@example.com", password="pass")
        client = Client()
        client.force_login(user)
        sessionid = client.cookies.get("sessionid").value
        cookie_header = f"sessionid={sessionid}".encode("utf-8")

        async def run():
            communicator = WebsocketCommunicator(
                application,
                "/ws/alarm/",
                headers=[(b"cookie", cookie_header)],
            )
            try:
                connected, _ = await communicator.connect()
                self.assertTrue(connected)
            finally:
                await communicator.disconnect()

        asyncio.run(run())
