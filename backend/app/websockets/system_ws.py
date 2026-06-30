from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger

from app.core.config import settings
from app.core.security import verify_access_token, ACCESS_COOKIE_NAME
from app.services.system_service import get_full_system_stats
from app.websockets.manager import ws_manager

ROOM_SYSTEM = "system_metrics"
ROOM_NOTIFICATIONS = "notifications"


async def _broadcast_system_metrics_loop() -> None:
    logger.info("System metrics broadcast loop started (interval={}s)", settings.SYSTEM_METRICS_INTERVAL)
    while True:
        try:
            if ws_manager.room_count(ROOM_SYSTEM) > 0:
                stats = await get_full_system_stats()
                await ws_manager.broadcast_to_room(
                    ROOM_SYSTEM,
                    {"type": "system_metrics", "data": stats.model_dump()},
                )
        except Exception as exc:
            logger.error("System metrics broadcast error: {}", exc)
        await asyncio.sleep(settings.SYSTEM_METRICS_INTERVAL)


async def start_metrics_broadcaster() -> None:
    asyncio.create_task(_broadcast_system_metrics_loop())


async def handle_system_websocket(websocket: WebSocket) -> None:
    token = websocket.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        token = websocket.query_params.get("token")

    payload = verify_access_token(token) if token else None
    if payload is None:
        await websocket.close(code=4001)
        return

    conn_id = str(uuid.uuid4())
    user_id = int(payload.get("sub", 0))
    username = payload.get("username", "unknown")

    await ws_manager.connect(conn_id, websocket, user_id=user_id, username=username)
    await ws_manager.subscribe(conn_id, ROOM_SYSTEM)

    try:
        stats = await get_full_system_stats()
        await ws_manager.send_to(conn_id, {"type": "system_metrics", "data": stats.model_dump()})

        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=settings.WS_HEARTBEAT_TIMEOUT)
                data = json.loads(msg)
                if data.get("type") == "ping":
                    await ws_manager.send_to(conn_id, {"type": "pong"})
                elif data.get("type") == "subscribe":
                    room = data.get("room")
                    if room in (ROOM_SYSTEM, ROOM_NOTIFICATIONS):
                        await ws_manager.subscribe(conn_id, room)
                elif data.get("type") == "unsubscribe":
                    room = data.get("room")
                    await ws_manager.unsubscribe(conn_id, room)
            except asyncio.TimeoutError:
                await ws_manager.send_to(conn_id, {"type": "ping"})
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("System WS error for {}: {}", conn_id, exc)
    finally:
        await ws_manager.disconnect(conn_id)


async def broadcast_notification(
    title: str,
    message: str,
    level: str = "info",
    resource: str | None = None,
) -> None:
    await ws_manager.broadcast_to_room(
        ROOM_NOTIFICATIONS,
        {
            "type": "notification",
            "data": {
                "title": title,
                "message": message,
                "level": level,
                "resource": resource,
            },
        },
    )
