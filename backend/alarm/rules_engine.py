from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.db import transaction
from django.utils import timezone

from . import home_assistant
from . import services
from .models import Entity, Rule, RuleActionLog, RuleRuntimeState


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


def _is_mapping(value: Any) -> bool:
    return isinstance(value, dict)


def _get_op(node: Any) -> str | None:
    if not _is_mapping(node):
        return None
    op = node.get("op")
    return op if isinstance(op, str) else None


def _extract_for(node: Any) -> tuple[int | None, Any]:
    if _get_op(node) != "for":
        return None, node
    if not _is_mapping(node):
        return None, node
    seconds = node.get("seconds")
    child = node.get("child")
    if not isinstance(seconds, int) or seconds <= 0:
        return None, child
    return seconds, child


def _eval_condition(node: Any, *, entity_state: dict[str, str | None]) -> bool:
    op = _get_op(node)
    if not op:
        return False

    if op == "all":
        if not _is_mapping(node):
            return False
        children = node.get("children")
        if not isinstance(children, list) or not children:
            return False
        return all(_eval_condition(child, entity_state=entity_state) for child in children)

    if op == "any":
        if not _is_mapping(node):
            return False
        children = node.get("children")
        if not isinstance(children, list) or not children:
            return False
        return any(_eval_condition(child, entity_state=entity_state) for child in children)

    if op == "not":
        if not _is_mapping(node):
            return False
        return not _eval_condition(node.get("child"), entity_state=entity_state)

    if op == "entity_state":
        if not _is_mapping(node):
            return False
        entity_id = node.get("entity_id")
        equals = node.get("equals")
        if not isinstance(entity_id, str) or not isinstance(equals, str):
            return False
        current = entity_state.get(entity_id)
        return current == equals

    return False


def _eval_condition_explain(
    node: Any, *, entity_state: dict[str, str | None]
) -> tuple[bool, dict[str, Any]]:
    op = _get_op(node)
    if not op:
        return False, {"op": None, "ok": False, "reason": "missing_op"}

    if op in {"all", "any"}:
        if not _is_mapping(node):
            return False, {"op": op, "ok": False, "reason": "invalid_node"}
        children = node.get("children")
        if not isinstance(children, list) or not children:
            return False, {"op": op, "ok": False, "reason": "missing_children"}
        explained: list[dict[str, Any]] = []
        if op == "all":
            ok_all = True
            for child in children:
                ok_child, trace = _eval_condition_explain(child, entity_state=entity_state)
                explained.append(trace)
                if not ok_child:
                    ok_all = False
            return ok_all, {"op": "all", "ok": ok_all, "children": explained}
        ok_any = False
        for child in children:
            ok_child, trace = _eval_condition_explain(child, entity_state=entity_state)
            explained.append(trace)
            if ok_child:
                ok_any = True
        return ok_any, {"op": "any", "ok": ok_any, "children": explained}

    if op == "not":
        if not _is_mapping(node):
            return False, {"op": "not", "ok": False, "reason": "invalid_node"}
        ok_child, trace = _eval_condition_explain(node.get("child"), entity_state=entity_state)
        return (not ok_child), {"op": "not", "ok": (not ok_child), "child": trace}

    if op == "entity_state":
        if not _is_mapping(node):
            return False, {"op": "entity_state", "ok": False, "reason": "invalid_node"}
        entity_id = node.get("entity_id")
        equals = node.get("equals")
        if not isinstance(entity_id, str) or not isinstance(equals, str):
            return False, {"op": "entity_state", "ok": False, "reason": "missing_fields"}
        current = entity_state.get(entity_id)
        ok = current == equals
        return ok, {
            "op": "entity_state",
            "ok": ok,
            "entity_id": entity_id,
            "expected": equals,
            "actual": current,
        }

    return False, {"op": op, "ok": False, "reason": "unsupported_op"}


def _cooldown_active(*, rule: Rule, runtime: RuleRuntimeState | None, now) -> bool:
    cooldown_seconds = rule.cooldown_seconds
    if not cooldown_seconds:
        return False
    last_fired_at = runtime.last_fired_at if runtime else None
    if not last_fired_at:
        return False
    return (now - last_fired_at).total_seconds() < cooldown_seconds


def _ensure_runtime(rule: Rule) -> RuleRuntimeState:
    runtime, _ = RuleRuntimeState.objects.get_or_create(
        rule=rule,
        node_id="when",
        defaults={"status": "pending"},
    )
    return runtime


def _log_action(
    *,
    rule: Rule,
    fired_at,
    kind: str,
    actions: list[dict[str, Any]],
    result: dict[str, Any],
    trace: dict[str, Any],
    error: str = "",
) -> None:
    RuleActionLog.objects.create(
        rule=rule,
        entity=None,
        fired_at=fired_at,
        kind=kind,
        actions=actions,
        result=result,
        trace=trace,
        alarm_state_before=result.get("alarm_state_before", "") if isinstance(result, dict) else "",
        alarm_state_after=result.get("alarm_state_after", "") if isinstance(result, dict) else "",
        error=error,
    )


