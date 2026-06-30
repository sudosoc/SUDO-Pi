from __future__ import annotations

import uuid

from fastapi import APIRouter, WebSocket

from app.core.dependencies import ActiveUser, OperatorUser
from app.websockets.terminal_ws import get_active_sessions, handle_terminal_websocket, kill_session

router = APIRouter(prefix="/terminal", tags=["Terminal"])


@router.get("/sessions")
async def list_sessions(_: OperatorUser) -> list[dict]:
    return get_active_sessions()


@router.delete("/sessions/{session_id}")
async def terminate_session(session_id: str, _: OperatorUser) -> dict:
    killed = kill_session(session_id)
    return {"killed": killed}


@router.websocket("/ws/{session_id}")
async def terminal_ws(websocket: WebSocket, session_id: str) -> None:
    await handle_terminal_websocket(websocket, session_id)


@router.websocket("/ws")
async def terminal_ws_new(websocket: WebSocket) -> None:
    session_id = str(uuid.uuid4())
    await handle_terminal_websocket(websocket, session_id)
