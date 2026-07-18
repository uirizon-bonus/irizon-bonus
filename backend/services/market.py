from fastapi.responses import JSONResponse

from backend import legacy
from backend.core import dashboard as dashboard_core
from backend.core import transactions as transaction_core
from backend.db import bonus_db
from backend.models.schemas import MarketOrderCreatePayload, MarketOrderStatusPayload


def get_market_orders_payload(offset: int, limit: int, search: str, status: str, order_type: str):
    orders, total_count = transaction_core._load_market_orders(
        offset=int(offset),
        limit=int(limit),
        search=search,
        status=status,
        order_type=order_type,
    )
    return {"count": int(total_count), "orders": orders, "offset": int(offset), "limit": int(limit)}


def get_market_stats_payload():
    return transaction_core._load_market_stats()


def create_market_order_payload(payload: MarketOrderCreatePayload):
    try:
        order = transaction_core._create_market_order(payload)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)

    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="create",
            entity="market_order",
            entity_id=str(order.get("id")),
            description=f"Created market order {order.get('id')} ({order.get('type')})",
            actor=str(payload.operator or "Admin"),
        )
        connection.commit()
    finally:
        connection.close()
    return {"message": "Market order created", "order": order}


def update_market_order_status_payload(order_id: str, payload: MarketOrderStatusPayload):
    try:
        order = transaction_core._update_market_order_status(order_id, payload)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    if order is None:
        return JSONResponse({"error": "Market order not found"}, status_code=404)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="status_change",
            entity="market_order",
            entity_id=str(order_id),
            description=f"Changed market order {order_id} to {payload.status}",
            actor=str(payload.operator or "Admin"),
        )
        connection.commit()
    finally:
        connection.close()
    return {"message": "Market order updated", "order": order}
