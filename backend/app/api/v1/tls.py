from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, EmailStr

from app.core.dependencies import ActiveUser, AdminUser, CsrfVerified
from app.services import tls_service

router = APIRouter(prefix="/tls", tags=["TLS Certificate"])


class GenerateSelfSignedBody(BaseModel):
    days: int = Field(365, ge=1, le=3650)
    cn: str = Field("sudo-pi.local", max_length=255)
    san_hosts: list[str] = Field(default_factory=list, max_length=20)


class UploadCertBody(BaseModel):
    cert_pem: str = Field(..., description="PEM-encoded certificate")
    key_pem: str = Field(..., description="PEM-encoded private key")


class LetsEncryptBody(BaseModel):
    domain: str = Field(..., max_length=253)
    email: str = Field(..., max_length=320)


@router.get("/info")
async def get_cert_info(_: ActiveUser) -> dict:
    """Return metadata about the current TLS certificate."""
    return await tls_service.get_cert_info()


@router.post("/generate-self-signed", dependencies=[CsrfVerified])
async def generate_self_signed(body: GenerateSelfSignedBody, _: AdminUser) -> dict:
    """Generate a new self-signed certificate and reload nginx."""
    try:
        return await tls_service.generate_self_signed(
            days=body.days,
            cn=body.cn,
            san_hosts=body.san_hosts or None,
        )
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.post("/upload", dependencies=[CsrfVerified])
async def upload_cert(body: UploadCertBody, _: AdminUser) -> dict:
    """Replace the TLS certificate with a PEM-encoded cert+key pair."""
    try:
        return await tls_service.upload_cert(body.cert_pem, body.key_pem)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.get("/certbot")
async def check_certbot(_: AdminUser) -> dict:
    """Check if certbot is installed and return its version."""
    return await tls_service.check_certbot()


@router.post("/letsencrypt", dependencies=[CsrfVerified])
async def request_letsencrypt(body: LetsEncryptBody, _: AdminUser) -> dict:
    """Obtain a Let's Encrypt certificate for the given domain."""
    try:
        return await tls_service.request_letsencrypt(body.domain, body.email)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
