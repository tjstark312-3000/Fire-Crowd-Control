from __future__ import annotations

from app.core.config import Settings
from app.core.logging import get_logger, log_event
from app.services.analytics.base import AnalyticsEngine
from app.services.analytics.dummy_engine import DummyEngine
from app.services.analytics.onnx_engine import ONNXEngine

logger = get_logger(__name__)


def create_engine(settings: Settings) -> AnalyticsEngine:
    if settings.model_path.exists():
        try:
            engine = ONNXEngine(model_path=settings.model_path, overlay_alpha=settings.overlay_alpha)
            log_event(logger, "engine_selected", engine="onnx", model_path=str(settings.model_path))
            return engine
        except Exception as exc:  # pragma: no cover - fallback behavior
            log_event(logger, "engine_fallback", reason=str(exc), fallback_engine="dummy")

    log_event(logger, "engine_selected", engine="dummy")
    return DummyEngine(overlay_alpha=settings.overlay_alpha)
