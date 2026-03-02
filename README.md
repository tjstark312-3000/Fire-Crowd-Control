# Scottsdale Fire Department (SFD) - Crowd Ops

Production-grade crowd operations monorepo with real-time camera analytics, density heatmap overlays, and mission-control UI.

## Stack
- Frontend: React + Vite + TypeScript
- UI: Tailwind + shadcn-style components + Radix primitives
- Data Grid: TanStack Table
- Charts: Recharts
- Icons: lucide-react
- Backend: FastAPI + OpenCV + ONNX Runtime (fallback DummyEngine)
- Persistence: SQLite (default) or Supabase Postgres
- Realtime: Supabase Realtime (`analytics_latest`) with automatic WebSocket fallback

## Repo Tree
```text
.
├── README.md
├── backend
│   ├── .env.example
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── requirements-onnx.txt
│   ├── scripts
│   │   └── init_supabase.sql
│   ├── app
│   │   ├── api
│   │   │   ├── cameras.py
│   │   │   ├── health.py
│   │   │   └── ws.py
│   │   ├── core
│   │   │   ├── config.py
│   │   │   └── logging.py
│   │   ├── db
│   │   │   ├── base.py
│   │   │   └── session.py
│   │   ├── models
│   │   │   ├── camera.py
│   │   │   ├── analytics_latest.py
│   │   │   └── alert.py
│   │   ├── repositories
│   │   │   └── camera_repository.py
│   │   ├── schemas
│   │   │   ├── camera.py
│   │   │   └── analytics.py
│   │   ├── services
│   │   │   ├── analytics
│   │   │   │   ├── base.py
│   │   │   │   ├── dummy_engine.py
│   │   │   │   ├── onnx_engine.py
│   │   │   │   ├── heatmap.py
│   │   │   │   └── factory.py
│   │   │   ├── camera_worker.py
│   │   │   ├── camera_manager.py
│   │   │   └── broadcaster.py
│   │   └── main.py
│   ├── data
│   │   └── README.md
│   └── models
│       └── README.md
├── frontend
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── src
│       ├── App.tsx
│       ├── index.css
│       ├── main.tsx
│       ├── api
│       │   └── client.ts
│       ├── lib
│       │   ├── utils.ts
│       │   └── supabase.ts
│       ├── hooks
│       │   ├── useAnalyticsStream.ts
│       │   └── use-toast.ts
│       ├── context
│       │   ├── AppContext.tsx
│       │   └── AuthContext.tsx
│       ├── components
│       │   ├── Layout.tsx
│       │   ├── CommandPalette.tsx
│       │   ├── CameraTile.tsx
│       │   ├── CamerasDataTable.tsx
│       │   ├── AlertsPanel.tsx
│       │   ├── VideoOverlay.tsx
│       │   └── ui
│       │       ├── button.tsx
│       │       ├── input.tsx
│       │       ├── badge.tsx
│       │       ├── checkbox.tsx
│       │       ├── switch.tsx
│       │       ├── slider.tsx
│       │       ├── dropdown-menu.tsx
│       │       └── toaster.tsx
│       └── pages
│           ├── DashboardPage.tsx
│           ├── CamerasPage.tsx
│           ├── CameraDetailPage.tsx
│           ├── AlertsPage.tsx
│           ├── SettingsPage.tsx
│           └── ModelIntegrationPage.tsx
└── infra
    ├── docker-compose.yml
    └── nginx
        └── nginx.conf
```

## Supabase Setup (Required for DB + Realtime + Auth)
1. Create a Supabase project.
2. In Supabase SQL Editor, run:
   - `backend/scripts/init_supabase.sql`
3. Get credentials from Supabase project settings:
   - `Project URL`
   - `anon public key`
   - `service_role key`
   - `Postgres connection string`
4. Configure backend env (`backend/.env`):
   ```bash
   DATABASE_URL=postgresql+psycopg://<user>:<password>@<host>:5432/postgres
   CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173
   DEFAULT_TARGET_FPS=2
   DEFAULT_ALERT_THRESHOLD=120
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_ANON_KEY=<anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   ```
5. Configure frontend env (`frontend/.env`):
   ```bash
   VITE_API_BASE=http://localhost:8000
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key>
   VITE_FORCE_MOCK=false
   ```

## Realtime Behavior
- Frontend subscribes to Supabase Realtime on `public.analytics_latest`.
- Backend upserts one row per camera in `analytics_latest` after inference.
- If Supabase is not configured or channel fails, frontend falls back to `WS /ws/analytics`.
- If backend is unavailable, frontend falls back to mock stream mode.

## Local Development
### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs

## Docker Compose
```bash
docker compose -f infra/docker-compose.yml up --build
```

Open:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000

## Sample Video / Simulated Mode
- Put sample file at `backend/data/sample.mp4`.
- Use stream URL `sim://sample` for simulated ingest.
- Use stream URL `device://0` for your local webcam (macOS laptop camera index 0).
- For `device://0`, run backend directly on your Mac host so OpenCV can access the camera device.
- If sample file is missing, backend generates synthetic frames.

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

## Reliability Notes
- Per-camera worker loop with frame drop behavior when lagging.
- Analytics writes rate-limited by `target_fps` (validated/clamped to 1-5 FPS).
- Structured logging; API returns safe errors.
- Alerts persisted server-side with cooldown guard to prevent spam.

## CSRNet Training + ONNX + React Native Handoff
Train with:

```bash
python backend/scripts/train_csrnet.py --device cuda
```

Outputs now include:

- Epoch checkpoints: `backend/models/checkpoints/csrnet_epoch_XXXX.pt`
- Last checkpoint: `backend/models/checkpoints/csrnet_last.pt`
- Best checkpoint: `backend/models/checkpoints/csrnet_best.pt`
- Exported ONNX: `backend/models/crowd_model_stride8.onnx`
- Copied mobile ONNX: `mobile/assets/models/crowd_model_stride8.onnx`

Kaggle GPU helper script:

```bash
backend/scripts/run_csrnet_kaggle.sh
```
