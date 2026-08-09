from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from fastapi.responses import JSONResponse

from backend.core import catalog as catalog_core
from backend.core import customers as customer_core
from backend.core import points as points_core
from backend.db import bonus_db
from backend.models.schemas import (
    MarketOrderCreatePayload,
    MarketOrderStatusPayload,
    OrderCreatePayload,
    RedemptionRequestBulkStatusPayload,
    RedemptionRequestCreatePayload,
    RedemptionRequestStatusPayload,
)


def _load_requests() -> List[Dict[str, Any]]:
    connection = bonus_db()
    try:
        rows = connection.execute(
            """
            SELECT
                public_id, created_at, customer_id, customer_name, gift_id, gift_name, gift_image,
                points_used, status, operator, reject_reason, request_type
            FROM redemption_requests
            ORDER BY datetime(created_at) DESC, id DESC
            """
        ).fetchall()
    finally:
        connection.close()

    return [_serialize_request_row(row) for row in rows]


def _serialize_request_row(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row["public_id"]),
        "date": str(row["created_at"]),
        "customerId": str(row["customer_id"]),
        "customerName": str(row["customer_name"]),
        "giftId": str(row["gift_id"]),
        "giftName": str(row["gift_name"]),
        "giftImage": str(row["gift_image"] or ""),
        "pointsUsed": int(row["points_used"] or 0),
        "status": str(row["status"]),
        "operator": str(row["operator"] or ""),
        "rejectReason": str(row["reject_reason"] or ""),
        "requestType": str(row["request_type"] or "Admin"),
    }


def _load_request_by_id(public_id: str) -> Optional[Dict[str, Any]]:
    connection = bonus_db()
    try:
        row = connection.execute(
            """
            SELECT
                public_id, created_at, customer_id, customer_name, gift_id, gift_name, gift_image,
                points_used, status, operator, reject_reason, request_type
            FROM redemption_requests
            WHERE public_id = ?
            """,
            (public_id,),
        ).fetchone()
    finally:
        connection.close()
    if row is None:
        return None
    return _serialize_request_row(row)


