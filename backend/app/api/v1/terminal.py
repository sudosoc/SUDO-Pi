from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, WebSocket
from pydantic import BaseModel, Field

from app.core.dependencies import ActiveUser, CsrfVerified, OperatorUser
from app.websockets.terminal_ws import get_active_sessions, handle_terminal_websocket, kill_session

router = APIRouter(prefix="/terminal", tags=["Terminal"])

_EXECUTE_TIMEOUT = 30.0
_MAX_OUTPUT_BYTES = 100_000


class ExecuteRequest(BaseModel):
    command: str = Field(..., min_length=1, max_length=2000)


@router.post("/execute", dependencies=[CsrfVerified])
async def execute_command(body: ExecuteRequest, _: OperatorUser) -> dict:
    """Run a one-shot shell command for the quick-terminal drawer.

    Same privilege level as the interactive terminal (operator+), but capped
    at 30 s and 100 KB of output since there is no PTY to interrupt from.
    """
    proc = await asyncio.create_subprocess_shell(
        body.command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        raw, _err = await asyncio.wait_for(proc.communicate(), timeout=_EXECUTE_TIMEOUT)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return {"output": f"Command timed out after {_EXECUTE_TIMEOUT:.0f}s", "exit_code": 124}

    output = raw[:_MAX_OUTPUT_BYTES].decode("utf-8", errors="replace")
    if len(raw) > _MAX_OUTPUT_BYTES:
        output += "\n… output truncated …"
    return {"output": output, "exit_code": proc.returncode or 0}


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
