# Agent Onboarding

Quick orientation and rules for collaborating on this repo.

## Project snapshot
- Backend: Django (custom user model in `backend/accounts`)
- DB target: PostgreSQL
- Docs live in `docs/`
- Completed docs go in `docs/archived/`

## Where to look
- Planning: `docs/PLANNING.md`
- Archived planning: `docs/archived/`
- User/auth schema details: `docs/archived/USER_SCHEMA_PLANNING.md`
- Backend code: `backend/`
- Schema assets: `schema/`

## Conventions
- Keep doc updates in `docs/`; move completed docs to `docs/archived/`.
- Document architectural decisions as ADRs in `docs/adr/`, including alternatives and outstanding todos.
- Prefer `rg` for searching.
- Keep changes minimal and aligned with existing patterns.
- Use the Docker helper scripts for running app commands (required).

## Common commands
```bash
python backend/manage.py migrate
python backend/manage.py createsuperuser
python backend/manage.py runserver
```

## Docker helper scripts
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
