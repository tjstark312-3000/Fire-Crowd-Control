from __future__ import annotations

import base64

import cv2
import numpy as np


def _normalize_density_map(density_map: np.ndarray) -> np.ndarray:
    density = np.asarray(density_map, dtype=np.float32)
    if density.size == 0:
        return np.zeros((1, 1), dtype=np.float32)

    p5 = float(np.percentile(density, 5))
    p95 = float(np.percentile(density, 95))
    if p95 <= p5 + 1e-6:
        min_v = float(density.min())
        max_v = float(density.max())
        if max_v <= min_v + 1e-6:
            return np.zeros_like(density, dtype=np.float32)
        normalized = (density - min_v) / (max_v - min_v)
    else:
        normalized = (density - p5) / (p95 - p5)

    return np.clip(normalized, 0.0, 1.0).astype(np.float32)


def density_map_to_overlay_png_base64(
    density_map: np.ndarray,
    frame_size: tuple[int, int],
    alpha: float = 0.65,
) -> str:
    frame_w, frame_h = frame_size
    alpha = float(np.clip(alpha, 0.0, 1.0))

    normalized = _normalize_density_map(density_map)
    upscaled = cv2.resize(normalized, (frame_w, frame_h), interpolation=cv2.INTER_CUBIC)
    heat = cv2.applyColorMap((upscaled * 255).astype(np.uint8), cv2.COLORMAP_JET)

    # OpenCV stores BGRA; PNG output is browser-safe when encoded.
    overlay_alpha = (upscaled * (255.0 * alpha)).astype(np.uint8)
    overlay_bgra = np.dstack((heat, overlay_alpha))

    ok, encoded = cv2.imencode(".png", overlay_bgra)
    if not ok:
        return ""
    return base64.b64encode(encoded.tobytes()).decode("utf-8")
