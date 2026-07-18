import hmac
from datetime import datetime

from fastapi import Header, HTTPException

from backend.config import ADMIN_API_KEY
from backend.db import bonus_db


def require_admin(x_admin_key: str = Header(alias="x-admin-key", default="")) -> None:
    if not ADMIN_API_KEY:
        raise HTTPException(status_code=500, detail="ADMIN_API_KEY is not configured on the server")
    if not hmac.compare_digest(x_admin_key, ADMIN_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid admin key")


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
    if x_admin_key and ADMIN_API_KEY and hmac.compare_digest(x_admin_key, ADMIN_API_KEY):
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

