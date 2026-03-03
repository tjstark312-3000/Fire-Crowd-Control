# Operations Runbook

## Prerequisites
- Docker + Docker Compose
- Node.js 20+
- Python 3.11+
- Git LFS (`git lfs install`)

## Environment Baseline
Backend defaults are PostgreSQL-first:
- `DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/sfd_crowd`
- `ALLOW_SQLITE=false`

Copy and adjust:
```bash
cp backend/.env.example backend/.env
```

## Start the Stack
From repo root:
```bash
docker compose -f infra/docker-compose.yml up --build
```

Endpoints:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

## Verify ONNX Inference (Not Dummy Fallback)
1. Ensure model artifact is present:
```bash
git lfs pull
```
2. Check backend logs:
```bash
docker compose -f infra/docker-compose.yml logs backend --tail=200 | rg "engine_selected|engine_fallback"
```
Expected:
- `engine_selected` with `engine":"onnx"`
- no recurring `engine_fallback` lines.

## Multi-Camera Validation
Create several simulated cameras:
```bash
for i in 1 2 3 4 5; do
  curl -sS -X POST http://localhost:8000/api/cameras \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Sim Cam $i\",\"stream_url\":\"sim://sample\",\"enabled\":true,\"target_fps\":2,\"alert_threshold\":120}" >/dev/null
done
```

Check camera status:
```bash
curl -sS http://localhost:8000/api/cameras | jq '.[] | {name,status,last_processed_fps,last_latency_ms,last_crowd_count}'
```

Check latest snapshots for one camera:
```bash
CAM_ID=$(curl -sS http://localhost:8000/api/cameras | jq -r '.[0].id')
curl -sS "http://localhost:8000/api/cameras/$CAM_ID/latest" | jq '{status,processed_fps,latency_ms,crowd_count}'
```

## Migration Workflow
Use Alembic for all schema changes.

Apply migrations:
```bash
cd backend
alembic upgrade head
```

Create migration:
```bash
cd backend
alembic revision -m "describe change"
```

Container startup migration logic:
1. If legacy tables exist but `alembic_version` is missing, startup stamps head.
2. Then startup runs `alembic upgrade head`.
3. If Alembic is unavailable, startup falls back to `python -m app.db.bootstrap`.

Manual recovery for legacy DB:
```bash
docker compose -f infra/docker-compose.yml up -d postgres
docker compose -f infra/docker-compose.yml run --rm backend alembic stamp head
docker compose -f infra/docker-compose.yml up --build
```

## Health and Smoke Checks
```bash
curl -sS http://localhost:8000/health
curl -sS http://localhost:8000/api/cameras | jq 'length'
```

Build checks:
```bash
backend/.venv/bin/python -m compileall backend/app backend/alembic
cd frontend && npm run build
docker compose -f infra/docker-compose.yml config >/dev/null
```

## Runtime Tuning
Key settings:
- `DATABASE_POOL_SIZE`
- `DATABASE_MAX_OVERFLOW`
- `DATABASE_POOL_TIMEOUT`
- `HEATMAP_TEMPORAL_SMOOTHING`
- `HEATMAP_MAX_WIDTH`
- `HEATMAP_PNG_COMPRESSION`
- per-camera `target_fps`

Inference memory model:
- Camera workers reuse a shared ONNX Runtime session.
- This avoids loading one model copy per camera and prevents common OOM restart loops.

Recommended first optimizations under load:
1. Reduce `target_fps` on lower-priority cameras.
2. Lower `HEATMAP_MAX_WIDTH` (for example from 640 to 512).
3. Increase DB pool size only after measuring DB saturation.

## Backup and Restore (Compose Postgres)
Backup:
```bash
docker compose -f infra/docker-compose.yml exec -T postgres \
  pg_dump -U postgres -d sfd_crowd > backup_$(date +%Y%m%d_%H%M%S).sql
```

Restore:
```bash
cat backup.sql | docker compose -f infra/docker-compose.yml exec -T postgres \
  psql -U postgres -d sfd_crowd
```

## Release Checklist
1. `git lfs pull` has run in build/deploy environment.
2. `engine_selected=onnx` confirmed in backend logs.
3. `alembic upgrade head` succeeds on target DB.
4. `/health` returns `{"status":"ok","database":"ok"}`.
5. At least 3 camera workers verified online.
6. Frontend receives live analytics updates.
