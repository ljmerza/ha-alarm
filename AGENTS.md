# Agent Onboarding

This repo is a Django + React alarm panel that integrates with Home Assistant.
Use this file to get oriented quickly and to follow the established “how we build features” patterns.

## TL;DR (first run)
- Backend (Django/DRF/Channels/Celery): `docker compose` service `web`, exposed on `http://localhost:5427`
- Frontend (Vite/React): `docker compose` service `frontend`, exposed on `http://localhost:5428`

### Start/stop (required: use helper scripts)
```bash
./scripts/docker-up.sh
./scripts/docker-down.sh
```

### Tests (Home Assistant disabled by default)
```bash
./scripts/docker-test.sh
```

### Shell into the backend container (for manage.py commands)
```bash
./scripts/docker-shell.sh
```

## Repo map
- Backend: `backend/`
  - Project config: `backend/config/`
  - Accounts/auth: `backend/accounts/` (custom user model, codes, onboarding/auth endpoints)
  - Alarm domain + API: `backend/alarm/` (state machine, sensors + entity registry, rules engine, websocket, MQTT/HA integration)
  - Locks + door codes: `backend/locks/` (door codes CRUD + HA lock discovery)
- Frontend: `frontend/` (React + TS + Vite; API client uses cookies + CSRF)
- Docs: `docs/` (active) and `docs/archived/` (completed/old)
- ADRs: `docs/adr/` (architecture decisions; update/add when behavior changes)
- Docker helpers: `scripts/`

## Features (what exists today)
### Backend features
- **Auth + sessions (SPA-first)**: session cookies + CSRF (`GET /api/auth/csrf/`, `POST /api/auth/login/`, `POST /api/auth/logout/`).
- **Onboarding + setup gating**: bootstrap (`POST /api/onboarding/`) + setup requirements (`GET /api/onboarding/setup-status/`).
- **Alarm state machine**: snapshot (`AlarmStateSnapshot`) + event log (`AlarmEvent`) with transitions via `alarm.use_cases` / `alarm.state_machine`.
- **Alarm API**:
  - state + transitions: `GET /api/alarm/state/`, `POST /api/alarm/arm/`, `POST /api/alarm/disarm/`, `POST /api/alarm/cancel-arming/`
  - events feed: `GET /api/events/`
- **WebSocket updates**: `/ws/alarm/` via Channels consumer (`backend/alarm/consumers.py`).
- **Sensors + entity registry**:
  - sensors CRUD: `GET/POST /api/alarm/sensors/`, `GET/PATCH/DELETE /api/alarm/sensors/:id/`
  - HA entity registry (import/sync): `GET /api/alarm/entities/`, `POST /api/alarm/entities/sync/`
- **Rules engine**: rules CRUD + evaluation tools (`/api/alarm/rules/`, `/api/alarm/rules/run/`, `/api/alarm/rules/simulate/`).
- **Home Assistant integration**: status + entity/service discovery (`/api/alarm/home-assistant/status/`, `/entities/`, `/notify-services/`) via `HomeAssistantGateway`.
- **MQTT integration (HA discovery + commands)**:
  - settings + status + test: `/api/alarm/mqtt/settings/`, `/api/alarm/mqtt/status/`, `/api/alarm/mqtt/test/`
  - HA alarm entity discovery: `/api/alarm/mqtt/publish-discovery/`, `/api/alarm/mqtt/alarm-entity/`
  - secret handling: `backend/alarm/crypto.py` (`SETTINGS_ENCRYPTION_KEY` required to decrypt stored secrets)
- **Codes**:
  - alarm PIN codes: `/api/codes/` (accounts `UserCode`)
  - door codes + lock assignment: `/api/door-codes/` and `/api/locks/available/` (locks app)

### Frontend features
- **Cookie + CSRF API client**: `frontend/src/services/api.ts` (`credentials: 'include'`, auto-CSRF priming).
- **Pages**: `frontend/src/pages/`
  - Auth: `LoginPage.tsx`, bootstrap: `OnboardingPage.tsx`
  - Setup: `SetupWizardPage.tsx`, MQTT: `SetupMqttPage.tsx`, entity import: `ImportSensorsPage.tsx`
  - Operations: `DashboardPage.tsx`, `EventsPage.tsx`, `RulesPage.tsx`, `RulesTestPage.tsx`, `CodesPage.tsx`, `DoorCodesPage.tsx`, `SettingsPage.tsx`
