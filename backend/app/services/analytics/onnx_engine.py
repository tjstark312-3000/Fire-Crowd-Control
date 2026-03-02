from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.services.analytics.heatmap import density_map_to_overlay_png_base64

try:
    import onnxruntime as ort
except Exception:  # pragma: no cover - optional runtime in local dev
    ort = None

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class ONNXEngine:
    def __init__(self, model_path: Path, overlay_alpha: float = 0.65) -> None:
        if ort is None:
            raise RuntimeError("onnxruntime is unavailable")
        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")

        self.overlay_alpha = overlay_alpha
        self.session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        input_meta = self.session.get_inputs()[0]
        output_meta = self.session.get_outputs()[0]
        self.input_name = input_meta.name
        self.output_name = output_meta.name
        self.input_shape = input_meta.shape
        self.output_shape = output_meta.shape
        self.layout = self._infer_layout(self.input_shape, self.output_shape)

    def _dim_is(self, shape: list[Any] | tuple[Any, ...], index: int, expected: int) -> bool:
        if len(shape) <= index:
            return False
        dim = shape[index]
        return isinstance(dim, int) and dim == expected

    def _infer_layout(self, input_shape: list[Any] | tuple[Any, ...], output_shape: list[Any] | tuple[Any, ...]) -> str:
        in_ch_first = self._dim_is(input_shape, 1, 3)
        in_ch_last = self._dim_is(input_shape, 3, 3)
        out_ch_first = self._dim_is(output_shape, 1, 1)
        out_ch_last = self._dim_is(output_shape, 3, 1)

        if in_ch_first and not in_ch_last:
            return "nchw"
        if in_ch_last and not in_ch_first:
            return "nhwc"
        if out_ch_first and not out_ch_last:
            return "nchw"
        if out_ch_last and not out_ch_first:
            return "nhwc"
        # Safe default for most PyTorch exports.
        return "nchw"

    def _resolve_input_hw(self, frame_h: int, frame_w: int) -> tuple[int, int]:
        if len(self.input_shape) >= 4:
            if self.layout == "nhwc":
                h = self.input_shape[1]
                w = self.input_shape[2]
            else:
                h = self.input_shape[2]
                w = self.input_shape[3]
            target_h = int(h) if isinstance(h, int) and h > 0 else frame_h
            target_w = int(w) if isinstance(w, int) and w > 0 else frame_w
            return target_h, target_w
        return frame_h, frame_w

    def _preprocess(self, frame_bgr: np.ndarray) -> tuple[np.ndarray, tuple[int, int]]:
        frame_h, frame_w = frame_bgr.shape[:2]
        target_h, target_w = self._resolve_input_hw(frame_h, frame_w)

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
        x = resized.astype(np.float32) / 255.0
        x = (x - IMAGENET_MEAN) / IMAGENET_STD
        if self.layout == "nhwc":
            x = x[None, ...]
        else:
            x = np.transpose(x, (2, 0, 1))[None, ...]
        return x, (frame_w, frame_h)

    def _extract_density_map(self, output: Any) -> np.ndarray:
        density = np.asarray(output, dtype=np.float32)
        if density.ndim == 4:
            if self.layout == "nhwc":
                density = density[0, :, :, 0]
            else:
                density = density[0, 0, :, :]
        elif density.ndim == 3:
            density = density[0, :, :]
        elif density.ndim > 4:
            density = np.squeeze(density)

        if density.ndim != 2:
            density = np.squeeze(density)
        if density.ndim != 2:
            raise RuntimeError(f"Unexpected ONNX output shape after squeeze: {density.shape}")

        density = np.clip(density, 0.0, None)
        return density.astype(np.float32)

    def infer(self, frame_bgr: np.ndarray) -> dict[str, object]:
        model_input, frame_size = self._preprocess(frame_bgr)
        output = self.session.run([self.output_name], {self.input_name: model_input})[0]
        density_map = self._extract_density_map(output)

        crowd_count = float(np.sum(density_map))
        overlay_png_base64 = density_map_to_overlay_png_base64(
            density_map,
            frame_size=frame_size,
            alpha=self.overlay_alpha,
        )

        return {
            "crowd_count": crowd_count,
            "density_map": density_map,
            "overlay_png_base64": overlay_png_base64,
        }
