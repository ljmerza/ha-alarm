# ADR 0010: Disable Home Assistant Integration During Tests by Default

## Status
Accepted

## Context
The backend can optionally talk to a real Home Assistant instance when `HOME_ASSISTANT_URL`/`HOME_ASSISTANT_TOKEN` are configured.

When running automated tests, inheriting these environment variables can cause the test suite to:
- make real network calls,
- become flaky (depends on HA reachability and data),
- be slower and harder to run in CI.

## Decision
When running `manage.py test`, treat Home Assistant as “not configured” by default:
- In `config.settings`, clear `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN` when `"test"` is present in `sys.argv`.
- Allow opt-in integration testing by setting `ALLOW_HOME_ASSISTANT_IN_TESTS=true`.
- Reduce noise by setting the `alarm.home_assistant` logger to `WARNING` during tests (unless HA integration is enabled).

## Alternatives Considered
- Patch/mocking at every call site (fragile, easy to miss).
- Add a dedicated “integration tests” runner and separate settings module (more structure than needed right now).
- Rely on CI to never set HA env vars (hard to guarantee for local runs).

## Consequences
- Tests are deterministic and do not hit real Home Assistant by default.
- Integration coverage can still be exercised intentionally via `ALLOW_HOME_ASSISTANT_IN_TESTS=true`.

## Todos
- Consider a dedicated helper script for HA integration test runs (e.g., `./scripts/docker-test-ha.sh`) if needed.
