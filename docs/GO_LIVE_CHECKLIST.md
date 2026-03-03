# Go-Live Checklist (March 3, 2026)

Environment: local Docker Compose stack from repo root (`/Users/tjstark/Documents/Fire_Crowd_Control`)

## Final Status
- Overall: `PASS`
- Blocking failures: `0`

## Checklist Results

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Docker services up (`backend`, `frontend`, `postgres`) | PASS | `docker compose -f infra/docker-compose.yml ps` showed all services `Up`, postgres `healthy`. |
| 2 | Compose configuration valid | PASS | `docker compose -f infra/docker-compose.yml config` returned `compose_ok`. |
| 3 | Backend health endpoint | PASS | `GET /health` returned `{"status":"ok","database":"ok"}`. |
| 4 | DB migration head applied | PASS | `docker compose ... exec backend alembic current` returned `20260303_0001 (head)`. |
| 5 | Inference engine is ONNX (not fallback) | PASS | Backend logs show repeated `engine_selected` with `"engine":"onnx"` and no `engine_fallback` in final tail. |
| 6 | Multi-camera runtime online | PASS | `GET /api/cameras` summary: `total=7`, `online=7`, `offline=0`. |
| 7 | Runtime stability soak (2 min) | PASS | Restart counter stayed `0` across 8 samples (15s interval); no `oom`/`die` events since soak start. |
| 8 | Backend code compile check | PASS | `python -m compileall backend/app backend/alembic` completed successfully. |
| 9 | Frontend production build | PASS | `npm run build` completed successfully. |
| 10 | Production docs and runbooks present | PASS | Added and linked architecture, API, operations, deployment, troubleshooting, and this checklist. |

## Fixes Applied During Final Validation
1. Shared ONNX runtime session across workers to reduce model duplication.
2. Added bounded event queue setting (`ANALYTICS_EVENT_QUEUE_SIZE`) to cap payload buffering.
3. Added frame processing width cap (`FRAME_MAX_WIDTH`) to reduce per-camera inference/frame memory.

## Current Production-Tuned Defaults
- `ANALYTICS_EVENT_QUEUE_SIZE=128`
- `FRAME_MAX_WIDTH=640`
- `HEATMAP_MAX_WIDTH=640`
- `HEATMAP_PNG_COMPRESSION=3`

## Notes
- Frontend build still warns about large JS chunk size; non-blocking for current go-live baseline.
