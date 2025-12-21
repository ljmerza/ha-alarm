from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from django.utils import timezone

from alarm.models import Entity, Rule, RuleRuntimeState
from alarm.rules.runtime_state import ensure_runtime


@dataclass(frozen=True)
class RuleEngineRepositories:
    list_enabled_rules: Callable[[], list[Rule]]
    entity_state_map: Callable[[], dict[str, str | None]]
    due_runtimes: Callable[[object], list[RuleRuntimeState]]
    ensure_runtime: Callable[[Rule], RuleRuntimeState]


def default_rule_engine_repositories() -> RuleEngineRepositories:
    def _list_enabled_rules() -> list[Rule]:
        return list(Rule.objects.filter(enabled=True).order_by("-priority", "id"))

    def _entity_state_map() -> dict[str, str | None]:
        return {e.entity_id: e.last_state for e in Entity.objects.all()}

    def _due_runtimes(now) -> list[RuleRuntimeState]:
        now = now or timezone.now()
        return list(
            RuleRuntimeState.objects.select_for_update()
            .filter(scheduled_for__isnull=False, scheduled_for__lte=now, rule__enabled=True)
            .select_related("rule")
            .order_by("scheduled_for", "id")
        )

    return RuleEngineRepositories(
        list_enabled_rules=_list_enabled_rules,
        entity_state_map=_entity_state_map,
        due_runtimes=_due_runtimes,
        ensure_runtime=ensure_runtime,
    )

