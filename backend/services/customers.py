from typing import Any, Dict

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from backend import legacy
from backend.config import MANUAL_BONUS_MAX, ADMIN_USERNAME
from backend.core import dashboard as dashboard_core
from backend.core import customers as customer_core
from backend.core import points as points_core
from backend.core.catalog import QrScanError
from backend.db import bonus_db
from backend.models.schemas import (
    BonusCreatePayload,
    CustomerDeductPayload,
    CustomerUpsertPayload,
    DeviceTokenPayload,
    QrScanPayload,
)


def get_clients_payload(*, offset: int, limit: int, refresh: bool):
    clients, error = dashboard_core._build_clients(refresh=refresh, offset=offset, limit=limit)
    if error:
        return error
    return {"count": len(clients), "clients": clients}


def create_client_payload(payload: CustomerUpsertPayload):
    try:
        customer = customer_core._create_customer(payload)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    return {"message": "Customer created", "client": customer}


def update_client_payload(client_id: str, payload: CustomerUpsertPayload):
    try:
        customer = customer_core._update_customer(client_id, payload)
    except LookupError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    return {"message": "Customer updated", "client": customer}


def delete_client_payload(client_id: str):
    try:
        customer_core._delete_customer(client_id)
    except LookupError as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=409)
    return {"message": "Customer deleted"}


def get_customer_by_phone_payload(phone: str):
    client = customer_core._get_client_by_phone(phone)
    if client is None:
        return JSONResponse({"error": "Customer not found"}, status_code=404)
    snapshot = customer_core._load_customer_snapshot(str(client.get("id") or ""))
    if snapshot is None:
        return JSONResponse({"error": "Customer not found"}, status_code=404)
    return {"customer": snapshot}


def phone_lookup_debug_payload(phone: str, include_remote: bool):
    return customer_core._phone_lookup_debug(phone, include_remote=include_remote)


def customer_points_payload():
    points = customer_core._load_customer_points()
    return {"count": len(points), "points": points}


def customer_analytics_payload():
    from backend.core import analytics as analytics_core

    return analytics_core._load_customer_analytics()


def customer_reconciliation_payload(client_id: str, start_date: str, end_date: str):
    if start_date > end_date:
        return JSONResponse({"error": "start_date must be less than or equal to end_date"}, status_code=400)
    return customer_core._load_reconciliation(client_id, start_date, end_date)


def customer_portal_payload(client_id: str, current_id: str):
    if client_id != current_id:
        raise HTTPException(status_code=403, detail="Access denied")
    customer = customer_core._load_customer_snapshot(client_id)
    if customer is None:
        return JSONResponse({"error": "Customer not found"}, status_code=404)
    return {"customer": customer}


def customer_requests_payload(client_id: str, current_id: str):
    if client_id != current_id:
        raise HTTPException(status_code=403, detail="Access denied")
    requests = customer_core._load_customer_requests(client_id)
    return {"count": len(requests), "requests": requests}


def customer_activity_payload(client_id: str, current_id: str):
    if client_id != current_id:
        raise HTTPException(status_code=403, detail="Access denied")
    activities = customer_core._load_customer_activity(client_id)
    return {"count": len(activities), "activities": activities}


def create_customer_bonus_payload(client_id: str, payload: BonusCreatePayload):
    if int(payload.points) > MANUAL_BONUS_MAX:
        return JSONResponse(
            {"error": f"Bir martalik bonus {MANUAL_BONUS_MAX:,} balldan oshmasligi kerak"},
            status_code=400,
        )
    operator = ADMIN_USERNAME or "Admin"
    points_core._create_bonus_transaction(
        client_id=str(client_id),
        client_name=payload.full_name.strip(),
        points=int(payload.points),
        note=payload.note,
    )
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="bonus",
            entity="customer",
            entity_id=str(client_id),
            description=f"Manual bonus {int(payload.points)} points",
            actor=operator,
        )
        connection.commit()
    finally:
        connection.close()
    dashboard_core._invalidate_dashboard_cache()

    updated_client = customer_core._load_customer_snapshot(str(client_id))
    if updated_client is None:
        bonus_summary = points_core._load_bonus_totals().get(str(client_id), {})
        updated_points_earned = int(bonus_summary.get("points_earned", payload.current_points_earned + int(payload.points)) or 0)
        last_bonus_at = str(bonus_summary.get("last_bonus_at", "") or payload.last_updated or "")
        updated_client = {
            "id": str(client_id),
            "fullName": payload.full_name.strip(),
            "phone": payload.phone.strip(),
            "totalPoints": updated_points_earned,
            "pointsEarned": updated_points_earned,
            "pointsRedeemed": 0.0,
            "status": "active",
            "lastUpdated": payload.last_updated or last_bonus_at,
        }
    return {"message": "Bonus added", "client": updated_client}