- **Error resilience**: feature-level error boundaries + centralized error handling (see `frontend/src/components/providers/FeatureErrorBoundary.tsx` and `frontend/src/lib/errors.ts`).
- **Client state**: React Query for server state + focused Zustand stores (see `frontend/src/stores/`).

## Fast orientation (where to look first)
- Alarm state machine core: `backend/alarm/state_machine/` and `backend/alarm/use_cases/`
- HTTP endpoints wiring: `backend/alarm/urls.py`, `backend/accounts/urls.py`, `backend/locks/urls.py`
- DRF views (thin controllers): `backend/alarm/views/`, `backend/accounts/views/`, `backend/locks/views/`
- Settings keys + defaults: `backend/alarm/settings_registry.py`
- MQTT + HA discovery payloads: `backend/alarm/mqtt/ha_alarm.py`
- Secret encryption helpers: `backend/alarm/crypto.py`
- Frontend routing/pages: `frontend/src/pages/` and `frontend/src/routes.tsx`
- Frontend API + WS clients: `frontend/src/services/api.ts`, `frontend/src/services/websocket.ts`

## Common commands
### Run a realistic demo dataset (backend container)
```bash
./scripts/docker-shell.sh
python manage.py seed_test_home
```

### Targeted tests
```bash
./scripts/docker-shell.sh
pytest backend/accounts/tests/test_setup_status.py
pytest backend/alarm/tests/test_websocket.py
pytest backend/alarm/tests/test_mqtt_api.py
```

## Architecture (what exists today)
### Backend
- **Auth**: Django session cookies for SPA + CSRF protection.
  - CSRF priming endpoint: `GET /api/auth/csrf/` (sets `csrftoken`)
  - Login creates a session: `POST /api/auth/login/`
  - Token auth still exists for compatibility (`Authorization: Bearer ...`) and for WS `?token=` fallback.
- **HTTP API**: Django REST Framework (`backend/config/settings.py` sets auth + exception handler).
- **WebSocket**: Django Channels (ASGI in `backend/config/asgi.py`, consumer in `backend/alarm/consumers.py`).
  - Cookie/session auth works via `AuthMiddlewareStack`.
  - `?token=` auth works via `backend/alarm/middleware.py` (fallback/back-compat).
- **Alarm state machine**: modules under `backend/alarm/state_machine/`.
  - `backend/alarm/services.py` is a compatibility facade; new code should prefer `alarm.use_cases` and/or `alarm.state_machine`.
- **Rules engine**: public entrypoints in `backend/alarm/rules_engine.py`, internals in `backend/alarm/rules/`.
  - Repository boundary for testability: `backend/alarm/rules/repositories.py`.
- **Home Assistant integration**: concrete API functions live in `backend/alarm/home_assistant.py`.
  - Application code should depend on `HomeAssistantGateway` (`backend/alarm/gateways/home_assistant.py`) for testability and future safety controls.

### Frontend
- API client: `frontend/src/services/api.ts`
  - Always uses `credentials: 'include'` (session cookies).
  - Automatically fetches `/api/auth/csrf/` and sends `X-CSRFToken` for unsafe requests.
- WebSocket: `frontend/src/services/websocket.ts`
  - Connects to `/ws/alarm/` and relies on cookie/session auth (preferred).

## ADR-guided “house rules” (best practices)
When adding new features, align with these decisions first; if you need to deviate, write a new ADR.

- **State machine model (MVP)**: `docs/adr/0001-core-models-state-machine.md`
  - One current snapshot (`AlarmStateSnapshot`) + append-only event log (`AlarmEvent`).
- **Code auth + rate limiting**: `docs/adr/0002-code-auth-and-rate-limiting.md`
  - Per-code lockout + global rate limiting (per user/device/IP) at the API layer.
- **Thin controllers + use cases**: `docs/adr/0005-thin-views-and-use-cases.md`
  - DRF views should parse/validate + delegate; put business logic in `backend/*/use_cases/`.
