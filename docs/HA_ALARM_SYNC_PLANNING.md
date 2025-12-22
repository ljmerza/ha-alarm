# Home Assistant Alarm ↔ Alarm App Sync (Planning)

## Goals

- Two-way sync between a Home Assistant `alarm_control_panel.*` entity and this app’s alarm state machine.
- Default behavior: **Home Assistant is authoritative**, but the user can switch to “local authoritative” (or disable sync) via settings.
- Prevent sync loops (outbound updates echoing back inbound).
- If Home Assistant is offline/unreachable:
  - UI shows **offline**.
  - Users can still arm/disarm/trigger locally.
  - Local changes are queued and sync to Home Assistant once it’s reachable again.
- Use Home Assistant’s `last_updated` timestamp to resolve conflicts.

## Non-goals (v1)

- Home Assistant WebSocket subscription (`state_changed`) for push-style inbound updates.
- Multi-alarm support (one HA alarm entity per active settings profile only).
- Exact parity with every HA alarm feature (custom arming modes beyond this app’s states).

## Current repo context

- HA connectivity exists via `backend/alarm/home_assistant.py` + `backend/alarm/gateways/home_assistant.py`.
- Frontend already shows HA reachable/offline in `SystemStatusCard` from `/api/alarm/home-assistant/status/`.
- Local transitions are handled by `backend/alarm/state_machine/*` and are triggered by API endpoints under `backend/alarm/views/*`.
- There is an existing pattern for “call HA on local state changes” (notifications) scheduled via `transaction.on_commit` and run as a Celery task.

## Proposed user-facing behavior

### Onboarding

- Ask for Home Assistant alarm entity id, e.g. `alarm_control_panel.home`.
- Save it to the active `AlarmSettingsProfile` settings entries.
- Offer a toggle: enable/disable alarm sync (default off, or on if entity is provided—pick one and stay consistent).

### Settings

Provide a “Home Assistant Alarm Sync” section:

- `Enabled` (boolean)
- `HA authoritative` (boolean; default true)
- `HA alarm entity id` (string, required when enabled)
- Optional: `poll_seconds` (integer; default e.g. 5–15)

### Dashboard / Status

- Show:
  - HA connection (already present).
  - Alarm sync: `Disabled` / `Enabled` + `Pending local changes` (if any) + last push error (if any).

## State mapping

### HA → Local mapping

- `disarmed` → `disarmed`
- `arming` → `arming`
- `pending` → `pending`
- `triggered` → `triggered`
- `armed_home` → `armed_home`
- `armed_away` → `armed_away`
- `armed_night` → `armed_night`
- `armed_custom_bypass` → `armed_vacation` (chosen mapping)

Ignore (do not transition, but record last seen):

- `unknown`, `unavailable`, empty states, or anything unrecognized.

### Local → HA mapping (service calls)

Target domain: `alarm_control_panel`

- `disarmed` → `alarm_disarm`
- `armed_home` → `alarm_arm_home`
- `armed_away` → `alarm_arm_away`
- `armed_night` → `alarm_arm_night`
- `armed_vacation` → `alarm_arm_custom_bypass`
- `triggered` (optional) → `alarm_trigger` (only if HA entity supports it)

Notes:
- HA service calls require a `target: { entity_id: <entity_id> }`.
- HA disarm often supports `service_data: { code: "...." }`. Decide whether to send codes (likely “no”; rely on HA-side auth/token).

## Loop prevention

When applying HA → local transitions, tag them:

- `reason = "ha_sync"`
- `metadata = { "origin": "home_assistant", "ha_entity_id": "...", "ha_last_updated": "...", "ha_state": "..." }`

Outbound sync must **skip** any local transitions whose origin is Home Assistant (reason/metadata check), so we don’t echo.

## Conflict resolution (timestamp-based)

Canonical inbound compare field: **Home Assistant `last_updated`**.

We need three timestamps:

- `ha_last_updated` (from HA state payload)
- `local_changed_at` (this app’s `AlarmStateSnapshot.entered_at`)
- `pending_local_changed_at` (when we last changed locally while HA was offline/unreachable)

Rules when HA is reachable:

1) If there is a pending local change:
   - If `ha_last_updated >= pending_local_changed_at`: HA wins → drop pending, adopt HA state locally.
   - If `pending_local_changed_at > ha_last_updated`: local wins → push pending state to HA.
2) If there is no pending local change:
   - If `ha_last_updated > local_changed_at`: adopt HA state locally.
   - Else: no-op.

Tie-breaking:

- On exact equality, prefer HA (avoids flapping when clocks differ slightly and HA updates are coalesced).

Clock skew:

- Accept small skew; optionally add a tolerance window (e.g. 1–2s) before deciding.

## Offline handling and queuing

### Desired behavior

- If HA is unreachable:
  - The app continues to transition locally.
  - The latest local target state is stored as `pending_local_state` (overwrite older pending; only the newest matters).
  - UI displays HA offline and “pending sync”.