def _load_qr_scan_events(
    *,
    offset: int = 0,
    limit: int = 100,
    customer_id: str = "",
    product_id: str = "",
    search: str = "",
) -> Dict[str, Any]:
    where_clauses: List[str] = []
    params: List[Any] = []

    if customer_id.strip():
        where_clauses.append("client_id = ?")
        params.append(customer_id.strip())
    if product_id.strip():
        where_clauses.append("product_id = ?")
        params.append(product_id.strip())
    if search.strip():
        needle = f"%{search.strip().lower()}%"
        where_clauses.append(
            "(LOWER(client_id) LIKE ? OR LOWER(client_name) LIKE ? OR LOWER(product_id) LIKE ? OR LOWER(product_name) LIKE ?)"
        )
        params.extend([needle, needle, needle, needle])

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    connection = bonus_db()
    try:
        total_row = connection.execute(
            f"SELECT COUNT(*) AS count FROM qr_scan_events {where_sql}",
            tuple(params),
        ).fetchone()
        rows = connection.execute(
            f"""
            SELECT id, created_at, client_id, client_name, product_id, product_name, qr_code, quantity, points_awarded
            FROM qr_scan_events
            {where_sql}
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            tuple([*params, int(limit), int(offset)]),
        ).fetchall()
    finally:
        connection.close()

    events = [
        {
            "id": int(row["id"] or 0),
            "date": str(row["created_at"] or ""),
            "customerId": str(row["client_id"] or ""),
            "customerName": str(row["client_name"] or ""),
            "productId": str(row["product_id"] or ""),
            "productName": str(row["product_name"] or ""),
            "qrCode": str(row["qr_code"] or ""),
            "quantity": int(row["quantity"] or 0),
            "pointsAwarded": int(row["points_awarded"] or 0),
        }
        for row in rows
    ]
    return {"count": int(total_row["count"] or 0), "events": events}


def _load_gift_by_id(gift_id: str) -> Optional[Dict[str, Any]]:
    return next((gift for gift in catalog_core._load_gifts() if gift["id"] == gift_id), None)


def _request_status_applies_effects(status: str) -> bool:
    return str(status or "").strip() in {"Approved", "Shipped", "Completed"}


def _apply_request_effects(connection: Any, request_row: Any) -> None:
    # Re-check the balance at approval time: affordability was verified when the
    # request was created, but the client may have spent points since then.
    if int(request_row["points_applied"] or 0) == 0:
        points_used = int(request_row["points_used"] or 0)
        balance = _get_client_points_balance(connection, str(request_row["customer_id"]))
        if balance < points_used:
            raise ValueError(
                f"{request_row['public_id']}: mijozda yetarli ball yo‘q (mavjud: {balance}, kerak: {points_used})"
            )
    if int(request_row["stock_applied"] or 0) == 0:
        connection.execute(
            "UPDATE gifts SET stock = stock - 1 WHERE id = ? AND stock > 0",
            (str(request_row["gift_id"]),),
        )
        connection.execute(
            "UPDATE redemption_requests SET stock_applied = 1 WHERE public_id = ?",
            (str(request_row["public_id"]),),
        )
    if int(request_row["points_applied"] or 0) == 0:
        points_core._insert_bonus_transaction(
            connection,
            client_id=str(request_row["customer_id"]),
            client_name=str(request_row["customer_name"]),
            points=-int(request_row["points_used"] or 0),
            note=f"Redemption {request_row['public_id']}",
            source_type="request",
            source_ref=str(request_row["public_id"]),
        )
        connection.execute(
            "UPDATE redemption_requests SET points_applied = 1 WHERE public_id = ?",
            (str(request_row["public_id"]),),
        )


def _revert_request_effects(connection: Any, request_row: Any, *, note: str) -> None:
    if int(request_row["stock_applied"] or 0) == 1:
        connection.execute(
            "UPDATE gifts SET stock = stock + 1 WHERE id = ?",
            (str(request_row["gift_id"]),),
        )
        connection.execute(
            "UPDATE redemption_requests SET stock_applied = 0 WHERE public_id = ?",
            (str(request_row["public_id"]),),
        )
    if int(request_row["points_applied"] or 0) == 1:
        points_core._insert_bonus_transaction(
            connection,
            client_id=str(request_row["customer_id"]),
            client_name=str(request_row["customer_name"]),
            points=int(request_row["points_used"] or 0),
            note=note,
            source_type="request_reversal",
            source_ref=str(request_row["public_id"]),
        )
        connection.execute(
            "UPDATE redemption_requests SET points_applied = 0 WHERE public_id = ?",
            (str(request_row["public_id"]),),
        )


def _create_request(payload: RedemptionRequestCreatePayload) -> Dict[str, Any]:
    gift = _load_gift_by_id(payload.gift_id.strip())
    if gift is None:
        raise ValueError("Gift not found")
    if not gift.get("isActive"):
        raise ValueError("Gift is inactive")
    if int(gift.get("stock", 0)) <= 0:
        raise ValueError("Gift is out of stock")

    connection = bonus_db()
    try:
        from backend import legacy as _legacy

        public_id = _legacy._generate_catalog_public_id(connection, "redemption_requests", "REQ", 5000, key_column="public_id")
        initial_status = "Pending" if payload.request_type.strip() == "Customer" else "Approved"
        connection.execute(
            """
            INSERT INTO redemption_requests (
                public_id, customer_id, customer_name, gift_id, gift_name, gift_image,
                points_used, status, operator, reject_reason, request_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
            """,
            (
                public_id,
                payload.customer_id.strip(),
                payload.customer_name.strip(),
                payload.gift_id.strip(),
                str(gift["name"]["RU"]),
                str(gift["image"] or ""),
                int(gift["pointsCost"]),
                initial_status,
                payload.operator.strip() or "Admin",
                payload.request_type.strip() or "Admin",
            ),
        )
        request_row = connection.execute(
            "SELECT * FROM redemption_requests WHERE public_id = ?",
            (public_id,),
        ).fetchone()
        if request_row is None:
            raise RuntimeError("Created request could not be loaded")
        if _request_status_applies_effects(initial_status):
            _apply_request_effects(connection, request_row)
        connection.commit()
    finally:
        connection.close()

    created_request = next((request for request in _load_requests() if request["id"] == public_id), None)
    if created_request is None:
        raise RuntimeError("Created request could not be loaded")
    return created_request


def _update_request_status(public_id: str, payload: RedemptionRequestStatusPayload) -> Optional[Dict[str, Any]]:
    next_status = payload.status.strip()
    connection = bonus_db()
    try:
        request_row = connection.execute(
            "SELECT * FROM redemption_requests WHERE public_id = ?",
            (public_id,),
        ).fetchone()
        if request_row is None:
            return None

        current_status = str(request_row["status"])
        if current_status == next_status:
            return _load_request_by_id(public_id)

        if next_status == "Rejected":
            _revert_request_effects(connection, request_row, note=f"Redemption {public_id} rejected")
        elif _request_status_applies_effects(next_status):
            gift_row = connection.execute("SELECT stock, is_active FROM gifts WHERE id = ?", (str(request_row["gift_id"]),)).fetchone()
            if gift_row is None or not bool(gift_row["is_active"]):
                raise ValueError("Gift is inactive")
            if int(request_row["stock_applied"] or 0) == 0 and int(gift_row["stock"] or 0) <= 0:
                raise ValueError("Gift is out of stock")
            _apply_request_effects(connection, request_row)

        connection.execute(
            """
            UPDATE redemption_requests
            SET status = ?, operator = ?, reject_reason = ?
            WHERE public_id = ?
            """,
            (
                next_status,
                payload.operator.strip() or str(request_row["operator"] or "Admin"),
                payload.reject_reason.strip() if next_status == "Rejected" else "",
                public_id,
            ),
        )
        connection.commit()
    finally:
        connection.close()

    return _load_request_by_id(public_id)


def _update_requests_status_bulk(payload: RedemptionRequestBulkStatusPayload) -> List[Dict[str, Any]]:
    request_ids = [str(request_id).strip() for request_id in payload.ids if str(request_id).strip()]
    if not request_ids:
        return []

    next_status = payload.status.strip()
    operator = payload.operator.strip() or "Admin"
    reject_reason = payload.reject_reason.strip() if next_status == "Rejected" else ""
    updated_ids: List[str] = []

    connection = bonus_db()
    try:
        for public_id in request_ids:
            request_row = connection.execute(
                "SELECT * FROM redemption_requests WHERE public_id = ?",
                (public_id,),
            ).fetchone()
            if request_row is None:
                continue

            current_status = str(request_row["status"])
            if current_status != next_status:
                if next_status == "Rejected":
                    _revert_request_effects(connection, request_row, note=f"Redemption {public_id} rejected")
                elif _request_status_applies_effects(next_status):
                    gift_row = connection.execute(
                        "SELECT stock, is_active FROM gifts WHERE id = ?",
                        (str(request_row["gift_id"]),),
                    ).fetchone()
                    if gift_row is None or not bool(gift_row["is_active"]):
                        raise ValueError(f"Gift is inactive for {public_id}")
                    if int(request_row["stock_applied"] or 0) == 0 and int(gift_row["stock"] or 0) <= 0:
                        raise ValueError(f"Gift is out of stock for {public_id}")
                    _apply_request_effects(connection, request_row)

                connection.execute(
                    """
                    UPDATE redemption_requests
                    SET status = ?, operator = ?, reject_reason = ?
                    WHERE public_id = ?
                    """,
                    (next_status, operator, reject_reason, public_id),
                )

            from backend import legacy as _legacy

            _legacy._audit_log(
                connection,
                action="bulk_status_update",
                entity="request",
                entity_id=public_id,
                description=f"Changed request {public_id} to {next_status}",
                actor=operator,
            )
            updated_ids.append(public_id)

        connection.commit()
    finally:
        connection.close()

    if not updated_ids:
        return []

    fetch_connection = bonus_db()
    try:
        placeholders = ",".join(["?"] * len(updated_ids))
        rows = fetch_connection.execute(
            f"""
            SELECT
                public_id, created_at, customer_id, customer_name, gift_id, gift_name, gift_image,
                points_used, status, operator, reject_reason, request_type
            FROM redemption_requests
            WHERE public_id IN ({placeholders})
            """,
            tuple(updated_ids),
        ).fetchall()
    finally:
        fetch_connection.close()

    rows_by_id = {str(row["public_id"]): _serialize_request_row(row) for row in rows}
    return [rows_by_id[request_id] for request_id in updated_ids if request_id in rows_by_id]


def _load_orders(*, offset: int = 0, limit: int = 100, search: str = "", status: str = "") -> Tuple[List[Dict[str, Any]], int]:
    connection = bonus_db()
    try:
        order_params: List[Any] = []
        order_where_sql = ""
        manual_params: List[Any] = []
        manual_where_sql = "WHERE source_type = 'manual'"
        if search.strip():
            normalized = f"%{search.strip().lower()}%"
            order_where_sql = (
                "WHERE LOWER(public_id) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(customer_id) LIKE ?"
            )
            order_params = [normalized, normalized, normalized]
            manual_where_sql += (
                " AND (LOWER('MAN-' || id) LIKE ? OR LOWER(client_name) LIKE ? OR LOWER(client_id) LIKE ? OR LOWER(note) LIKE ?)"
            )
            manual_params = [normalized, normalized, normalized, normalized]

        order_rows = connection.execute(
            f"""
            SELECT public_id, created_at, customer_id, customer_name, total_points, items_count, created_by, status, note
            FROM orders
            {order_where_sql}
            ORDER BY datetime(created_at) DESC, id DESC
            """,
            tuple(order_params),
        ).fetchall()
        manual_rows = connection.execute(
            f"""
            SELECT id, client_id, client_name, points, note, created_at
            FROM bonus_transactions
            {manual_where_sql}
            ORDER BY datetime(created_at) DESC, id DESC
            """,
            tuple(manual_params),
        ).fetchall()
        manual_ids = [f"MAN-{row['id']}" for row in manual_rows]
        reversed_manual_refs: set[str] = set()
        if manual_ids:
            placeholders = ",".join(["?"] * len(manual_ids))
            reversed_rows = connection.execute(
                f"""
                SELECT source_ref
                FROM bonus_transactions
                WHERE source_type = 'manual_reversal'
                  AND source_ref IN ({placeholders})
                """,
                tuple(manual_ids),
            ).fetchall()
            reversed_manual_refs = {str(row["source_ref"]) for row in reversed_rows}
        combined_rows = [
            {
                "kind": "order",
                "row": row,
                "created_at": str(row["created_at"] or ""),
                "sort_id": int(row["public_id"].split("-")[-1]) if str(row["public_id"]).split("-")[-1].isdigit() else 0,
                "status": str(row["status"] or "Confirmed"),
            }
            for row in order_rows
        ]
        combined_rows.extend(
            {
                "kind": "manual",
                "row": row,
                "created_at": str(row["created_at"] or ""),
                "sort_id": int(row["id"] or 0),
                "status": "Reversed" if f"MAN-{row['id']}" in reversed_manual_refs else "Confirmed",
            }
            for row in manual_rows
        )

        status_filter = str(status or "").strip()
        if status_filter:
            combined_rows = [entry for entry in combined_rows if entry["status"] == status_filter]

        total_count = len(combined_rows)
        combined_rows.sort(key=lambda entry: (entry["created_at"], entry["sort_id"]), reverse=True)
        paged_rows = combined_rows[int(offset):int(offset) + int(limit)]

        order_ids = [str(entry["row"]["public_id"]) for entry in paged_rows if entry["kind"] == "order"]
        item_rows = []
        if order_ids:
            placeholders = ",".join(["?"] * len(order_ids))
            item_rows = connection.execute(
                f"""
                SELECT order_public_id, product_id, product_name, points_per_unit, quantity, total_points, id
                FROM order_items
                WHERE order_public_id IN ({placeholders})
                ORDER BY id ASC
                """,
                tuple(order_ids),
            ).fetchall()
    finally:
        connection.close()

    items_by_order: Dict[str, List[Dict[str, Any]]] = {}
    for row in item_rows:
        order_public_id = str(row["order_public_id"])
        items_by_order.setdefault(order_public_id, []).append(
            {
                "id": f"ITM-{row['id']}",
                "productId": str(row["product_id"]),
                "productName": str(row["product_name"]),
                "pointsPerUnit": int(row["points_per_unit"] or 0),
                "quantity": int(row["quantity"] or 0),
                "totalPoints": int(row["total_points"] or 0),
            }
        )

    orders: List[Dict[str, Any]] = []
    for entry in paged_rows:
        row = entry["row"]
        if entry["kind"] == "manual":
            manual_id = f"MAN-{row['id']}"
            points = int(row["points"] or 0)
            is_reversed = manual_id in reversed_manual_refs
            orders.append(
                {
                    "id": manual_id,
                    "date": str(row["created_at"]),
                    "customerId": str(row["client_id"]),
                    "customerName": str(row["client_name"]),
                    "totalPoints": points,
                    "itemsCount": 1,
                    "createdBy": "Admin",
                    "status": "Reversed" if is_reversed else "Confirmed",
                    "items": [
                        {
                            "id": f"ITM-{manual_id}",
                            "productId": "MANUAL",
                            "productName": "Manual bonus",
                            "pointsPerUnit": points,
                            "quantity": 1,
                            "totalPoints": points,
                        }
                    ],
                    "note": str(row["note"] or ""),
                }
            )
            continue

        orders.append(
            {
                "id": str(row["public_id"]),
                "date": str(row["created_at"]),
                "customerId": str(row["customer_id"]),
                "customerName": str(row["customer_name"]),
                "totalPoints": int(row["total_points"] or 0),
                "itemsCount": int(row["items_count"] or 0),
                "createdBy": str(row["created_by"]),
                "status": str(row["status"]),
                "items": items_by_order.get(str(row["public_id"]), []),
                "note": str(row["note"] or ""),
            }
        )
    return orders, total_count


def _serialize_manual_bonus_order(row: Any, *, is_reversed: bool) -> Dict[str, Any]:
    manual_id = f"MAN-{row['id']}"
    points = int(row["points"] or 0)
    return {
        "id": manual_id,
        "date": str(row["created_at"]),
        "customerId": str(row["client_id"]),
        "customerName": str(row["client_name"]),
        "totalPoints": points,
        "itemsCount": 1,
        "createdBy": "Admin",
        "status": "Reversed" if is_reversed else "Confirmed",
        "items": [
            {
                "id": f"ITM-{manual_id}",
                "productId": "MANUAL",
                "productName": "Manual bonus",
                "pointsPerUnit": points,
                "quantity": 1,
                "totalPoints": points,
            }
        ],
        "note": str(row["note"] or ""),
    }


def _load_order_by_id(public_id: str) -> Optional[Dict[str, Any]]:
    connection = bonus_db()
    try:
        order_row = connection.execute(
            """
            SELECT public_id, created_at, customer_id, customer_name, total_points, items_count, created_by, status, note
            FROM orders
            WHERE public_id = ?
            """,
            (public_id,),
        ).fetchone()
        if order_row is None:
            return None
        item_rows = connection.execute(
            """
            SELECT order_public_id, product_id, product_name, points_per_unit, quantity, total_points, id
            FROM order_items
            WHERE order_public_id = ?
            ORDER BY id ASC
            """,
            (public_id,),
        ).fetchall()
    finally:
        connection.close()

    items = [
        {
            "id": f"ITM-{row['id']}",
            "productId": str(row["product_id"]),
            "productName": str(row["product_name"]),
            "pointsPerUnit": int(row["points_per_unit"] or 0),
            "quantity": int(row["quantity"] or 0),
            "totalPoints": int(row["total_points"] or 0),
        }
        for row in item_rows
    ]
    return {
        "id": str(order_row["public_id"]),
        "date": str(order_row["created_at"]),
        "customerId": str(order_row["customer_id"]),
        "customerName": str(order_row["customer_name"]),
        "totalPoints": int(order_row["total_points"] or 0),
        "itemsCount": int(order_row["items_count"] or 0),
        "createdBy": str(order_row["created_by"]),
        "status": str(order_row["status"]),
        "items": items,
        "note": str(order_row["note"] or ""),
    }


def _generate_order_public_id(connection: sqlite3.Connection) -> str:
    row = connection.execute("SELECT COALESCE(MAX(id), 0) AS max_id FROM orders").fetchone()
    next_id = int(row["max_id"] or 0) + 1
    return f"ORD-{9000 + next_id}"


def _create_order(payload: OrderCreatePayload) -> Dict[str, Any]:
    product_map = catalog_core._load_product_map()
    order_items: List[Dict[str, Any]] = []
    total_points = 0

    for item in payload.items:
        product = product_map.get(item.productId)
        if product is None or not product.get("isActive"):
            raise ValueError(f"Product {item.productId} is not available")

        points_per_unit = int(product["pointsValue"])
        row_total = points_per_unit * int(item.quantity)
        total_points += row_total
        order_items.append(
            {
                "productId": item.productId,
                "productName": str(product["name"]["EN"]),
                "pointsPerUnit": points_per_unit,
                "quantity": int(item.quantity),
                "totalPoints": row_total,
            }
        )

    connection = bonus_db()
    try:
        public_id = _generate_order_public_id(connection)
        connection.execute(
            """
            INSERT INTO orders (
                public_id, customer_id, customer_name, total_points, items_count, created_by, status, note
            ) VALUES (?, ?, ?, ?, ?, ?, 'Confirmed', ?)
            """,
            (
                public_id,
                payload.customerId.strip(),
                payload.customerName.strip(),
                total_points,
                len(order_items),
                payload.createdBy.strip() or "Admin",
                payload.note.strip(),
            ),
        )
        connection.executemany(
            """
            INSERT INTO order_items (
                order_public_id, product_id, product_name, points_per_unit, quantity, total_points
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    public_id,
                    item["productId"],
                    item["productName"],
                    item["pointsPerUnit"],
                    item["quantity"],
                    item["totalPoints"],
                )
                for item in order_items
            ],
        )
        connection.commit()
    finally:
        connection.close()

    points_core._create_bonus_transaction(
        client_id=payload.customerId.strip(),
        client_name=payload.customerName.strip(),
        points=total_points,
        note=payload.note.strip() or f"Order {public_id}",
        source_type="order",
        source_ref=public_id,
    )

    created_order = next((order for order in _load_orders()[0] if order["id"] == public_id), None)
    if created_order is None:
        raise RuntimeError("Created order could not be loaded")
    return created_order


