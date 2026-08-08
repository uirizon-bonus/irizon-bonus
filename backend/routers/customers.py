from fastapi import APIRouter, Depends, Query

from backend import deps
from backend.models.schemas import BonusCreatePayload, CustomerUpsertPayload, DeviceTokenPayload, QrScanPayload
from backend.services import customers as customer_service


router = APIRouter(tags=["customers"])


@router.get("/api/clients", dependencies=[Depends(deps.require_admin)])
def get_clients(
    offset: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=5000),
    refresh: bool = Query(False, description="Reload customers from local DB and refresh cache file"),
):
    return customer_service.get_clients_payload(offset=offset, limit=limit, refresh=refresh)


@router.post("/api/clients", dependencies=[Depends(deps.require_admin)])
def create_client(payload: CustomerUpsertPayload):
    return customer_service.create_client_payload(payload)


@router.put("/api/clients/{client_id}", dependencies=[Depends(deps.require_admin)])
def update_client(client_id: str, payload: CustomerUpsertPayload):
    return customer_service.update_client_payload(client_id, payload)


@router.delete("/api/clients/{client_id}", dependencies=[Depends(deps.require_admin)])
def delete_client(client_id: str):
    return customer_service.delete_client_payload(client_id)


@router.get("/api/customers/by-phone", dependencies=[Depends(deps.require_admin)])
def get_customer_by_phone(phone: str = Query(..., min_length=3, max_length=32)):
    return customer_service.get_customer_by_phone_payload(phone)


@router.get("/api/debug/phone-lookup", dependencies=[Depends(deps.require_admin)])
def debug_phone_lookup(
    phone: str = Query(..., min_length=3, max_length=32),
    include_remote: bool = Query(False, description="Also scan SmartUp remote API. This can be slow."),
):
    return customer_service.phone_lookup_debug_payload(phone, include_remote)


@router.get("/api/customer-points", dependencies=[Depends(deps.require_admin)])
def get_customer_points():
    return customer_service.customer_points_payload()


@router.get("/api/clients/{client_id}/activity", dependencies=[Depends(deps.require_admin)])
def get_client_activity(client_id: str):
    return customer_service.client_activity_payload(client_id)


@router.get("/api/customers/{client_id}/portal")
def get_customer_portal(client_id: str, current_id: str = Depends(deps.require_customer)):
    return customer_service.customer_portal_payload(client_id, current_id)


@router.get("/api/customers/{client_id}/requests")
def get_customer_requests(client_id: str, current_id: str = Depends(deps.require_customer)):
    return customer_service.customer_requests_payload(client_id, current_id)


@router.get("/api/customers/{client_id}/activity")
def get_customer_activity(client_id: str, current_id: str = Depends(deps.require_customer)):
    return customer_service.customer_activity_payload(client_id, current_id)


@router.post("/api/customers/{client_id}/bonus", dependencies=[Depends(deps.require_admin)])
def create_customer_bonus(client_id: str, payload: BonusCreatePayload):
    return customer_service.create_customer_bonus_payload(client_id, payload)


@router.post("/api/customers/{client_id}/device-token")
def register_device_token(client_id: str, payload: DeviceTokenPayload, current_id: str = Depends(deps.require_customer)):
    return customer_service.register_device_token_payload(client_id, payload, current_id)


@router.post("/api/customers/{client_id}/scan-qr")
def create_customer_qr_points(client_id: str, payload: QrScanPayload, current_id: str = Depends(deps.require_customer)):
    return customer_service.create_customer_qr_points_payload(client_id, payload, current_id)
