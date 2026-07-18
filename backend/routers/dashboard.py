from fastapi import APIRouter, Depends, Query

from backend import deps
from backend.services import dashboard as dashboard_service


router = APIRouter(tags=["dashboard"])


@router.get("/api/dashboard/summary", dependencies=[Depends(deps.require_admin)])
def get_dashboard_summary(refresh: bool = Query(False, description="Force refresh summary cache")):
    return dashboard_service.get_dashboard_summary_payload(refresh)


@router.get("/api/audit", dependencies=[Depends(deps.require_admin)])
def get_audit_activity(
    limit: int = Query(200, ge=1, le=1000),
    search: str = Query(""),
    activity_type: str = Query("all"),
):
    return dashboard_service.get_audit_activity_payload(limit, search, activity_type)