def _reverse_manual_bonus_order(public_id: str) -> Optional[Dict[str, Any]]:
    if not public_id.startswith("MAN-"):
        return None
    raw_id = public_id.removeprefix("MAN-")
    if not raw_id.isdigit():
        return None

    connection = bonus_db()
    try:
        row = connection.execute(
            """
            SELECT id, client_id, client_name, points, note, created_at
            FROM bonus_transactions
            WHERE id = ? AND source_type = 'manual'
            """,
            (int(raw_id),),
        ).fetchone()
        if row is None:
            return None

        existing_reversal = connection.execute(
            """
            SELECT id
            FROM bonus_transactions
            WHERE source_type = 'manual_reversal' AND source_ref = ?
            """,
            (public_id,),
        ).fetchone()
        if existing_reversal is None:
            points_core._insert_bonus_transaction(
                connection,
                client_id=str(row["client_id"]),
                client_name=str(row["client_name"]),
                points=-int(row["points"] or 0),
                note=f"Manual bonus {public_id} reversed",
                source_type="manual_reversal",
                source_ref=public_id,
            )
            connection.commit()

        return _serialize_manual_bonus_order(row, is_reversed=True)
    finally:
        connection.close()


def _restore_manual_bonus_order(public_id: str) -> Optional[Dict[str, Any]]:
    if not public_id.startswith("MAN-"):
        return None
    raw_id = public_id.removeprefix("MAN-")
    if not raw_id.isdigit():
        return None

    connection = bonus_db()
    try:
        row = connection.execute(
            """
            SELECT id, client_id, client_name, points, note, created_at
            FROM bonus_transactions
            WHERE id = ? AND source_type = 'manual'
            """,
            (int(raw_id),),
        ).fetchone()
        if row is None:
            return None

        # Restore by removing the reversal entry, giving the points back once.
        connection.execute(
            "DELETE FROM bonus_transactions WHERE source_type = 'manual_reversal' AND source_ref = ?",
            (public_id,),
        )
        connection.commit()
        return _serialize_manual_bonus_order(row, is_reversed=False)
    finally:
        connection.close()


