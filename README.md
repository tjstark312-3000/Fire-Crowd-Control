# Scottsdale Fire Department (SFD) - Crowd Ops

Real-time crowd analytics platform for multi-camera monitoring with heatmap overlays, alerting, and mission-control UI.

## Current Status (Handoff)
As of March 3, 2026, this repo is at a production-ready baseline:
- PostgreSQL-first architecture is active.
- Alembic migrations are enabled and running.
- ONNX inference is active in backend (with dummy fallback only if model missing).
- Multi-camera pipeline is running with memory hardening in place.
- Go-live checklist has been executed and marked PASS.

Go-live report:
- [Go-Live Checklist](docs/GO_LIVE_CHECKLIST.md)

## Documentation Map
- [Developer Documentation Index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API Contract](docs/API.md)
- [Operations Runbook](docs/OPERATIONS.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Tech Stack
- Frontend: React + Vite + TypeScript
- Backend: FastAPI + SQLAlchemy + OpenCV + ONNX Runtime
- Database: PostgreSQL (default), SQLite only if explicitly enabled
- Realtime: Supabase Realtime (`analytics_latest`) with backend websocket fallback
- Migrations: Alembic

## Repository Layout
```text
.
├── README.md
├── docs/
├── backend/
│   ├── app/
│   ├── alembic/
│   ├── scripts/
│   ├── .env.example
│   └── Dockerfile
├── frontend/
└── infra/
    └── docker-compose.yml
```

## Quick Start (Recommended)
From repo root:
```bash
docker compose -f infra/docker-compose.yml up --build
```

Endpoints:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs
- Postgres: `localhost:5432`

## First-Time Setup (Important)
The ONNX model is tracked by Git LFS.

```bash
git lfs install
git lfs pull
```

If this step is skipped, backend may log `engine_fallback` and use dummy inference.

## Health and Verification Commands
Run these after startup:

```bash
# API + DB health
curl -sS http://localhost:8000/health

# Migration revision in running backend
docker compose -f infra/docker-compose.yml exec -T backend alembic current

# Inference engine status
docker compose -f infra/docker-compose.yml logs backend --tail=200 | rg "engine_selected|engine_fallback"

# Camera status summary
curl -sS http://localhost:8000/api/cameras | jq '{total:length, online: map(select(.status=="online"))|length}'
```

## Daily Workflow for Teammates
### Build checks
```bash
backend/.venv/bin/python -m compileall backend/app backend/alembic
cd frontend && npm run build
cd .. && docker compose -f infra/docker-compose.yml config
```

### Add test cameras
```bash
for i in 1 2 3; do
  curl -sS -X POST http://localhost:8000/api/cameras \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Sim Cam $i\",\"stream_url\":\"sim://sample\",\"enabled\":true,\"target_fps\":2,\"alert_threshold\":120}" >/dev/null
done
```

### Follow backend logs
```bash
docker compose -f infra/docker-compose.yml logs -f backend
```

## Key Environment Variables
Backend defaults (`backend/.env.example`):

```bash
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/sfd_crowd
ALLOW_SQLITE=false

DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
DATABASE_POOL_TIMEOUT=30
DATABASE_POOL_RECYCLE=1800
DATABASE_CONNECT_TIMEOUT=10

DEFAULT_TARGET_FPS=2
DEFAULT_ALERT_THRESHOLD=120

OVERLAY_ALPHA=0.65
HEATMAP_TEMPORAL_SMOOTHING=0.35
HEATMAP_MAX_WIDTH=640
HEATMAP_PNG_COMPRESSION=3
ANALYTICS_EVENT_QUEUE_SIZE=128
FRAME_MAX_WIDTH=640
```

Performance/memory controls for multi-camera operation:
- `ANALYTICS_EVENT_QUEUE_SIZE`: bounds queued payload memory.
- `FRAME_MAX_WIDTH`: caps frame size before inference/encoding.
- `HEATMAP_MAX_WIDTH`: caps overlay size.

## Database and Migration Policy
- Canonical command: `alembic upgrade head`
- Current base migration: `backend/alembic/versions/20260303_0001_initial_schema.py`
- Container startup script attempts migration alignment automatically.
- Schema changes must be migration-driven (no ad-hoc production `create_all`).

## API Surface
- `GET /health`
- `GET /api/cameras`
- `POST /api/cameras`
- `PATCH /api/cameras/{id}`
- `DELETE /api/cameras/{id}`
- `GET /api/cameras/{id}/latest`
- `WS /ws/analytics`

For full request/response contract, use:
- [API Contract](docs/API.md)

## Known Operational Notes
- If Docker events show backend `oom` + `exitCode=137`, reduce:
  - camera count or per-camera FPS
  - `FRAME_MAX_WIDTH`
  - `HEATMAP_MAX_WIDTH`
  - `ANALYTICS_EVENT_QUEUE_SIZE`
- If CORS parsing fails, ensure `CORS_ORIGINS` is comma-separated.
- If migrations fail on legacy schema with missing `alembic_version`, use stamp flow in:
  - [Troubleshooting](docs/TROUBLESHOOTING.md)

## Next Steps for the Team
### Priority 1 (immediate)
1. Add CI gates: lint, unit/integration tests, migration check, frontend build, Docker image build.
2. Add automated soak/load test for N-camera scenarios and track restart/OOM behavior.
3. Add metrics + dashboards (queue depth, inference latency, API latency, DB latency, websocket publish rate).

### Priority 2 (short-term)
1. Add production alerts for:
   - backend restarts
   - OOM kills
   - camera offline/error rates
2. Add Postgres backup/restore job automation and recovery drill cadence.
3. Add API auth hardening + role-based access controls for operators/admins.

### Priority 3 (medium-term)
1. Optimize frontend bundle size (code-splitting/manual chunk strategy).
2. Add canary deployment workflow and rollback automation.
3. Expand model lifecycle docs (versioning, rollback model, accuracy/perf baselines).

## CSRNet Training and Mobile Handoff
Training command:
```bash
python backend/scripts/train_csrnet.py --device cuda
```

Primary artifacts:
- `backend/models/checkpoints/csrnet_epoch_XXXX.pt`
- `backend/models/checkpoints/csrnet_last.pt`
- `backend/models/checkpoints/csrnet_best.pt`
- `backend/models/crowd_model_stride8.onnx`
- `mobile/assets/models/crowd_model_stride8.onnx`

Kaggle helper:
```bash
backend/scripts/run_csrnet_kaggle.sh
```
