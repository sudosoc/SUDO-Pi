from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket
from loguru import logger


class ConnectionInfo:
    def __init__(self, websocket: WebSocket, user_id: int | None, username: str | None) -> None:
        self.websocket = websocket
        self.user_id = user_id
        self.username = username
        self.rooms: set[str] = set()


class WebSocketManager:
    def __init__(self) -> None:
        self._connections: dict[str, ConnectionInfo] = {}
        self._rooms: dict[str, set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, connection_id: str, websocket: WebSocket, user_id: int | None = None, username: str | None = None) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[connection_id] = ConnectionInfo(websocket, user_id, username)
        logger.debug("WS connected: {} user={}", connection_id, username)

    async def disconnect(self, connection_id: str) -> None:
        async with self._lock:
            info = self._connections.pop(connection_id, None)
            if info:
                for room in info.rooms:
                    self._rooms[room].discard(connection_id)
        logger.debug("WS disconnected: {}", connection_id)

    async def subscribe(self, connection_id: str, room: str) -> None:
        async with self._lock:
            if connection_id in self._connections:
                self._connections[connection_id].rooms.add(room)
                self._rooms[room].add(connection_id)

    async def unsubscribe(self, connection_id: str, room: str) -> None:
        async with self._lock:
            if connection_id in self._connections:
                self._connections[connection_id].rooms.discard(room)
            self._rooms[room].discard(connection_id)

    async def send_to(self, connection_id: str, message: Any) -> bool:
        info = self._connections.get(connection_id)
        if info is None:
            return False
        try:
            if isinstance(message, (dict, list)):
                await info.websocket.send_json(message)
            else:
                await info.websocket.send_text(str(message))
            return True
        except Exception as exc:
            logger.debug("Failed to send to {}: {}", connection_id, exc)
            await self.disconnect(connection_id)
            return False

    async def broadcast_to_room(self, room: str, message: Any) -> int:
        async with self._lock:
            member_ids = set(self._rooms.get(room, set()))

        tasks = [self.send_to(cid, message) for cid in member_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return sum(1 for r in results if r is True)

    async def broadcast_all(self, message: Any) -> int:
        async with self._lock:
            all_ids = list(self._connections.keys())
        tasks = [self.send_to(cid, message) for cid in all_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return sum(1 for r in results if r is True)

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    def room_count(self, room: str) -> int:
        return len(self._rooms.get(room, set()))


ws_manager = WebSocketManager()
