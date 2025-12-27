from __future__ import annotations

import sys

from django.apps import AppConfig


class AlarmConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "alarm"

    def ready(self) -> None:
        # Avoid side effects during migrations/collectstatic/tests.
        argv = " ".join(sys.argv).lower()
        if any(token in argv for token in ["makemigrations", "migrate", "collectstatic", "pytest", " test"]):
            return

        try:
            from django.db import connection

            connection.ensure_connection()
        except Exception:
            return

        try:
            from alarm.gateways.mqtt import default_mqtt_gateway
            from alarm.integrations.dispatch import initialize_integrations
            from alarm.state_machine.settings import get_active_settings_profile, get_setting_json
            from alarm.mqtt.config import normalize_mqtt_connection, prepare_runtime_mqtt_connection
        except Exception:
            return

        # Register subscriptions + on-connect hooks for integrations.
        initialize_integrations()

        # Best-effort: connect if configured.
        try:
            profile = get_active_settings_profile()
            settings_obj = normalize_mqtt_connection(get_setting_json(profile, "mqtt_connection") or {})
            default_mqtt_gateway.apply_settings(settings=prepare_runtime_mqtt_connection(settings_obj))
        except Exception:
            return
