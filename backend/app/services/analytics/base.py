from __future__ import annotations

from typing import Protocol

import numpy as np


class AnalyticsEngine(Protocol):
    def infer(self, frame_bgr: np.ndarray) -> dict[str, object]:
        """Run inference and return crowd_count, density_map, overlay_png_base64."""
