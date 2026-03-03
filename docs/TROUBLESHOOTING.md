# Troubleshooting

## 1) Backend exits with CORS parse error
Symptom:
- `SettingsError: error parsing value for field "cors_origins"`

Cause:
- Old image/build expecting JSON list for `CORS_ORIGINS`.

Fix:
1. Rebuild backend image:
```bash
docker compose -f infra/docker-compose.yml build backend --no-cache
```
2. Use comma-separated env value:
```bash
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173
```

## 2) `DuplicateTable: relation "cameras" already exists`
Symptom:
- Alembic tries to run initial migration on a DB that already has tables.

Fix (one-time):
```bash
docker compose -f infra/docker-compose.yml up -d postgres
docker compose -f infra/docker-compose.yml run --rm backend alembic stamp head
docker compose -f infra/docker-compose.yml up --build
```

Notes:
- Startup script now auto-detects this legacy case and stamps automatically.

## 3) ONNX not loading, backend falls back to dummy engine
Symptom:
- Logs show `engine_fallback` and message about Git LFS pointer.

Fix:
```bash
git lfs install
git lfs pull
docker compose -f infra/docker-compose.yml build backend --no-cache
docker compose -f infra/docker-compose.yml up -d backend
```

Verify:
```bash
docker compose -f infra/docker-compose.yml logs backend --tail=120 | rg "engine_selected|engine_fallback"
```

## 4) Docker image pull/build TLS timeout
Symptom:
- `TLS handshake timeout` while pulling base images (for example `nginx:1.27-alpine`).

Fix:
1. Retry build (most common transient fix).
2. Check host network and DNS stability.
3. Pull base image manually:
```bash
docker pull nginx:1.27-alpine
```
4. Re-run compose build.

## 5) `zsh: command not found: #`
Symptom:
- Shell error after pasting a command block containing comment lines.

Cause:
- The `# ...` comment line was pasted as a command in an unsafe format.

Fix:
- Paste only executable lines, or run a clean script without inline comments.

## 6) Cameras stay offline
Checks:
1. Verify stream URL scheme is valid (`sim`, `rtsp`, `http(s)`, `device`, `camera`).
2. For `sim://sample`, ensure `backend/data/sample.mp4` exists or expect synthetic frames.
3. Check backend logs:
```bash
docker compose -f infra/docker-compose.yml logs backend --tail=200 | rg "camera_worker|camera_infer_error|offline"
```

## 7) Backend keeps restarting with `exitCode=137` / OOM
Symptom:
- Docker events show repeated `oom` and `die` with `exitCode=137`.

Checks:
```bash
docker events --since 5m --until "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --filter container=sfd-crowd-backend | tail -n 50
```

Fixes:
1. Ensure you are running the latest code where ONNX session is shared across workers.
2. Reduce active cameras or lower camera `target_fps`.
3. Lower heatmap payload settings (`HEATMAP_MAX_WIDTH`, compression tuning).
4. Increase Docker Desktop memory allocation if needed.

## 8) Frontend not receiving realtime updates
Checks:
1. Confirm backend websocket endpoint reachable:
```bash
curl -i http://localhost:8000/health
```
2. If Supabase is configured, verify `VITE_SUPABASE_URL` and anon key.
3. Check browser console for websocket/subscription errors.
4. Verify camera is enabled and producing events.

## 9) Migration command works locally but not in container
Checks:
1. Confirm `backend/alembic.ini` and `backend/alembic/` are copied in Dockerfile.
2. Confirm container starts via `scripts/start_backend.sh`.
3. Confirm DB connectivity from backend container.

## Log Commands
```bash
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs backend --tail=200
docker compose -f infra/docker-compose.yml logs postgres --tail=200
docker compose -f infra/docker-compose.yml logs frontend --tail=200
```
