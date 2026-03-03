# Scottsdale Fire Department (SFD) - Crowd Ops

Production-grade crowd operations monorepo with real-time camera analytics, density heatmap overlays, and mission-control UI.

## Recent Platform Updates
- Switched to PostgreSQL-first persistence (SQLite is opt-in only via `ALLOW_SQLITE=true`).
- Added Alembic migration scaffolding and initial production schema migration.
- Added database connection pooling and startup schema validation.
- Added DB-aware `/health` checks (`503` when DB is unavailable).
- Added Docker Compose PostgreSQL service with health checks.
- Improved realtime heatmap pipeline for smooth updates under load:
  - Added bounded event queue between camera workers and DB/websocket writes.
  - Added temporal heatmap smoothing in ONNX and dummy engines.
- Added heatmap payload optimization with configurable max width and PNG compression.
- Added stale event filtering in frontend stream handling to prevent out-of-order jitter.
- Added ONNX Git LFS pointer detection with explicit error messaging.
- Added shared ONNX runtime session reuse across camera workers to reduce memory and prevent per-camera model duplication.

## Stack
- Frontend: React + Vite + TypeScript
- UI: Tailwind + Radix primitives
- Charts/Data: Recharts + TanStack Table
- Backend: FastAPI + SQLAlchemy + OpenCV + ONNX Runtime (fallback DummyEngine)
- Database: PostgreSQL (default), SQLite (dev fallback only)
- Realtime: Supabase Realtime (`analytics_latest`) with automatic WebSocket fallback
- Migrations: Alembic

## Documentation Index
- [Developer Documentation Index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API Contract](docs/API.md)
- [Operations Runbook](docs/OPERATIONS.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Production Defaults
- `DATABASE_URL` default: `postgresql+psycopg://postgres:postgres@localhost:5432/sfd_crowd`
- `ALLOW_SQLITE` default: `false`
- Startup fails fast if required DB tables are missing.
- Backend health endpoint validates live DB connectivity.

## Repository Structure
```text
.
├── README.md
├── backend
│   ├── .env.example
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   ├── scripts/
│   │   ├── start_backend.sh
│   │   └── init_supabase.sql
│   └── app/
├── frontend
└── infra
    └── docker-compose.yml
```

## Quick Start (Recommended: Docker)
```bash
docker compose -f infra/docker-compose.yml up --build
```

Services:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs
- PostgreSQL: `localhost:5432`

## Local Development
### 1) Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

Run migrations:
```bash
alembic upgrade head
```

Start API:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```

## Backend Environment (`backend/.env`)
```bash
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/sfd_crowd
ALLOW_SQLITE=false
DATABASE_ECHO=false
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

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Database and Migrations
- Canonical migration path: `alembic upgrade head`
- Initial migration file: `backend/alembic/versions/20260303_0001_initial_schema.py`
- Container startup script runs migrations automatically when Alembic CLI is available.
- Restricted/offline fallback: startup uses schema bootstrap (`python -m app.db.bootstrap`).

## Realtime Heatmap Pipeline
- Per-camera workers run inference and emit analytics events.
- Events are buffered through a bounded queue before DB writes and websocket broadcast.
- Backend stores latest per-camera analytics in `analytics_latest`.
- Frontend consumes Supabase `postgres_changes` when configured.
- Frontend falls back to backend websocket stream when Supabase is unavailable.
- Frontend drops stale/out-of-order camera events to keep overlays stable.

## Heatmap Smoothness and Throughput Controls
- `HEATMAP_TEMPORAL_SMOOTHING` (0.0-0.95): reduces flicker between frames.
- `HEATMAP_MAX_WIDTH`: caps overlay resolution to reduce payload size and render latency.
- `HEATMAP_PNG_COMPRESSION` (0-9): tradeoff between CPU and payload size.

## ONNX Model Requirement
The ONNX model is tracked in Git LFS. If model loading fails or backend falls back to dummy engine, fetch LFS artifacts:

```bash
git lfs pull
```

Expected model path:
- `backend/models/crowd_model_stride8.onnx`

## Supabase Setup (Optional but Recommended for Hosted Realtime/Auth)
1. Create a Supabase project.
2. Run `backend/scripts/init_supabase.sql` in Supabase SQL Editor.
3. Set backend env:
```bash
DATABASE_URL=postgresql+psycopg://<user>:<password>@<host>:5432/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```
4. Set frontend env:
```bash
VITE_API_BASE=http://localhost:8000
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_FORCE_MOCK=false
```

## API
- `GET /health`
- `GET /api/cameras`
- `POST /api/cameras`
- `PATCH /api/cameras/{id}`
- `DELETE /api/cameras/{id}`
- `GET /api/cameras/{id}/latest`
- `WS /ws/analytics`

Event payload:
```json
{
  "camera_id": "string",
  "ts": "ISO8601",
  "status": "online|offline|error",
  "processed_fps": 2.4,
  "latency_ms": 88.2,
  "crowd_count": 123.5,
  "density_overlay_png_base64": "...",
  "frame_jpeg_base64": "...",
  "message": "optional"
}
```

## Validation Commands
```bash
# Backend static checks
backend/.venv/bin/python -m compileall backend/app backend/alembic

# Frontend production build
cd frontend && npm run build

# Compose configuration check
cd infra && docker compose config
```

## Next Steps
1. Pull real ONNX artifacts (`git lfs pull`) in all deploy environments.
2. Enable CI pipeline stages: lint, tests, migration check, frontend build, image build.
3. Add load testing for multi-camera realtime throughput and tune `HEATMAP_*` + DB pool settings.
4. Add structured metrics and tracing (Prometheus/OpenTelemetry) for queue depth, inference latency, DB latency, websocket broadcast latency.
5. Enforce migration-only schema changes in CI/CD (`alembic upgrade head` on deploy).
6. Add backup/restore, retention, and disaster recovery runbooks for PostgreSQL.

## CSRNet Training + Mobile Handoff
Train with:
```bash
python backend/scripts/train_csrnet.py --device cuda
```

Outputs include:
- `backend/models/checkpoints/csrnet_epoch_XXXX.pt`
- `backend/models/checkpoints/csrnet_last.pt`
- `backend/models/checkpoints/csrnet_best.pt`
- `backend/models/crowd_model_stride8.onnx`
- `mobile/assets/models/crowd_model_stride8.onnx`

Kaggle helper:
```bash
backend/scripts/run_csrnet_kaggle.sh
```
