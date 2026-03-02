from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_camera_manager
from app.db.session import get_db
from app.models.analytics_latest import AnalyticsLatest
from app.models.camera import Camera
from app.repositories.camera_repository import CameraRepository
from app.schemas.camera import CameraCreate, CameraOut, CameraUpdate, LatestSnapshot
from app.services.camera_manager import CameraManager

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


def _preview_url(camera: Camera, request: Request) -> str | None:
    parsed = urlparse(camera.stream_url)
    if parsed.scheme == "sim":
        return str(request.base_url).rstrip("/") + "/data/sample.mp4"
    if parsed.scheme in {"http", "https"}:
        return camera.stream_url
    return None


def _camera_to_out(camera: Camera, request: Request) -> CameraOut:
    return CameraOut(
        id=camera.id,
        name=camera.name,
        stream_url=camera.stream_url,
        enabled=camera.enabled,
        target_fps=camera.target_fps,
        alert_threshold=camera.alert_threshold,
        status=camera.status,
        last_latency_ms=camera.last_latency_ms,
        last_processed_fps=camera.last_processed_fps,
        last_crowd_count=camera.last_crowd_count,
        last_update_ts=camera.last_update_ts,
        preview_url=_preview_url(camera, request),
    )


@router.get("", response_model=list[CameraOut])
def list_cameras(request: Request, db: Session = Depends(get_db)) -> list[CameraOut]:
    repo = CameraRepository(db)
    cameras = repo.list()
    return [_camera_to_out(camera, request) for camera in cameras]


@router.post("", response_model=CameraOut, status_code=status.HTTP_201_CREATED)
def create_camera(
    request: Request,
    payload: CameraCreate,
    db: Session = Depends(get_db),
    manager: CameraManager = Depends(get_camera_manager),
) -> CameraOut:
    repo = CameraRepository(db)
    try:
        camera = repo.create(payload)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Camera name must be unique")

    manager.sync_camera(camera.id)
    return _camera_to_out(camera, request)


@router.patch("/{camera_id}", response_model=CameraOut)
def update_camera(
    camera_id: str,
    request: Request,
    payload: CameraUpdate,
    db: Session = Depends(get_db),
    manager: CameraManager = Depends(get_camera_manager),
) -> CameraOut:
    repo = CameraRepository(db)
    camera = repo.get(camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")

    try:
        updated = repo.update(camera, payload)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Camera name must be unique")

    manager.sync_camera(updated.id)
    return _camera_to_out(updated, request)


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_camera(
    camera_id: str,
    db: Session = Depends(get_db),
    manager: CameraManager = Depends(get_camera_manager),
) -> Response:
    repo = CameraRepository(db)
    camera = repo.get(camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")

    repo.delete(camera)
    manager.remove_camera(camera_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{camera_id}/latest", response_model=LatestSnapshot)
def latest_snapshot(
    camera_id: str,
    db: Session = Depends(get_db),
    manager: CameraManager = Depends(get_camera_manager),
) -> LatestSnapshot:
    repo = CameraRepository(db)
    camera = repo.get(camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")

    latest = manager.latest_snapshot(camera_id)
    if latest:
        ts = latest.get("ts")
        if isinstance(ts, str):
            try:
                ts = datetime.fromisoformat(ts)
            except ValueError:
                ts = datetime.now(timezone.utc)
        return LatestSnapshot(
            camera_id=camera_id,
            ts=ts,
            status=str(latest.get("status", camera.status)),
            processed_fps=float(latest.get("processed_fps", camera.last_processed_fps or 0.0)),
            latency_ms=float(latest.get("latency_ms", camera.last_latency_ms or 0.0)),
            crowd_count=float(latest.get("crowd_count", camera.last_crowd_count or 0.0)),
            density_overlay_png_base64=str(latest.get("density_overlay_png_base64", "")),
            frame_jpeg_base64=str(latest.get("frame_jpeg_base64", "")),
            message=latest.get("message"),
        )

    persisted = db.get(AnalyticsLatest, camera_id)
    if persisted is not None:
        return LatestSnapshot(
            camera_id=camera_id,
            ts=persisted.ts,
            status=persisted.status,
            processed_fps=persisted.processed_fps,
            latency_ms=persisted.latency_ms,
            crowd_count=persisted.crowd_count,
            density_overlay_png_base64=persisted.density_overlay_png_base64,
            frame_jpeg_base64=None,
            message=None,
        )

    return LatestSnapshot(
        camera_id=camera_id,
        ts=camera.last_update_ts,
        status=camera.status,
        processed_fps=camera.last_processed_fps or 0.0,
        latency_ms=camera.last_latency_ms or 0.0,
        crowd_count=camera.last_crowd_count or 0.0,
        density_overlay_png_base64="",
        frame_jpeg_base64=None,
        message="No analytics available yet",
    )
