# ADR 0007: Home Assistant Gateway Abstraction

## Status
Accepted

## Context
Multiple parts of the backend interact with Home Assistant:
- entity import/sync,
- sensor “live state” enrichment,
- rule actions (`ha_call_service`).

Direct imports of `alarm.home_assistant` couple business logic to a concrete integration module and make it harder to introduce security controls (e.g., limiting which HA services can be called).

## Decision
- Introduce `alarm.gateways.home_assistant.DefaultHomeAssistantGateway` as an adapter around `alarm.home_assistant`.
- Depend on the `HomeAssistantGateway` Protocol in application code (DIP), using `default_home_assistant_gateway` as the default implementation.

## Alternatives Considered
- Keep using `alarm.home_assistant` directly and patch module-level functions in tests.
- Fully implement an integration layer (repositories, ports/adapters) now (more structure than needed).

## Consequences
- Improves testability and reuse: callers can inject fake gateways.
- Keeps the existing `alarm.home_assistant` API intact for incremental migration.

## Todos
- Consider per-role authorization and rate limiting for HA service calls.
