from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AnalyticsEvent(BaseModel):
    camera_id: str
    ts: datetime
    status: Literal["online", "offline", "error"]
    processed_fps: float = Field(ge=0)
    latency_ms: float = Field(ge=0)
    crowd_count: float = Field(ge=0)
    density_overlay_png_base64: str
    message: str | None = None
