import hmac
from datetime import datetime

from fastapi import Header, HTTPException

from backend.config import ADMIN_API_KEY, ADMIN_USERNAME
from backend.core import admin_users
from backend.db import bonus_db


async def require_admin(x_admin_key: str = Header(alias="x-admin-key", default="")) -> str:
    """Authenticate an admin request and return who is making it.

    Two kinds of value arrive in this header: a per-user session token issued by
    /api/admin/login, and the legacy shared ADMIN_API_KEY. The shared key is kept
    working so scripts and any still-open tab do not break, but it cannot name a
    person — it is attributed to the configured ADMIN_USERNAME.

    Declared async on purpose: FastAPI runs sync dependencies in a worker thread,
    and a ContextVar set there would not be visible to the endpoint. Running in
    the request's own task means the actor set here reaches the service layer.
    """
    actor = admin_users.resolve_session(x_admin_key)
    if actor is None:
        if not ADMIN_API_KEY or not hmac.compare_digest(x_admin_key, ADMIN_API_KEY):
            raise HTTPException(status_code=401, detail="Invalid admin key")
        actor = ADMIN_USERNAME or "Admin"
    admin_users.set_current_actor(actor)
    return actor


def require_customer(authorization: str = Header(default="")) -> str:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing session token")
    connection = bonus_db()
    try:
        row = connection.execute(
            "SELECT client_id, expires_at FROM customer_sessions WHERE token = ?",
            (token,),
        ).fetchone()
    finally:
        connection.close()
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    expires_raw = str(row["expires_at"] or "")
    try:
        expires_at = datetime.fromisoformat(expires_raw.replace("Z", "+00:00"))
        now_time = datetime.now(expires_at.tzinfo) if expires_at.tzinfo else datetime.utcnow()
        if now_time > expires_at:
            raise HTTPException(status_code=401, detail="Session token expired")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid session token")
    return str(row["client_id"])


def require_admin_or_customer(
    authorization: str = Header(default=""),
    x_admin_key: str = Header(alias="x-admin-key", default=""),
) -> None:
    if x_admin_key:
        actor = admin_users.resolve_session(x_admin_key)
        if actor is not None:
            admin_users.set_current_actor(actor)
            return
        if ADMIN_API_KEY and hmac.compare_digest(x_admin_key, ADMIN_API_KEY):
            admin_users.set_current_actor(ADMIN_USERNAME or "Admin")
            return
    token = authorization.removeprefix("Bearer ").strip()
    if token:
        connection = bonus_db()
        try:
            row = connection.execute(
                "SELECT client_id, expires_at FROM customer_sessions WHERE token = ?",
                (token,),
            ).fetchone()
        finally:
            connection.close()
        if row is not None:
            expires_raw = str(row["expires_at"] or "")
            try:
                expires_at = datetime.fromisoformat(expires_raw.replace("Z", "+00:00"))
                now_time = datetime.now(expires_at.tzinfo) if expires_at.tzinfo else datetime.utcnow()
                if now_time <= expires_at:
                    return
            except ValueError:
                pass
    raise HTTPException(status_code=401, detail="Authentication required")

