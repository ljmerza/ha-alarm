from __future__ import annotations

from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from accounts.models import User


class AuthApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="auth@example.com", password="pass")

    def test_login_returns_token_payload(self):
        url = reverse("auth-login")
        response = self.client.post(url, data={"email": "auth@example.com", "password": "pass"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("accessToken", response.data)
        self.assertIn("refreshToken", response.data)
        self.assertEqual(response.data["accessToken"], response.data["refreshToken"])
        self.assertEqual(response.data["user"]["email"], "auth@example.com")

    def test_login_rejects_invalid_credentials(self):
        url = reverse("auth-login")
        response = self.client.post(url, data={"email": "auth@example.com", "password": "wrong"}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_refresh_requires_refresh_token(self):
        url = reverse("auth-token-refresh")
        response = self.client.post(url, data={}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Missing refresh token.")

    def test_refresh_rejects_invalid_token(self):
        url = reverse("auth-token-refresh")
        response = self.client.post(url, data={"refresh": "nope"}, format="json")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Invalid refresh token.")

    def test_refresh_returns_same_token(self):
        token = Token.objects.create(user=self.user)
        url = reverse("auth-token-refresh")
        response = self.client.post(url, data={"refresh": token.key}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["accessToken"], token.key)
        self.assertEqual(response.data["refreshToken"], token.key)

    def test_logout_deletes_token(self):
        token = Token.objects.create(user=self.user)
        self.client.force_authenticate(self.user, token=token)
        url = reverse("auth-logout")
        response = self.client.post(url, data={}, format="json")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Token.objects.filter(key=token.key).exists())

