"""Reading the SmartUp catalogue and warehouse stock for the points shop.

This talks to SmartUp's *integration* API — JSON in, JSON out, context in
headers — which is a different family from the xlsx report endpoints used by
the dashboard (`/b/trade/rep/...:run`).

Two rules shape everything here:

* **Only Основной склад counts.** Four of the eight warehouses are брак
  (defective) stores, and the second-largest pile of stock sits in one of them.
  Summing every warehouse would offer customers damaged parts.
* **The whole company shares 500 API calls a day.** So the catalogue and the
  balance are mirrored into `smartup_inventory`, and every search, page load
  and stock read is served from that mirror rather than from SmartUp.
"""

from __future__ import annotations

import base64
import json
import logging
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.config import (
    SMARTUP_API_BASE,
    SMARTUP_INTEGRATION_TIMEOUT,
    SMARTUP_LOGIN,
    SMARTUP_PASSWORD,
    SMARTUP_PROJECT_CODE,
    SMARTUP_SYNC_MIN_INTERVAL_SEC,
    SMARTUP_WAREHOUSE_ID,
    DEFAULT_FILIAL_ID,
)
from backend.db import bonus_db

logger = logging.getLogger("clients_api")

CATALOGUE_PATH = "/b/anor/mxsx/mr/inventory$export"
BALANCE_PATH = "/b/anor/mxsx/mkw/balance$export"

# Product group ids in this tenant: 11708 is the car model, 11709 the part type.
GROUP_MODEL = "11708"
GROUP_PART = "11709"


class SmartUpUnavailable(RuntimeError):
    """SmartUp could not be reached or refused the request."""

    def __init__(self, message: str, status: int = 0) -> None:
        super().__init__(message)
        self.status = status

    def as_payload(self) -> Dict[str, Any]:
        return {"error": "smartup_unavailable", "message": str(self), "status": self.status}


def _post(path: str, body: Dict[str, Any]) -> Dict[str, Any]:
    if not SMARTUP_LOGIN or not SMARTUP_PASSWORD:
        raise SmartUpUnavailable("SMARTUP_LOGIN / SMARTUP_PASSWORD env not set")

    token = base64.b64encode(f"{SMARTUP_LOGIN}:{SMARTUP_PASSWORD}".encode()).decode()
    request = urllib.request.Request(
        SMARTUP_API_BASE + path,
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Authorization": "Basic " + token,
            "Content-Type": "application/json",
            "Accept": "application/json",
            # SmartUp takes the working context in headers, not the body.
            "project_code": SMARTUP_PROJECT_CODE,
            "filial_id": str(DEFAULT_FILIAL_ID),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=SMARTUP_INTEGRATION_TIMEOUT) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        raise SmartUpUnavailable(f"SmartUp returned HTTP {exc.code}", exc.code) from exc
    except Exception as exc:  # network, DNS, TLS, timeout
        raise SmartUpUnavailable(f"SmartUp unreachable: {type(exc).__name__}") from exc

    try:
        return json.loads(raw)
    except ValueError as exc:
        raise SmartUpUnavailable("SmartUp returned something that is not JSON") from exc


def search_blob(name: str = "", code: str = "", article: str = "", short_name: str = "") -> str:
    """One lowercased haystack per product, built in Python.

    Python's `str.lower()` folds Cyrillic; SQLite's `lower()` only folds ASCII,
    so matching against `lower(name)` finds nothing for a catalogue written in
    Russian. Pre-computing the text here keeps search identical on SQLite and
    Postgres.
    """
    return " ".join(part for part in (name, short_name, code, article) if part).lower()


def _as_int(value: Any) -> int:
    """Quantities arrive as strings, sometimes with decimals."""
    try:
        return int(float(str(value).replace(",", ".")))
    except (TypeError, ValueError):
        return 0


def _group_names(groups: Any, lookup: Dict[str, Tuple[str, str]]) -> Tuple[str, str]:
    model = part = ""
    for group in groups or []:
        type_id = str(group.get("type_id") or "")
        name, group_id = lookup.get(type_id, ("", ""))
        if group_id == GROUP_MODEL:
            model = name
        elif group_id == GROUP_PART:
            part = name
    return model, part


