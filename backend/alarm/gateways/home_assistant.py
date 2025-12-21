from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from alarm import home_assistant


class HomeAssistantGateway(Protocol):
    def get_status(self, *, timeout_seconds: float = 2.0) -> home_assistant.HomeAssistantStatus: ...

    def ensure_available(self, *, timeout_seconds: float = 2.0) -> home_assistant.HomeAssistantStatus: ...

    def list_entities(self, *, timeout_seconds: float = 5.0) -> list[dict[str, Any]]: ...

    def call_service(
        self,
        *,
        domain: str,
        service: str,
        target: dict[str, Any] | None = None,
        service_data: dict[str, Any] | None = None,
        timeout_seconds: float = 5.0,
    ) -> None: ...


@dataclass(frozen=True)
class DefaultHomeAssistantGateway:
    """
    Adapter around `alarm.home_assistant` module to allow DI-friendly usage.
    """

    def get_status(self, *, timeout_seconds: float = 2.0) -> home_assistant.HomeAssistantStatus:
        return home_assistant.get_status(timeout_seconds=timeout_seconds)

    def ensure_available(self, *, timeout_seconds: float = 2.0) -> home_assistant.HomeAssistantStatus:
        return home_assistant.ensure_available(timeout_seconds=timeout_seconds)

    def list_entities(self, *, timeout_seconds: float = 5.0) -> list[dict[str, Any]]:
        return home_assistant.list_entities(timeout_seconds=timeout_seconds)

    def call_service(
        self,
        *,
        domain: str,
        service: str,
        target: dict[str, Any] | None = None,
        service_data: dict[str, Any] | None = None,
        timeout_seconds: float = 5.0,
    ) -> None:
        return home_assistant.call_service(
            domain=domain,
            service=service,
            target=target,
            service_data=service_data,
            timeout_seconds=timeout_seconds,
        )


default_home_assistant_gateway = DefaultHomeAssistantGateway()
