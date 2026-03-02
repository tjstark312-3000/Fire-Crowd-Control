from __future__ import annotations

import asyncio

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.cameras import router as cameras_router
from app.api.health import router as health_router
from app.api.ws import router as ws_router
from app.core.config import get_settings
from app.core.logging import get_logger, log_event, setup_logging
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.services.broadcaster import AnalyticsBroadcaster
from app.services.camera_manager import CameraManager

settings = get_settings()
setup_logging()
logger = get_logger(__name__)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(cameras_router)
app.include_router(ws_router)

app.mount("/data", StaticFiles(directory=str(settings.sample_video_path.parent)), name="data")


@app.on_event("startup")
async def startup() -> None:
    Base.metadata.create_all(bind=engine)

    broadcaster = AnalyticsBroadcaster()
    broadcaster.set_loop(asyncio.get_running_loop())

    manager = CameraManager(session_factory=SessionLocal, settings=settings, broadcaster=broadcaster)
    manager.ensure_demo_camera()
    manager.start_enabled_workers()

    app.state.broadcaster = broadcaster
    app.state.camera_manager = manager

    log_event(logger, "startup_complete")


@app.on_event("shutdown")
async def shutdown() -> None:
    manager: CameraManager | None = getattr(app.state, "camera_manager", None)
    if manager:
        manager.shutdown()
    log_event(logger, "shutdown_complete")


@app.exception_handler(Exception)
async def global_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    log_event(logger, "unhandled_exception", error=str(exc))
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
