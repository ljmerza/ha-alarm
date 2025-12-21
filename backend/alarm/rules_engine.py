from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.db import transaction
from django.utils import timezone

from .models import Entity, Rule, RuleRuntimeState
from .rules.action_executor import execute_actions
from .rules.audit_log import log_rule_action
from .rules.conditions import eval_condition, eval_condition_explain, extract_for
from .rules.runtime_state import cooldown_active, ensure_runtime


class RuleEngineError(RuntimeError):
    pass


@dataclass(frozen=True)
class RuleRunResult:
    evaluated: int
    fired: int
    scheduled: int
    skipped_cooldown: int
    errors: int

    def as_dict(self) -> dict[str, int]:
        return {
            "evaluated": self.evaluated,
            "fired": self.fired,
            "scheduled": self.scheduled,
            "skipped_cooldown": self.skipped_cooldown,
            "errors": self.errors,
        }


@transaction.atomic
def run_rules(*, now=None, actor_user=None) -> RuleRunResult:
    now = now or timezone.now()
    rules = list(Rule.objects.filter(enabled=True).order_by("-priority", "id"))
    entities = Entity.objects.all()
    entity_state = {e.entity_id: e.last_state for e in entities}

    fired = 0
    scheduled = 0
    skipped_cooldown = 0
    errors = 0

    due_runtimes = list(
        RuleRuntimeState.objects.select_for_update()
        .filter(scheduled_for__isnull=False, scheduled_for__lte=now, rule__enabled=True)
        .select_related("rule")
        .order_by("scheduled_for", "id")
    )

    for runtime in due_runtimes:
        rule = runtime.rule
        seconds, child = extract_for((rule.definition or {}).get("when") if isinstance(rule.definition, dict) else None)
        if not seconds:
            runtime.scheduled_for = None
            runtime.became_true_at = None
            runtime.save(update_fields=["scheduled_for", "became_true_at", "updated_at"])
            continue

        matched = eval_condition(child, entity_state=entity_state)
        if not matched:
            runtime.scheduled_for = None
            runtime.became_true_at = None
            runtime.save(update_fields=["scheduled_for", "became_true_at", "updated_at"])
            continue

        if cooldown_active(rule=rule, runtime=runtime, now=now):
            skipped_cooldown += 1
            runtime.scheduled_for = None
            runtime.save(update_fields=["scheduled_for", "updated_at"])
            continue

        try:
            then = (rule.definition or {}).get("then") if isinstance(rule.definition, dict) else []
            actions = then if isinstance(then, list) else []
            result = execute_actions(rule=rule, actions=actions, now=now, actor_user=actor_user)
            log_rule_action(
                rule=rule,
                fired_at=now,
                kind=rule.kind,
                actions=actions,
                result=result,
                trace={"source": "timer"},
            )
            runtime.last_fired_at = now
            runtime.scheduled_for = None
            runtime.save(update_fields=["last_fired_at", "scheduled_for", "updated_at"])
            fired += 1
        except Exception as exc:  # pragma: no cover - defensive
            errors += 1
            log_rule_action(
                rule=rule,
                fired_at=now,
                kind=rule.kind,
                actions=[],
                result={},
                trace={"source": "timer"},
                error=str(exc),
            )

    for rule in rules:
        definition = rule.definition or {}
        when_node = definition.get("when") if isinstance(definition, dict) else None
        seconds, child = extract_for(when_node)

        if seconds:
            runtime = ensure_runtime(rule)
            matched = eval_condition(child, entity_state=entity_state)
            if not matched:
                if runtime.became_true_at or runtime.scheduled_for:
                    runtime.became_true_at = None
                    runtime.scheduled_for = None
                    runtime.save(update_fields=["became_true_at", "scheduled_for", "updated_at"])
                continue

            if runtime.became_true_at is None or runtime.scheduled_for is None:
                runtime.became_true_at = now
                runtime.scheduled_for = now + timedelta(seconds=seconds)
                runtime.save(update_fields=["became_true_at", "scheduled_for", "updated_at"])
                scheduled += 1
            continue

        matched = eval_condition(when_node, entity_state=entity_state)
        if not matched:
            continue

        runtime = ensure_runtime(rule)
        if cooldown_active(rule=rule, runtime=runtime, now=now):
            skipped_cooldown += 1
            continue

        then = definition.get("then") if isinstance(definition, dict) else []
        actions = then if isinstance(then, list) else []
        try:
            result = execute_actions(rule=rule, actions=actions, now=now, actor_user=actor_user)
            log_rule_action(
                rule=rule,
                fired_at=now,
                kind=rule.kind,
                actions=actions,
                result=result,
                trace={"source": "immediate"},
            )
            runtime.last_fired_at = now
            runtime.save(update_fields=["last_fired_at", "updated_at"])
            fired += 1
        except Exception as exc:  # pragma: no cover - defensive
            errors += 1
            log_rule_action(
                rule=rule,
                fired_at=now,
                kind=rule.kind,
                actions=actions,
                result={},
                trace={"source": "immediate"},
                error=str(exc),
            )

    return RuleRunResult(
        evaluated=len(rules),
        fired=fired,
        scheduled=scheduled,
        skipped_cooldown=skipped_cooldown,
        errors=errors,
    )


