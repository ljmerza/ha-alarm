# Home Assistant Alarm Integration via Webhook (Planning)

## Goals

- **One-way push**: This app's alarm state machine is authoritative; Home Assistant receives state updates via webhook.
- **Real-time updates**: On every local state transition, POST the new state to a configured HA webhook URL.
- **Simple integration**: Users configure a webhook in HA and paste the URL into app settings.
- **Best-effort delivery**: Retry webhook calls on failure with exponential backoff (optional).
- **Startup state push**: On app startup, push current state to HA so it recovers from restarts/missed updates.
- **HA as observer/controller**: HA can display state and trigger automations, and can control the alarm by calling this app's API endpoints.

## Non-goals (v1)

- Bidirectional sync (HA is not authoritative; it only observes and controls via API).
- Conflict resolution, timestamp comparisons, or pending queues.
- Polling HA for state changes.
- Multi-alarm support (one webhook URL per active settings profile only).

## Current repo context

- HA connectivity exists via `backend/alarm/home_assistant.py` + `backend/alarm/gateways/home_assistant.py`.
- Frontend already shows HA reachable/offline in `SystemStatusCard` from `/api/alarm/home-assistant/status/`.
- Local transitions are handled by `backend/alarm/state_machine/*` and are triggered by API endpoints under `backend/alarm/views/*`.
- There is an existing pattern for "call HA on local state changes" (notifications) scheduled via `transaction.on_commit` and run as a Celery task.

## Proposed user-facing behavior

### Onboarding

- Ask if the user wants to integrate with Home Assistant.
- If yes:
  1. Ask for an **entity name** (e.g., "Home Alarm", "Office Alarm") - used for display in HA and logs.
  2. Provide instructions:
     - In Home Assistant, create a webhook automation (Automation → New → Webhook trigger).
     - Copy the webhook URL (e.g., `http://homeassistant.local:8123/api/webhook/alarm_state_webhook_id`).
     - Paste it into the app's settings.
     - Optionally create an `input_select.alarm_app_state` helper to mirror the state visually in HA.
- Save the entity name and webhook URL to the active `AlarmSettingsProfile` settings entries.

### Settings

Provide a "Home Assistant Integration" section:

- `Enabled` (boolean; default false)
- `Entity name` (string; e.g., "Home Alarm" - user can rename anytime)
- `Webhook URL` (string; required when enabled)
- `Retry on failure` (boolean; default true)
- Optional: `Timeout seconds` (integer; default 5)

### Dashboard / Status

- Show:
  - HA integration: `Disabled` / `Enabled`
  - If enabled: Last webhook push status (`Success` / `Failed: <error>` / `Pending`)
  - Last successful push timestamp

## State mapping

### Local → HA webhook payload

On each state transition, POST a JSON payload to the webhook URL:

```json
{
  "entity_name": "Home Alarm",
  "state": "armed_away",
  "previous_state": "arming",
  "changed_at": "2025-12-23T10:30:45.123456Z",
  "triggered_by": "user",
  "metadata": {
    "settings_profile_id": 1,
    "transition_id": "abc123"
  }
}
```

The `entity_name` allows HA automations to identify which alarm sent the update (useful for multi-location setups or clearer logging).

**State values:**
- `disarmed`
- `arming`
- `pending`
- `triggered`
- `armed_home`
- `armed_away`
- `armed_night`
- `armed_vacation`

### HA-side setup (user's responsibility)

**Option 1: Update an input_select helper**

Create `input_select.alarm_app_state` in HA with options matching the states above. Webhook automation action:

```yaml
service: input_select.select_option
target:
  entity_id: input_select.alarm_app_state
data:
  option: "{{ trigger.json.state }}"
```

**Option 2: Trigger automations directly**

Use conditions in the webhook automation to trigger actions based on `trigger.json.state`:

