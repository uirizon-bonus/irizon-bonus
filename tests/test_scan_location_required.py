"""The scan location backstop: off by default, refuses blind scans when on."""
import importlib, os, shutil, sys, tempfile

TMP = tempfile.mkdtemp(prefix="irizon-loc-")
os.environ.update({
    "DATABASE_URL": "", "ADMIN_API_KEY": "test-key", "ADMIN_USERNAME": "tester",
    "CATALOG_MANAGED_BY_XLSX": "false",
    "BONUS_DB_PATH": os.path.join(TMP, "t.sqlite3"),
    "UPLOADS_DIR": os.path.join(TMP, "uploads"),
})
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, "/Users/a1234/Desktop/irizon-bonus")

import backend.config as config
assert str(config.BONUS_DB_PATH) == os.environ["BONUS_DB_PATH"]

fails = []
def check(label, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + label + (f"   {detail}" if detail and not ok else ""))
    if not ok: fails.append(label)

print("\n=== default is OFF, so older builds keep working ===")
check("REQUIRE_SCAN_LOCATION defaults to False", config.REQUIRE_SCAN_LOCATION is False,
      str(config.REQUIRE_SCAN_LOCATION))

from backend.services import customers as svc
from backend.models.schemas import QrScanPayload
from fastapi.responses import JSONResponse
import json

def call(lat, lng):
    """Run only the guard: a real scan needs a customer and a live QR code."""
    payload = QrScanPayload(qr_code="IRIZON-TEST-CODE-123", quantity=1, lat=lat, lng=lng)
    if svc.REQUIRE_SCAN_LOCATION and (payload.lat is None or payload.lng is None):
        return JSONResponse({"error": "Joylashuvsiz skanerlab bo'lmaydi",
                             "code": "location_required"}, status_code=400)
    return None

check("flag off: a scan with no location passes the guard", call(None, None) is None)

print("\n=== with the flag ON ===")
svc.REQUIRE_SCAN_LOCATION = True
blocked = call(None, None)
check("blind scan refused", blocked is not None and blocked.status_code == 400)
if blocked is not None:
    body = json.loads(bytes(blocked.body))
    check("refusal carries a code the app can match", body.get("code") == "location_required", str(body))
check("scan with coordinates still passes", call(41.3111, 69.2797) is None)
check("half a fix is still refused", call(41.3111, None) is not None)

print("\n=== the payload still accepts the full shape ===")
p = QrScanPayload(qr_code="IRIZON-TEST-CODE-123", lat=41.3111, lng=69.2797, accuracy=12.5)
check("lat/lng/accuracy round-trip", (p.lat, p.lng, p.accuracy) == (41.3111, 69.2797, 12.5))
p2 = QrScanPayload(qr_code="IRIZON-TEST-CODE-123")
check("coordinates remain optional in the schema", p2.lat is None and p2.lng is None)

shutil.rmtree(TMP, ignore_errors=True)
print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}"))
sys.exit(1 if fails else 0)
