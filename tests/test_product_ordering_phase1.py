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
# Stock is owned by the SmartUp sync. A number in the payload is ignored on
# purpose: typed stock is wrong the moment the warehouse ships something.
check("payload order_stock is ignored", product.get("orderStock") == 0, str(product.get("orderStock")))
check("isOrderable round-trips", product.get("isOrderable") is True)
check("smartupCode round-trips", product.get("smartupCode") == "1572")
check("smartupLinked reported", product.get("smartupLinked") is True)
check("pointsValue untouched", product.get("pointsValue") == 110)

print("\n=== a shop product must be linked to SmartUp ===")
r = client.post("/api/products", headers=H, json={
    "name": "Bog'lanmagan mahsulot", "points_value": 10, "is_active": True,
    "points_price": 500, "is_orderable": True,
})
check("unlinked product refused", r.status_code == 400, f"{r.status_code} {r.text[:160]}")
check("names the reason", r.json().get("error") == "smartup_link_required", r.text[:160])

r = client.post("/api/products", headers=H, json={
    "name": "Katalogda qoladi", "points_value": 10, "is_active": True,
    "points_price": 500, "is_orderable": False,
})
check("unlinked earn-only product is fine", r.status_code == 200, str(r.status_code))

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
    "points_price": 125, "is_orderable": True, "allow_price_below_earn": True,
    "smartup_product_id": "3438834", "smartup_code": "1399",
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
check("isOrderable survived", after.get("isOrderable") is True, str(after.get("isOrderable")))
check("smartupCode survived", after.get("smartupCode") == "1572", str(after.get("smartupCode")))
check("image survived", after.get("image") == "", str(after.get("image")))

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

print("\n=== SmartUp mirror: search and stock ===")
# Seed the mirror directly. The real sync fetches this from SmartUp; what is
# under test here is everything that happens to the data afterwards.
from backend.core import smartup_sync as _sync
seed = [
    ("5190844", "1572", "Свечи зажигания IRIZON PRC IZ62N199 COBALT", "COBALT", "irizon", 455),
    ("3438834", "1399", "Муштук бабина Irizon PRC 0788B", "COBALT", "", 12092),
    ("2127375", "51", "Муштук бабина MP PRC 0788B", "COBALT", "Муштук", 0),
]
con = sqlite3.connect(str(config.BONUS_DB_PATH))
con.executemany(
    "INSERT INTO smartup_inventory (product_id, code, name, model, part_type, state,"
    " stock_main, synced_at, search_blob)"
    " VALUES (?, ?, ?, ?, ?, 'A', ?, '2026-10-01T09:00:00+00:00', ?)",
    [row + (_sync.search_blob(row[2], row[1]),) for row in seed],
)
con.commit(); con.close()

r = client.get("/api/smartup/inventory", headers=H, params={"q": "свечи"})
check("search finds a Cyrillic name", r.status_code == 200 and len(r.json()["items"]) == 1, r.text[:160])
r = client.get("/api/smartup/inventory", headers=H, params={"q": "СВЕЧИ"})
check("search folds Cyrillic case", len(r.json()["items"]) == 1, r.text[:160])
r = client.get("/api/smartup/inventory", headers=H, params={"q": "Муштук"})
check("search matches mid-catalogue Cyrillic", len(r.json()["items"]) == 2, str(len(r.json()["items"])))
r = client.get("/api/smartup/inventory", headers=H, params={"q": "1399"})
check("search finds by code", r.status_code == 200 and r.json()["items"][0]["code"] == "1399", r.text[:160])
r = client.get("/api/smartup/inventory", headers=H, params={"in_stock": "true"})
check("in-stock filter drops the empty one", len(r.json()["items"]) == 2, str(len(r.json()["items"])))
check("sync state reported", r.json()["sync"]["catalogueCount"] == 3, r.text[:200])
r = client.get("/api/smartup/inventory")
check("search needs admin auth", r.status_code in (401, 403), str(r.status_code))

print("\n=== stock flows from the mirror onto linked products ===")
from backend.core import smartup_sync
con = sqlite3.connect(str(config.BONUS_DB_PATH))
con.row_factory = sqlite3.Row
# bonus_db() is what the applier uses; call it through the same helper.
from backend.db import bonus_db
connection = bonus_db()
try:
    applied = smartup_sync._apply_stock_to_products(connection, "2026-10-01T09:05:00+00:00")
    connection.commit()
finally:
    connection.close()
con.close()
check("applied to the linked products", applied >= 2, str(applied))

r = client.get("/api/products", headers=H)
by_id = {p["id"]: p for p in r.json()["products"]}
check("linked by product_id got its stock", by_id[pid]["orderStock"] == 455, str(by_id[pid]["orderStock"]))
check("stockSyncedAt recorded", bool(by_id[pid]["stockSyncedAt"]), str(by_id[pid].get("stockSyncedAt")))
unlinked = [p for p in by_id.values() if not p["smartupLinked"]]
check("unlinked products keep zero stock", all(p["orderStock"] == 0 for p in unlinked),
      str([(p["id"], p["orderStock"]) for p in unlinked]))

check("stock_for resolves by id", smartup_sync.stock_for(smartup_product_id="3438834") == 12092)
check("stock_for resolves by code", smartup_sync.stock_for(smartup_code="51") == 0)
check("stock_for is None when unlinked", smartup_sync.stock_for() is None)

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
