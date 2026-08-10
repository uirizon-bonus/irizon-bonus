import hmac

from fastapi import APIRouter, HTTPException

from backend.config import ADMIN_API_KEY, ADMIN_PASSWORD, ADMIN_USERNAME
from backend.models.schemas import AdminLoginPayload


router = APIRouter(tags=["admin_auth"])


@router.post("/api/admin/login")
def admin_login(payload: AdminLoginPayload):
    if not ADMIN_USERNAME or not ADMIN_PASSWORD or not ADMIN_API_KEY:
        raise HTTPException(status_code=500, detail="Admin login is not configured on the server")
    # Compare both fields (constant-time) before combining so failure timing
    # does not reveal which field was wrong.
    username_ok = hmac.compare_digest(payload.username.strip(), ADMIN_USERNAME)
    password_ok = hmac.compare_digest(payload.password, ADMIN_PASSWORD)
    if not (username_ok and password_ok):
        raise HTTPException(status_code=401, detail="Login yoki parol noto‘g‘ri")
    return {"token": ADMIN_API_KEY}
