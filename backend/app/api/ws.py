from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.broadcaster import AnalyticsBroadcaster
from app.services.camera_manager import CameraManager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/analytics")
async def analytics_ws(websocket: WebSocket) -> None:
    broadcaster: AnalyticsBroadcaster = websocket.app.state.broadcaster
    manager: CameraManager = websocket.app.state.camera_manager

    await broadcaster.connect(websocket)

    try:
        for snapshot in manager.latest_snapshots():
            await websocket.send_json(snapshot)

        while True:
            # Keep connection open. Clients may send ping messages.
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except TimeoutError:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        await broadcaster.disconnect(websocket)
    except Exception:
        await broadcaster.disconnect(websocket)
