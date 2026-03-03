# Architecture

## System Overview
SFD Crowd Ops is a real-time camera analytics platform with a FastAPI backend, React frontend, and PostgreSQL persistence.

## Core Runtime Flow
1. A camera worker reads a stream (`sim://`, `rtsp://`, `http(s)://`, `device://`).
2. The worker runs inference via `ONNXEngine` (or `DummyEngine` fallback).
3. The worker emits an analytics event to a bounded in-memory queue.
4. `CameraManager` event processor persists:
   - latest camera state in `cameras`
   - latest analytics snapshot in `analytics_latest`
   - threshold/offline alerts in `alerts`
5. Events are broadcast to websocket clients (`/ws/analytics`).
6. Frontend consumes realtime updates from:
   - Supabase `postgres_changes` on `analytics_latest` when configured, else
   - backend websocket fallback.

## Backend Components
- `app/main.py`: app bootstrap, CORS, startup/shutdown lifecycle.
- `app/services/camera_worker.py`: per-camera capture + infer loop.
- `app/services/camera_manager.py`: worker orchestration, event queue, persistence, alert generation.
- `app/services/analytics/onnx_engine.py`: ONNX runtime inference path.
- `app/services/analytics/dummy_engine.py`: synthetic fallback path.
- `app/services/broadcaster.py`: websocket fan-out.
- `app/api/*.py`: health, camera CRUD, websocket endpoints.

## Database Design
Schema is migration-managed by Alembic. Initial revision: `20260303_0001`.

### `cameras`
- Camera configuration and latest runtime status.
- Key constraints:
  - unique `name`
  - `target_fps` range 1..5
  - `alert_threshold >= 1`
- Key indexes:
  - `ix_cameras_enabled`
  - `ix_cameras_created_at`

### `analytics_latest`
- One row per camera (`camera_id` PK).
- Stores latest metrics and heatmap overlay payload.

### `alerts`
- Append-only alert events.
- Key indexes:
  - `ix_alerts_camera_ts`
  - `ix_alerts_resolved_ts`

## Migration Model
- Source of truth: Alembic migrations.
- Container startup behavior:
  1. Detect legacy schema with missing `alembic_version`.
  2. Auto-`alembic stamp head` only in that specific case.
  3. Run `alembic upgrade head`.
  4. Fallback to `app.db.bootstrap` only if Alembic CLI is unavailable.

## Inference and Heatmap Pipeline
- ONNX model path: `backend/models/crowd_model_stride8.onnx`.
- Engine selection:
  - ONNX if model exists and is a real binary.
  - Dummy fallback if ONNX load fails.
- ONNX memory behavior:
  - backend reuses one shared ONNX Runtime session across camera workers.
  - each worker still has isolated temporal smoothing state.
- Worker frame sizing:
  - frames are resized to `FRAME_MAX_WIDTH` before inference/encoding to cap runtime memory per camera.
- Robustness features:
  - Git LFS pointer detection with explicit log message.
  - Temporal smoothing for stable heatmaps.
  - Overlay resize and PNG compression for payload control.
  - Frontend stale/out-of-order event filtering by camera timestamp.

## Multi-Camera Scaling Considerations
- One thread per camera worker.
- One shared queue processor for DB writes + broadcast.
- One shared ONNX session for all workers to avoid per-camera model duplication.
- Bounded queue avoids unbounded memory growth under bursts.
- Backpressure behavior drops oldest queued events first to preserve fresh realtime data.
- Throughput tuning knobs:
  - camera `target_fps`
  - `HEATMAP_MAX_WIDTH`
  - `HEATMAP_PNG_COMPRESSION`
  - DB pool settings (`DATABASE_POOL_*`)
