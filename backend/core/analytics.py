from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from backend.config import (
    SEGMENT_ACTIVE_DAYS,
    SEGMENT_ATRISK_DAYS,
    SEGMENT_CHAMPION_MIN_EVENTS,
    SEGMENT_NEW_DAYS,
    TIER_GOLD_MIN,
    TIER_PREMIUM_MIN,
)
from backend.db import bonus_db


def _parse_dt(value: Any) -> Optional[datetime]:
    """Accept the created_at values as they come back from either backend:
    datetime objects (Postgres via psycopg) or ISO-ish strings (SQLite)."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip().replace("T", " ")
    if not text:
        return None
    # Trim fractional seconds / timezone to a form fromisoformat handles.
    for candidate in (text, text.split(".")[0], text.split("+")[0].strip()):
        try:
            return datetime.fromisoformat(candidate)
        except ValueError:
            continue
    return None


def _max_dt(*values: Optional[datetime]) -> Optional[datetime]:
    present = [v for v in values if v is not None]
    return max(present) if present else None


def _min_dt(*values: Optional[datetime]) -> Optional[datetime]:
    present = [v for v in values if v is not None]
    return min(present) if present else None


def _tier_for(points_balance: int) -> str:
    if points_balance >= TIER_PREMIUM_MIN:
        return "Premium"
    if points_balance >= TIER_GOLD_MIN:
        return "Gold"
    return "Silver"


def _segment_for(recency_days: Optional[int], first_seen_days: Optional[int], event_count: int) -> str:
    """RFM-lite segment from recency (days since last activity), tenure (days
    since first activity) and frequency (business events)."""
    if recency_days is None:
        return "Inactive"  # never any recorded activity
    if first_seen_days is not None and first_seen_days <= SEGMENT_NEW_DAYS:
        return "New"
    if recency_days <= SEGMENT_NEW_DAYS and event_count >= SEGMENT_CHAMPION_MIN_EVENTS:
        return "Champion"
    if recency_days <= SEGMENT_ACTIVE_DAYS:
        return "Loyal"
    if recency_days <= SEGMENT_ATRISK_DAYS:
        return "At-Risk"
    return "Dormant"


def _load_customer_analytics() -> Dict[str, Any]:
    """Per-customer loyalty analytics derived entirely from existing tables — no
    schema change. Combines points balance (bonus_transactions) with activity
    recency/frequency across scans, redemptions, bonus events and app logins,
    then assigns a points-based tier and an RFM-lite segment. Also returns a
    summary the dashboard can render directly."""
    connection = bonus_db()
    try:
        customers = connection.execute("SELECT id, full_name, status FROM customers").fetchall()
        bonus = connection.execute(
            """
            SELECT client_id, COALESCE(SUM(points), 0) AS pts, COUNT(*) AS cnt,
                   MIN(created_at) AS first_at, MAX(created_at) AS last_at
            FROM bonus_transactions GROUP BY client_id
            """
        ).fetchall()
        scans = connection.execute(
            """
            SELECT client_id, COUNT(*) AS cnt, MIN(created_at) AS first_at, MAX(created_at) AS last_at
            FROM qr_scan_events GROUP BY client_id
            """
        ).fetchall()
        redemptions = connection.execute(
            """
            SELECT customer_id AS client_id, COUNT(*) AS cnt, MIN(created_at) AS first_at, MAX(created_at) AS last_at
            FROM redemption_requests GROUP BY customer_id
            """
        ).fetchall()
        sessions = connection.execute(
            """
            SELECT client_id, MIN(created_at) AS first_at, MAX(created_at) AS last_at
            FROM customer_sessions GROUP BY client_id
            """
        ).fetchall()
    finally:
        connection.close()

    bonus_by = {str(r["client_id"]): r for r in bonus}
    scans_by = {str(r["client_id"]): r for r in scans}
    redeem_by = {str(r["client_id"]): r for r in redemptions}
    sess_by = {str(r["client_id"]): r for r in sessions}

    now = datetime.utcnow()
    this_month = (now.year, now.month)

    rows: List[Dict[str, Any]] = []
    summary = {
        "totalCustomers": 0,
        "newThisMonth": 0,
        "notReturned90d": 0,
        "activeLast30d": 0,
        "tiers": {"Premium": 0, "Gold": 0, "Silver": 0},
        "segments": {"Champion": 0, "Loyal": 0, "New": 0, "At-Risk": 0, "Dormant": 0, "Inactive": 0},
    }

    for customer in customers:
        cid = str(customer["id"])
        b, s, r, se = bonus_by.get(cid), scans_by.get(cid), redeem_by.get(cid), sess_by.get(cid)

        points_balance = int(b["pts"]) if b else 0
        event_count = (int(b["cnt"]) if b else 0) + (int(s["cnt"]) if s else 0) + (int(r["cnt"]) if r else 0)

        last_at = _max_dt(
            _parse_dt(b["last_at"]) if b else None,
            _parse_dt(s["last_at"]) if s else None,
            _parse_dt(r["last_at"]) if r else None,
            _parse_dt(se["last_at"]) if se else None,
        )
        first_at = _min_dt(
            _parse_dt(b["first_at"]) if b else None,
            _parse_dt(s["first_at"]) if s else None,
            _parse_dt(r["first_at"]) if r else None,
            _parse_dt(se["first_at"]) if se else None,
        )
        recency_days = (now - last_at).days if last_at else None
        first_seen_days = (now - first_at).days if first_at else None

        tier = _tier_for(points_balance)
        segment = _segment_for(recency_days, first_seen_days, event_count)

        rows.append(
            {
                "clientId": cid,
                "fullName": str(customer["full_name"] or ""),
                "status": str(customer["status"] or "active"),
                "pointsBalance": points_balance,
                "activityCount": event_count,
                "firstActivityAt": first_at.isoformat() if first_at else "",
                "lastActivityAt": last_at.isoformat() if last_at else "",
                "recencyDays": recency_days,
                "tier": tier,
                "segment": segment,
            }
        )

        summary["totalCustomers"] += 1
        summary["tiers"][tier] += 1
        summary["segments"][segment] += 1
        if first_at and (first_at.year, first_at.month) == this_month:
            summary["newThisMonth"] += 1
        if recency_days is not None and recency_days <= 30:
            summary["activeLast30d"] += 1
        if recency_days is not None and recency_days > SEGMENT_ACTIVE_DAYS:
            summary["notReturned90d"] += 1

    rows.sort(key=lambda item: item["pointsBalance"], reverse=True)
    return {"count": len(rows), "generatedAt": now.isoformat(), "summary": summary, "customers": rows}
