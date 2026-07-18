from fastapi import APIRouter, Depends, Query

from backend import deps
from backend.models.schemas import MarketOrderCreatePayload, MarketOrderStatusPayload
from backend.services import market as market_service


router = APIRouter(tags=["market"])


@router.get("/api/market/orders", dependencies=[Depends(deps.require_admin_or_customer)])
def get_market_orders(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: str = Query(""),
    status: str = Query("all"),
    order_type: str = Query("all"),
):
    return market_service.get_market_orders_payload(offset, limit, search, status, order_type)


@router.get("/api/market/stats", dependencies=[Depends(deps.require_admin)])
def get_market_stats():
    return market_service.get_market_stats_payload()


@router.post("/api/market/orders", dependencies=[Depends(deps.require_admin_or_customer)])
def create_market_order(payload: MarketOrderCreatePayload):
    return market_service.create_market_order_payload(payload)


@router.put("/api/market/orders/{order_id}/status", dependencies=[Depends(deps.require_admin)])
def update_market_order_status(order_id: str, payload: MarketOrderStatusPayload):
    return market_service.update_market_order_status_payload(order_id, payload)
