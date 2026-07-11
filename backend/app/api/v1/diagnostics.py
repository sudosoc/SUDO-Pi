from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

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


@router.get("/export")
async def export_diagnostics(
    _: ActiveUser,
    fmt: str = Query("json", regex="^(json|text)$"),
) -> Response:
    """Download a full system diagnostic report as a file."""
    try:
        report = await diagnostics_service.export_report()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Export failed: {exc}") from exc

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    if fmt == "text":
        # Flatten nested dicts to readable text
        lines: list[str] = [
            "=" * 70,
            "  SUDO-Pi Diagnostic Report",
            f"  Generated: {report['generated_at']}",
            "=" * 70,
        ]
        for section, value in report.items():
            if section == "generated_at":
                continue
            lines.append(f"\n{'─' * 70}")
            lines.append(f"  {section.upper().replace('_', ' ')}")
            lines.append("─" * 70)
            if isinstance(value, dict):
                for k, v in value.items():
                    if isinstance(v, (dict, list)):
                        lines.append(f"  {k}:")
                        lines.append(f"    {json.dumps(v, indent=2)}")
                    else:
                        lines.append(f"  {k}: {v}")
            elif isinstance(value, list):
                for item in value:
                    lines.append(f"  - {item}")
            else:
                lines.append(f"  {value}")

        content = "\n".join(lines).encode()
        return Response(
            content=content,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="sudo-pi-report-{timestamp}.txt"'},
        )

    # JSON default
    content = json.dumps(report, indent=2, default=str).encode()
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="sudo-pi-report-{timestamp}.json"'},
    )
