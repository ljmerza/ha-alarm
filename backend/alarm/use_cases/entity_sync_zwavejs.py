from __future__ import annotations

from typing import Any

from django.utils import timezone

from alarm.gateways.zwavejs import ZwavejsGateway
from alarm.models import Entity
from alarm.zwavejs.manager import build_zwavejs_entity_id, infer_entity_domain, normalize_entity_state


def _extract_nodes(controller_state: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Best-effort extraction of a nodes list from zwave-js-server state shapes.
    """

    state = controller_state.get("state") if isinstance(controller_state.get("state"), dict) else controller_state
    nodes = state.get("nodes") if isinstance(state, dict) else None
    return nodes if isinstance(nodes, list) else []


def sync_entities_from_zwavejs(*, zwavejs: ZwavejsGateway, now=None, per_node_limit: int = 200) -> dict[str, Any]:
    now = now or timezone.now()
    imported = 0
    updated = 0

    controller_state = zwavejs.controller_get_state(timeout_seconds=10)
    nodes = _extract_nodes(controller_state)

    # If the homeId isn't available (e.g. we connected but haven't received the version message),
    # still import with 0 so entity ids are stable within this runtime.
    home_id = zwavejs.get_home_id() or 0

    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = node.get("id") if isinstance(node.get("id"), int) else node.get("nodeId")
        if not isinstance(node_id, int) or node_id <= 0:
            continue

        node_name = node.get("name") if isinstance(node.get("name"), str) and node.get("name") else f"Node {node_id}"

        try:
            value_ids = zwavejs.node_get_defined_value_ids(node_id=node_id, timeout_seconds=10)
        except Exception:
            continue

        count = 0
        for value_id in value_ids:
            if not isinstance(value_id, dict):
                continue
            command_class = value_id.get("commandClass")
            prop = value_id.get("property")
            if not isinstance(command_class, int) or prop is None:
                continue

            count += 1
            if per_node_limit and count > per_node_limit:
                break

            try:
                metadata = zwavejs.node_get_value_metadata(node_id=node_id, value_id=value_id, timeout_seconds=10)
            except Exception:
                metadata = {}

            try:
                value = zwavejs.node_get_value(node_id=node_id, value_id=value_id, timeout_seconds=10)
            except Exception:
                value = None

            entity_id = build_zwavejs_entity_id(home_id=home_id, node_id=node_id, value_id=value_id)
            domain = infer_entity_domain(value=value)
            label = metadata.get("label") if isinstance(metadata.get("label"), str) else None
            name = f"{node_name} • {label}" if label else f"{node_name} • {entity_id}"

            defaults = {
                "domain": domain,
                "name": name,
                "device_class": None,
                "last_state": normalize_entity_state(value=value),
                "last_changed": now,
                "last_seen": now,
                "attributes": {
                    "zwavejs": {
                        "home_id": home_id,
                        "node_id": node_id,
                        "node_name": node_name,
                        "value_id": value_id,
                        "metadata": metadata,
                    }
                },
                "source": "zwavejs",
            }

            _, created = Entity.objects.update_or_create(entity_id=entity_id, defaults=defaults)
            imported += 1 if created else 0
            updated += 0 if created else 1

    return {"imported": imported, "updated": updated, "timestamp": now}
