from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def initialize_integrations() -> None:
    """
    Register integration hooks/subscriptions.

    Safe to call multiple times.
    """
    try:
        from alarm.integrations.home_assistant.mqtt_alarm_entity import (
            initialize_home_assistant_mqtt_alarm_entity_integration,
        )
    except Exception:
        return

    try:
        initialize_home_assistant_mqtt_alarm_entity_integration()
    except Exception as exc:
        logger.info("Integrations initialization skipped: %s", exc)


def on_alarm_state_change_committed(*, state_to: str) -> None:
    """
    Called after a DB commit for an alarm state transition.
    """
    try:
        from alarm.integrations.home_assistant.mqtt_alarm_entity import publish_state
    except Exception:
        return

    try:
        publish_state(state=state_to)
    except Exception:
        return