```yaml
trigger:
  - platform: webhook
    webhook_id: alarm_state_webhook_id
action:
  - choose:
      - conditions:
          - condition: template
            value_template: "{{ trigger.json.state == 'triggered' }}"
        sequence:
          - service: notify.mobile_app
            data:
              message: "Alarm triggered!"
      - conditions:
          - condition: template
            value_template: "{{ trigger.json.state == 'armed_away' }}"
        sequence:
          - service: light.turn_off
            target:
              entity_id: all
```

**Controlling the alarm from HA:**

Users can call this app's API endpoints from HA automations/scripts:

```yaml
service: rest_command.alarm_arm_away
data: {}
```

Where `rest_command.alarm_arm_away` is configured in HA's `configuration.yaml`:

```yaml
rest_command:
  alarm_arm_away:
    url: "http://alarm-app.local/api/alarm/arm/away/"
    method: POST
    headers:
      Authorization: "Bearer <app_api_token>"
      Content-Type: "application/json"
```

## Backend design

### Settings (profile setting)

Add `home_assistant_integration` to `backend/alarm/settings_registry.py` (JSON):

```json
{
  "enabled": false,
  "entity_name": "Home Alarm",
  "webhook_url": "",
  "retry_on_failure": true,
  "timeout_seconds": 5
}
```

Expose it in `backend/alarm/serializers/alarm.py` so the frontend can read/update it through existing settings profile endpoints.

### Webhook push task

Create a Celery task in `backend/alarm/tasks.py`:

```python
@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def push_alarm_state_to_home_assistant(
    self,
    settings_profile_id: int,
    state: str,
    previous_state: str,
    changed_at: str,
    triggered_by: str,
    transition_id: str
):
    """
    POST alarm state to HA webhook.

    Retries on failure with exponential backoff if retry_on_failure is enabled.
    """
    # Load settings (includes entity_name, webhook_url, etc.)
    # Build payload with entity_name, state, previous_state, changed_at, triggered_by, metadata
    # POST to webhook_url with timeout
    # On success: log, update last_push_success_at
    # On failure: log error, retry if enabled, update last_push_error
```

**Tracking last push status (optional model):**

Add a simple model to track webhook push status per settings profile (for UI display):

- `settings_profile` (FK, unique)
- `webhook_url` (string, denormalized for debugging)
- `last_push_attempt_at` (datetime/null)
- `last_push_success_at` (datetime/null)
- `last_push_error` (text/null)
- `last_pushed_state` (string/null)

This keeps API responses fast and enables UI display of push status without checking task results.

### Where to trigger the webhook push

In the state machine transition handler (likely `backend/alarm/state_machine/manager.py` or similar), after a successful transition:

```python
from django.db import transaction

def transition_to_state(state, triggered_by, metadata):
    # ... perform transition ...

    # After commit, push to HA webhook if enabled
    transaction.on_commit(lambda: push_alarm_state_to_home_assistant.delay(
        settings_profile_id=current_profile.id,
        state=new_state,
        previous_state=old_state,
        changed_at=snapshot.entered_at.isoformat(),
        triggered_by=triggered_by,
        transition_id=transition_id
    ))
```

**Skip webhook push for certain transitions:**