def _update_order_status(public_id: str, status: str) -> Optional[Dict[str, Any]]:
    next_status = str(status or "").strip()
    if next_status not in ("Confirmed", "Reversed"):
        raise ValueError("Order status must be 'Confirmed' or 'Reversed'")

    if public_id.startswith("MAN-"):
        return (
            _reverse_manual_bonus_order(public_id)
            if next_status == "Reversed"
            else _restore_manual_bonus_order(public_id)
        )

    target_order = _load_order_by_id(public_id)
    if target_order is None:
        return None

    # Idempotent: the status is the source of truth for whether points are applied.
    if str(target_order.get("status")) == next_status:
        return target_order

    connection = bonus_db()
    try:
        connection.execute(
            "UPDATE orders SET status = ? WHERE public_id = ?",
            (next_status, public_id),
        )
        connection.commit()
    finally:
        connection.close()

    total_points = int(target_order["totalPoints"])
    if next_status == "Reversed":
        points_core._create_bonus_transaction(
            client_id=str(target_order["customerId"]),
            client_name=str(target_order["customerName"]),
            points=-total_points,
            note=f"Order {public_id} reversed",
            source_type="order_reversal",
            source_ref=public_id,
        )
    else:  # Confirmed → restore the previously refunded points
        points_core._create_bonus_transaction(
            client_id=str(target_order["customerId"]),
            client_name=str(target_order["customerName"]),
            points=total_points,
            note=f"Order {public_id} restored",
            source_type="order_restore",
            source_ref=public_id,
        )
    return _load_order_by_id(public_id)


