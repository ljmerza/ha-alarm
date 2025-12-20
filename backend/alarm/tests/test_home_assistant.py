from __future__ import annotations

from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from accounts.models import User


class HomeAssistantStatusApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="ha@example.com", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    @override_settings(HOME_ASSISTANT_URL="", HOME_ASSISTANT_TOKEN="")
    def test_status_not_configured(self):
        url = reverse("ha-status")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["configured"])
        self.assertFalse(response.data["reachable"])

    @override_settings(HOME_ASSISTANT_URL="http://ha:8123", HOME_ASSISTANT_TOKEN="token")
    @patch("alarm.home_assistant._get_client")
    def test_status_reachable(self, mock_get_client):
        class _Client:
            def get_config(self):
                return {"version": "1.0"}

        mock_get_client.return_value = _Client()
        url = reverse("ha-status")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["configured"])
        self.assertTrue(response.data["reachable"])

    @override_settings(HOME_ASSISTANT_URL="http://ha:8123", HOME_ASSISTANT_TOKEN="token")
    @patch("alarm.home_assistant._get_client")
    def test_entities_returns_data(self, mock_get_client):
        class _State:
            entity_id = "binary_sensor.front_door"
            state = "off"
            attributes = {"friendly_name": "Front Door", "device_class": "door"}
            last_changed = "2025-01-01T00:00:00Z"

        class _Client:
            def get_config(self):
                return {"version": "1.0"}

            def get_states(self):
                return [_State()]

        mock_get_client.return_value = _Client()
        url = reverse("ha-entities")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["data"][0]["entity_id"], "binary_sensor.front_door")

    @override_settings(HOME_ASSISTANT_URL="http://ha:8123", HOME_ASSISTANT_TOKEN="token")
    @patch("alarm.home_assistant.get_status")
    @patch("alarm.home_assistant.list_entities", side_effect=RuntimeError("boom"))
    def test_entities_handles_list_failure(self, mock_list_entities, mock_get_status):
        class _Status:
            configured = True
            reachable = True
            error = None

        mock_get_status.return_value = _Status()
        url = reverse("ha-entities")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["detail"], "Failed to fetch Home Assistant entities.")
