from __future__ import annotations

from copy import deepcopy

from alarm.crypto import decrypt_secret, encrypt_secret

DEFAULT_MQTT_CONNECTION: dict[str, object] = {
    "enabled": False,
    "host": "",
    "port": 1883,
    "username": "",
    "password": "",
    "use_tls": False,
    "tls_insecure": False,
    "client_id": "cubxi-alarm",
    "keepalive_seconds": 30,
    "connect_timeout_seconds": 5,
}


def normalize_mqtt_connection(raw: object) -> dict[str, object]:
    base = deepcopy(DEFAULT_MQTT_CONNECTION)
    if isinstance(raw, dict):
        base.update({k: v for k, v in raw.items() if k in base})
    return base


def mask_mqtt_connection(raw: object) -> dict[str, object]:
    normalized = normalize_mqtt_connection(raw)
    password = normalized.pop("password", "")
    normalized["has_password"] = bool(password)
    return normalized


def encrypt_mqtt_password(plain: object) -> str:
    if plain is None:
        return ""
    plain_str = str(plain)
    if plain_str == "":
        return ""
    return encrypt_secret(plain_str)


def decrypt_mqtt_password(stored: object) -> str:
    if stored is None:
        return ""
    stored_str = str(stored)
    if stored_str == "":
        return ""
    return decrypt_secret(stored_str)


def prepare_runtime_mqtt_connection(raw: object) -> dict[str, object]:
    """
    Returns a normalized connection dict with a decrypted `password` suitable for runtime usage.
    """

    normalized = normalize_mqtt_connection(raw)
    normalized["password"] = decrypt_mqtt_password(normalized.get("password"))
    return normalized
