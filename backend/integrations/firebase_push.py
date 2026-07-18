import os
import threading
from typing import Any, Dict, List

from backend.config import APP_DISPLAY_NAME, FIREBASE_SERVICE_ACCOUNT, logger
from backend.db import bonus_db

try:
    import firebase_admin
    from firebase_admin import credentials as fb_credentials, messaging as fb_messaging
except Exception:
    firebase_admin = None  # type: ignore[assignment]
    fb_credentials = None
    fb_messaging = None


_firebase_app = None

_STATUS_PUSH = {
    "Approved": (
        "Ariza tasdiqlandi",
        "{gift} sovg'asi tasdiqlandi. Tayyor bo'lganda sizga xabar beramiz.",
    ),
    "Rejected": (
        "Ariza rad etildi",
        "{gift} sovg'asi bo'yicha ariza rad etildi. Batafsil ma'lumot ilovada.",
    ),
    "Shipped": (
        "Sovg'a yo'lda",
        "{gift} sovg'asi yetkazib berishga topshirildi. Status yangilanishini kuting.",
    ),
    "Delivered": (
        "Sovg'a tayyor",
        "{gift} sovg'asi olish uchun tayyor.",
    ),
    "Completed": (
        "Sovg'a olindi",
        "{gift} sovg'asi bo'yicha ariza muvaffaqiyatli yakunlandi.",
    ),
    "Processing": (
        "Ariza ko'rib chiqilmoqda",
        "{gift} sovg'asi bo'yicha ariza qabul qilindi va ko'rib chiqilmoqda.",
    ),
    "Pending": (
        "Ariza qabul qilindi",
        "{gift} sovg'asi bo'yicha ariza yaratildi va ko'rib chiqishni kutmoqda.",
    ),
}


def ensure_firebase() -> bool:
    global _firebase_app
    if _firebase_app is not None:
        return True
    if firebase_admin is None:
        logger.warning("FCM: firebase_admin package not installed")
        return False
    abs_path = os.path.abspath(FIREBASE_SERVICE_ACCOUNT)
    if not os.path.exists(abs_path):
        logger.warning("FCM: service account not found at %s", abs_path)
        return False
    try:
        cred = fb_credentials.Certificate(abs_path)
        _firebase_app = firebase_admin.initialize_app(cred)
        logger.info("FCM: firebase initialized from %s", abs_path)
        return True
    except Exception as exc:
        logger.warning("FCM: firebase init failed: %s", exc)
        return False


def build_push_message(token: str, title: str, body: str) -> Any:
    clean_title = str(title or APP_DISPLAY_NAME).strip()[:120] or APP_DISPLAY_NAME
    clean_body = str(body or "").strip()[:1000]
    return fb_messaging.Message(
        notification=fb_messaging.Notification(title=clean_title, body=clean_body),
        android=fb_messaging.AndroidConfig(
            priority="high",
            notification=fb_messaging.AndroidNotification(
                title=clean_title,
                body=clean_body,
                channel_id="irizon_bonus",
                color="#1E6FD9",
                sound="default",
                default_sound=True,
                default_vibrate_timings=True,
            ),
        ),
        data={
            "title": clean_title,
            "body": clean_body,
            "source": "irizon_bonus",
        },
        token=token,
    )


def send_push_notification(customer_id: str, title: str, body: str) -> None:
    logger.info("FCM: sending to customer_id=%s title=%r", customer_id, title)
    if not ensure_firebase():
        logger.warning("FCM: firebase not ready, skipping notification")
        return
    connection = bonus_db()
    try:
        rows = connection.execute(
            "SELECT fcm_token FROM device_tokens WHERE customer_id = ?",
            (customer_id,),
        ).fetchall()
    finally:
        connection.close()
    tokens = [str(row["fcm_token"]) for row in rows if row["fcm_token"]]
    logger.info("FCM: found %d token(s) for customer_id=%s", len(tokens), customer_id)
    for token in tokens:
        try:
            msg_id = fb_messaging.send(build_push_message(token, title, body))
            logger.info("FCM: sent OK message_id=%s", msg_id)
        except Exception as exc:
            logger.warning("FCM: send failed token=%s... error=%s", token[:20], exc)


def send_push_to_tokens(tokens: List[str], title: str, body: str) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for token in tokens:
        try:
            msg_id = fb_messaging.send(build_push_message(token, title, body))
            results.append({"token": token[:20] + "...", "status": "ok", "messageId": msg_id})
        except Exception as exc:
            logger.warning("FCM: send failed token=%s... error=%s", token[:20], exc)
            results.append({"token": token[:20] + "...", "status": "error", "error": str(exc)})
    return results


def notify_request_status(customer_id: str, gift_name: str, status: str) -> None:
    logger.info("FCM: _notify_request_status called customer_id=%r status=%r gift=%r", customer_id, status, gift_name)
    entry = _STATUS_PUSH.get(status)
    if not entry:
        logger.info("FCM: status %r not in notification map, skipping", status)
        return
    if not customer_id:
        logger.info("FCM: customer_id is empty, skipping")
        return
    title, body_tpl = entry
    body = body_tpl.format(gift=gift_name) if gift_name else title
    logger.info("FCM: starting thread for customer_id=%s", customer_id)
    threading.Thread(
        target=send_push_notification,
        args=(customer_id, title, body),
        daemon=True,
    ).start()