def simulate_rules(
    *,
    entity_states: dict[str, str],
    now=None,
    assume_for_seconds: int | None = None,
) -> dict[str, Any]:
    """
    Dry-run: evaluates rules against provided entity_states and returns what would happen.
    No actions are executed.
    """
    now = now or timezone.now()
    assume_for_seconds = assume_for_seconds if isinstance(assume_for_seconds, int) else None
    if assume_for_seconds is not None and assume_for_seconds < 0:
        assume_for_seconds = 0

    rules = list(Rule.objects.filter(enabled=True).order_by("-priority", "id"))
    db_entities = {e.entity_id: e.last_state for e in Entity.objects.all()}
    merged_state: dict[str, str | None] = {**db_entities, **entity_states}

    matched: list[dict[str, Any]] = []
    not_matched: list[dict[str, Any]] = []

    for rule in rules:
        definition = rule.definition or {}
        when_node = definition.get("when") if isinstance(definition, dict) else None
        seconds, child = extract_for(when_node)

        if seconds:
            ok_child, trace = eval_condition_explain(child, entity_state=merged_state)
            if not ok_child:
                not_matched.append(
                    {
                        "id": rule.id,
                        "name": rule.name,
                        "kind": rule.kind,
                        "priority": rule.priority,
                        "matched": False,
                        "for": {"seconds": seconds, "status": "not_true"},
                        "trace": trace,
                    }
                )
                continue
            satisfied = assume_for_seconds is not None and assume_for_seconds >= seconds
            if not satisfied:
                matched.append(
                    {
                        "id": rule.id,
                        "name": rule.name,
                        "kind": rule.kind,
                        "priority": rule.priority,
                        "matched": False,
                        "for": {"seconds": seconds, "status": "would_schedule"},
                        "trace": trace,
                        "actions": definition.get("then") if isinstance(definition.get("then"), list) else [],
                    }
                )
                continue
            matched.append(
                {
                    "id": rule.id,
                    "name": rule.name,
                    "kind": rule.kind,
                    "priority": rule.priority,
                    "matched": True,
                    "for": {"seconds": seconds, "status": "assumed_satisfied", "assumed_for_seconds": assume_for_seconds},
                    "trace": trace,
                    "actions": definition.get("then") if isinstance(definition.get("then"), list) else [],
                }
            )
            continue

        ok, trace = eval_condition_explain(when_node, entity_state=merged_state)
        payload = {
            "id": rule.id,
            "name": rule.name,
            "kind": rule.kind,
            "priority": rule.priority,
            "matched": ok,
            "trace": trace,
            "actions": definition.get("then") if isinstance(definition.get("then"), list) else [],
        }
        if ok:
            matched.append(payload)
        else:
            not_matched.append(payload)

    return {
        "timestamp": now.isoformat(),
        "summary": {
            "evaluated": len(rules),
            "matched": sum(1 for r in matched if r.get("matched") is True),
            "would_schedule": sum(1 for r in matched if r.get("for", {}).get("status") == "would_schedule"),
        },
        "matched_rules": matched,
        "non_matching_rules": not_matched,
    }
