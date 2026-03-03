from __future__ import annotations

from threading import Lock

from app.core.config import Settings
from app.core.logging import get_logger, log_event
from app.services.analytics.base import AnalyticsEngine
from app.services.analytics.dummy_engine import DummyEngine
from app.services.analytics.onnx_engine import ONNXEngine, ONNXSessionBundle

logger = get_logger(__name__)
_session_bundle_lock = Lock()
_session_bundle_cache: dict[str, ONNXSessionBundle] = {}


def _get_or_create_session_bundle(settings: Settings) -> ONNXSessionBundle:
    cache_key = str(settings.model_path.resolve())

    cached = _session_bundle_cache.get(cache_key)
    if cached is not None:
        return cached

    with _session_bundle_lock:
        cached = _session_bundle_cache.get(cache_key)
        if cached is not None:
            return cached
        created = ONNXEngine.build_session_bundle(settings.model_path)
        _session_bundle_cache[cache_key] = created
        return created


def create_engine(settings: Settings) -> AnalyticsEngine:
    if settings.model_path.exists():
        try:
            session_bundle = _get_or_create_session_bundle(settings)
            engine = ONNXEngine(
                session_bundle=session_bundle,
                overlay_alpha=settings.overlay_alpha,
                heatmap_smoothing=settings.heatmap_temporal_smoothing,
                heatmap_max_width=settings.heatmap_max_width,
                heatmap_png_compression=settings.heatmap_png_compression,
            )
            log_event(logger, "engine_selected", engine="onnx", model_path=str(settings.model_path))
            return engine
        except Exception as exc:  # pragma: no cover - fallback behavior
            log_event(logger, "engine_fallback", reason=str(exc), fallback_engine="dummy")

    log_event(logger, "engine_selected", engine="dummy")
    return DummyEngine(
        overlay_alpha=settings.overlay_alpha,
        heatmap_smoothing=settings.heatmap_temporal_smoothing,
        heatmap_max_width=settings.heatmap_max_width,
        heatmap_png_compression=settings.heatmap_png_compression,
    )
