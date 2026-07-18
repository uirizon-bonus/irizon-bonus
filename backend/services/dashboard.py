import time

from backend.core import dashboard as dashboard_core


def get_dashboard_summary_payload(refresh: bool):
    if not refresh:
        cached_payload = dashboard_core._DASHBOARD_CACHE.get("payload")
        cached_ts = float(dashboard_core._DASHBOARD_CACHE.get("ts") or 0.0)
        if cached_payload is not None and (time.time() - cached_ts) <= dashboard_core.DASHBOARD_CACHE_TTL_SEC:
            return cached_payload

    payload = dashboard_core._build_dashboard_summary()
    dashboard_core._DASHBOARD_CACHE["ts"] = time.time()
    dashboard_core._DASHBOARD_CACHE["payload"] = payload
    return payload


def get_audit_activity_payload(limit: int, search: str, activity_type: str):
    activities = dashboard_core._load_audit_activity(limit=int(limit), search=search, activity_type=activity_type)
    return {"count": len(activities), "activities": activities}
