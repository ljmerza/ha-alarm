from __future__ import annotations

from copy import deepcopy

from alarm.crypto import decrypt_secret, encrypt_secret

DEFAULT_ZWAVEJS_CONNECTION: dict[str, object] = {
    "enabled": False,
    "ws_url": "",
    "api_token": "",
    "connect_timeout_seconds": 5,
    "reconnect_min_seconds": 1,
    "reconnect_max_seconds": 30,
}


def normalize_zwavejs_connection(raw: object) -> dict[str, object]:
    base = deepcopy(DEFAULT_ZWAVEJS_CONNECTION)
    if isinstance(raw, dict):
        base.update({k: v for k, v in raw.items() if k in base})
    return base


def mask_zwavejs_connection(raw: object) -> dict[str, object]:
    normalized = normalize_zwavejs_connection(raw)
    token = normalized.pop("api_token", "")
    normalized["has_api_token"] = bool(token)
    return normalized


def encrypt_zwavejs_api_token(plain: object) -> str:
    if plain is None:
        return ""
    plain_str = str(plain)
    if plain_str == "":
        return ""
    return encrypt_secret(plain_str)


def decrypt_zwavejs_api_token(stored: object) -> str:
    if stored is None:
        return ""
    stored_str = str(stored)
    if stored_str == "":
        return ""
    return decrypt_secret(stored_str)


def prepare_runtime_zwavejs_connection(raw: object) -> dict[str, object]:
    """
    Returns a normalized connection dict with a decrypted `api_token` suitable for runtime usage.
    """

    normalized = normalize_zwavejs_connection(raw)
    normalized["api_token"] = decrypt_zwavejs_api_token(normalized.get("api_token"))
    return normalized