def _execute_actions(*, rule: Rule, actions: list[dict[str, Any]], now, actor_user=None) -> dict[str, Any]:
    snapshot_before = services.get_current_snapshot(process_timers=True)
    alarm_state_before = snapshot_before.current_state
    action_results: list[dict[str, Any]] = []
    error_messages: list[str] = []

    for action in actions:
        if not isinstance(action, dict):
            action_results.append({"ok": False, "error": "invalid_action"})
            continue
        action_type = action.get("type")
        if action_type == "alarm_disarm":
            try:
                services.disarm(user=actor_user, reason=f"rule:{rule.id}")
                action_results.append({"ok": True, "type": "alarm_disarm"})
            except Exception as exc:  # pragma: no cover - defensive
                action_results.append({"ok": False, "type": "alarm_disarm", "error": str(exc)})
                error_messages.append(str(exc))
            continue

        if action_type == "alarm_arm":
            mode = action.get("mode")
            if not isinstance(mode, str):
                action_results.append({"ok": False, "type": "alarm_arm", "error": "missing_mode"})
                continue
            try:
                services.arm(target_state=mode, user=actor_user, reason=f"rule:{rule.id}")
                action_results.append({"ok": True, "type": "alarm_arm", "mode": mode})
            except Exception as exc:
                action_results.append({"ok": False, "type": "alarm_arm", "mode": mode, "error": str(exc)})
                error_messages.append(str(exc))
            continue

        if action_type == "alarm_trigger":
            try:
                services.trigger(user=actor_user, reason=f"rule:{rule.id}")
                action_results.append({"ok": True, "type": "alarm_trigger"})
            except Exception as exc:
                action_results.append({"ok": False, "type": "alarm_trigger", "error": str(exc)})
                error_messages.append(str(exc))
            continue

        if action_type == "ha_call_service":
            domain = action.get("domain")
            service_name = action.get("service")
            target = action.get("target")
            service_data = action.get("service_data")
            if not isinstance(domain, str) or not isinstance(service_name, str):
                action_results.append({"ok": False, "type": "ha_call_service", "error": "missing_domain_or_service"})
                continue
            try:
                home_assistant.call_service(
                    domain=domain,
                    service=service_name,
                    target=target if isinstance(target, dict) else None,
                    service_data=service_data if isinstance(service_data, dict) else None,
                )
                action_results.append({"ok": True, "type": "ha_call_service", "domain": domain, "service": service_name})
            except Exception as exc:
                action_results.append({"ok": False, "type": "ha_call_service", "domain": domain, "service": service_name, "error": str(exc)})
                error_messages.append(str(exc))
            continue

        action_results.append({"ok": False, "type": str(action_type), "error": "unsupported_action"})

    snapshot_after = services.get_current_snapshot(process_timers=True)
    return {
        "alarm_state_before": alarm_state_before,
        "alarm_state_after": snapshot_after.current_state,
        "actions": action_results,
        "errors": error_messages,
        "timestamp": now.isoformat(),
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
        seconds, child = _extract_for((rule.definition or {}).get("when") if isinstance(rule.definition, dict) else None)
        if not seconds:
            runtime.scheduled_for = None
            runtime.became_true_at = None
            runtime.save(update_fields=["scheduled_for", "became_true_at", "updated_at"])
            continue

        matched = _eval_condition(child, entity_state=entity_state)
        if not matched:
            runtime.scheduled_for = None
            runtime.became_true_at = None
            runtime.save(update_fields=["scheduled_for", "became_true_at", "updated_at"])
            continue

        if _cooldown_active(rule=rule, runtime=runtime, now=now):
            skipped_cooldown += 1
            runtime.scheduled_for = None
            runtime.save(update_fields=["scheduled_for", "updated_at"])
            continue

        try:
            then = (rule.definition or {}).get("then") if isinstance(rule.definition, dict) else []
            actions = then if isinstance(then, list) else []
            result = _execute_actions(rule=rule, actions=actions, now=now, actor_user=actor_user)
            _log_action(rule=rule, fired_at=now, kind=rule.kind, actions=actions, result=result, trace={"source": "timer"})
            runtime.last_fired_at = now
            runtime.scheduled_for = None
            runtime.save(update_fields=["last_fired_at", "scheduled_for", "updated_at"])
            fired += 1
        except Exception as exc:  # pragma: no cover - defensive
            errors += 1
            _log_action(
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
        seconds, child = _extract_for(when_node)

        if seconds:
            runtime = _ensure_runtime(rule)
            matched = _eval_condition(child, entity_state=entity_state)
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

        matched = _eval_condition(when_node, entity_state=entity_state)
        if not matched:
            continue

        runtime = _ensure_runtime(rule)
        if _cooldown_active(rule=rule, runtime=runtime, now=now):
            skipped_cooldown += 1
            continue

        then = definition.get("then") if isinstance(definition, dict) else []
        actions = then if isinstance(then, list) else []
        try:
            result = _execute_actions(rule=rule, actions=actions, now=now, actor_user=actor_user)
            _log_action(rule=rule, fired_at=now, kind=rule.kind, actions=actions, result=result, trace={"source": "immediate"})
            runtime.last_fired_at = now
            runtime.save(update_fields=["last_fired_at", "updated_at"])
            fired += 1
        except Exception as exc:  # pragma: no cover - defensive
            errors += 1
            _log_action(
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
        seconds, child = _extract_for(when_node)

        if seconds:
            ok_child, trace = _eval_condition_explain(child, entity_state=merged_state)
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

        ok, trace = _eval_condition_explain(when_node, entity_state=merged_state)
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
