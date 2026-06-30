from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class FileEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    size_bytes: int
    modified_at: float
    permissions: str
    owner: str
    group: str
    is_symlink: bool
    symlink_target: str | None


class DirectoryListing(BaseModel):
    path: str
    parent: str | None
    entries: list[FileEntry]
    total: int


class FileRenameRequest(BaseModel):
    path: str
    new_name: str = Field(..., min_length=1, max_length=255)


class FileMoveRequest(BaseModel):
    source: str
    destination: str


class FileCopyRequest(BaseModel):
    source: str
    destination: str


class MkdirRequest(BaseModel):
    path: str
    name: str = Field(..., min_length=1, max_length=255)


class CompressRequest(BaseModel):
    paths: list[str]
    destination: str
    format: str = Field("tar.gz", pattern=r"^(tar\.gz|tar\.bz2|zip)$")


class ExtractRequest(BaseModel):
    path: str
    destination: str


class FilePermissionsRequest(BaseModel):
    path: str
    mode: str = Field(..., pattern=r"^[0-7]{3,4}$")
    recursive: bool = False


class FileContentResponse(BaseModel):
    path: str
    content: str
    encoding: str
    size_bytes: int
    is_binary: bool


class FileWriteRequest(BaseModel):
    path: str
    content: str
    encoding: str = "utf-8"
