from fastapi import HTTPException
from fastapi.responses import JSONResponse

from backend import legacy
from backend.config import MARKET_BUY_RATE, MARKET_SELL_RATE
from backend.core import admin_users
from backend.core import customers as customer_core
from backend.core import dashboard as dashboard_core
from backend.core import transactions as transaction_core
from backend.db import bonus_db
from backend.models.schemas import CustomerMarketOrderPayload, MarketOrderCreatePayload, MarketOrderStatusPayload


def get_market_orders_payload(
    offset: int,
    limit: int,
    search: str,
    status: str,
    order_type: str,
    date_from: str = "",
    date_to: str = "",
    client_id: str = "",
):
    orders, total_count = transaction_core._load_market_orders(
        offset=int(offset),
        limit=int(limit),
        search=search,
        status=status,
        order_type=order_type,
        date_from=date_from,
        date_to=date_to,
        client_id=client_id,
    )
    return {"count": int(total_count), "orders": orders, "offset": int(offset), "limit": int(limit)}


def get_market_stats_payload():
    return transaction_core._load_market_stats()


def get_customer_market_orders_payload(client_id: str, current_id: str, offset: int, limit: int):
    if client_id != current_id:
        raise HTTPException(status_code=403, detail="Access denied")
    orders, total_count = transaction_core._load_market_orders(
        offset=int(offset),
        limit=int(limit),
        client_id=current_id,
    )
    return {"count": int(total_count), "orders": orders, "offset": int(offset), "limit": int(limit)}


def create_customer_market_order_payload(client_id: str, payload: CustomerMarketOrderPayload, current_id: str):
    if client_id != current_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _create_customer_market_order(current_id, payload.type, payload.points, payload.payment_method)


def create_legacy_customer_market_order_payload(customer_id: str, payload: MarketOrderCreatePayload):
    # Older app builds post the full admin-shaped body to /api/market/orders. Only
    # type, points and payment method are read; client, amount, rate and status are
    # ignored.
    order_type = payload.type.strip().lower()
    if order_type not in {"buy", "sell"}:
        return JSONResponse({"error": "Unsupported order type"}, status_code=400)
    return _create_customer_market_order(customer_id, order_type, payload.points, payload.payment_method)


def _create_customer_market_order(customer_id: str, order_type: str, points: int, payment_method: str):
    customer = customer_core._load_customer_snapshot(customer_id)
    if customer is None:
        return JSONResponse({"error": "Customer not found"}, status_code=404)
    # The customer, price and status come from the server. A customer order always
    # starts Pending, so points only move once an operator completes it.
    is_buy = order_type == "buy"
    rate = MARKET_BUY_RATE if is_buy else MARKET_SELL_RATE
    order_payload = MarketOrderCreatePayload(
        client_id=customer_id,
        client_name=str(customer.get("fullName") or customer_id),
        type=order_type,
        points=points,
        amount_uzs=points * rate,
        rate=rate,
        payment_method=payment_method if is_buy else "",
        status="Pending",
        note="created from customer app",
        operator="customer-app",
    )
    return create_market_order_payload(order_payload, actor=f"customer:{customer_id}")


def create_market_order_payload(payload: MarketOrderCreatePayload, actor: str = ""):
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
            actor=actor or admin_users.current_actor(),
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
            actor=admin_users.current_actor(),
        )
        connection.commit()
    finally:
        connection.close()
    return {"message": "Market order updated", "order": order}
