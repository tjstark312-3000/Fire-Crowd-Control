from __future__ import annotations

from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.camera import Camera
from app.schemas.camera import CameraCreate, CameraUpdate


class CameraRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self) -> Sequence[Camera]:
        return self.db.execute(select(Camera).order_by(Camera.created_at.asc())).scalars().all()

    def get(self, camera_id: str) -> Camera | None:
        return self.db.get(Camera, camera_id)

    def create(self, payload: CameraCreate) -> Camera:
        camera = Camera(
            name=payload.name,
            stream_url=payload.stream_url,
            enabled=payload.enabled,
            target_fps=payload.target_fps,
            alert_threshold=payload.alert_threshold,
        )
        self.db.add(camera)
        self.db.commit()
        self.db.refresh(camera)
        return camera

    def update(self, camera: Camera, payload: CameraUpdate) -> Camera:
        updates = payload.model_dump(exclude_unset=True)
        for key, value in updates.items():
            setattr(camera, key, value)
        self.db.add(camera)
        self.db.commit()
        self.db.refresh(camera)
        return camera

    def delete(self, camera: Camera) -> None:
        self.db.delete(camera)
        self.db.commit()
