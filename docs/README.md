# Developer Documentation

This folder is the source of truth for future contributors.

## Read Order
1. [Architecture](ARCHITECTURE.md)
2. [API Contract](API.md)
3. [Operations Runbook](OPERATIONS.md)
4. [Deployment Guide](DEPLOYMENT.md)
5. [Troubleshooting](TROUBLESHOOTING.md)
6. [Go-Live Checklist](GO_LIVE_CHECKLIST.md)

## Scope
- Backend service behavior, schema, migrations, and inference runtime.
- Frontend realtime stream handling and fallback behavior.
- Multi-camera validation workflow.
- Production deployment and release checklist.

## Quick Links
- Main project overview: [`../README.md`](../README.md)
- Docker stack: [`../infra/docker-compose.yml`](../infra/docker-compose.yml)
- Backend startup script: [`../backend/scripts/start_backend.sh`](../backend/scripts/start_backend.sh)
- Initial migration: [`../backend/alembic/versions/20260303_0001_initial_schema.py`](../backend/alembic/versions/20260303_0001_initial_schema.py)