def _delete_order(public_id: str) -> Optional[Dict[str, Any]]:
    # Soft reverse: keep the record, mark it Reversed, refund points once.
    return _update_order_status(public_id, "Reversed")


def _normalize_market_type(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized not in {"buy", "sell"}:
        raise ValueError("Market type must be 'buy' or 'sell'")
    return normalized


def _normalize_market_status(value: str) -> str:
    normalized = str(value or "").strip().lower()
    mapping = {
        "pending": "Pending",
        "completed": "Completed",
        "rejected": "Rejected",
        "cancelled": "Cancelled",
        "canceled": "Cancelled",
    }
    next_status = mapping.get(normalized)
    if next_status is None:
        raise ValueError("Unsupported market status")
    return next_status


def _serialize_market_order_row(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row["public_id"]),
        "date": str(row["created_at"]),
        "updatedAt": str(row["updated_at"]),
        "clientId": str(row["client_id"]),
        "clientName": str(row["client_name"]),
        "type": str(row["type"]),
        "points": int(row["points"] or 0),
        "amountUZS": int(row["amount_uzs"] or 0),
        "rate": int(row["rate"] or 0),
        "paymentMethod": str(row["payment_method"] or ""),
        "status": str(row["status"] or "Pending"),
        "note": str(row["note"] or ""),
        "operator": str(row["operator"] or ""),
        "pointsApplied": int(row["points_applied"] or 0),
    }