def register_device_token_payload(client_id: str, payload: DeviceTokenPayload, current_id: str):
    if client_id != current_id:
        raise HTTPException(status_code=403, detail="Access denied")
    connection = bonus_db()
    try:
        connection.execute(
            """
            INSERT INTO device_tokens (customer_id, fcm_token, platform, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(fcm_token) DO UPDATE SET
                customer_id = excluded.customer_id,
                platform = excluded.platform,
                updated_at = CURRENT_TIMESTAMP
            """,
            (client_id, payload.fcm_token.strip(), payload.platform.strip()),
        )
        connection.commit()
    finally:
        connection.close()
    return {"message": "Device token registered"}


def update_customer_profile_payload(client_id: str, payload, current_id: str):
    if client_id != current_id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        customer = legacy._set_customer_name(str(client_id), payload.full_name)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    if customer is None:
        return JSONResponse({"error": "Customer not found"}, status_code=404)
    return {"message": "Profile updated", "customer": customer}


def create_customer_qr_points_payload(client_id: str, payload: QrScanPayload, current_id: str):
    if client_id != current_id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        result = legacy._apply_qr_scan(str(client_id), payload)
    except QrScanError as exc:
        body: Dict[str, Any] = {"error": str(exc), "code": exc.code}
        if exc.used_at:
            body["usedAt"] = exc.used_at
        return JSONResponse(body, status_code=400)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="qr_scan",
            entity="customer",
            entity_id=str(client_id),
            description=f"QR scan +{int(result['awardedPoints'])} points",
            actor="System",
        )
        connection.commit()
    finally:
        connection.close()
    return {
        "message": "QR scan applied",
        "awardedPoints": int(result["awardedPoints"]),
        "pointsPerUnit": int(result["pointsPerUnit"]),
        "quantity": int(result["quantity"]),
        "product": result["product"],
        "customer": result["customer"],
    }


def deduct_customer_points_payload(client_id: str, payload: CustomerDeductPayload):
    from backend.core import transactions as transaction_core
    from backend.integrations.firebase_push import send_push_notification

    if payload.reason_code not in points_core.DEDUCT_REASONS:
        return JSONResponse(
            {"error": f"Noma'lum sabab: {payload.reason_code}", "code": "unknown_reason"},
            status_code=400,
        )

    amount = int(payload.points)
    connection = bonus_db()
    try:
        balance = transaction_core._get_client_points_balance(connection, str(client_id))
        # Points already promised to pending gift requests are not the
        # operator's to take — the customer is still owed that gift.
        reserved = transaction_core._get_client_reserved_points(connection, str(client_id))
    finally:
        connection.close()
    available = balance - reserved

    if amount > available and not payload.force:
        return JSONResponse(
            {
                "error": (
                    f"Yechib bo'lmaydi: mavjud {available} ball "
                    f"(balans {balance}, so'rovlarda band {reserved}), yechmoqchi {amount} ball"
                ),
                "code": "insufficient_points",
                "available": available,
                "balance": balance,
                "reserved": reserved,
                "requested": amount,
            },
            status_code=400,
        )

    snapshot = customer_core._load_customer_snapshot(str(client_id))
    client_name = (payload.full_name or "").strip() or (snapshot or {}).get("fullName", "") or str(client_id)

    new_balance = points_core._create_manual_debit(
        client_id=str(client_id),
        client_name=client_name,
        points=amount,
        reason_code=payload.reason_code,
        note=payload.note,
    )

    operator = ADMIN_USERNAME or "Admin"
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="bonus_deduct",
            entity="customer",
            entity_id=str(client_id),
            description=(
                f"Deducted {amount} points ({payload.reason_code}): {payload.note.strip()}"
                + (f" | FORCED over available {available}" if amount > available else "")
            ),
            actor=operator,
        )
        connection.commit()
    finally:
        connection.close()
    dashboard_core._invalidate_dashboard_cache()

    if payload.notify:
        try:
            send_push_notification(
                str(client_id),
                "Ballaringiz o'zgardi",
                f"-{amount:,} ball. {points_core._deduct_reason_label(payload.reason_code)}: "
                f"{payload.note.strip()} Balans: {new_balance:,} ball".replace(",", " "),
            )
        except Exception as exc:  # a failed push must not undo a recorded deduction
            legacy.logger.warning("Deduct push failed for %s: %s", client_id, exc)

    return {
        "message": "Points deducted",
        "clientId": str(client_id),
        "deducted": amount,
        "balance": new_balance,
        "forced": amount > available,
        "client": customer_core._load_customer_snapshot(str(client_id)),
    }
