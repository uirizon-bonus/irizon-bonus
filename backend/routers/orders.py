from fastapi import APIRouter, Depends, Query

from backend import deps
from backend.models.schemas import OrderCreatePayload, OrderStatusPayload
from backend.services import orders as orders_service


router = APIRouter(tags=["orders"])


@router.get("/api/orders", dependencies=[Depends(deps.require_admin)])
def get_orders(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: str = Query("", description="Search by order id or customer"),
    status: str = Query("", description="Filter by status: Confirmed or Reversed"),
    date_from: str = Query("", description="Filter created date >= YYYY-MM-DD"),
    date_to: str = Query("", description="Filter created date <= YYYY-MM-DD"),
):
    return orders_service.get_orders_payload(offset, limit, search, status, date_from, date_to)


@router.get("/api/points-summary", dependencies=[Depends(deps.require_admin)])
def get_points_summary():
    return orders_service.get_points_summary_payload()


@router.post("/api/orders", dependencies=[Depends(deps.require_admin)])
def create_order(payload: OrderCreatePayload):
    return orders_service.create_order_payload(payload)


@router.put("/api/orders/{order_id}/status", dependencies=[Depends(deps.require_admin)])
def update_order_status(order_id: str, payload: OrderStatusPayload):
    return orders_service.update_order_status_payload(order_id, payload)


@router.delete("/api/orders/{order_id}", dependencies=[Depends(deps.require_admin)])
def delete_order(order_id: str):
    return orders_service.delete_order_payload(order_id)