def _get_client_points_balance(connection: Any, client_id: str) -> int:
    row = connection.execute(
        "SELECT COALESCE(SUM(points), 0) AS total FROM bonus_transactions WHERE client_id = ?",
        (str(client_id),),
    ).fetchone()
    return int(row["total"] or 0) if row is not None else 0


def _generate_market_order_public_id(connection: Any) -> str:
    row = connection.execute("SELECT COALESCE(MAX(id), 0) AS max_id FROM points_market_orders").fetchone()
    next_id = int(row["max_id"] or 0) + 1
    return f"MKT-{8000 + next_id}"


def _apply_market_points_effect(connection: Any, market_row: Any, *, note_suffix: str = "") -> None:
    if int(market_row["points_applied"] or 0) == 1:
        return
    points_value = int(market_row["points"] or 0)
    is_sell = str(market_row["type"] or "buy").lower() == "sell"
    if is_sell:
        # Selling subtracts points — the client must actually own enough.
        current_balance = _get_client_points_balance(connection, str(market_row["client_id"]))
        if current_balance < points_value:
            raise ValueError(
                f"Mijozda yetarli ball yo‘q (mavjud: {current_balance}, kerak: {points_value})"
            )
    signed_points = points_value
    if is_sell:
        signed_points = -signed_points
    base_note = f"Points market apply {market_row['public_id']} ({market_row['type']})"
    note = f"{base_note} {note_suffix}".strip()
    points_core._insert_bonus_transaction(
        connection,
        client_id=str(market_row["client_id"]),
        client_name=str(market_row["client_name"]),
        points=signed_points,
        note=note,
        source_type="market",
        source_ref=str(market_row["public_id"]),
    )
    connection.execute(
        """
        UPDATE points_market_orders
        SET points_applied = 1, updated_at = CURRENT_TIMESTAMP
        WHERE public_id = ?
        """,
        (str(market_row["public_id"]),),
    )


