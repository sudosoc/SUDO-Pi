from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.dependencies import ActiveUser
from app.services import diagnostics_service

router = APIRouter(prefix="/diagnostics", tags=["Diagnostics"])


@router.get("")
async def get_diagnostics(_: ActiveUser) -> dict:
    """Run a full system self-check: services, privileges, tooling, storage."""
    try:
        return await diagnostics_service.run_diagnostics()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Diagnostics failed: {exc}") from exc
