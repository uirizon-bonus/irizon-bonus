from fastapi import APIRouter, Depends, Query

from backend import deps
from backend.models.schemas import MarketOrderCreatePayload, MarketOrderStatusPayload
from backend.services import market as market_service


router = APIRouter(tags=["market"])


# Current app builds use /api/customers/{client_id}/market-orders. Older builds
# still call these two routes with a customer token, so a customer call is
# accepted but scoped to the session's customer: the list shows only their own
# orders, and a new order is priced by the server and always starts Pending.
# Admin calls behave as before.
@router.get("/api/market/orders")
def get_market_orders(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: str = Query(""),
    status: str = Query("all"),
    order_type: str = Query("all"),
    date_from: str = Query(""),
    date_to: str = Query(""),
    caller: deps.Caller = Depends(deps.require_admin_or_customer_identity),
):
    return market_service.get_market_orders_payload(
        offset, limit, search, status, order_type, date_from, date_to, client_id=caller.customer_id
    )


@router.get("/api/market/stats", dependencies=[Depends(deps.require_admin)])
def get_market_stats():
    return market_service.get_market_stats_payload()


@router.post("/api/market/orders")
def create_market_order(
    payload: MarketOrderCreatePayload,
    caller: deps.Caller = Depends(deps.require_admin_or_customer_identity),
):
    if caller.customer_id:
        return market_service.create_legacy_customer_market_order_payload(caller.customer_id, payload)
    return market_service.create_market_order_payload(payload)


@router.put("/api/market/orders/{order_id}/status", dependencies=[Depends(deps.require_admin)])
def update_market_order_status(order_id: str, payload: MarketOrderStatusPayload):
    return market_service.update_market_order_status_payload(order_id, payload)
