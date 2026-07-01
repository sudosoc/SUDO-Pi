from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.core.dependencies import AdminUser, CsrfVerified
from app.services import cron_service

router = APIRouter(prefix="/cron", tags=["cron"])


class CronJobRequest(BaseModel):
    minute: str
    hour: str
    dom: str
    month: str
    dow: str
    user: str = "root"
    command: str
    comment: str = ""

    @field_validator("minute", "hour", "dom", "month", "dow")
    @classmethod
    def validate_field(cls, v: str) -> str:
        import re
        v = v.strip()
        if not v or not re.match(r"^[\d\*/,\-]+$", v):
            raise ValueError(f"Invalid cron field: {v!r}")
        return v

    @field_validator("command")
    @classmethod
    def validate_command(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Command must not be empty")
        return v

    @field_validator("user")
    @classmethod
    def validate_user(cls, v: str) -> str:
        import re
        v = v.strip()
        if not re.match(r"^[a-z_][a-z0-9_\-]{0,31}$", v):
            raise ValueError("Invalid username")
        return v


@router.get("/jobs")
async def list_jobs(_: AdminUser = None):
    return await cron_service.list_jobs()


@router.post("/jobs", dependencies=[CsrfVerified])
async def add_job(body: CronJobRequest, _: AdminUser = None):
    if not cron_service.validate_cron_schedule(
        body.minute, body.hour, body.dom, body.month, body.dow
    ):
        raise HTTPException(400, "Invalid cron schedule")
    try:
        return await cron_service.add_job(
            minute=body.minute,
            hour=body.hour,
            dom=body.dom,
            month=body.month,
            dow=body.dow,
            user=body.user,
            command=body.command,
            comment=body.comment,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.put("/jobs/{job_id:path}", dependencies=[CsrfVerified])
async def update_job(job_id: str, body: CronJobRequest, _: AdminUser = None):
    if not cron_service.validate_cron_schedule(
        body.minute, body.hour, body.dom, body.month, body.dow
    ):
        raise HTTPException(400, "Invalid cron schedule")
    result = await cron_service.update_job(
        job_id=job_id,
        minute=body.minute,
        hour=body.hour,
        dom=body.dom,
        month=body.month,
        dow=body.dow,
        user=body.user,
        command=body.command,
        comment=body.comment,
    )
    if result is None:
        raise HTTPException(404, "Job not found or not editable")
    return result


@router.delete("/jobs/{job_id:path}", dependencies=[CsrfVerified])
async def delete_job(job_id: str, _: AdminUser = None):
    ok = await cron_service.delete_job(job_id)
    if not ok:
        raise HTTPException(404, "Job not found or not deletable")
    return {"ok": True}


@router.post("/jobs/{job_id:path}/toggle", dependencies=[CsrfVerified])
async def toggle_job(job_id: str, _: AdminUser = None):
    new_state = await cron_service.toggle_job(job_id)
    if new_state is None:
        raise HTTPException(404, "Job not found or not editable")
    return {"enabled": new_state}


@router.post("/jobs/{job_id:path}/run", dependencies=[CsrfVerified])
async def run_job(job_id: str, _: AdminUser = None):
    # Find the job to get command + user
    jobs = await cron_service.list_jobs()
    job = next((j for j in jobs if j["id"] == job_id), None)
    if job is None:
        raise HTTPException(404, "Job not found")
    rc, stdout, stderr = await cron_service.run_job_now(job["command"], job["user"])
    return {
        "returncode": rc,
        "stdout": stdout,
        "stderr": stderr,
        "success": rc == 0,
    }
