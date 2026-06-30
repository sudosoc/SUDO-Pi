from __future__ import annotations

import io
import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from loguru import logger

from app.core.config import settings
from app.core.dependencies import ActiveUser, CsrfVerified, DBSession, OperatorUser
from app.schemas.files import (
    CompressRequest,
    DirectoryListing,
    ExtractRequest,
    FileCopyRequest,
    FileContentResponse,
    FileMoveRequest,
    FilePermissionsRequest,
    FileRenameRequest,
    FileWriteRequest,
    MkdirRequest,
)
from app.services import file_service
from app.services.audit_service import AuditService

router = APIRouter(prefix="/files", tags=["File Manager"])

_MAX_UPLOAD_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


@router.get("/list", response_model=DirectoryListing)
async def list_directory(
    _: ActiveUser,
    path: str = Query("/home"),
) -> DirectoryListing:
    try:
        return await file_service.list_directory(path)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except (FileNotFoundError, NotADirectoryError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/content", response_model=FileContentResponse)
async def read_file(
    _: ActiveUser,
    path: str = Query(...),
) -> FileContentResponse:
    try:
        content, is_binary = await file_service.read_file(path)
        size = Path(path).stat().st_size
        return FileContentResponse(
            path=path,
            content=content,
            encoding="hex" if is_binary else "utf-8",
            size_bytes=size,
            is_binary=is_binary,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except (FileNotFoundError, IsADirectoryError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.put("/content", dependencies=[CsrfVerified])
async def write_file(
    body: FileWriteRequest,
    current_user: OperatorUser,
    db: DBSession,
) -> dict:
    audit = AuditService(db)
    try:
        await file_service.write_file(body.path, body.content, body.encoding)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    await audit.log("file.write", user=current_user, resource=body.path, status_code=200)
    return {"detail": "File saved"}


@router.get("/download")
async def download_file(
    _: ActiveUser,
    path: str = Query(...),
) -> FileResponse:
    p = Path(path).resolve()
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    try:
        await file_service.list_directory(str(p.parent))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return FileResponse(str(p), filename=p.name, media_type="application/octet-stream")


@router.post("/upload", dependencies=[CsrfVerified])
async def upload_file(
    request: Request,
    current_user: OperatorUser,
    db: DBSession,
    destination: str = Query("/tmp"),
    file: UploadFile = ...,
) -> dict:
    if file.size and file.size > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit")

    dest_path = (Path(destination) / (file.filename or "upload")).resolve()
    try:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(dest_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                await f.write(chunk)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    audit = AuditService(db)
    await audit.log("file.upload", user=current_user, resource=str(dest_path), status_code=200)
    return {"detail": "Uploaded", "path": str(dest_path)}


@router.delete("/delete", dependencies=[CsrfVerified])
async def delete_path(
    path: str = Query(...),
    current_user: OperatorUser = ...,
    db: DBSession = ...,
) -> dict:
    audit = AuditService(db)
    try:
        await file_service.delete_path(path)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    await audit.log("file.delete", user=current_user, resource=path, status_code=200)
    return {"detail": "Deleted"}


@router.post("/rename", dependencies=[CsrfVerified])
async def rename_path(body: FileRenameRequest, current_user: OperatorUser, db: DBSession) -> dict:
    audit = AuditService(db)
    try:
        new_path = await file_service.rename_path(body.path, body.new_name)
    except (PermissionError, FileNotFoundError, OSError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await audit.log("file.rename", user=current_user, resource=body.path, status_code=200)
    return {"detail": "Renamed", "path": new_path}


@router.post("/move", dependencies=[CsrfVerified])
async def move_path(body: FileMoveRequest, current_user: OperatorUser, db: DBSession) -> dict:
    audit = AuditService(db)
    try:
        new_path = await file_service.move_path(body.source, body.destination)
    except (PermissionError, FileNotFoundError, OSError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await audit.log("file.move", user=current_user, resource=body.source, status_code=200)
    return {"detail": "Moved", "path": new_path}


@router.post("/copy", dependencies=[CsrfVerified])
async def copy_path(body: FileCopyRequest, current_user: OperatorUser, db: DBSession) -> dict:
    audit = AuditService(db)
    try:
        new_path = await file_service.copy_path(body.source, body.destination)
    except (PermissionError, FileNotFoundError, OSError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await audit.log("file.copy", user=current_user, resource=body.source, status_code=200)
    return {"detail": "Copied", "path": new_path}


@router.post("/mkdir", dependencies=[CsrfVerified])
async def make_directory(body: MkdirRequest, current_user: OperatorUser, db: DBSession) -> dict:
    audit = AuditService(db)
    try:
        new_path = await file_service.make_directory(body.path, body.name)
    except (PermissionError, OSError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await audit.log("file.mkdir", user=current_user, resource=new_path, status_code=200)
    return {"detail": "Directory created", "path": new_path}


@router.post("/compress", dependencies=[CsrfVerified])
async def compress(body: CompressRequest, current_user: OperatorUser, db: DBSession) -> dict:
    audit = AuditService(db)
    try:
        result = await file_service.compress_paths(body.paths, body.destination, body.format)
    except (PermissionError, OSError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await audit.log("file.compress", user=current_user, resource=body.destination, status_code=200)
    return {"detail": "Compressed", "path": result}


@router.post("/extract", dependencies=[CsrfVerified])
async def extract(body: ExtractRequest, current_user: OperatorUser, db: DBSession) -> dict:
    audit = AuditService(db)
    try:
        result = await file_service.extract_archive(body.path, body.destination)
    except (PermissionError, OSError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await audit.log("file.extract", user=current_user, resource=body.path, status_code=200)
    return {"detail": "Extracted", "path": result}


@router.post("/chmod", dependencies=[CsrfVerified])
async def set_permissions(body: FilePermissionsRequest, current_user: OperatorUser, db: DBSession) -> dict:
    audit = AuditService(db)
    try:
        await file_service.set_permissions(body.path, body.mode, body.recursive)
    except (PermissionError, OSError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await audit.log("file.chmod", user=current_user, resource=body.path, status_code=200)
    return {"detail": "Permissions updated"}