- **Alarm state machine decomposition**: `docs/adr/0008-alarm-state-machine-decomposition.md`
  - Prefer `backend/alarm/state_machine/*` for transitions/timing; keep `backend/alarm/services.py` as a facade for older call sites.
- **Rules engine decomposition**: `docs/adr/0006-rules-engine-internal-modules.md`
  - Keep `alarm.rules_engine` public API stable; split evaluation/runtime/actions/audit into `backend/alarm/rules/*`.
- **Home Assistant gateway abstraction**: `docs/adr/0007-home-assistant-gateway-and-allowlist.md`
  - Don’t import `alarm.home_assistant` directly from business logic; depend on `HomeAssistantGateway`.
- **Rules engine repository boundary**: `docs/adr/0009-rules-engine-repository-boundary.md`
  - Don’t bake ORM queries into engine orchestration; route through repositories so unit tests can run without DB.
- **Disable HA during tests**: `docs/adr/0010-disable-home-assistant-during-tests.md`
  - Tests must not hit real HA by default; opt-in via `ALLOW_HOME_ASSISTANT_IN_TESTS=true`.
- **Session cookie auth for SPA**: `docs/adr/0011-session-cookie-auth.md`
  - Cookies + CSRF are the default path; token flows remain only until fully removed.

## How to add a backend feature (pattern)
Use this checklist to keep changes consistent and easy to test.

1) **Start with the domain boundary**
   - Alarm transitions/timers/events: `backend/alarm/state_machine/*`
   - App orchestration (what the API “does”): `backend/alarm/use_cases/*` or `backend/accounts/use_cases/*`
   - External IO (Home Assistant): `backend/alarm/gateways/home_assistant.py` Protocol + default gateway

2) **Keep views thin**
   - Put endpoint code in `backend/*/views/*.py` and delegate quickly.
   - Prefer raising domain/use-case exceptions and letting `backend/config/exception_handler.py` translate to HTTP.
   - For object-level permissions in APIViews, use `backend/config/view_utils.py`.

3) **Serializers and query performance**
   - Keep serializers in `backend/alarm/serializers/` and `backend/accounts/serializers.py`.
   - Watch for N+1 queries; add `select_related/prefetch_related` in views/use cases and lock in with tests (see existing `*prefetch*` tests).

4) **Tests**
   - Default: `./scripts/docker-test.sh`
   - Prefer unit tests for pure logic (rules engine injection/repositories are already set up for this).
   - If you need HA integration coverage, explicitly opt-in with `ALLOW_HOME_ASSISTANT_IN_TESTS=true` and keep it isolated.

## How to add a frontend feature (pattern)
- Prefer adding API calls via `frontend/src/services/api.ts` (keeps cookie + CSRF correct).
- For new backend endpoints that mutate state:
  - ensure CSRF is required and working (unsafe methods must include `X-CSRFToken`).
  - return consistent error shapes (`{"detail": "..."}`
    or DRF validation errors) so `ApiClient.handleResponse()` can show good messages.
- Keep auth assumptions aligned with the backend:
  - session cookies are the default; don’t store tokens in `localStorage`.

## Environment & configuration
- Example env: `.env.example` (copy to `.env`)
- Home Assistant settings:
  - `HOME_ASSISTANT_URL` / `HOME_ASSISTANT_TOKEN` (preferred)
  - `HA_URL` / `HA_TOKEN` (compat)
- Secrets at rest:
  - `SETTINGS_ENCRYPTION_KEY` (required to decrypt stored secrets like encrypted MQTT passwords)
- Dev CSRF/CORS:
  - `DEBUG=True` and `ALLOWED_HOSTS` control dev-time trusted origins; see `backend/config/settings.py`.

## Docs workflow
- Planning/working docs live in `docs/`.
- Completed docs move to `docs/archived/`.
- New architectural decisions go in `docs/adr/NNNN-short-title.md` using `docs/adr/README.md` template.

## Docker helper scripts (reference)
```bash
./scripts/docker-up.sh
./scripts/docker-down.sh
./scripts/docker-rebuild.sh
./scripts/docker-makemigrations.sh
./scripts/docker-migrate.sh
./scripts/docker-test.sh
./scripts/docker-shell.sh
./scripts/docker-reset.sh
```
