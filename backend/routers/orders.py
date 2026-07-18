from fastapi import APIRouter, Depends, Query

from backend import deps
from backend.models.schemas import OrderCreatePayload
from backend.services import orders as orders_service


router = APIRouter(tags=["orders"])


@router.get("/api/orders", dependencies=[Depends(deps.require_admin)])
def get_orders(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: str = Query("", description="Search by order id or customer"),
):
    return orders_service.get_orders_payload(offset, limit, search)


@router.post("/api/orders", dependencies=[Depends(deps.require_admin)])
def create_order(payload: OrderCreatePayload):
    return orders_service.create_order_payload(payload)


@router.delete("/api/orders/{order_id}", dependencies=[Depends(deps.require_admin)])
def delete_order(order_id: str):
    return orders_service.delete_order_payload(order_id)
