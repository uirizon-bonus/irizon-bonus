from fastapi import APIRouter, Depends, Query

from backend import deps
from backend.models.schemas import PushNotificationPayload
from backend.services import push as push_service


router = APIRouter(tags=["push"])


@router.get("/api/debug/push-status", dependencies=[Depends(deps.require_admin)])
def debug_push_status():
    return push_service.get_push_notification_status_payload()


@router.get("/api/push-notifications/status", dependencies=[Depends(deps.require_admin)])
def get_push_notification_status():
    return push_service.get_push_notification_status_payload()


@router.post("/api/push-notifications/send", dependencies=[Depends(deps.require_admin)])
def send_push_notification(payload: PushNotificationPayload):
    return push_service.send_push_notification_payload(payload)


@router.post("/api/debug/push-test", dependencies=[Depends(deps.require_admin)])
def debug_push_test(
    customer_id: str = Query(...),
    title: str = Query(default="Test"),
    body: str = Query(default="Push notification test"),
):
    return push_service.debug_push_test_payload(customer_id, title, body)
