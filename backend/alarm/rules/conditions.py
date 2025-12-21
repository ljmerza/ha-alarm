from __future__ import annotations

from typing import Any


def _is_mapping(value: Any) -> bool:
    return isinstance(value, dict)


def _get_op(node: Any) -> str | None:
    if not _is_mapping(node):
        return None
    op = node.get("op")
    return op if isinstance(op, str) else None


def extract_for(node: Any) -> tuple[int | None, Any]:
    if _get_op(node) != "for":
        return None, node
    if not _is_mapping(node):
        return None, node
    seconds = node.get("seconds")
    child = node.get("child")
    if not isinstance(seconds, int) or seconds <= 0:
        return None, child
    return seconds, child


def eval_condition(node: Any, *, entity_state: dict[str, str | None]) -> bool:
    op = _get_op(node)
    if not op:
        return False

    if op == "all":
        if not _is_mapping(node):
            return False
        children = node.get("children")
        if not isinstance(children, list) or not children:
            return False
        return all(eval_condition(child, entity_state=entity_state) for child in children)

    if op == "any":
        if not _is_mapping(node):
            return False
        children = node.get("children")
        if not isinstance(children, list) or not children:
            return False
        return any(eval_condition(child, entity_state=entity_state) for child in children)

    if op == "not":
        if not _is_mapping(node):
            return False
        return not eval_condition(node.get("child"), entity_state=entity_state)

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


def eval_condition_explain(node: Any, *, entity_state: dict[str, str | None]) -> tuple[bool, dict[str, Any]]:
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
                ok_child, trace = eval_condition_explain(child, entity_state=entity_state)
                explained.append(trace)
                if not ok_child:
                    ok_all = False
            return ok_all, {"op": "all", "ok": ok_all, "children": explained}
        ok_any = False
        for child in children:
            ok_child, trace = eval_condition_explain(child, entity_state=entity_state)
            explained.append(trace)
            if ok_child:
                ok_any = True
        return ok_any, {"op": "any", "ok": ok_any, "children": explained}

    if op == "not":
        if not _is_mapping(node):
            return False, {"op": "not", "ok": False, "reason": "invalid_node"}
        ok_child, trace = eval_condition_explain(node.get("child"), entity_state=entity_state)
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

