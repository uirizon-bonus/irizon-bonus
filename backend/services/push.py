import os

from fastapi.responses import JSONResponse

from backend import legacy
from backend.config import FIREBASE_SERVICE_ACCOUNT
from backend.db import bonus_db
from backend.integrations import firebase_push
from backend.models.schemas import PushNotificationPayload


def get_push_notification_status_payload():
    abs_path = os.path.abspath(FIREBASE_SERVICE_ACCOUNT)
    firebase_ready = firebase_push.ensure_firebase()
    connection = bonus_db()
    try:
        rows = connection.execute(
            "SELECT customer_id, platform, updated_at FROM device_tokens ORDER BY updated_at DESC LIMIT 50"
        ).fetchall()
    finally:
        connection.close()
    tokens = [{"customerId": str(r["customer_id"]), "platform": str(r["platform"]), "updatedAt": str(r["updated_at"])} for r in rows]
    return {
        "firebaseAdminInstalled": firebase_push.firebase_admin is not None,
        "serviceAccountPath": abs_path,
        "serviceAccountExists": os.path.exists(abs_path),
        "firebaseReady": firebase_ready,
        "deviceTokenCount": len(tokens),
        "deviceTokens": tokens,
    }


def send_push_notification_payload(payload: PushNotificationPayload):
    if not firebase_push.ensure_firebase():
        return JSONResponse({"error": "Firebase is not ready. Check service account configuration."}, status_code=500)

    audience = str(payload.audience or "customer").strip().lower()
    if audience not in {"customer", "all"}:
        return JSONResponse({"error": "audience must be 'customer' or 'all'"}, status_code=400)

    customer_id = str(payload.customer_id or "").strip()
    if audience == "customer" and not customer_id:
        return JSONResponse({"error": "customer_id is required for customer audience"}, status_code=400)

    connection = bonus_db()
    try:
        if audience == "all":
            rows = connection.execute("SELECT DISTINCT fcm_token FROM device_tokens").fetchall()
        else:
            rows = connection.execute(
                "SELECT fcm_token FROM device_tokens WHERE customer_id = ?",
                (customer_id,),
            ).fetchall()
        tokens = [str(row["fcm_token"]) for row in rows if row["fcm_token"]]
        if not tokens:
            target = "all customers" if audience == "all" else f"customer_id={customer_id}"
            return JSONResponse({"error": f"No device tokens for {target}"}, status_code=404)

        results = firebase_push.send_push_to_tokens(tokens, payload.title.strip(), payload.body.strip())
        sent_count = len([result for result in results if result["status"] == "ok"])
        legacy._audit_log(
            connection,
            action="send",
            entity="push_notification",
            entity_id=customer_id if audience == "customer" else "all",
            description=f"Sent push notification to {sent_count}/{len(tokens)} device(s): {payload.title.strip()}",
            actor="Admin",
        )
        connection.commit()
    finally:
        connection.close()

    return {
        "message": "Push notification sent",
        "audience": audience,
        "customerId": customer_id,
        "targeted": len(tokens),
        "sent": sent_count,
        "failed": len(tokens) - sent_count,
        "results": results,
    }


def debug_push_test_payload(customer_id: str, title: str, body: str):
    return send_push_notification_payload(
        PushNotificationPayload(customer_id=customer_id, title=title, body=body)
    )
