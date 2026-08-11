import hashlib
import hmac
import io
import math
import secrets
import zipfile
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import pandas as pd
import requests

from backend.config import (
    DEFAULT_BEGIN_DATE,
    GIFTS_XLSX_PATH,
    ITEM_QR_CODE_PREFIX,
    PRODUCTS_XLSX_PATH,
    QR_CODE_PREFIX,
    QR_CODE_SECRET,
    logger,
)
from backend.core import points as points_core
from backend.db import bonus_db
from backend.models.schemas import GiftCreatePayload, ProductCreatePayload, ProductQrUnscanPayload, QrScanPayload


class QrScanError(ValueError):
    def __init__(self, message: str, *, code: str = "qr_failed", used_at: str = ""):
        super().__init__(message)
        self.code = str(code or "qr_failed")
        self.used_at = str(used_at or "")


DEFAULT_PRODUCTS = [
    {
        "id": "P-3001",
        "name": {"EN": "Solar Panel X5", "RU": "Солнечная панель X5", "UZ": "Quyosh paneli X5"},
        "pointsValue": 50,
        "category": "Energy",
        "isActive": True,
    },
    {
        "id": "P-3002",
        "name": {"EN": "Smart Inverter Pro", "RU": "Умный инвертор Pro", "UZ": "Aqlli invertor Pro"},
        "pointsValue": 120,
        "category": "Electronics",
        "isActive": True,
    },
]

DEFAULT_GIFTS = [
    {
        "id": "G-2001",
        "name": {"EN": "Premium Thermos", "RU": "Премиум термос", "UZ": "Premium termos"},
        "description": {
            "EN": "Keep your drinks hot for 24h.",
            "RU": "Сохраняет напитки горячими 24ч.",
            "UZ": "Ichimliklarni 24 soat issiq saqlaydi.",
        },
        "pointsCost": 500,
        "category": "Lifestyle",
        "stock": 12,
        "isActive": True,
        "image": "https://picsum.photos/400/300?random=1",
    },
    {
        "id": "G-2002",
        "name": {"EN": "Wireless Headphones", "RU": "Беспроводные наушники", "UZ": "Simsiz quloqchinlar"},
        "description": {
            "EN": "High fidelity audio.",
            "RU": "Высококачественный звук.",
            "UZ": "Yuqori sifatli ovoz.",
        },
        "pointsCost": 1200,
        "category": "Tech",
        "stock": 5,
        "isActive": True,
        "image": "https://picsum.photos/400/300?random=2",
    },
    {
        "id": "G-2003",
        "name": {"EN": "Leather Notebook", "RU": "Кожаный блокнот", "UZ": "Charm daftar"},
        "description": {
            "EN": "A5 Genuine leather cover.",
            "RU": "A5 Обложка из натуральной кожи.",
            "UZ": "A5 Tabiiy charm muqova.",
        },
        "pointsCost": 300,
        "category": "Stationary",
        "stock": 0,
        "isActive": False,
        "image": "https://picsum.photos/400/300?random=3",
    },
]


def _parse_float(value: Any) -> float:
    try:
        if value is None:
            return 0.0
        if isinstance(value, (int, float)):
            parsed = float(value)
            return parsed if math.isfinite(parsed) else 0.0
        parsed = float(str(value).replace(" ", "").replace(",", "."))
        return parsed if math.isfinite(parsed) else 0.0
    except Exception:
        return 0.0


def _slugify_catalog_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    normalized = "".join(character if character.isalnum() else "-" for character in text)
    while "--" in normalized:
        normalized = normalized.replace("--", "-")
    return normalized.strip("-")


def _load_products_from_xlsx() -> List[Dict[str, Any]]:
    if not PRODUCTS_XLSX_PATH.exists():
        return []

    dataframe = pd.read_excel(PRODUCTS_XLSX_PATH, sheet_name=0).copy()
    if dataframe.empty:
        return []

    usable_columns = [column for column in dataframe.columns if str(column).strip()]
    if len(usable_columns) < 2:
        return []

    name_column = usable_columns[0]
    points_column = usable_columns[1]
    imported_products: List[Dict[str, Any]] = []

    for _, row in dataframe.iterrows():
        name = str(row.get(name_column, "") or "").strip()
        if not name or name.lower() == "nan":
            continue

        points_value = int(_parse_float(row.get(points_column, 0)))
        imported_products.append(
            {
                "id": f"PX-{len(imported_products) + 1:04d}",
                "name": name,
                "points_value": points_value,
                "category": "",
                "is_active": True,
            }
        )

    return imported_products


