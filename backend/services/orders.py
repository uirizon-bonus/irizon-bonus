import time

from fastapi.responses import JSONResponse

from backend import legacy
from backend.core import dashboard as dashboard_core
from backend.core import transactions as transaction_core
from backend.db import bonus_db
from backend.models.schemas import OrderCreatePayload, OrderStatusPayload


def get_orders_payload(offset: int, limit: int, search: str):
    started = time.time()
    cache_key = f"{search.strip().lower()}|{int(offset)}|{int(limit)}"
    cached_entry = legacy._ORDERS_CACHE.get(cache_key)
    if cached_entry:
        cached_at = float(cached_entry.get("ts") or 0.0)
        if (time.time() - cached_at) <= legacy.ORDERS_CACHE_TTL_SEC:
            return cached_entry["payload"]
    orders, total_count = transaction_core._load_orders(offset=int(offset), limit=int(limit), search=search)
    payload = {"count": int(total_count), "orders": orders, "offset": int(offset), "limit": int(limit)}
    legacy._ORDERS_CACHE[cache_key] = {"ts": time.time(), "payload": payload}
    legacy.logger.info("Loaded /api/orders in %.2fs", time.time() - started)
    return payload


def create_order_payload(payload: OrderCreatePayload):
    try:
        order = transaction_core._create_order(payload)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="create",
            entity="order",
            entity_id=str(order.get("id")),
            description=f"Created order {order.get('id')}",
            actor=str(payload.createdBy or "Admin"),
        )
        connection.commit()
    finally:
        connection.close()
    legacy._ORDERS_CACHE.clear()
    dashboard_core._invalidate_dashboard_cache()
    return {"message": "Order created", "order": order}


def update_order_status_payload(order_id: str, payload: OrderStatusPayload):
    try:
        order = transaction_core._update_order_status(order_id, payload.status)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except Exception as exc:  # pragma: no cover - defensive
        legacy.logger.exception("Failed to update order %s status", order_id)
        return JSONResponse({"error": f"Failed to update order: {exc}"}, status_code=500)
    if order is None:
        return JSONResponse({"error": "Order not found"}, status_code=404)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="status_change",
            entity="order",
            entity_id=str(order_id),
            description=f"Changed order {order_id} to {payload.status}",
            actor=str(payload.actor or "Admin"),
        )
        connection.commit()
    finally:
        connection.close()
    legacy._ORDERS_CACHE.clear()
    dashboard_core._invalidate_dashboard_cache()
    return {"message": "Order updated", "order": order}


def delete_order_payload(order_id: str):
    try:
        deleted_order = transaction_core._delete_order(order_id)
        if deleted_order is None:
            return JSONResponse({"error": "Order not found"}, status_code=404)
        connection = bonus_db()
        try:
            legacy._audit_log(
                connection,
                action="delete",
                entity="order",
                entity_id=str(order_id),
                description=f"Deleted order {order_id}",
                actor="Admin",
            )
            connection.commit()
        finally:
            connection.close()
        legacy._ORDERS_CACHE.clear()
        dashboard_core._invalidate_dashboard_cache()
        return {"message": "Order deleted", "order": deleted_order}
    except Exception as exc:
        legacy.logger.exception("Failed to delete order %s", order_id)
        return JSONResponse({"error": f"Failed to delete order: {exc}"}, status_code=500)
