"""Push notifications with a picture and a tap destination."""
import os, shutil, sys, tempfile

TMP = tempfile.mkdtemp(prefix="irizon-push-")
os.environ.update({
    "DATABASE_URL": "", "ADMIN_API_KEY": "test-key", "ADMIN_USERNAME": "tester",
    "BONUS_DB_PATH": os.path.join(TMP, "t.sqlite3"),
    "UPLOADS_DIR": os.path.join(TMP, "uploads"),
})
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

fails = []
def check(label, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + label + (f"   {detail}" if detail and not ok else ""))
    if not ok: fails.append(label)

from backend.integrations import firebase_push as fp
from backend.models.schemas import PushNotificationPayload

print("\n=== the payload accepts a picture and a link ===")
p = PushNotificationPayload(title="T", body="B", image_url="https://api.irizon.uz/uploads/push/a.png",
                            link_url="https://irizon.uz/promo")
check("image_url accepted", p.image_url.endswith("a.png"))
check("link_url accepted", p.link_url.endswith("/promo"))
check("both optional", PushNotificationPayload(title="T", body="B").image_url == "")

print("\n=== only an address Firebase can fetch is used ===")
check("https kept", fp._public_image_url("https://api.irizon.uz/uploads/push/a.png").endswith("a.png"))
check("http kept", fp._public_image_url("http://example.com/a.png").endswith("a.png"))
check("relative path dropped", fp._public_image_url("/uploads/push/a.png") == "")
check("empty stays empty", fp._public_image_url("") == "")
check("javascript: dropped", fp._public_image_url("javascript:alert(1)") == "")

print("\n=== the built message ===")
if fp.fb_messaging is None:
    print("  SKIP  firebase_admin not installed in this environment")
else:
    IMG = "https://api.irizon.uz/uploads/push/a.png"
    m = fp.build_push_message("tok", "Title", "Body", image_url=IMG)
    check("notification carries the image", m.notification.image == IMG, str(m.notification.image))
    check("android carries the image", m.android.notification.image == IMG)
    check("apns marked mutable so iOS can render it later", m.apns.payload.aps.mutable_content is True)
    check("apns fcm_options carries the image", m.apns.fcm_options.image == IMG)
    check("data carries the image for the app itself", m.data.get("image") == IMG)

    print("\n  -- destinations --")
    g = fp.build_push_message("tok", "T", "B", gift_id="G-1042")
    check("gift sets screen=gift", g.data.get("screen") == "gift" and g.data.get("giftId") == "G-1042", str(g.data))

    u = fp.build_push_message("tok", "T", "B", link_url="https://irizon.uz/promo")
    check("link sets screen=url", u.data.get("screen") == "url" and u.data.get("url") == "https://irizon.uz/promo", str(u.data))

    both = fp.build_push_message("tok", "T", "B", gift_id="G-1", link_url="https://irizon.uz/x")
    check("a gift wins over a link (one tap, one destination)",
          both.data.get("screen") == "gift" and "url" not in both.data, str(both.data))

    bad = fp.build_push_message("tok", "T", "B", link_url="javascript:alert(1)")
    check("a non-http link is no destination at all", "screen" not in bad.data, str(bad.data))

    plain = fp.build_push_message("tok", "T", "B")
    check("no image, no link: unchanged behaviour", plain.notification.image is None and "screen" not in plain.data)
    check("plain message still has title/body in data", plain.data.get("title") == "T")

shutil.rmtree(TMP, ignore_errors=True)
print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}"))
sys.exit(1 if fails else 0)
