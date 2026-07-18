from fastapi import APIRouter, Depends

from backend import deps
from backend.models.schemas import AuthRequestOtpPayload, AuthVerifyOtpPayload
from backend.services import auth as auth_service


router = APIRouter(tags=["auth"])


@router.post("/api/auth/request-otp")
def request_auth_otp(payload: AuthRequestOtpPayload):
    return auth_service.request_auth_otp_payload(payload)


@router.post("/api/auth/verify-otp")
def verify_auth_otp(payload: AuthVerifyOtpPayload):
    return auth_service.verify_auth_otp_payload(payload)


@router.get("/api/debug/otp-config", dependencies=[Depends(deps.require_admin)])
def debug_otp_config():
    return auth_service.otp_config_debug_payload()