def _load_gifts_from_xlsx() -> List[Dict[str, Any]]:
    if not GIFTS_XLSX_PATH.exists():
        return []

    dataframe = pd.read_excel(GIFTS_XLSX_PATH, sheet_name=0, header=None).copy()
    if dataframe.empty:
        return []

    imported_gifts: List[Dict[str, Any]] = []
    for _, row in dataframe.iterrows():
        name = str(row.iloc[0] if len(row) > 0 else "" or "").strip()
        if not name or name.lower() == "nan":
            continue

        points_cost = int(_parse_float(row.iloc[1] if len(row) > 1 else 0))
        imported_gifts.append(
            {
                "id": f"GX-{len(imported_gifts) + 1:04d}",
                "name": name,
                "description": "",
                "points_cost": points_cost,
                "category": "",
                "stock": 0,
                "is_active": True,
                "image": f"https://picsum.photos/seed/{_slugify_catalog_text(name) or len(imported_gifts) + 1}/400/300",
            }
        )

    return imported_gifts


def _load_catalog_deleted_ids(connection: Any, item_type: str) -> set[str]:
    rows = connection.execute(
        "SELECT item_id FROM catalog_deleted_items WHERE item_type = ?",
        (str(item_type),),
    ).fetchall()
    return {str(row["item_id"]) for row in rows}


def _mark_catalog_deleted(connection: Any, item_type: str, item_id: str) -> None:
    connection.execute(
        """
        INSERT OR IGNORE INTO catalog_deleted_items (item_type, item_id)
        VALUES (?, ?)
        """,
        (str(item_type), str(item_id)),
    )


def _sync_catalog_from_uploaded_files(connection: Any) -> None:
    imported_products = _load_products_from_xlsx()
    if imported_products:
        deleted_product_ids = _load_catalog_deleted_ids(connection, "product")
        imported_products = [
            product for product in imported_products
            if str(product["id"]) not in deleted_product_ids
        ]
        product_rows = connection.execute("SELECT id FROM products").fetchall()
        existing_product_ids = {str(row["id"]) for row in product_rows}
        if existing_product_ids and existing_product_ids.issubset({"P-3001", "P-3002"}):
            connection.execute("DELETE FROM products WHERE id IN ('P-3001', 'P-3002')")
        connection.execute("DELETE FROM products WHERE id LIKE 'PX-%'")
        connection.executemany(
            """
            INSERT INTO products (id, name_ru, points_value, category, is_active)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    product["id"],
                    product["name"],
                    int(product["points_value"]),
                    str(product["category"]),
                    1 if product["is_active"] else 0,
                )
                for product in imported_products
            ],
        )
        logger.info("Imported %s products from %s", len(imported_products), PRODUCTS_XLSX_PATH.name)

    imported_gifts = _load_gifts_from_xlsx()
    if imported_gifts:
        deleted_gift_ids = _load_catalog_deleted_ids(connection, "gift")
        imported_gifts = [
            gift for gift in imported_gifts
            if str(gift["id"]) not in deleted_gift_ids
        ]
        gift_rows = connection.execute("SELECT id FROM gifts").fetchall()
        existing_gift_ids = {str(row["id"]) for row in gift_rows}
        if existing_gift_ids and existing_gift_ids.issubset({"G-2001", "G-2002", "G-2003"}):
            connection.execute("DELETE FROM gifts WHERE id IN ('G-2001', 'G-2002', 'G-2003')")
        connection.execute("DELETE FROM gifts WHERE id LIKE 'GX-%'")
        connection.executemany(
            """
            INSERT INTO gifts (
                id, name_ru, description_ru, points_cost, category, stock, is_active, image
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    gift["id"],
                    gift["name"],
                    gift["description"],
                    int(gift["points_cost"]),
                    str(gift["category"]),
                    int(gift["stock"]),
                    1 if gift["is_active"] else 0,
                    str(gift["image"]),
                )
                for gift in imported_gifts
            ],
        )
        logger.info("Imported %s gifts from %s", len(imported_gifts), GIFTS_XLSX_PATH.name)


def _qr_signature(product_id: str) -> str:
    return hmac.new(
        QR_CODE_SECRET.encode("utf-8"),
        product_id.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:16]


def _build_product_qr_code(product_id: str) -> str:
    product_key = str(product_id).strip()
    signature = _qr_signature(product_key)
    return f"{QR_CODE_PREFIX}:{product_key}:{signature}"


def _parse_product_qr_code(qr_code: str) -> Optional[str]:
    raw = str(qr_code or "").strip()
    parts = raw.split(":")
    if len(parts) != 3:
        return None
    prefix, product_id, signature = parts
    if prefix != QR_CODE_PREFIX:
        return None
    if not product_id or not signature:
        return None
    expected = _qr_signature(product_id)
    if not hmac.compare_digest(signature, expected):
        return None
    return product_id


def _build_item_qr_code() -> str:
    token = secrets.token_urlsafe(18)
    return f"{ITEM_QR_CODE_PREFIX}:{token}"


