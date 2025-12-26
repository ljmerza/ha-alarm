from __future__ import annotations

OBJECT_ID = "latchpoint_alarm"

DISCOVERY_TOPIC = f"homeassistant/alarm_control_panel/{OBJECT_ID}/config"
STATE_TOPIC = f"{OBJECT_ID}/alarm/state"
COMMAND_TOPIC = f"{OBJECT_ID}/alarm/command"
AVAILABILITY_TOPIC = f"{OBJECT_ID}/alarm/availability"
ERROR_TOPIC = f"{OBJECT_ID}/alarm/error"

