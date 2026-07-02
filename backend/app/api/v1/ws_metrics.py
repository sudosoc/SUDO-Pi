from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from app.core.security import verify_access_token, ACCESS_COOKIE_NAME
from app.services.metrics_service import collect_snapshot

router = APIRouter(tags=["WebSocket"])

_PUSH_INTERVAL = 3  # seconds between metric pushes


class MetricsConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.debug("Live metrics WS connected (total={})", len(self.active_connections))

    def disconnect(self, websocket: WebSocket) -> None:
        try:
            self.active_connections.remove(websocket)
        except ValueError:
            pass
        logger.debug("Live metrics WS disconnected (total={})", len(self.active_connections))

    async def broadcast(self, data: dict) -> None:
        dead: list[WebSocket] = []
        for conn in list(self.active_connections):
            try:
                await conn.send_json(data)
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.disconnect(conn)

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)


metrics_manager = MetricsConnectionManager()


@router.websocket("/ws/metrics")
async def websocket_metrics(websocket: WebSocket) -> None:
    """
    Stream live metrics every 3 seconds to authenticated clients.
    Auth via cookie (access_token) or ?token= query parameter.
    Message format: {"type": "metrics", "data": {cpu, ram, disk, temp, rx, tx, timestamp}}
    """
    # Authenticate the WS connection
    token = websocket.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        token = websocket.query_params.get("token")

    payload = verify_access_token(token) if token else None
    if payload is None:
        await websocket.close(code=4001)
        return

    await metrics_manager.connect(websocket)
    try:
        # Send initial snapshot immediately so the UI doesn't have to wait 3 s
        try:
            snapshot = await collect_snapshot()
            await websocket.send_json({"type": "metrics", "data": snapshot})
        except Exception as exc:
            logger.debug("Initial WS metrics snapshot failed: {}", exc)

        while True:
            # Non-blocking receive with timeout — lets us detect disconnects promptly
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=_PUSH_INTERVAL)
                # Handle optional ping from client
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                # Time to push a new snapshot
                try:
                    snapshot = await collect_snapshot()
                    await websocket.send_json({"type": "metrics", "data": snapshot})
                except Exception as exc:
                    logger.debug("WS metrics push failed: {}", exc)
            # Any other message type is silently ignored
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("Live metrics WS error: {}", exc)
    finally:
        metrics_manager.disconnect(websocket)
