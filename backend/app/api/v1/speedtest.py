from fastapi import APIRouter, HTTPException

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import speedtest_service

router = APIRouter(prefix="/speedtest", tags=["Speed Test"])


@router.get("/history")
async def get_history(_: ActiveUser) -> list[dict]:
    return speedtest_service.get_history()


@router.post("/run", dependencies=[CsrfVerified])
async def run_speedtest(_: AdminUser) -> dict:
    try:
        result = await speedtest_service.run_speedtest()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return result
