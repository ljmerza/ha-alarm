from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from alarm.zwavejs.manager import (
    ZwavejsConnectionManager,
    ZwavejsConnectionSettings,
    ZwavejsConnectionStatus,
    zwavejs_connection_manager,
)


class ZwavejsGateway(Protocol):
    def get_status(self) -> ZwavejsConnectionStatus: ...

    def apply_settings(self, *, settings_obj: ZwavejsConnectionSettings) -> None: ...

    def test_connection(self, *, settings_obj: ZwavejsConnectionSettings, timeout_seconds: float | None = None) -> None: ...

    def ensure_connected(self, *, timeout_seconds: float = 5.0) -> None: ...

    def controller_get_state(self, *, timeout_seconds: float = 5.0) -> dict: ...

    def node_get_defined_value_ids(self, *, node_id: int, timeout_seconds: float = 5.0) -> list[dict]: ...

    def node_get_value_metadata(self, *, node_id: int, value_id: dict, timeout_seconds: float = 5.0) -> dict: ...

    def node_get_value(self, *, node_id: int, value_id: dict, timeout_seconds: float = 5.0) -> object: ...

    def get_home_id(self) -> int | None: ...

    def lock(self, *, node_id: int) -> None: ...

    def unlock(self, *, node_id: int) -> None: ...

    def set_value(
        self,
        *,
        node_id: int,
        endpoint: int,
        command_class: int,
        property: str | int,
        value: object,
        property_key: str | int | None = None,
    ) -> None: ...


@dataclass(frozen=True)
class DefaultZwavejsGateway:
    manager: ZwavejsConnectionManager = zwavejs_connection_manager

    def get_status(self) -> ZwavejsConnectionStatus:
        return self.manager.get_status()

    def apply_settings(self, *, settings_obj: ZwavejsConnectionSettings) -> None:
        self.manager.apply_settings(settings_obj=settings_obj)

    def test_connection(self, *, settings_obj: ZwavejsConnectionSettings, timeout_seconds: float | None = None) -> None:
        self.manager.test_connection(settings_obj=settings_obj, timeout_seconds=timeout_seconds)

    def ensure_connected(self, *, timeout_seconds: float = 5.0) -> None:
        self.manager.ensure_connected(timeout_seconds=timeout_seconds)

    def controller_get_state(self, *, timeout_seconds: float = 5.0) -> dict:
        return self.manager.controller_get_state(timeout_seconds=timeout_seconds)

    def node_get_defined_value_ids(self, *, node_id: int, timeout_seconds: float = 5.0) -> list[dict]:
        return self.manager.node_get_defined_value_ids(node_id=node_id, timeout_seconds=timeout_seconds)

    def node_get_value_metadata(self, *, node_id: int, value_id: dict, timeout_seconds: float = 5.0) -> dict:
        return self.manager.node_get_value_metadata(node_id=node_id, value_id=value_id, timeout_seconds=timeout_seconds)

    def node_get_value(self, *, node_id: int, value_id: dict, timeout_seconds: float = 5.0) -> object:
        return self.manager.node_get_value(node_id=node_id, value_id=value_id, timeout_seconds=timeout_seconds)

    def get_home_id(self) -> int | None:
        return self.manager.get_home_id()

    def lock(self, *, node_id: int) -> None:
        self.manager.lock(node_id=node_id)

    def unlock(self, *, node_id: int) -> None:
        self.manager.unlock(node_id=node_id)

    def set_value(
        self,
        *,
        node_id: int,
        endpoint: int,
        command_class: int,
        property: str | int,
        value: object,
        property_key: str | int | None = None,
    ) -> None:
        self.manager.set_value(
            node_id=node_id,
            endpoint=endpoint,
            command_class=command_class,
            property=property,
            value=value,
            property_key=property_key,
        )


default_zwavejs_gateway: ZwavejsGateway = DefaultZwavejsGateway()
