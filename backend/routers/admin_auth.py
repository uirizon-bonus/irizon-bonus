import hmac
import time
from collections import defaultdict
from threading import Lock
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.config import ADMIN_API_KEY, ADMIN_PASSWORD, ADMIN_USERNAME
from backend import deps
from backend.core import admin_users
from backend.models.schemas import AdminLoginPayload


router = APIRouter(tags=["admin_auth"])

# --- Simple in-memory brute-force throttle (per client IP) -------------------
# Single-process service, so a plain dict is enough. Failures within the window
# accumulate; past the cap the IP is blocked until the oldest failure ages out.
_FAIL_WINDOW_SEC = 15 * 60
_MAX_FAILS = 8
_failures: Dict[str, List[float]] = defaultdict(list)
_failures_lock = Lock()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _recent_failures(ip: str, now: float) -> int:
    with _failures_lock:
        recent = [ts for ts in _failures.get(ip, []) if now - ts < _FAIL_WINDOW_SEC]
        if recent:
            _failures[ip] = recent
        else:
            _failures.pop(ip, None)
        # Opportunistic global prune so rotating-IP attempts can't grow the map.
        if len(_failures) > 5000:
            for key in [k for k, v in _failures.items() if not v or now - max(v) >= _FAIL_WINDOW_SEC]:
                _failures.pop(key, None)
        return len(recent)


def _record_failure(ip: str, now: float) -> None:
    with _failures_lock:
        _failures[ip].append(now)


def _clear_failures(ip: str) -> None:
    with _failures_lock:
        _failures.pop(ip, None)


@router.post("/api/admin/login")
def admin_login(payload: AdminLoginPayload, request: Request):
    ip = _client_ip(request)
    now = time.time()
    if _recent_failures(ip, now) >= _MAX_FAILS:
        raise HTTPException(status_code=429, detail="Juda ko‘p urinish. 15 daqiqadan so‘ng qayta urinib ko‘ring.")

    # Real accounts first; each gets its own session token so the audit trail can
    # name the person behind every change.
    account = admin_users.authenticate(payload.username, payload.password)
    if account is not None:
        _clear_failures(ip)
        token = admin_users.create_session(account["username"], ip)
        return {"token": token, "username": account["username"], "fullName": account["fullName"]}

    # Fallback to the single env-configured admin, so the panel keeps working on
    # a deployment where no accounts have been created yet.
    if ADMIN_USERNAME and ADMIN_PASSWORD and ADMIN_API_KEY:
        # Compare both fields (constant-time) before combining so failure timing
        # does not reveal which field was wrong.
        username_ok = hmac.compare_digest(payload.username.strip(), ADMIN_USERNAME)
        password_ok = hmac.compare_digest(payload.password, ADMIN_PASSWORD)
        if username_ok and password_ok:
            _clear_failures(ip)
            admin_users.ensure_env_admin(ADMIN_USERNAME, ADMIN_PASSWORD)
            token = admin_users.create_session(ADMIN_USERNAME.strip().lower(), ip)
            return {"token": token, "username": ADMIN_USERNAME, "fullName": ADMIN_USERNAME}

    _record_failure(ip, now)
    raise HTTPException(status_code=401, detail="Login yoki parol noto‘g‘ri")


@router.get("/api/admin/me")
def admin_me(actor: str = Depends(deps.require_admin)):
    return {"username": actor}


@router.get("/api/admin/users", dependencies=[Depends(deps.require_admin)])
def admin_users_list():
    return {"users": admin_users.list_users()}