def _fetch_group_lookup() -> Dict[str, Tuple[str, str]]:
    """type_id -> (readable name, which group it belongs to)."""
    try:
        document = _post("/b/anor/mxsx/mr/product_group$export", {})
    except SmartUpUnavailable:
        # Categories are a nicety; losing them must not fail a stock sync.
        return {}
    lookup: Dict[str, Tuple[str, str]] = {}
    for group in document.get("product_group") or []:
        group_id = str(group.get("product_group_id") or "")
        for item in group.get("product_group_types") or []:
            lookup[str(item.get("product_type_id") or "")] = (str(item.get("name") or ""), group_id)
    return lookup


def sync_inventory() -> Dict[str, Any]:
    """Mirror the SmartUp catalogue and Основной склад stock, then apply it.

    Returns a summary rather than raising on a partial result: the caller shows
    it to the operator, who can then see exactly what landed.
    """
    today = datetime.now(timezone.utc).strftime("%d.%m.%Y")

    catalogue = _post(CATALOGUE_PATH, {}).get("inventory") or []
    balance = _post(BALANCE_PATH, {"begin_date": today, "end_date": today}).get("balance") or []
    groups = _fetch_group_lookup()

    # One balance row is one batch in one warehouse, so quantities are summed
    # per product and everything outside Основной склад is dropped.
    stock: Dict[str, int] = {}
    cost: Dict[str, str] = {}
    for row in balance:
        if str(row.get("warehouse_id") or "") != str(SMARTUP_WAREHOUSE_ID):
            continue
        product_id = str(row.get("product_id") or "")
        if not product_id:
            continue
        stock[product_id] = stock.get(product_id, 0) + _as_int(row.get("quantity"))
        if row.get("input_price"):
            cost[product_id] = str(row.get("input_price"))

    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    connection = bonus_db()
    try:
        seen: set = set()
        for item in catalogue:
            product_id = str(item.get("product_id") or "")
            if not product_id:
                continue
            seen.add(product_id)
            model, part = _group_names(item.get("groups"), groups)
            code = str(item.get("code") or "")
            name = str(item.get("name") or "")
            short_name = str(item.get("short_name") or "")
            article = str(item.get("article_code") or "")
            values = (
                code,
                name,
                short_name,
                article,
                model,
                part,
                str(item.get("measure_code") or ""),
                str(item.get("state") or "A"),
                stock.get(product_id, 0),
                cost.get(product_id, ""),
                stamp,
                search_blob(name, code, article, short_name),
            )
            updated = connection.execute(
                """
                UPDATE smartup_inventory
                SET code = ?, name = ?, short_name = ?, article_code = ?, model = ?,
                    part_type = ?, measure = ?, state = ?, stock_main = ?,
                    input_price = ?, synced_at = ?, search_blob = ?
                WHERE product_id = ?
                """,
                values + (product_id,),
            )
            if updated.rowcount == 0:
                connection.execute(
                    """
                    INSERT INTO smartup_inventory (
                        code, name, short_name, article_code, model, part_type,
                        measure, state, stock_main, input_price, synced_at,
                        search_blob, product_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    values + (product_id,),
                )

        # Stock can exist for a product the catalogue export leaves out; those
        # are kept rather than dropped, so a linked product never silently
        # reads zero just because its catalogue row went missing.
        for product_id, quantity in stock.items():
            if product_id in seen:
                continue
            updated = connection.execute(
                "UPDATE smartup_inventory SET stock_main = ?, synced_at = ? WHERE product_id = ?",
                (quantity, stamp, product_id),
            )
            if updated.rowcount == 0:
                connection.execute(
                    """
                    INSERT INTO smartup_inventory (product_id, code, name, stock_main, synced_at)
                    VALUES (?, '', '(katalogda yo''q)', ?, ?)
                    """,
                    (product_id, quantity, stamp),
                )

        applied = _apply_stock_to_products(connection, stamp)
        connection.commit()
    finally:
        connection.close()

    summary = {
        "syncedAt": stamp,
        "catalogueCount": len(catalogue),
        "balanceRows": len(balance),
        "inStockCount": len([q for q in stock.values() if q > 0]),
        "warehouseId": str(SMARTUP_WAREHOUSE_ID),
        "productsUpdated": applied,
    }
    logger.info("SmartUp sync: %s", summary)
    return summary


def _apply_stock_to_products(connection, stamp: str) -> int:
    """Copy mirrored stock onto every linked product in our own catalogue."""
    rows = connection.execute(
        """
        SELECT id, smartup_product_id, smartup_code
        FROM products
        WHERE smartup_product_id <> '' OR smartup_code <> ''
        """
    ).fetchall()
    if not rows:
        return 0

    mirror = connection.execute(
        "SELECT product_id, code, stock_main FROM smartup_inventory"
    ).fetchall()
    by_id = {str(r["product_id"]): int(r["stock_main"] or 0) for r in mirror}
    by_code: Dict[str, int] = {}
    for r in mirror:
        code = str(r["code"] or "").strip()
        if code:
            by_code[code] = int(r["stock_main"] or 0)

    updated = 0
    for row in rows:
        product_id = str(row["smartup_product_id"] or "").strip()
        code = str(row["smartup_code"] or "").strip()
        # The id is the stronger link; the code is the fallback for rows linked
        # before ids were recorded.
        if product_id and product_id in by_id:
            quantity = by_id[product_id]
        elif code and code in by_code:
            quantity = by_code[code]
        else:
            continue
        connection.execute(
            "UPDATE products SET order_stock = ?, stock_synced_at = ? WHERE id = ?",
            (quantity, stamp, str(row["id"])),
        )
        updated += 1
    return updated


_LAST_SYNC_ATTEMPT = {"ts": 0.0}


def sync_if_stale(force: bool = False) -> Dict[str, Any]:
    """Sync unless one ran very recently, to protect the daily call budget."""
    now = time.time()
    if not force and now - _LAST_SYNC_ATTEMPT["ts"] < SMARTUP_SYNC_MIN_INTERVAL_SEC:
        state = last_sync_state()
        state["skipped"] = True
        return state
    _LAST_SYNC_ATTEMPT["ts"] = now
    return sync_inventory()


def last_sync_state() -> Dict[str, Any]:
    connection = bonus_db()
    try:
        row = connection.execute(
            "SELECT count(*) AS total, max(synced_at) AS synced_at FROM smartup_inventory"
        ).fetchone()
        in_stock = connection.execute(
            "SELECT count(*) AS n FROM smartup_inventory WHERE stock_main > 0"
        ).fetchone()
    finally:
        connection.close()
    return {
        "syncedAt": str((row["synced_at"] if row else "") or ""),
        "catalogueCount": int((row["total"] if row else 0) or 0),
        "inStockCount": int((in_stock["n"] if in_stock else 0) or 0),
        "warehouseId": str(SMARTUP_WAREHOUSE_ID),
        "skipped": False,
    }


def search_inventory(query: str = "", limit: int = 50, in_stock_only: bool = False) -> List[Dict[str, Any]]:
    """Search the mirrored SmartUp catalogue. Never calls SmartUp."""
    needle = f"%{query.strip().lower()}%"
    clauses = ["state = 'A'"]
    params: List[Any] = []
    if query.strip():
        # Matched against the pre-lowered blob, never lower(name): see search_blob().
        clauses.append("search_blob LIKE ?")
        params.append(needle)
    if in_stock_only:
        clauses.append("stock_main > 0")

    connection = bonus_db()
    try:
        rows = connection.execute(
            f"""
            SELECT product_id, code, name, short_name, article_code, model,
                   part_type, measure, stock_main, input_price, synced_at
            FROM smartup_inventory
            WHERE {' AND '.join(clauses)}
            ORDER BY stock_main DESC, name
            LIMIT ?
            """,
            tuple(params) + (max(1, min(int(limit), 200)),),
        ).fetchall()
    finally:
        connection.close()

    return [
        {
            "productId": str(row["product_id"]),
            "code": str(row["code"] or ""),
            "name": str(row["name"] or ""),
            "shortName": str(row["short_name"] or ""),
            "articleCode": str(row["article_code"] or ""),
            "model": str(row["model"] or ""),
            "partType": str(row["part_type"] or ""),
            "measure": str(row["measure"] or ""),
            "stock": int(row["stock_main"] or 0),
            "inputPrice": str(row["input_price"] or ""),
            "syncedAt": str(row["synced_at"] or ""),
        }
        for row in rows
    ]


def stock_for(smartup_product_id: str = "", smartup_code: str = "") -> Optional[int]:
    """Mirrored stock for one SmartUp product, or None when it is not linked."""
    product_id = (smartup_product_id or "").strip()
    code = (smartup_code or "").strip()
    if not product_id and not code:
        return None
    connection = bonus_db()
    try:
        row = None
        if product_id:
            row = connection.execute(
                "SELECT stock_main FROM smartup_inventory WHERE product_id = ?", (product_id,)
            ).fetchone()
        if row is None and code:
            row = connection.execute(
                "SELECT stock_main FROM smartup_inventory WHERE code = ?", (code,)
            ).fetchone()
    finally:
        connection.close()
    return int(row["stock_main"] or 0) if row is not None else None