def _load_product_qr_codes(
    product_id: str,
    *,
    offset: int = 0,
    limit: int = 200,
    state: str = "all",
    search: str = "",
) -> Dict[str, Any]:
    normalized_product_id = str(product_id or "").strip().lower()
    if not normalized_product_id or normalized_product_id == "all":
        where_sql = "WHERE 1=1"
        params: List[Any] = []
    else:
        where_sql = "WHERE product_id = ?"
        params = [str(product_id)]
    normalized_state = str(state or "all").strip().lower()
    if normalized_state == "unused":
        where_sql += " AND is_used = 0 AND is_revoked = 0"
    elif normalized_state == "used":
        where_sql += " AND is_used = 1"
    elif normalized_state == "revoked":
        where_sql += " AND is_revoked = 1"
    if search.strip():
        where_sql += " AND (LOWER(qr_code) LIKE ? OR LOWER(used_by_client_id) LIKE ?)"
        needle = f"%{search.strip().lower()}%"
        params.extend([needle, needle])

    connection = bonus_db()
    try:
        total_row = connection.execute(
            f"SELECT COUNT(*) AS count FROM product_qr_codes {where_sql}",
            tuple(params),
        ).fetchone()
        rows = connection.execute(
            f"""
            SELECT
                id, qr_code, product_id, product_name, points_per_unit,
                is_used, used_by_client_id, used_at, is_revoked, revoked_at, created_at
            FROM product_qr_codes
            {where_sql}
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            tuple([*params, int(limit), int(offset)]),
        ).fetchall()
    finally:
        connection.close()

    codes = [
        {
            "id": int(row["id"] or 0),
            "qrCode": str(row["qr_code"] or ""),
            "productId": str(row["product_id"] or ""),
            "productName": str(row["product_name"] or ""),
            "pointsPerUnit": int(row["points_per_unit"] or 0),
            "isUsed": bool(row["is_used"]),
            "usedByClientId": str(row["used_by_client_id"] or ""),
            "usedByClientName": "",
            "usedAt": str(row["used_at"] or ""),
            "isRevoked": bool(row["is_revoked"]),
            "revokedAt": str(row["revoked_at"] or ""),
            "createdAt": str(row["created_at"] or ""),
        }
        for row in rows
    ]
    _fill_used_by_client_names(codes)
    return {"count": int(total_row["count"] or 0), "codes": codes}


def _fill_used_by_client_names(codes: List[Dict[str, Any]]) -> None:
    """Add usedByClientName to QR code rows, resolved from the customers table."""
    from backend.core import customers as _customer_core

    names = _customer_core._resolve_current_client_names([code.get("usedByClientId") for code in codes])
    for code in codes:
        code["usedByClientName"] = names.get(str(code.get("usedByClientId") or ""), "")


def _load_all_qr_codes(
    *,
    offset: int = 0,
    limit: int = 200,
    state: str = "all",
    search: str = "",
) -> Dict[str, Any]:
    return _load_product_qr_codes(
        "all",
        offset=offset,
        limit=limit,
        state=state,
        search=search,
    )


def _load_products() -> List[Dict[str, Any]]:
    connection = bonus_db()
    try:
        rows = connection.execute(
            """
            SELECT id, name_ru, points_value, category, is_active
            FROM products
            ORDER BY id
            """
        ).fetchall()
        deleted_ids = _load_catalog_deleted_ids(connection, "product")
    finally:
        connection.close()

    return [
        {
            "id": str(row["id"]),
            "name": {
                "EN": str(row["name_ru"]),
                "RU": str(row["name_ru"]),
                "UZ": str(row["name_ru"]),
            },
            "pointsValue": int(row["points_value"] or 0),
            "category": str(row["category"] or ""),
            "isActive": bool(row["is_active"]),
            "qrCode": _build_product_qr_code(str(row["id"])),
        }
        for row in rows
        if str(row["id"]) not in deleted_ids
    ]


def _load_product_map() -> Dict[str, Dict[str, Any]]:
    return {product["id"]: product for product in _load_products()}


def _generate_product_qr_codes(product_id: str, count: int) -> Dict[str, Any]:
    if str(product_id or "").strip().lower() == "all":
        raise ValueError("Product is required")
    product = _load_product_map().get(str(product_id))
    if product is None:
        raise ValueError("Product not found")
    if not product.get("isActive"):
        raise ValueError("Product is inactive")
    if int(product.get("pointsValue") or 0) <= 0:
        raise ValueError("Product points must be greater than zero")

    created_codes: List[str] = []
    connection = bonus_db()
    try:
        for _ in range(int(count)):
            created = False
            for _retry in range(8):
                qr_code = _build_item_qr_code()
                try:
                    connection.execute(
                        """
                        INSERT INTO product_qr_codes (
                            qr_code, product_id, product_name, points_per_unit, is_used, used_by_client_id, used_at
                        ) VALUES (?, ?, ?, ?, 0, '', '')
                        """,
                        (
                            qr_code,
                            str(product["id"]),
                            str(product["name"]["RU"]),
                            int(product["pointsValue"] or 0),
                        ),
                    )
                    created_codes.append(qr_code)
                    created = True
                    break
                except Exception:
                    continue
            if not created:
                raise RuntimeError("Failed to create unique QR code")
        connection.commit()
    finally:
        connection.close()

    return {
        "productId": str(product["id"]),
        "productName": str(product["name"]["RU"]),
        "pointsValue": int(product["pointsValue"] or 0),
        "createdCount": len(created_codes),
        "codes": created_codes,
    }


def _load_product_qr_stats(product_id: str) -> Dict[str, int]:
    connection = bonus_db()
    try:
        normalized_product_id = str(product_id or "").strip().lower()
        if not normalized_product_id or normalized_product_id == "all":
            row = connection.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN is_used = 1 THEN 1 ELSE 0 END) AS used,
                    SUM(CASE WHEN is_revoked = 1 THEN 1 ELSE 0 END) AS revoked,
                    SUM(CASE WHEN is_used = 0 AND is_revoked = 0 THEN 1 ELSE 0 END) AS unused
                FROM product_qr_codes
                """
            ).fetchone()
        else:
            row = connection.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN is_used = 1 THEN 1 ELSE 0 END) AS used,
                    SUM(CASE WHEN is_revoked = 1 THEN 1 ELSE 0 END) AS revoked,
                    SUM(CASE WHEN is_used = 0 AND is_revoked = 0 THEN 1 ELSE 0 END) AS unused
                FROM product_qr_codes
                WHERE product_id = ?
                """,
                (str(product_id),),
            ).fetchone()
    finally:
        connection.close()
    return {
        "total": int((row["total"] if row else 0) or 0),
        "used": int((row["used"] if row else 0) or 0),
        "revoked": int((row["revoked"] if row else 0) or 0),
        "unused": int((row["unused"] if row else 0) or 0),
    }


def _bulk_set_product_qr_revoked(product_id: str, ids: List[int], *, revoked: bool) -> int:
    clean_ids = [int(item) for item in ids if int(item) > 0]
    if not clean_ids:
        return 0
    placeholders = ", ".join(["?"] * len(clean_ids))
    connection = bonus_db()
    try:
        if revoked:
            cursor = connection.execute(
                f"""
                UPDATE product_qr_codes
                SET is_revoked = 1, revoked_at = CURRENT_TIMESTAMP
                WHERE product_id = ? AND id IN ({placeholders}) AND is_used = 0 AND is_revoked = 0
                """,
                tuple([str(product_id), *clean_ids]),
            )
        else:
            cursor = connection.execute(
                f"""
                UPDATE product_qr_codes
                SET is_revoked = 0, revoked_at = ''
                WHERE product_id = ? AND id IN ({placeholders}) AND is_used = 0 AND is_revoked = 1
                """,
                tuple([str(product_id), *clean_ids]),
            )
        connection.commit()
        return int(cursor.rowcount or 0)
    finally:
        connection.close()


def _unscan_product_qr_code(product_id: str, qr_row_id: int, payload: ProductQrUnscanPayload) -> Dict[str, Any]:
    from backend.core import customers as customer_core
    from backend import legacy as _legacy

    connection = bonus_db()
    try:
        row = connection.execute(
            """
            SELECT id, qr_code, product_id, product_name, points_per_unit, is_used, used_by_client_id, used_at
            FROM product_qr_codes
            WHERE id = ? AND product_id = ?
            """,
            (int(qr_row_id), str(product_id)),
        ).fetchone()
        if row is None:
            raise ValueError("QR code row not found")
        if int(row["is_used"] or 0) != 1:
            raise ValueError("QR code is not used")

        client_id = str(row["used_by_client_id"] or "").strip()
        if not client_id:
            raise ValueError("Used QR is missing customer reference")
        customer = customer_core._load_customer_snapshot(client_id)
        client_name = str((customer or {}).get("fullName") or client_id)
        points = int(row["points_per_unit"] or 0)
        if points <= 0:
            raise ValueError("Invalid points value on QR row")

        reason_text = str(payload.reason or "").strip()
        note = f"QR skan bekor qilindi: {row['product_name']} #{row['id']}"
        if reason_text:
            note = f"{note} | {reason_text}"

        points_core._insert_bonus_transaction(
            connection,
            client_id=client_id,
            client_name=client_name,
            points=-points,
            note=note,
            source_type="qr_unscan",
            source_ref=str(row["qr_code"] or ""),
        )

        connection.execute(
            """
            UPDATE product_qr_codes
            SET is_used = 0, used_by_client_id = '', used_at = ''
            WHERE id = ? AND is_used = 1
            """,
            (int(qr_row_id),),
        )
        connection.commit()
    finally:
        connection.close()

    return {"id": int(qr_row_id), "clientId": client_id, "pointsReversed": int(points)}


def _apply_qr_scan(client_id: str, payload: QrScanPayload) -> Dict[str, Any]:
    from backend.core import customers as customer_core
    from backend import legacy as _legacy

    raw_qr = str(payload.qr_code or "").strip()
    if not raw_qr:
        raise QrScanError("Invalid QR code", code="invalid_qr")
    customer = customer_core._load_customer_snapshot(str(client_id))
    if customer is None:
        raise QrScanError("Customer not found", code="customer_not_found")
    client_name = str(customer.get("fullName") or client_id)

    connection = bonus_db()
    try:
        quantity = int(payload.quantity or 1)
        product_id = ""
        product_name = ""
        points_per_unit = 0
        unique_qr_row = connection.execute(
            """
            SELECT id, product_id, product_name, points_per_unit, is_used, is_revoked, used_at
            FROM product_qr_codes
            WHERE qr_code = ?
            """,
            (raw_qr,),
        ).fetchone()

        if unique_qr_row is None:
            static_product_id = _parse_product_qr_code(raw_qr)
            if static_product_id:
                raise QrScanError(
                    "Product template QR detected. Use generated one-time QR codes instead",
                    code="template_qr",
                )
            raise QrScanError("QR code is not registered", code="not_registered")
        if int(unique_qr_row["is_revoked"] or 0) == 1:
            raise QrScanError("QR code is revoked", code="revoked")
        if int(unique_qr_row["is_used"] or 0) == 1:
            used_at = str(unique_qr_row["used_at"] or "")
            raise QrScanError("QR code already used", code="already_used", used_at=used_at)

        product_id = str(unique_qr_row["product_id"] or "")
        product_name = str(unique_qr_row["product_name"] or "")
        points_per_unit = int(unique_qr_row["points_per_unit"] or 0)
        quantity = 1

        awarded_points = points_per_unit * quantity
        if awarded_points <= 0:
            raise QrScanError("Product points must be greater than zero", code="zero_points")

        note_text = payload.note.strip()
        base_note = f"QR skan: {product_name} x{quantity}"
        transaction_note = f"{base_note} | {note_text}" if note_text else base_note

        points_core._insert_bonus_transaction(
            connection,
            client_id=str(client_id),
            client_name=client_name,
            points=awarded_points,
            note=transaction_note,
            source_type="qr_scan",
            source_ref=raw_qr,
        )
        used_cursor = connection.execute(
            """
            UPDATE product_qr_codes
            SET is_used = 1, used_by_client_id = ?, used_at = CURRENT_TIMESTAMP
            WHERE id = ? AND is_used = 0
            """,
            (str(client_id), int(unique_qr_row["id"] or 0)),
        )
        if used_cursor.rowcount <= 0:
            raise QrScanError("QR code already used", code="already_used")
        connection.execute(
            """
            INSERT INTO qr_scan_events (
                client_id, client_name, product_id, product_name, qr_code, quantity, points_awarded
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(client_id),
                client_name,
                str(product_id),
                product_name,
                raw_qr,
                quantity,
                awarded_points,
            ),
        )
        connection.commit()
    finally:
        connection.close()

    updated_customer = customer_core._load_customer_snapshot(str(client_id))
    if updated_customer is None:
        updated_customer = customer
    return {
        "awardedPoints": awarded_points,
        "pointsPerUnit": points_per_unit,
        "quantity": quantity,
        "product": {"id": product_id, "name": {"RU": product_name, "EN": product_name, "UZ": product_name}},
        "customer": updated_customer,
    }


