from __future__ import annotations

import base64
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

import cv2
import numpy as np

from app.core.logging import get_logger, log_event
from app.services.analytics.base import AnalyticsEngine

logger = get_logger(__name__)


@dataclass(slots=True)
class WorkerCameraConfig:
    camera_id: str
    name: str
    stream_url: str
    target_fps: float


class CameraWorker:
    def __init__(
        self,
        config: WorkerCameraConfig,
        engine: AnalyticsEngine,
        sample_video_path: Path,
        on_event: Callable[[dict[str, object]], None],
    ) -> None:
        self.config = config
        self.engine = engine
        self.sample_video_path = sample_video_path
        self.on_event = on_event

        self._thread = threading.Thread(target=self._run, name=f"camera-worker-{config.camera_id}", daemon=True)
        self._stop_event = threading.Event()

    def start(self) -> None:
        log_event(logger, "camera_worker_start", camera_id=self.config.camera_id, stream_url=self.config.stream_url)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()

    def join(self, timeout: float = 3.0) -> None:
        if self._thread.is_alive():
            self._thread.join(timeout=timeout)
        log_event(logger, "camera_worker_stopped", camera_id=self.config.camera_id)

    def _emit(
        self,
        status: str,
        processed_fps: float,
        latency_ms: float,
        crowd_count: float,
        density_overlay_png_base64: str,
        frame_jpeg_base64: str = "",
        message: str | None = None,
    ) -> None:
        payload = {
            "camera_id": self.config.camera_id,
            "ts": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "processed_fps": float(max(processed_fps, 0.0)),
            "latency_ms": float(max(latency_ms, 0.0)),
            "crowd_count": float(max(crowd_count, 0.0)),
            "density_overlay_png_base64": density_overlay_png_base64,
            "frame_jpeg_base64": frame_jpeg_base64,
            "message": message,
        }
        self.on_event(payload)

    def _parse_device_index(self) -> int | None:
        parsed = urlparse(self.config.stream_url)
        if parsed.scheme not in {"device", "camera"}:
            return None

        raw_index = parsed.netloc or parsed.path.lstrip("/")
        if not raw_index or not raw_index.isdigit():
            return None
        return int(raw_index)

    def _open_capture(self) -> cv2.VideoCapture | None:
        parsed = urlparse(self.config.stream_url)

        if parsed.scheme == "sim":
            if self.sample_video_path.exists():
                return cv2.VideoCapture(str(self.sample_video_path))
            return None

        local_device_index = self._parse_device_index()
        if local_device_index is not None:
            cap_avfoundation = getattr(cv2, "CAP_AVFOUNDATION", None)
            if cap_avfoundation is not None:
                capture = cv2.VideoCapture(local_device_index, cap_avfoundation)
                if capture.isOpened():
                    return capture
                capture.release()

            capture = cv2.VideoCapture(local_device_index)
            if capture.isOpened():
                return capture
            capture.release()
            return None

        capture = cv2.VideoCapture(self.config.stream_url)
        if capture.isOpened():
            return capture
        capture.release()
        return None

    def _frame_to_jpeg_base64(self, frame: np.ndarray) -> str:
        ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        if not ok:
            return ""
        return base64.b64encode(encoded.tobytes()).decode("ascii")

    def _synthetic_frame(self, width: int = 1280, height: int = 720) -> np.ndarray:
        canvas = np.zeros((height, width, 3), dtype=np.uint8)
        now = time.time()
        gradient = np.linspace(0, 180, width, dtype=np.uint8)
        canvas[:, :, 0] = gradient
        canvas[:, :, 1] = np.flip(gradient)
        pulse = int((np.sin(now * 1.3) * 0.5 + 0.5) * 120)
        canvas[:, :, 2] = 40 + pulse

        text = "SIMULATED CAMERA FEED"
        cv2.putText(canvas, text, (40, 70), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 3)
        cv2.putText(canvas, datetime.now().strftime("%H:%M:%S"), (40, 130), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
        return canvas

    def _run(self) -> None:
        target_interval = 1.0 / min(max(self.config.target_fps, 1.0), 5.0)

        while not self._stop_event.is_set():
            cap = self._open_capture()
            is_synthetic = cap is None
            if cap is None and not self.sample_video_path.exists() and self.config.stream_url.startswith("sim://"):
                log_event(
                    logger,
                    "camera_worker_simulated_fallback",
                    camera_id=self.config.camera_id,
                    reason="sample_video_missing",
                )
            elif cap is None:
                self._emit(
                    status="offline",
                    processed_fps=0.0,
                    latency_ms=0.0,
                    crowd_count=0.0,
                    density_overlay_png_base64="",
                    frame_jpeg_base64="",
                    message="Camera stream unavailable",
                )
                time.sleep(2.0)
                continue

            next_tick = time.monotonic()

            while not self._stop_event.is_set():
                now = time.monotonic()
                if now < next_tick:
                    if cap is not None and cap.isOpened():
                        cap.grab()
                    time.sleep(min(next_tick - now, 0.01))
                    continue

                read_started = time.monotonic()
                if is_synthetic:
                    frame = self._synthetic_frame()
                    ok = True
                else:
                    ok, frame = cap.read()

                if not ok or frame is None:
                    if cap is not None and cap.isOpened():
                        cap.release()
                        cap = self._open_capture()
                        if cap is not None:
                            continue
                    self._emit(
                        status="offline",
                        processed_fps=0.0,
                        latency_ms=0.0,
                        crowd_count=0.0,
                        density_overlay_png_base64="",
                        frame_jpeg_base64="",
                        message="Camera read failed",
                    )
                    break

                try:
                    infer_started = time.monotonic()
                    result = self.engine.infer(frame)
                    infer_ms = (time.monotonic() - infer_started) * 1000.0

                    self._emit(
                        status="online",
                        processed_fps=1000.0 / max(infer_ms, 1.0),
                        latency_ms=infer_ms + (infer_started - read_started) * 1000.0,
                        crowd_count=float(result.get("crowd_count", 0.0)),
                        density_overlay_png_base64=str(result.get("overlay_png_base64", "")),
                        frame_jpeg_base64=self._frame_to_jpeg_base64(frame),
                        message=None,
                    )
                except Exception as exc:
                    log_event(
                        logger,
                        "camera_infer_error",
                        camera_id=self.config.camera_id,
                        error=str(exc),
                    )
                    self._emit(
                        status="error",
                        processed_fps=0.0,
                        latency_ms=0.0,
                        crowd_count=0.0,
                        density_overlay_png_base64="",
                        frame_jpeg_base64="",
                        message="Inference failed",
                    )
                    time.sleep(1.0)

                next_tick += target_interval
                if time.monotonic() - next_tick > target_interval:
                    next_tick = time.monotonic()

            if cap is not None and cap.isOpened():
                cap.release()

            if not is_synthetic:
                time.sleep(1.0)
