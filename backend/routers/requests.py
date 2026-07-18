from fastapi import APIRouter, Depends

from backend import deps
from backend.models.schemas import RedemptionRequestBulkStatusPayload, RedemptionRequestCreatePayload, RedemptionRequestStatusPayload
from backend.services import requests as requests_service


router = APIRouter(tags=["requests"])


@router.get("/api/requests", dependencies=[Depends(deps.require_admin)])
def get_requests():
    return requests_service.get_requests_payload()


@router.post("/api/requests", dependencies=[Depends(deps.require_admin_or_customer)])
def create_request(payload: RedemptionRequestCreatePayload):
    return requests_service.create_request_payload(payload)


@router.put("/api/requests/{request_id}/status", dependencies=[Depends(deps.require_admin)])
def update_request_status(request_id: str, payload: RedemptionRequestStatusPayload):
    return requests_service.update_request_status_payload(request_id, payload)


@router.put("/api/requests/bulk-status", dependencies=[Depends(deps.require_admin)])
def update_requests_status_bulk(payload: RedemptionRequestBulkStatusPayload):
    return requests_service.update_requests_status_bulk_payload(payload)
