from __future__ import annotations

import queue
import threading
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.core.logging import get_logger, log_event
from app.models.alert import Alert
from app.models.analytics_latest import AnalyticsLatest
from app.models.camera import Camera
from app.repositories.camera_repository import CameraRepository
from app.schemas.camera import CameraCreate
from app.services.analytics.factory import create_engine
from app.services.broadcaster import AnalyticsBroadcaster
from app.services.camera_worker import CameraWorker, WorkerCameraConfig

logger = get_logger(__name__)
ALERT_COOLDOWN_SECONDS = 15.0


class CameraManager:
    def __init__(
        self,
        session_factory: sessionmaker,
        settings: Settings,
        broadcaster: AnalyticsBroadcaster,
    ) -> None:
        self.session_factory = session_factory
        self.settings = settings
        self.broadcaster = broadcaster

        self._workers: dict[str, CameraWorker] = {}
        self._latest_events: dict[str, dict[str, Any]] = {}
        self._last_alert_ts: dict[str, float] = {}
        self._lock = threading.Lock()
        self._event_queue: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=settings.analytics_event_queue_size)
        self._event_stop = threading.Event()
        self._event_thread = threading.Thread(
            target=self._process_event_queue,
            name="analytics-event-processor",
            daemon=True,
        )
        self._event_thread.start()

    def ensure_demo_camera(self) -> None:
        with self.session_factory() as db:
            repo = CameraRepository(db)
            existing = repo.list()
            if existing:
                return

            demo = CameraCreate(
                name="SFD Demo Camera",
                stream_url="sim://sample",
                enabled=True,
                target_fps=self.settings.default_target_fps,
                alert_threshold=self.settings.default_alert_threshold,
            )
            repo.create(demo)
            log_event(logger, "camera_seeded", name=demo.name, stream_url=demo.stream_url)

    def start_enabled_workers(self) -> None:
        with self.session_factory() as db:
            cameras = db.query(Camera).filter(Camera.enabled.is_(True)).all()

        for camera in cameras:
            self._start_worker(camera)

    def sync_camera(self, camera_id: str) -> None:
        with self.session_factory() as db:
            camera = db.get(Camera, camera_id)

        if camera is None:
            self.stop_worker(camera_id)
            return

        if not camera.enabled:
            self.stop_worker(camera_id)
            return

        self._start_worker(camera)

    def stop_worker(self, camera_id: str) -> None:
        worker: CameraWorker | None = None
        with self._lock:
            worker = self._workers.pop(camera_id, None)

        if worker is None:
            return

        worker.stop()
        worker.join()
        log_event(logger, "camera_worker_removed", camera_id=camera_id)

    def remove_camera(self, camera_id: str) -> None:
        self.stop_worker(camera_id)
        with self._lock:
            self._latest_events.pop(camera_id, None)

    def shutdown(self) -> None:
        with self._lock:
            camera_ids = list(self._workers.keys())

        for camera_id in camera_ids:
            self.stop_worker(camera_id)
        self._event_stop.set()
        self._event_thread.join(timeout=3.0)

    def latest_snapshot(self, camera_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._latest_events.get(camera_id)

    def latest_snapshots(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._latest_events.values())

    def _start_worker(self, camera: Camera) -> None:
        self.stop_worker(camera.id)

        worker = CameraWorker(
            config=WorkerCameraConfig(
                camera_id=camera.id,
                name=camera.name,
                stream_url=camera.stream_url,
                target_fps=camera.target_fps,
                frame_max_width=self.settings.frame_max_width,
            ),
            engine=create_engine(self.settings),
            sample_video_path=self.settings.sample_video_path,
            on_event=self._handle_worker_event,
        )

        with self._lock:
            self._workers[camera.id] = worker

        worker.start()

    def _handle_worker_event(self, payload: dict[str, Any]) -> None:
        try:
            self._event_queue.put_nowait(payload)
            return
        except queue.Full:
            pass

        # Drop the oldest queued event under sustained load to keep real-time updates fresh.
        try:
            _ = self._event_queue.get_nowait()
            self._event_queue.task_done()
        except queue.Empty:
            pass

        try:
            self._event_queue.put_nowait(payload)
        except queue.Full:
            log_event(
                logger,
                "camera_event_dropped",
                camera_id=str(payload.get("camera_id", "")),
                reason="event_queue_full",
            )

    def _process_event_queue(self) -> None:
        while not self._event_stop.is_set() or not self._event_queue.empty():
            try:
                payload = self._event_queue.get(timeout=0.2)
            except queue.Empty:
                continue
            try:
                self._persist_and_broadcast_event(payload)
            except Exception as exc:
                log_event(logger, "camera_event_processing_failed", error=str(exc))
            finally:
                self._event_queue.task_done()

    def _persist_and_broadcast_event(self, payload: dict[str, Any]) -> None:
        camera_id = str(payload.get("camera_id"))
        ts_raw = payload.get("ts")

        ts: datetime | None = None
        if isinstance(ts_raw, str):
            try:
                ts = datetime.fromisoformat(ts_raw)
            except ValueError:
                ts = None

        with self.session_factory() as db:
            camera = db.get(Camera, camera_id)
            if camera is not None:
                camera.status = str(payload.get("status", "offline"))
                camera.last_latency_ms = float(payload.get("latency_ms", 0.0))
                camera.last_processed_fps = float(payload.get("processed_fps", 0.0))
                camera.last_crowd_count = float(payload.get("crowd_count", 0.0))
                camera.last_update_ts = ts
                db.add(camera)

                latest = db.get(AnalyticsLatest, camera_id)
                if latest is None:
                    latest = AnalyticsLatest(camera_id=camera_id)
                latest.ts = ts
                latest.status = camera.status
                latest.processed_fps = camera.last_processed_fps or 0.0
                latest.latency_ms = camera.last_latency_ms or 0.0
                latest.crowd_count = camera.last_crowd_count or 0.0
                latest.density_overlay_png_base64 = str(payload.get("density_overlay_png_base64", ""))
                db.add(latest)

                self._maybe_add_alerts(
                    db=db,
                    camera=camera,
                    ts=ts or datetime.now(timezone.utc),
                )
                db.commit()

        with self._lock:
            self._latest_events[camera_id] = payload

        self.broadcaster.broadcast_from_thread(payload)

    def _can_emit_alert(self, key: str, ts: datetime) -> bool:
        ts_epoch = ts.timestamp()
        with self._lock:
            prev = self._last_alert_ts.get(key, 0.0)
            if ts_epoch - prev < ALERT_COOLDOWN_SECONDS:
                return False
            self._last_alert_ts[key] = ts_epoch
        return True

    def _insert_alert(
        self,
        *,
        db: Any,
        camera: Camera,
        ts: datetime,
        alert_type: str,
        severity: str,
        message: str,
    ) -> None:
        db.add(
            Alert(
                camera_id=camera.id,
                ts=ts,
                type=alert_type,
                severity=severity,
                message=message,
                resolved=False,
            )
        )

    def _maybe_add_alerts(self, *, db: Any, camera: Camera, ts: datetime) -> None:
        status = camera.status.lower()
        crowd_count = float(camera.last_crowd_count or 0.0)
        threshold = int(camera.alert_threshold or self.settings.default_alert_threshold)

        if status != "online" and self._can_emit_alert(f"{camera.id}:offline", ts):
            self._insert_alert(
                db=db,
                camera=camera,
                ts=ts,
                alert_type="offline",
                severity="critical",
                message=f"{camera.name} is {status.upper()}",
            )

        if crowd_count >= threshold and self._can_emit_alert(f"{camera.id}:threshold", ts):
            self._insert_alert(
                db=db,
                camera=camera,
                ts=ts,
                alert_type="threshold",
                severity="warning",
                message=f"{camera.name} crowd count {crowd_count:.1f} >= threshold {threshold}",
            )