def _revert_market_points_effect(connection: Any, market_row: Any, *, note_suffix: str = "") -> None:
    if int(market_row["points_applied"] or 0) == 0:
        return
    signed_points = int(market_row["points"] or 0)
    if str(market_row["type"] or "buy").lower() == "sell":
        signed_points = -signed_points
    base_note = f"Points market rollback {market_row['public_id']} ({market_row['type']})"
    note = f"{base_note} {note_suffix}".strip()
    points_core._insert_bonus_transaction(
        connection,
        client_id=str(market_row["client_id"]),
        client_name=str(market_row["client_name"]),
        points=-signed_points,
        note=note,
        source_type="market_rollback",
        source_ref=str(market_row["public_id"]),
    )
    connection.execute(
        """
        UPDATE points_market_orders
        SET points_applied = 0, updated_at = CURRENT_TIMESTAMP
        WHERE public_id = ?
        """,
        (str(market_row["public_id"]),),
    )


def _load_market_orders(
    *,
    offset: int = 0,
    limit: int = 50,
    search: str = "",
    status: str = "all",
    order_type: str = "all",
) -> Tuple[List[Dict[str, Any]], int]:
    connection = bonus_db()
    try:
        clauses: List[str] = []
        params: List[Any] = []
        normalized_search = search.strip().lower()
        if normalized_search:
            clauses.append(
                "(LOWER(public_id) LIKE ? OR LOWER(client_id) LIKE ? OR LOWER(client_name) LIKE ? OR LOWER(note) LIKE ?)"
            )
            wildcard = f"%{normalized_search}%"
            params.extend([wildcard, wildcard, wildcard, wildcard])

        normalized_status = status.strip().lower()
        if normalized_status and normalized_status != "all":
            clauses.append("LOWER(status) = ?")
            params.append(normalized_status)

        normalized_type = order_type.strip().lower()
        if normalized_type and normalized_type != "all":
            clauses.append("LOWER(type) = ?")
            params.append(normalized_type)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        count_row = connection.execute(
            f"SELECT COUNT(*) AS total FROM points_market_orders {where_sql}",
            tuple(params),
        ).fetchone()
        total_count = int(count_row["total"] or 0)
        rows = connection.execute(
            f"""
            SELECT
                public_id, created_at, updated_at, client_id, client_name, type, points,
                amount_uzs, rate, payment_method, status, note, operator, points_applied
            FROM points_market_orders
            {where_sql}
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            tuple([*params, int(limit), int(offset)]),
        ).fetchall()
    finally:
        connection.close()

    return ([_serialize_market_order_row(row) for row in rows], total_count)


def _load_market_stats() -> Dict[str, Any]:
    connection = bonus_db()
    try:
        stats_row = connection.execute(
            """
            SELECT
                COUNT(*) AS total_count,
                COALESCE(SUM(CASE WHEN LOWER(status) = 'pending' THEN 1 ELSE 0 END), 0) AS pending_count,
                COALESCE(SUM(CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
                COALESCE(SUM(CASE WHEN LOWER(status) IN ('rejected', 'cancelled') THEN 1 ELSE 0 END), 0) AS rejected_count,
                COALESCE(SUM(CASE WHEN LOWER(type) = 'buy' THEN points ELSE 0 END), 0) AS buy_points,
                COALESCE(SUM(CASE WHEN LOWER(type) = 'sell' THEN points ELSE 0 END), 0) AS sell_points,
                COALESCE(SUM(CASE WHEN LOWER(type) = 'buy' THEN amount_uzs ELSE 0 END), 0) AS buy_amount_uzs,
                COALESCE(SUM(CASE WHEN LOWER(type) = 'sell' THEN amount_uzs ELSE 0 END), 0) AS sell_amount_uzs
            FROM points_market_orders
            """
        ).fetchone()
    finally:
        connection.close()

    return {
        "total": int(stats_row["total_count"] or 0),
        "pending": int(stats_row["pending_count"] or 0),
        "completed": int(stats_row["completed_count"] or 0),
        "rejected": int(stats_row["rejected_count"] or 0),
        "buyPoints": int(stats_row["buy_points"] or 0),
        "sellPoints": int(stats_row["sell_points"] or 0),
        "buyAmountUZS": int(stats_row["buy_amount_uzs"] or 0),
        "sellAmountUZS": int(stats_row["sell_amount_uzs"] or 0),
    }


def _create_market_order(payload: MarketOrderCreatePayload) -> Dict[str, Any]:
    normalized_type = _normalize_market_type(payload.type)
    normalized_status = _normalize_market_status(payload.status)
    payment_method = payload.payment_method.strip().lower()
    if normalized_type == "buy" and payment_method not in {"click", "payme", "cash", "bank", ""}:
        raise ValueError("Unsupported payment method")
    if normalized_type == "buy" and not payment_method:
        raise ValueError("Payment method is required for buy operation")

    connection = bonus_db()
    try:
        public_id = _generate_market_order_public_id(connection)
        connection.execute(
            """
            INSERT INTO points_market_orders (
                public_id, client_id, client_name, type, points, amount_uzs, rate,
                payment_method, status, note, operator, points_applied, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
            """,
            (
                public_id,
                payload.client_id.strip(),
                payload.client_name.strip(),
                normalized_type,
                int(payload.points),
                int(payload.amount_uzs),
                int(payload.rate),
                payment_method,
                normalized_status,
                payload.note.strip(),
                payload.operator.strip() or "Admin",
            ),
        )
        market_row = connection.execute(
            "SELECT * FROM points_market_orders WHERE public_id = ?",
            (public_id,),
        ).fetchone()
        if market_row is None:
            raise RuntimeError("Market order was not created")
        if normalized_status == "Completed":
            _apply_market_points_effect(connection, market_row, note_suffix="completed on create")
            market_row = connection.execute(
                "SELECT * FROM points_market_orders WHERE public_id = ?",
                (public_id,),
            ).fetchone()
        connection.commit()
    finally:
        connection.close()

    if market_row is None:
        raise RuntimeError("Market order was not created")
    return _serialize_market_order_row(market_row)


def _update_market_order_status(public_id: str, payload: MarketOrderStatusPayload) -> Optional[Dict[str, Any]]:
    normalized_status = _normalize_market_status(payload.status)
    operator = payload.operator.strip() or "Admin"
    note_append = payload.note.strip()

    connection = bonus_db()
    try:
        row = connection.execute(
            "SELECT * FROM points_market_orders WHERE public_id = ?",
            (public_id,),
        ).fetchone()
        if row is None:
            return None

        current_status = str(row["status"] or "Pending")
        next_note = str(row["note"] or "").strip()
        if note_append:
            next_note = f"{next_note}\n{note_append}".strip() if next_note else note_append

        if current_status != normalized_status:
            if normalized_status == "Completed":
                _apply_market_points_effect(connection, row, note_suffix=f"status by {operator}")
            elif current_status == "Completed" and normalized_status in {"Rejected", "Cancelled", "Pending"}:
                _revert_market_points_effect(connection, row, note_suffix=f"status by {operator}")

        connection.execute(
            """
            UPDATE points_market_orders
            SET status = ?, operator = ?, note = ?, updated_at = CURRENT_TIMESTAMP
            WHERE public_id = ?
            """,
            (normalized_status, operator, next_note, public_id),
        )
        connection.commit()
    finally:
        connection.close()

    reload_connection = bonus_db()
    try:
        next_row = reload_connection.execute(
            "SELECT * FROM points_market_orders WHERE public_id = ?",
            (public_id,),
        ).fetchone()
    finally:
        reload_connection.close()
    if next_row is None:
        return None
    return _serialize_market_order_row(next_row)