Optionally, allow metadata to skip webhook push (e.g., if in the future we do accept inbound HA calls, we wouldn't echo back).

### Startup state push

On app startup, push the current alarm state to HA webhook to ensure HA has the correct state after:
- HA restarts (missed webhooks while HA was down)
- App restarts (HA might have stale state)
- Network issues (missed webhooks)

**Implementation options:**

**Option A: Django AppConfig.ready() (recommended)**

In `backend/alarm/apps.py`:

```python
from django.apps import AppConfig

class AlarmConfig(AppConfig):
    name = 'alarm'

    def ready(self):
        # Import here to avoid circular imports
        from django.db import connection

        # Only run if database is ready (not during migrations)
        if connection.ensure_connection():
            from alarm.tasks import push_current_state_to_home_assistant_on_startup
            # Delay slightly to ensure Celery is ready
            push_current_state_to_home_assistant_on_startup.apply_async(countdown=5)
```

**Option B: Management command**

Create `backend/alarm/management/commands/push_ha_state.py`:

```python
from django.core.management.base import BaseCommand
from alarm.tasks import push_current_state_to_home_assistant

class Command(BaseCommand):
    help = 'Push current alarm state to Home Assistant webhook'

    def handle(self, *args, **options):
        push_current_state_to_home_assistant()
        self.stdout.write(self.style.SUCCESS('State pushed to HA webhook'))
```

Call from container entrypoint or systemd service after app starts.

**Startup push task:**

```python
@shared_task
def push_current_state_to_home_assistant_on_startup():
    """
    Push current alarm state to HA webhook on app startup.

    This ensures HA has the correct state after restarts.
    """
    from alarm.models import AlarmSettingsProfile, AlarmStateSnapshot

    for profile in AlarmSettingsProfile.objects.filter(is_active=True):
        settings = profile.get_setting('home_assistant_integration')
        if not settings or not settings.get('enabled'):
            continue

        snapshot = AlarmStateSnapshot.objects.filter(
            settings_profile=profile
        ).order_by('-entered_at').first()

        if snapshot:
            push_alarm_state_to_home_assistant.delay(
                settings_profile_id=profile.id,
                state=snapshot.state,
                previous_state=None,  # Unknown on startup
                changed_at=snapshot.entered_at.isoformat(),
                triggered_by='startup_sync',
                transition_id=f'startup_{profile.id}'
            )
```

## Frontend design

### Types + services

- Extend `AlarmSettingsProfile` typing to include `homeAssistantIntegration`:
  ```typescript
  interface HomeAssistantIntegration {
    enabled: boolean;
    entityName: string;
    webhookUrl: string;
    retryOnFailure: boolean;
    timeoutSeconds: number;
  }
  ```
- Add UI form controls in `SettingsPage`:
  - Entity name input (text field, e.g., "Home Alarm")
  - Webhook URL input (text field with validation)
- Provide onboarding step to collect entity name and webhook URL.

### Status display

Extend `SystemStatusCard` to show:
- Integration enabled/disabled
- If enabled:
  - Last push: `Success (2 minutes ago)` / `Failed: Connection timeout` / `Pending`
  - Show retry status if applicable

### Input validation

**Entity name:**
- Required when integration is enabled
- Min 1 character, max 50 characters
- Alphanumeric, spaces, and basic punctuation allowed

**Webhook URL:**

Client-side validation:
- Must be a valid URL
- Should start with `http://` or `https://`
- Should contain `/api/webhook/`

Server-side validation:
- Same checks
- Optional: test webhook on save (POST a test payload, check for 200 response)

## Security and safety

- **No HA credentials stored**: Webhooks are public URLs with secret IDs; no auth token needed.
- **Webhook ID secrecy**: The webhook ID in the URL is the secret; treat it like a password (don't log full URLs).
- **HTTPS recommended**: Encourage users to use HTTPS if HA is exposed outside local network.
- **Validate settings permissions**: Ensure only admins can change integration settings (match existing settings permission behavior).
- **Rate limiting**: Consider rate-limiting webhook calls to prevent abuse if URL leaks.

## Observability

Log key events:
- Webhook push attempts (log state, profile ID, success/failure)
- Webhook push failures (log error, retry count)
- Webhook URL changes (audit log)

Include `settings_profile_id` and sanitized `webhook_url` (mask webhook ID) in logs.

Example:
```
INFO: Pushed state 'armed_away' to HA webhook (profile=1, url=http://***.***.***.***:8123/api/webhook/***...***, status=200)
ERROR: Failed to push state 'triggered' to HA webhook (profile=1, error=Connection timeout, retry=1/3)
```

## Testing plan

### Backend

- **Unit tests for payload construction**:
  - Verify JSON payload format
  - Verify state mapping

- **Task tests** (using `override_settings(CELERY_TASK_ALWAYS_EAGER=True)`):
  - Mock `requests.post` to simulate success/failure
  - Verify retries on failure
  - Verify last push status model updates

- **Integration tests**:
  - Trigger state transition, verify webhook task is enqueued
  - Verify task not enqueued when integration disabled
  - Verify task not enqueued for certain metadata (if skip logic added)

- **Startup push tests**:
  - Verify startup task pushes current state for all active profiles with integration enabled
  - Verify startup task skips profiles with integration disabled
  - Verify startup task handles missing snapshot gracefully

### Frontend

- **Settings page**:
  - Smoke tests for form parsing/serialization of `homeAssistantIntegration`
  - Validation tests (invalid URLs rejected)

- **Manual verification**:
  - Set up real HA webhook, trigger transitions, verify HA receives payloads
  - Test with unreachable webhook URL, verify failure status displayed

### HA-side testing

Create a test webhook automation in HA that logs received payloads:

```yaml
trigger:
  - platform: webhook
    webhook_id: alarm_test_webhook
action:
  - service: persistent_notification.create
    data:
      title: "{{ trigger.json.entity_name }} Update"
      message: "State: {{ trigger.json.state }}, Changed at: {{ trigger.json.changed_at }}"
```

## Rollout / ops notes

- **Celery worker required**: Webhook push uses Celery tasks; ensure a worker is running.
- **Webhook setup documentation**: Provide clear docs with HA YAML examples for webhook automation + `input_select` setup.
- **Migration**: If users previously expected HA → app sync, clarify that this is now one-way (app → HA) and HA controls the app via API.
- **Future enhancements**:
  - Support multiple webhook URLs (broadcast to multiple HA instances)
  - Webhook signature/HMAC for verification (if HA supports it)
  - Fallback to MQTT if webhook fails repeatedly

## Example HA Configuration

### Full working example

**1. Create input_select helper** (`configuration.yaml`):

```yaml
input_select:
  alarm_app_state:
    name: Alarm App State
    options:
      - disarmed
      - arming
      - pending
      - triggered
      - armed_home
      - armed_away
      - armed_night
      - armed_vacation
    icon: mdi:shield-home
```

**2. Create webhook automation** (via UI or `automations.yaml`):

```yaml
- id: alarm_app_webhook
  alias: "Alarm App State Webhook"
  trigger:
    - platform: webhook
      webhook_id: my_secret_alarm_webhook_id
  action:
    - service: input_select.select_option
      target:
        entity_id: input_select.alarm_app_state
      data:
        option: "{{ trigger.json.state }}"
    - service: logbook.log
      data:
        name: "{{ trigger.json.entity_name }}"
        message: "State changed to {{ trigger.json.state }}"
```

**3. Create REST commands for control** (`configuration.yaml`):

```yaml
rest_command:
  alarm_disarm:
    url: "http://192.168.1.100:8000/api/alarm/disarm/"
    method: POST
    headers:
      Authorization: "Bearer YOUR_APP_API_TOKEN"
      Content-Type: "application/json"

  alarm_arm_home:
    url: "http://192.168.1.100:8000/api/alarm/arm/home/"
    method: POST
    headers:
      Authorization: "Bearer YOUR_APP_API_TOKEN"
      Content-Type: "application/json"

  alarm_arm_away:
    url: "http://192.168.1.100:8000/api/alarm/arm/away/"
    method: POST
    headers:
      Authorization: "Bearer YOUR_APP_API_TOKEN"
      Content-Type: "application/json"
```

**4. Configure webhook URL in app settings**:

```
http://homeassistant.local:8123/api/webhook/my_secret_alarm_webhook_id
```

**5. Use in HA automations**:

```yaml
- id: alarm_triggered_notification
  alias: "Send notification when alarm triggered"
  trigger:
    - platform: state
      entity_id: input_select.alarm_app_state
      to: "triggered"
  action:
    - service: notify.mobile_app
      data:
        title: "Alarm Triggered!"
        message: "{{ state_attr('input_select.alarm_app_state', 'friendly_name') }} triggered at {{ now().strftime('%H:%M:%S') }}"

- id: arm_away_when_leaving
  alias: "Arm away when everyone leaves"
  trigger:
    - platform: state
      entity_id: zone.home
      to: "0"
  action:
    - service: rest_command.alarm_arm_away
```
