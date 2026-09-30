"""Phase 1 smoke test: migration, product ordering fields, price guard, uploads."""
import io, os, shutil, sys, tempfile, zlib, struct

TMP = tempfile.mkdtemp(prefix="irizon-phase1-")
os.environ["DATABASE_URL"] = ""
os.environ["UPLOADS_DIR"] = os.path.join(TMP, "uploads")
os.environ["ADMIN_API_KEY"] = "test-key"
os.environ["ADMIN_USERNAME"] = "tester"
os.environ["CATALOG_MANAGED_BY_XLSX"] = "false"
# Set before any backend import: importing the package builds the whole app, so
# a later assignment would come too late and the run would land on the working
# copy's own database.
os.environ["BONUS_DB_PATH"] = os.path.join(TMP, "test.sqlite3")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import backend.config as config
assert str(config.BONUS_DB_PATH) == os.environ["BONUS_DB_PATH"], "test would write to the real db"

from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)
H = {"x-admin-key": "test-key"}
fails = []

def check(label, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + label + (f"   {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(label)

print("\n=== migration ===")
import sqlite3
con = sqlite3.connect(str(config.BONUS_DB_PATH))
cols = {r[1] for r in con.execute("PRAGMA table_info(products)")}
con.close()
for c in ("points_price", "order_stock", "is_orderable", "description_ru",
          "image", "images", "smartup_product_id", "smartup_code"):
    check(f"products.{c} exists", c in cols)

print("\n=== create a product with an order price ===")
r = client.post("/api/products", headers=H, json={
    "name": "Свечи зажигания IRIZON PRC COBALT", "points_value": 110,
    "category": "IRIZON", "sku": "1572", "is_active": True,
    "points_price": 1350, "order_stock": 40, "is_orderable": True,
    "description": "Test", "image": "", "images": [],
    "smartup_product_id": "5190844", "smartup_code": "1572",
})
check("created", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
product = r.json().get("product", {}) if r.status_code == 200 else {}
pid = product.get("id", "")
check("pointsPrice round-trips", product.get("pointsPrice") == 1350, str(product.get("pointsPrice")))
check("orderStock round-trips", product.get("orderStock") == 40)
check("isOrderable round-trips", product.get("isOrderable") is True)
check("smartupCode round-trips", product.get("smartupCode") == "1572")
check("pointsValue untouched", product.get("pointsValue") == 110)

print("\n=== the guard: price at or below scan payout ===")
r = client.post("/api/products", headers=H, json={
    "name": "Муштук бабина IRIZON", "points_value": 400, "is_active": True,
    "points_price": 125, "order_stock": 10, "is_orderable": True,
})
check("refused with 400", r.status_code == 400, f"{r.status_code} {r.text[:200]}")
check("names the reason", r.json().get("error") == "price_below_earn", r.text[:200])
check("reports both numbers",
      r.json().get("pointsPrice") == 125 and r.json().get("pointsValue") == 400, r.text[:200])

r = client.post("/api/products", headers=H, json={
    "name": "Муштук бабина IRIZON", "points_value": 400, "is_active": True,
    "points_price": 400, "order_stock": 10, "is_orderable": True,
})
check("equal price also refused", r.status_code == 400, str(r.status_code))

r = client.post("/api/products", headers=H, json={
    "name": "Муштук бабина IRIZON (override)", "points_value": 400, "is_active": True,
    "points_price": 125, "order_stock": 10, "is_orderable": True,
    "allow_price_below_earn": True,
})
check("override is accepted", r.status_code == 200, f"{r.status_code} {r.text[:200]}")

r = client.post("/api/products", headers=H, json={
    "name": "Earn-only product", "points_value": 400, "is_active": True,
    "points_price": 125, "order_stock": 0, "is_orderable": False,
})
check("earn-only product is not policed", r.status_code == 200, str(r.status_code))

print("\n=== the override is written to the audit log ===")
con = sqlite3.connect(str(config.BONUS_DB_PATH))
rows = con.execute(
    "SELECT action, description FROM audit_events WHERE action = 'price_below_earn_override'"
).fetchall()
con.close()
check("override audited exactly once", len(rows) == 1, f"{len(rows)} rows")
if rows:
    check("audit names both numbers", "125" in rows[0][1] and "400" in rows[0][1], rows[0][1])

print("\n=== update path is guarded too ===")
r = client.put(f"/api/products/{pid}", headers=H, json={
    "name": "Свечи зажигания IRIZON PRC COBALT", "points_value": 110,
    "is_active": True, "points_price": 100, "order_stock": 40, "is_orderable": True,
})
check("update refused below earn", r.status_code == 400, str(r.status_code))

print("\n=== a legacy edit must not wipe the ordering fields ===")
# Exactly what the existing admin product form posts: no ordering fields at all.
r = client.put(f"/api/products/{pid}", headers=H, json={
    "name": "Свечи зажигания IRIZON PRC COBALT (renamed)", "points_value": 110,
    "category": "IRIZON", "sku": "1572", "is_active": True,
})
check("legacy edit accepted", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
after = r.json().get("product", {}) if r.status_code == 200 else {}
check("name did change", after.get("name", {}).get("RU", "").endswith("(renamed)"), str(after.get("name")))
check("pointsPrice survived", after.get("pointsPrice") == 1350, str(after.get("pointsPrice")))
check("orderStock survived", after.get("orderStock") == 40, str(after.get("orderStock")))
check("isOrderable survived", after.get("isOrderable") is True, str(after.get("isOrderable")))
check("smartupCode survived", after.get("smartupCode") == "1572", str(after.get("smartupCode")))

r = client.put(f"/api/products/{pid}", headers=H, json={
    "name": "Свечи зажигания IRIZON PRC COBALT (renamed)", "points_value": 110,
    "order_stock": 7,
})
check("partial stock edit works", r.status_code == 200 and r.json()["product"]["orderStock"] == 7,
      r.text[:200])
check("price still survived", r.json()["product"]["pointsPrice"] == 1350)

# Raising the scan payout above the existing price must be caught, even though
# the request says nothing about the price.
r = client.put(f"/api/products/{pid}", headers=H, json={
    "name": "Свечи зажигания IRIZON PRC COBALT (renamed)", "points_value": 5000,
})
check("raising scan payout above the price is refused", r.status_code == 400, f"{r.status_code} {r.text[:160]}")

print("\n=== image upload ===")
def png(w=8, h=8):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))

r = client.post("/api/uploads/image", headers=H, files={"file": ("photo.png", png(), "image/png")})
check("upload accepted", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
url = r.json().get("url", "") if r.status_code == 200 else ""
path = r.json().get("path", "") if r.status_code == 200 else ""
check("returns an absolute url", url.startswith("http"), url)
check("file is on disk", os.path.exists(os.path.join(os.environ["UPLOADS_DIR"], path)), path)

got = client.get("/uploads/" + path)
check("served back over http", got.status_code == 200 and got.content[:8] == b"\x89PNG\r\n\x1a\n", str(got.status_code))

r2 = client.post("/api/uploads/image", headers=H, files={"file": ("again.png", png(), "image/png")})
check("same bytes reuse one file", r2.json().get("path") == path, f'{r2.json().get("path")} vs {path}')

r = client.post("/api/uploads/image", headers=H,
                files={"file": ("evil.png", b"<html>not an image</html>", "image/png")})
check("non-image refused despite .png name", r.status_code == 400, str(r.status_code))
check("refusal names the type", r.json().get("error") == "unsupported_type", r.text[:160])

r = client.post("/api/uploads/image", headers=H,
                files={"file": ("big.png", png() + b"\x00" * (7 * 1024 * 1024), "image/png")})
check("oversized refused", r.status_code == 400 and r.json().get("error") == "too_large", r.text[:160])

r = client.post("/api/uploads/image", files={"file": ("photo.png", png(), "image/png")})
check("upload needs admin auth", r.status_code in (401, 403), str(r.status_code))

print("\n=== existing behaviour still intact ===")
r = client.get("/api/products")
check("product list loads", r.status_code == 200, str(r.status_code))
if r.status_code == 200:
    items = r.json().get("products", [])
    check("list includes the new fields",
          all("pointsPrice" in p and "isOrderable" in p for p in items))
    check("qrCode still generated", all(p.get("qrCode") for p in items))

shutil.rmtree(TMP, ignore_errors=True)
print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}"))
sys.exit(1 if fails else 0)