def _export_product_qr_zip(*, size: int = 600) -> bytes:
    products = _load_products()
    image_size = max(200, min(int(size), 2000))

    output = io.BytesIO()
    manifest_lines = ["product_id,product_name,points_value,qr_value,file_name,status"]

    with zipfile.ZipFile(output, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for product in products:
            product_id = str(product.get("id") or "").strip()
            product_name = str(product.get("name", {}).get("RU") or "").strip()
            points_value = int(product.get("pointsValue") or 0)
            qr_value = str(product.get("qrCode") or "").strip()
            safe_name = _slugify_catalog_text(product_name) or "product"
            file_name = f"{product_id}_{safe_name}.png"

            status = "ok"
            try:
                image_url = (
                    f"https://api.qrserver.com/v1/create-qr-code/?size={image_size}x{image_size}"
                    f"&data={quote(qr_value, safe='')}"
                )
                response = requests.get(image_url, timeout=20)
                response.raise_for_status()
                archive.writestr(file_name, response.content)
            except Exception as exc:
                status = f"error:{str(exc).replace(',', ';')}"
                archive.writestr(
                    f"{product_id}_{safe_name}.txt",
                    f"QR generation failed for {product_id}\n{str(exc)}\n",
                )

            manifest_lines.append(
                ",".join(
                    [
                        product_id,
                        product_name.replace(",", " "),
                        str(points_value),
                        qr_value.replace(",", " "),
                        file_name,
                        status,
                    ]
                )
            )

        archive.writestr("manifest.csv", "\n".join(manifest_lines) + "\n")

    output.seek(0)
    return output.getvalue()


def _load_product_qr_rows_for_export(
    product_id: str,
    *,
    include_used: bool = True,
    include_revoked: bool = True,
) -> List[Dict[str, Any]]:
    where_sql = "WHERE product_id = ?"
    params: List[Any] = [str(product_id)]
    if not include_used:
        where_sql += " AND is_used = 0"
    if not include_revoked:
        where_sql += " AND is_revoked = 0"

    connection = bonus_db()
    try:
        rows = connection.execute(
            f"""
            SELECT
                id, qr_code, product_id, product_name, points_per_unit,
                is_used, used_by_client_id, used_at, is_revoked, revoked_at, created_at
            FROM product_qr_codes
            {where_sql}
            ORDER BY datetime(created_at) DESC, id DESC
            """,
            tuple(params),
        ).fetchall()
    finally:
        connection.close()

    return [
        {
            "id": int(row["id"] or 0),
            "qrCode": str(row["qr_code"] or ""),
            "productId": str(row["product_id"] or ""),
            "productName": str(row["product_name"] or ""),
            "pointsPerUnit": int(row["points_per_unit"] or 0),
            "isUsed": bool(row["is_used"]),
            "usedByClientId": str(row["used_by_client_id"] or ""),
            "usedAt": str(row["used_at"] or ""),
            "isRevoked": bool(row["is_revoked"]),
            "revokedAt": str(row["revoked_at"] or ""),
            "createdAt": str(row["created_at"] or ""),
        }
        for row in rows
    ]


def _load_all_product_qr_rows_for_export(
    *,
    include_used: bool = True,
    include_revoked: bool = True,
) -> List[Dict[str, Any]]:
    where_sql = "WHERE 1=1"
    params: List[Any] = []
    if not include_used:
        where_sql += " AND is_used = 0"
    if not include_revoked:
        where_sql += " AND is_revoked = 0"

    connection = bonus_db()
    try:
        rows = connection.execute(
            f"""
            SELECT
                id, qr_code, product_id, product_name, points_per_unit,
                is_used, used_by_client_id, used_at, is_revoked, revoked_at, created_at
            FROM product_qr_codes
            {where_sql}
            ORDER BY datetime(created_at) DESC, id DESC
            """,
            tuple(params),
        ).fetchall()
    finally:
        connection.close()

    return [
        {
            "id": int(row["id"] or 0),
            "qrCode": str(row["qr_code"] or ""),
            "productId": str(row["product_id"] or ""),
            "productName": str(row["product_name"] or ""),
            "pointsPerUnit": int(row["points_per_unit"] or 0),
            "isUsed": bool(row["is_used"]),
            "usedByClientId": str(row["used_by_client_id"] or ""),
            "usedAt": str(row["used_at"] or ""),
            "isRevoked": bool(row["is_revoked"]),
            "revokedAt": str(row["revoked_at"] or ""),
            "createdAt": str(row["created_at"] or ""),
        }
        for row in rows
    ]


def _export_product_saved_qr_csv(product_id: str, *, include_used: bool = True, include_revoked: bool = True) -> str:
    rows = _load_product_qr_rows_for_export(product_id, include_used=include_used, include_revoked=include_revoked)
    header = "id,product_id,product_name,points_per_unit,is_used,is_revoked,used_by_client_id,used_at,revoked_at,created_at,qr_code"
    lines = [header]
    for row in rows:
        lines.append(
            ",".join(
                [
                    str(row["id"]),
                    str(row["productId"]).replace(",", " "),
                    str(row["productName"]).replace(",", " "),
                    str(row["pointsPerUnit"]),
                    "1" if bool(row["isUsed"]) else "0",
                    "1" if bool(row["isRevoked"]) else "0",
                    str(row["usedByClientId"]).replace(",", " "),
                    str(row["usedAt"]).replace(",", " "),
                    str(row["revokedAt"]).replace(",", " "),
                    str(row["createdAt"]).replace(",", " "),
                    str(row["qrCode"]).replace(",", " "),
                ]
            )
        )
    return "\n".join(lines) + "\n"


def _export_all_saved_qr_csv(*, include_used: bool = True, include_revoked: bool = True) -> str:
    rows = _load_all_product_qr_rows_for_export(include_used=include_used, include_revoked=include_revoked)
    header = "id,product_id,product_name,points_per_unit,is_used,is_revoked,used_by_client_id,used_at,revoked_at,created_at,qr_code"
    lines = [header]
    for row in rows:
        lines.append(
            ",".join(
                [
                    str(row["id"]),
                    str(row["productId"]).replace(",", " "),
                    str(row["productName"]).replace(",", " "),
                    str(row["pointsPerUnit"]),
                    "1" if bool(row["isUsed"]) else "0",
                    "1" if bool(row["isRevoked"]) else "0",
                    str(row["usedByClientId"]).replace(",", " "),
                    str(row["usedAt"]).replace(",", " "),
                    str(row["revokedAt"]).replace(",", " "),
                    str(row["createdAt"]).replace(",", " "),
                    str(row["qrCode"]).replace(",", " "),
                ]
            )
        )
    return "\n".join(lines) + "\n"


def _export_product_saved_qr_zip(
    product_id: str,
    *,
    size: int = 600,
    include_used: bool = True,
    include_revoked: bool = True,
) -> bytes:
    rows = _load_product_qr_rows_for_export(product_id, include_used=include_used, include_revoked=include_revoked)
    image_size = max(200, min(int(size), 2000))
    safe_product_id = _slugify_catalog_text(product_id) or "product"

    output = io.BytesIO()
    with zipfile.ZipFile(output, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        manifest = _export_product_saved_qr_csv(
            product_id,
            include_used=include_used,
            include_revoked=include_revoked,
        )
        archive.writestr("manifest.csv", manifest)

        for row in rows:
            qr_value = str(row["qrCode"])
            file_name = f"{safe_product_id}_{int(row['id'])}.png"
            try:
                image_url = (
                    f"https://api.qrserver.com/v1/create-qr-code/?size={image_size}x{image_size}"
                    f"&data={quote(qr_value, safe='')}"
                )
                response = requests.get(image_url, timeout=20)
                response.raise_for_status()
                archive.writestr(file_name, response.content)
            except Exception as exc:
                archive.writestr(f"{safe_product_id}_{int(row['id'])}.txt", f"QR image build failed\n{str(exc)}\n")

    output.seek(0)
    return output.getvalue()


def _export_all_saved_qr_zip(
    *,
    size: int = 600,
    include_used: bool = True,
    include_revoked: bool = True,
) -> bytes:
    rows = _load_all_product_qr_rows_for_export(include_used=include_used, include_revoked=include_revoked)
    image_size = max(200, min(int(size), 2000))

    output = io.BytesIO()
    with zipfile.ZipFile(output, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        manifest = _export_all_saved_qr_csv(
            include_used=include_used,
            include_revoked=include_revoked,
        )
        archive.writestr("manifest.csv", manifest)

        for row in rows:
            safe_product_id = _slugify_catalog_text(row["productId"]) or "product"
            file_name = f"{safe_product_id}_{int(row['id'])}.png"
            try:
                image_url = (
                    f"https://api.qrserver.com/v1/create-qr-code/?size={image_size}x{image_size}"
                    f"&data={quote(str(row['qrCode']), safe='')}"
                )
                response = requests.get(image_url, timeout=20)
                response.raise_for_status()
                archive.writestr(file_name, response.content)
            except Exception as exc:
                archive.writestr(f"{safe_product_id}_{int(row['id'])}.txt", f"QR image build failed\n{str(exc)}\n")

    output.seek(0)
    return output.getvalue()


def _generate_catalog_public_id(
    connection: Any,
    table_name: str,
    prefix: str,
    base: int,
    *,
    key_column: str = "id",
) -> str:
    row = connection.execute(f"SELECT COUNT(*) AS count FROM {table_name}").fetchone()
    next_id = int(row["count"] or 0) + 1
    item_type = "product" if table_name == "products" else "gift" if table_name == "gifts" else ""
    deleted_ids = _load_catalog_deleted_ids(connection, item_type) if item_type else set()
    while True:
        candidate = f"{prefix}-{base + next_id}"
        existing = connection.execute(f"SELECT 1 FROM {table_name} WHERE {key_column} = ?", (candidate,)).fetchone()
        if existing is None and candidate not in deleted_ids:
            return candidate
        next_id += 1


def _create_product(payload: ProductCreatePayload) -> Dict[str, Any]:
    connection = bonus_db()
    try:
        product_id = _generate_catalog_public_id(connection, "products", "P", 3000)
        default_name = payload.name.strip()
        connection.execute(
            """
            INSERT INTO products (id, name_ru, points_value, category, is_active)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                product_id,
                default_name,
                int(payload.points_value),
                payload.category.strip(),
                1 if payload.is_active else 0,
            ),
        )
        connection.commit()
    finally:
        connection.close()

    return next(product for product in _load_products() if product["id"] == product_id)


def _update_product(product_id: str, payload: ProductCreatePayload) -> Optional[Dict[str, Any]]:
    connection = bonus_db()
    try:
        default_name = payload.name.strip()
        cursor = connection.execute(
            """
            UPDATE products
            SET name_ru = ?, points_value = ?, category = ?, is_active = ?
            WHERE id = ?
            """,
            (
                default_name,
                int(payload.points_value),
                payload.category.strip(),
                1 if payload.is_active else 0,
                product_id,
            ),
        )
        connection.commit()
        if cursor.rowcount == 0:
            return None
    finally:
        connection.close()

    return next((product for product in _load_products() if product["id"] == product_id), None)


def _delete_product(product_id: str) -> bool:
    connection = bonus_db()
    try:
        deleted_ids = _load_catalog_deleted_ids(connection, "product")
        existing = connection.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone()
        if existing is None and product_id not in deleted_ids:
            return False
        _mark_catalog_deleted(connection, "product", product_id)
        cursor = connection.execute("DELETE FROM products WHERE id = ?", (product_id,))
        connection.commit()
        return cursor.rowcount > 0 or product_id in deleted_ids
    finally:
        connection.close()


def _load_gifts() -> List[Dict[str, Any]]:
    connection = bonus_db()
    try:
        rows = connection.execute(
            """
            SELECT
                id, name_ru, description_ru,
                points_cost, category, stock, is_active, image
            FROM gifts
            ORDER BY id
            """
        ).fetchall()
        deleted_ids = _load_catalog_deleted_ids(connection, "gift")
    finally:
        connection.close()

    return [
        {
            "id": str(row["id"]),
            "name": {
                "EN": str(row["name_ru"]),
                "RU": str(row["name_ru"]),
                "UZ": str(row["name_ru"]),
            },
            "description": {
                "EN": str(row["description_ru"]),
                "RU": str(row["description_ru"]),
                "UZ": str(row["description_ru"]),
            },
            "pointsCost": int(row["points_cost"] or 0),
            "category": str(row["category"] or ""),
            "stock": int(row["stock"] or 0),
            "isActive": bool(row["is_active"]),
            "image": str(row["image"] or ""),
        }
        for row in rows
        if str(row["id"]) not in deleted_ids
    ]


def _create_gift(payload: GiftCreatePayload) -> Dict[str, Any]:
    connection = bonus_db()
    try:
        gift_id = _generate_catalog_public_id(connection, "gifts", "G", 2000)
        default_name = payload.name.strip()
        default_description = payload.description.strip()
        connection.execute(
            """
            INSERT INTO gifts (
                id, name_ru, description_ru, points_cost, category, stock, is_active, image
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                gift_id,
                default_name,
                default_description,
                int(payload.points_cost),
                payload.category.strip(),
                int(payload.stock),
                1 if payload.is_active else 0,
                payload.image.strip(),
            ),
        )
        connection.commit()
    finally:
        connection.close()

    return next(gift for gift in _load_gifts() if gift["id"] == gift_id)


def _update_gift(gift_id: str, payload: GiftCreatePayload) -> Optional[Dict[str, Any]]:
    connection = bonus_db()
    try:
        default_name = payload.name.strip()
        default_description = payload.description.strip()
        cursor = connection.execute(
            """
            UPDATE gifts
            SET
                name_ru = ?,
                description_ru = ?,
                points_cost = ?, category = ?, stock = ?, is_active = ?, image = ?
            WHERE id = ?
            """,
            (
                default_name,
                default_description,
                int(payload.points_cost),
                payload.category.strip(),
                int(payload.stock),
                1 if payload.is_active else 0,
                payload.image.strip(),
                gift_id,
            ),
        )
        connection.commit()
        if cursor.rowcount == 0:
            return None
    finally:
        connection.close()

    return next((gift for gift in _load_gifts() if gift["id"] == gift_id), None)


def _delete_gift(gift_id: str) -> bool:
    connection = bonus_db()
    try:
        deleted_ids = _load_catalog_deleted_ids(connection, "gift")
        existing = connection.execute("SELECT 1 FROM gifts WHERE id = ?", (gift_id,)).fetchone()
        if existing is None and gift_id not in deleted_ids:
            return False
        _mark_catalog_deleted(connection, "gift", gift_id)
        cursor = connection.execute("DELETE FROM gifts WHERE id = ?", (gift_id,))
        connection.commit()
        return cursor.rowcount > 0 or gift_id in deleted_ids
    finally:
        connection.close()
