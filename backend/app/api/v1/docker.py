from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.core.dependencies import ActiveUser, AdminUser, OperatorUser, CsrfVerified
from app.core.security import verify_access_token, ACCESS_COOKIE_NAME
from app.services import docker_service, docker_resource_service

router = APIRouter(prefix="/docker", tags=["docker"])


class ResourceUpdate(BaseModel):
    cpu_cores: float = 0.0
    memory_mb: int = 0


@router.get("/containers")
async def list_containers(all: bool = True, _: ActiveUser = None):
    try:
        return await docker_service.list_containers(all_containers=all)
    except RuntimeError as exc:
        raise HTTPException(503, f"Docker unavailable: {exc}")


@router.post("/containers/{container_id}/{action}", dependencies=[CsrfVerified])
async def container_action(container_id: str, action: str, _: OperatorUser = None):
    allowed = {"start", "stop", "restart", "pause", "unpause"}
    if action not in allowed:
        raise HTTPException(400, f"Action must be one of: {', '.join(allowed)}")
    try:
        return await docker_service.container_action(container_id, action)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.delete("/containers/{container_id}", dependencies=[CsrfVerified])
async def remove_container(container_id: str, force: bool = False, _: AdminUser = None):
    try:
        return await docker_service.remove_container(container_id, force=force)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.get("/containers/{container_id}/resources")
async def get_container_resources(container_id: str, _: ActiveUser = None):
    try:
        return await docker_resource_service.get_container_resources(container_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.post("/containers/{container_id}/resources", dependencies=[CsrfVerified])
async def set_container_resources(
    container_id: str,
    body: ResourceUpdate,
    _: AdminUser = None,
):
    try:
        return await docker_resource_service.set_container_resources(
            container_id,
            cpu_cores=body.cpu_cores,
            memory_mb=body.memory_mb,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.get("/images")
async def list_images(_: ActiveUser = None):
    try:
        return await docker_service.list_images()
    except RuntimeError as exc:
        raise HTTPException(503, f"Docker unavailable: {exc}")


@router.delete("/images/{image_id}", dependencies=[CsrfVerified])
async def remove_image(image_id: str, force: bool = False, _: AdminUser = None):
    try:
        return await docker_service.remove_image(image_id, force=force)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.websocket("/containers/{container_id}/logs/stream")
async def stream_container_logs(
    websocket: WebSocket,
    container_id: str,
) -> None:
    # Authenticate via cookie or query param
    token = websocket.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        token = websocket.query_params.get("token")

    payload = verify_access_token(token) if token else None
    if payload is None:
        await websocket.close(code=4001)
        return

    role = payload.get("role", "viewer")
    if role not in ("admin", "operator", "viewer"):
        await websocket.close(code=4003)
        return

    await websocket.accept()

    proc: asyncio.subprocess.Process | None = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "logs", "-f", "--tail", "50",
            "--timestamps", container_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        async def _stream_pipe(pipe: asyncio.StreamReader, stream_name: str) -> None:
            while True:
                try:
                    line_bytes = await asyncio.wait_for(pipe.readline(), timeout=30.0)
                except asyncio.TimeoutError:
                    try:
                        await websocket.send_json({"type": "ping"})
                    except Exception:
                        return
                    continue

                if not line_bytes:
                    break

                line = line_bytes.decode("utf-8", errors="replace").rstrip("\n")
                ts = datetime.now(timezone.utc).isoformat()

                # docker logs --timestamps prefixes each line with a timestamp
                # Format: "2024-01-01T00:00:00.000000000Z actual content"
                parts = line.split(" ", 1)
                if len(parts) == 2 and "T" in parts[0] and "Z" in parts[0]:
                    ts = parts[0]
                    line = parts[1]

                try:
                    await websocket.send_json({
                        "type": "log",
                        "line": line,
                        "stream": stream_name,
                        "ts": ts,
                    })
                except Exception:
                    return

        stdout_task = asyncio.create_task(_stream_pipe(proc.stdout, "stdout"))
        stderr_task = asyncio.create_task(_stream_pipe(proc.stderr, "stderr"))

        # Listen for client disconnect
        async def _wait_for_close() -> None:
            try:
                while True:
                    msg = await websocket.receive_text()
                    if msg == "stop":
                        break
            except (WebSocketDisconnect, Exception):
                pass

        close_task = asyncio.create_task(_wait_for_close())

        done, pending = await asyncio.wait(
            [stdout_task, stderr_task, close_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.send_json({"type": "error", "message": f"Container {container_id!r} not found or Docker unavailable"})
        except Exception:
            pass
    finally:
        if proc and proc.returncode is None:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
