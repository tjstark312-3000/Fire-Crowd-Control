from __future__ import annotations

import math
import time

import cv2
import numpy as np

from app.services.analytics.heatmap import density_map_to_overlay_png_base64


class DummyEngine:
    def __init__(self, overlay_alpha: float = 0.65) -> None:
        self.overlay_alpha = overlay_alpha
        self.rng = np.random.default_rng()
        self.phase = self.rng.uniform(0, 2 * math.pi)

    def infer(self, frame_bgr: np.ndarray) -> dict[str, object]:
        frame_h, frame_w = frame_bgr.shape[:2]
        map_h = max(18, frame_h // 8)
        map_w = max(18, frame_w // 8)

        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        base = cv2.resize(gray, (map_w, map_h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0

        ys = np.linspace(-1.0, 1.0, map_h, dtype=np.float32)
        xs = np.linspace(-1.0, 1.0, map_w, dtype=np.float32)
        yy, xx = np.meshgrid(ys, xs, indexing="ij")

        t = time.time()
        cx = 0.5 * math.sin(t * 0.23 + self.phase)
        cy = 0.5 * math.cos(t * 0.17 + self.phase)
        hotspot = np.exp(-(((xx - cx) ** 2) + ((yy - cy) ** 2)) / 0.22).astype(np.float32)

        noise = self.rng.normal(loc=0.0, scale=0.08, size=(map_h, map_w)).astype(np.float32)
        density_map = np.clip(base * 0.35 + hotspot * 0.75 + noise, 0.0, 2.2).astype(np.float32)

        crowd_count = float(np.clip(np.sum(density_map) * 0.19, 0.0, 1000.0))
        overlay_png_base64 = density_map_to_overlay_png_base64(
            density_map,
            frame_size=(frame_w, frame_h),
            alpha=self.overlay_alpha,
        )

        return {
            "crowd_count": crowd_count,
            "density_map": density_map,
            "overlay_png_base64": overlay_png_base64,
        }
