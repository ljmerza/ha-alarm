from __future__ import annotations

from unittest.mock import patch

from django.test import SimpleTestCase

from alarm import home_assistant
from alarm.gateways.home_assistant import DefaultHomeAssistantGateway, HomeAssistantNotConfigured, HomeAssistantNotReachable


class HomeAssistantGatewayTests(SimpleTestCase):
    def setUp(self):
        self.gateway = DefaultHomeAssistantGateway()

    @patch("alarm.gateways.home_assistant.home_assistant.ensure_available")
    def test_ensure_available_maps_not_configured(self, mock_ensure_available):
        mock_ensure_available.side_effect = home_assistant.HomeAssistantNotConfigured("missing config")
        with self.assertRaises(HomeAssistantNotConfigured) as ctx:
            self.gateway.ensure_available()
        self.assertIn("missing config", str(ctx.exception))

    @patch("alarm.gateways.home_assistant.home_assistant.ensure_available")
    def test_ensure_available_maps_not_reachable(self, mock_ensure_available):
        mock_ensure_available.side_effect = home_assistant.HomeAssistantNotReachable("boom")
        with self.assertRaises(HomeAssistantNotReachable) as ctx:
            self.gateway.ensure_available()
        self.assertEqual(getattr(ctx.exception, "error", None), "boom")

    @patch("alarm.gateways.home_assistant.home_assistant.call_service")
    def test_call_service_delegates(self, mock_call_service):
        self.gateway.call_service(
            domain="alarm_control_panel",
            service="alarm_arm_home",
            target={"entity_id": "alarm_control_panel.home"},
            service_data={"code": "1234"},
            timeout_seconds=1.5,
        )
        mock_call_service.assert_called_once_with(
            domain="alarm_control_panel",
            service="alarm_arm_home",
            target={"entity_id": "alarm_control_panel.home"},
            service_data={"code": "1234"},
            timeout_seconds=1.5,
        )