### On reconnect

- The next sync attempt runs conflict rules and either:
  - applies HA → local, or
  - pushes local → HA, then clears pending on success.

## Backend design

### Settings (profile setting)

Add `home_assistant_alarm_sync` to `backend/alarm/settings_registry.py` (JSON):

```json
{
  "enabled": false,
  "ha_authoritative": true,
  "entity_id": "alarm_control_panel.home",
  "poll_seconds": 10
}
```

Expose it in `backend/alarm/serializers/alarm.py` so the frontend can read/update it through existing settings profile endpoints.

### Sync runtime state (new model)

Add a model to track sync bookkeeping, per active settings profile:

- `settings_profile` (FK, unique)
- `ha_entity_id` (string, denormalized for debugging)
- `last_seen_ha_state` (string)
- `last_seen_ha_last_updated` (datetime)
- `pending_local_state` (string/null)
- `pending_local_changed_at` (datetime/null)
- `last_push_attempt_at` (datetime/null)
- `last_push_success_at` (datetime/null)
- `last_push_error` (text/null)

This keeps API responses fast and enables UI display of “pending” and errors without re-checking HA.

### HA API additions (gateway)

Add a gateway method to fetch one entity state + timestamp:

- `get_entity_state(entity_id) -> { state: str, last_updated: datetime, attributes?: dict }`

Implementation can use HA REST:
- `GET /api/states/<entity_id>`

### Use case: `sync_alarm_with_home_assistant`

Create `backend/alarm/use_cases/home_assistant_alarm_sync.py`:

Inputs:
- current local snapshot
- sync config (enabled, entity_id, ha_authoritative, poll_seconds)
- HA gateway
- current time

Outputs:
- possibly updated local snapshot
- updated sync runtime state
- flags for UI (pending, last error, last seen timestamps)

This use case should:
- short-circuit if sync disabled or missing entity id
- handle HA unavailable (record offline + return)
- apply conflict resolution rules
- invoke either:
  - state machine transition (HA → local), or
  - enqueue outbound task (local → HA), or
  - no-op

### Where sync runs (inbound path)

Pick one or both:

1) **Read-time sync**: call the use case during `GET /api/alarm/state/`.
   - Pros: no extra infrastructure.
   - Cons: sync only happens when someone loads/refreshes UI; adds latency to the endpoint.

2) **Periodic sync**: a Celery beat task (or management command scheduled by cron) polls HA regularly.
   - Pros: up-to-date even without UI open.
   - Cons: needs worker/beat to be running.

Recommended: implement read-time sync first; add periodic later if needed.

### Outbound sync (task + retries)

Create a Celery task:

- `push_alarm_state_to_home_assistant(settings_profile_id, desired_state, desired_changed_at, correlation_id)`

Behavior:
- ensure HA available
- call HA service mapped from desired state
- on success: clear pending, record timestamps
- on failure: keep pending, record error, retry with backoff

Correlation id:
- store in runtime state and in local event metadata if helpful; mainly for debugging.

## Frontend design

### Types + services

- Extend `AlarmSettingsProfile` typing to include `homeAssistantAlarmSync`.
- Add UI form controls in `SettingsPage` (pattern used by `home_assistant_notify`).
- Extend onboarding flow to collect and persist the entity id + enabled toggle.

### Status display

Extend `SystemStatusCard` to show:
- Sync enabled/disabled
- If enabled and HA offline: “pending sync” if there are local pending changes
- Last sync error (if any)

## Security and safety

- Keep Home Assistant credentials server-side only (already true).
- Ensure only admins can change sync settings (match existing settings permission behavior).
- Validate `entity_id` format (simple `domain.object_id` string check) and require `domain == "alarm_control_panel"`.

## Observability

- Log key events:
  - HA unreachable/reachable transitions
  - inbound adopted HA state
  - outbound push attempts/success/failure
- Include `settings_profile_id` and `entity_id` in logs.

## Testing plan

Backend:
- Unit tests for state mapping table.
- Unit tests for conflict resolution rules (`last_updated` comparisons, pending behavior).
- Task tests using `override_settings(CELERY_TASK_ALWAYS_EAGER=True)` (pattern exists) to validate:
  - failures keep pending + record error
  - success clears pending
- API tests for `GET /api/alarm/state/` ensuring:
  - HA offline returns local snapshot and flags “offline”
  - HA online newer than local updates local snapshot via `ha_sync`

Frontend:
- Smoke tests around Settings page parsing/serialization of `homeAssistantAlarmSync`.
- Manual verification: disconnect HA (bad token) and confirm “offline” + “pending” behavior.

## Rollout / ops notes

- If outbound retries are desired in dev, ensure a Celery worker runs (and beat if periodic polling is added).
- If the current deployment does not run Celery, start with read-time sync and “best-effort” outbound push (no retries), or add worker as part of deployment.

