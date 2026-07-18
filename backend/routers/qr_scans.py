from fastapi import APIRouter, Depends, Query

from backend import deps
from backend.services import qr_scans as qr_scans_service


router = APIRouter(tags=["qr_scans"])


@router.get("/api/qr-scans", dependencies=[Depends(deps.require_admin)])
def get_qr_scans(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    customer_id: str = Query("", description="Filter by customer ID"),
    product_id: str = Query("", description="Filter by product ID"),
    search: str = Query("", description="Search by customer or product"),
):
    return qr_scans_service.get_qr_scans_payload(offset, limit, customer_id, product_id, search)
