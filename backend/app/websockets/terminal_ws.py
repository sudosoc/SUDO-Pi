from __future__ import annotations

import asyncio
import os
import struct
import fcntl
import termios
import uuid
from typing import Any

import ptyprocess
from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger

from app.core.config import settings
from app.core.security import verify_access_token, ACCESS_COOKIE_NAME

_ACTIVE_SESSIONS: dict[str, "TerminalSession"] = {}
_MAX_SESSIONS_PER_USER = 8


class TerminalSession:
    def __init__(self, session_id: str, user_id: int, username: str) -> None:
        self.session_id = session_id
        self.user_id = user_id
        self.username = username
        self.proc: ptyprocess.PtyProcess | None = None
        self._running = False

    def start(self, cols: int = 80, rows: int = 24) -> None:
        env = os.environ.copy()
        env.update({
            "TERM": "xterm-256color",
            "COLORTERM": "truecolor",
            "LANG": "en_US.UTF-8",
            "LC_ALL": "en_US.UTF-8",
        })
        self.proc = ptyprocess.PtyProcess.spawn(
            ["sudo", "-i"],
            dimensions=(rows, cols),
            env=env,
        )
        self._running = True
        logger.info("Terminal session {} started for user {} (PID={})", self.session_id, self.username, self.proc.pid)

    def resize(self, cols: int, rows: int) -> None:
        if self.proc and self.proc.isalive():
            self.proc.setwinsize(rows, cols)

    def write(self, data: bytes) -> None:
        if self.proc and self.proc.isalive():
            self.proc.write(data)

    async def read_output(self) -> bytes | None:
        if not self.proc or not self.proc.isalive():
            return None
        try:
            loop = asyncio.get_event_loop()
            data = await loop.run_in_executor(None, self._blocking_read)
            return data
        except EOFError:
            return None

    def _blocking_read(self) -> bytes:
        try:
            return self.proc.read(4096)
        except (EOFError, OSError):
            return b""

    def stop(self) -> None:
        self._running = False
        if self.proc and self.proc.isalive():
            try:
                self.proc.terminate(force=True)
            except Exception:
                pass
        logger.info("Terminal session {} stopped", self.session_id)

    @property
    def is_alive(self) -> bool:
        return self.proc is not None and self.proc.isalive()


async def handle_terminal_websocket(websocket: WebSocket, session_id: str) -> None:
    token = websocket.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        token = websocket.query_params.get("token")

    payload = verify_access_token(token) if token else None
    if payload is None:
        await websocket.close(code=4001)
        return

    user_id = int(payload.get("sub", 0))
    username = payload.get("username", "unknown")
    role = payload.get("role", "viewer")

    if role not in ("admin", "operator"):
        await websocket.close(code=4003)
        return

    user_sessions = [s for s in _ACTIVE_SESSIONS.values() if s.user_id == user_id]
    if len(user_sessions) >= _MAX_SESSIONS_PER_USER:
        await websocket.close(code=4029)
        return

    await websocket.accept()

    session = TerminalSession(session_id, user_id, username)
    _ACTIVE_SESSIONS[session_id] = session

    try:
        session.start()
        output_task = asyncio.create_task(_stream_output(websocket, session))

        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=settings.WS_HEARTBEAT_TIMEOUT)
            except asyncio.TimeoutError:
                if not session.is_alive:
                    break
                await websocket.send_json({"type": "ping"})
                continue

            msg_type = msg.get("type")

            if msg_type == "input":
                data_str = msg.get("data", "")
                session.write(data_str.encode("utf-8", errors="replace"))

            elif msg_type == "resize":
                cols = int(msg.get("cols", 80))
                rows = int(msg.get("rows", 24))
                session.resize(cols, rows)

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "kill":
                break

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("Terminal WS error for session {}: {}", session_id, exc)
    finally:
        output_task.cancel()
        session.stop()
        _ACTIVE_SESSIONS.pop(session_id, None)


async def _stream_output(websocket: WebSocket, session: TerminalSession) -> None:
    while session.is_alive:
        data = await session.read_output()
        if data is None or data == b"":
            if not session.is_alive:
                break
            await asyncio.sleep(0.01)
            continue
        try:
            await websocket.send_json({
                "type": "output",
                "data": data.decode("utf-8", errors="replace"),
            })
        except Exception:
            break
    try:
        await websocket.send_json({"type": "exit"})
    except Exception:
        pass


def get_active_sessions() -> list[dict]:
    return [
        {
            "session_id": s.session_id,
            "user_id": s.user_id,
            "username": s.username,
            "is_alive": s.is_alive,
        }
        for s in _ACTIVE_SESSIONS.values()
    ]


def kill_session(session_id: str) -> bool:
    session = _ACTIVE_SESSIONS.get(session_id)
    if session:
        session.stop()
        _ACTIVE_SESSIONS.pop(session_id, None)
        return True
    return False
