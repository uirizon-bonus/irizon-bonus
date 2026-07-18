import secrets
from datetime import datetime, timedelta

from fastapi.responses import JSONResponse

from backend.config import SESSION_TTL_MINUTES
from backend.core import customers as customer_core
from backend.db import bonus_db
from backend.models.schemas import AuthRequestOtpPayload, AuthVerifyOtpPayload


def request_auth_otp_payload(payload: AuthRequestOtpPayload):
    try:
        otp_payload = customer_core._create_otp(payload.phone)
    except ValueError as exc:
        status_code = 404 if "not found" in str(exc).lower() else 400
        return JSONResponse({"error": str(exc)}, status_code=status_code)
    return {"message": "OTP sent", **otp_payload}


def verify_auth_otp_payload(payload: AuthVerifyOtpPayload):
    try:
        customer = customer_core._verify_otp(payload.phone, payload.otp)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)

    session_token = secrets.token_urlsafe(32)
    expires_at = (
        "9999-12-31T23:59:59Z"
        if SESSION_TTL_MINUTES == 0
        else (datetime.utcnow() + timedelta(minutes=SESSION_TTL_MINUTES)).isoformat() + "Z"
    )
    connection = bonus_db()
    try:
        connection.execute(
            "INSERT INTO customer_sessions (token, client_id, expires_at) VALUES (?, ?, ?)",
            (session_token, str(customer["id"]), expires_at),
        )
        connection.commit()
    finally:
        connection.close()
    return {"message": "OTP verified", "customer": customer, "sessionToken": session_token}


def otp_config_debug_payload():
    return customer_core._otp_config_debug()
