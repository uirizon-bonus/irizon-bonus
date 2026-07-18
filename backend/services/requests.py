from fastapi.responses import JSONResponse

from backend import legacy
from backend.core import dashboard as dashboard_core
from backend.core import transactions as transaction_core
from backend.db import bonus_db
from backend.integrations.firebase_push import notify_request_status
from backend.models.schemas import RedemptionRequestBulkStatusPayload, RedemptionRequestCreatePayload, RedemptionRequestStatusPayload


def get_requests_payload():
    requests_data = transaction_core._load_requests()
    return {"count": len(requests_data), "requests": requests_data}


def create_request_payload(payload: RedemptionRequestCreatePayload):
    try:
        request = transaction_core._create_request(payload)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="create",
            entity="request",
            entity_id=str(request.get("id")),
            description=f"Created request {request.get('id')}",
            actor=str(payload.operator or "Admin"),
        )
        connection.commit()
    finally:
        connection.close()
    dashboard_core._invalidate_dashboard_cache()
    return {"message": "Request created", "request": request}


def update_request_status_payload(request_id: str, payload: RedemptionRequestStatusPayload):
    try:
        request = transaction_core._update_request_status(request_id, payload)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    if request is None:
        return JSONResponse({"error": "Request not found"}, status_code=404)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="status_change",
            entity="request",
            entity_id=str(request_id),
            description=f"Request {request_id} status {payload.status}",
            actor=str(payload.operator or "Admin"),
        )
        connection.commit()
    finally:
        connection.close()
    dashboard_core._invalidate_dashboard_cache()
    notify_request_status(
        customer_id=str(request.get("customerId", "")),
        gift_name=str(request.get("giftName", "")),
        status=payload.status,
    )
    return {"message": "Request updated", "request": request}


def update_requests_status_bulk_payload(payload: RedemptionRequestBulkStatusPayload):
    try:
        updated_requests = transaction_core._update_requests_status_bulk(payload)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)

    if not updated_requests:
        return JSONResponse({"error": "Requests not found"}, status_code=404)

    dashboard_core._invalidate_dashboard_cache()
    for req in updated_requests:
        notify_request_status(
            customer_id=str(req.get("customerId", "")),
            gift_name=str(req.get("giftName", "")),
            status=payload.status,
        )
    return {
        "message": "Requests updated",
        "requests": updated_requests,
        "count": len(updated_requests),
    }
