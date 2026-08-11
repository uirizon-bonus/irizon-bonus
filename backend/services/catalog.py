from fastapi import Query
from fastapi.responses import JSONResponse, Response

from backend import legacy
from backend.core import dashboard as dashboard_core
from backend.db import bonus_db
from backend.models.schemas import GiftCreatePayload, ProductCreatePayload, ProductQrBulkIdsPayload, ProductQrGeneratePayload, ProductQrUnscanPayload


def get_products_payload():
    products = legacy._load_products()
    return {"count": len(products), "products": products}


def get_product_qr_payload(product_id: str):
    product = next((item for item in legacy._load_products() if item["id"] == str(product_id)), None)
    if product is None:
        return JSONResponse({"error": "Product not found"}, status_code=404)
    return {
        "productId": str(product["id"]),
        "productName": str(product["name"]["RU"]),
        "pointsValue": int(product["pointsValue"] or 0),
        "qrCode": str(product["qrCode"]),
    }


def get_product_qr_codes_payload(product_id: str, offset: int, limit: int, state: str, search: str, date_from: str = "", date_to: str = ""):
    return legacy._load_product_qr_codes(
        str(product_id),
        offset=int(offset),
        limit=int(limit),
        state=state,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )


def get_all_qr_codes_payload(offset: int, limit: int, state: str, search: str, date_from: str = "", date_to: str = ""):
    return legacy._load_all_qr_codes(
        offset=int(offset),
        limit=int(limit),
        state=state,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )


def generate_product_qr_codes_payload(product_id: str, payload: ProductQrGeneratePayload):
    try:
        result = legacy._generate_product_qr_codes(str(product_id), int(payload.count))
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except RuntimeError as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="generate",
            entity="product_qr_codes",
            entity_id=str(product_id),
            description=f"Generated {result.get('createdCount')} QR codes for product {product_id}",
            actor="Admin",
        )
        connection.commit()
    finally:
        connection.close()
    return {"message": "QR codes generated", **result}


def get_product_qr_codes_stats_payload(product_id: str):
    return legacy._load_product_qr_stats(str(product_id))


def get_all_qr_codes_stats_payload():
    return legacy._load_product_qr_stats("all")


def revoke_product_qr_codes_payload(product_id: str, payload: ProductQrBulkIdsPayload):
    if str(product_id or "").strip().lower() == "all":
        return JSONResponse({"error": "Product is required"}, status_code=400)
    updated = legacy._bulk_set_product_qr_revoked(str(product_id), payload.ids, revoked=True)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="revoke",
            entity="product_qr_codes",
            entity_id=str(product_id),
            description=f"Revoked {int(updated)} QR codes",
            actor="Admin",
        )
        connection.commit()
    finally:
        connection.close()
    return {"message": "QR codes revoked", "updated": int(updated)}


def restore_product_qr_codes_payload(product_id: str, payload: ProductQrBulkIdsPayload):
    if str(product_id or "").strip().lower() == "all":
        return JSONResponse({"error": "Product is required"}, status_code=400)
    updated = legacy._bulk_set_product_qr_revoked(str(product_id), payload.ids, revoked=False)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="restore",
            entity="product_qr_codes",
            entity_id=str(product_id),
            description=f"Restored {int(updated)} QR codes",
            actor="Admin",
        )
        connection.commit()
    finally:
        connection.close()
    return {"message": "QR codes restored", "updated": int(updated)}


def unscan_product_qr_code_payload(product_id: str, qr_row_id: int, payload: ProductQrUnscanPayload):
    if str(product_id or "").strip().lower() == "all":
        return JSONResponse({"error": "Product is required"}, status_code=400)
    try:
        result = legacy._unscan_product_qr_code(str(product_id), int(qr_row_id), payload)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="unscan",
            entity="product_qr_codes",
            entity_id=str(qr_row_id),
            description=f"Unscanned QR code {qr_row_id} for product {product_id}",
            actor=str(payload.operator or "Admin"),
        )
        connection.commit()
    finally:
        connection.close()
    return {"message": "QR scan reverted", **result}


def download_product_qr_codes_csv_payload(product_id: str, include_used: bool, include_revoked: bool):
    csv_payload = legacy._export_product_saved_qr_csv(
        str(product_id),
        include_used=bool(include_used),
        include_revoked=bool(include_revoked),
    )
    safe_name = legacy._slugify_catalog_text(product_id) or "product"
    return Response(
        content=csv_payload.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_qr_codes.csv"'},
    )


def download_all_qr_codes_csv_payload(include_used: bool, include_revoked: bool):
    csv_payload = legacy._export_all_saved_qr_csv(
        include_used=bool(include_used),
        include_revoked=bool(include_revoked),
    )
    return Response(
        content=csv_payload.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="all_qr_codes.csv"'},
    )


def download_product_qr_codes_zip_payload(product_id: str, size: int, include_used: bool, include_revoked: bool):
    try:
        zip_payload = legacy._export_product_saved_qr_zip(
            str(product_id),
            size=int(size),
            include_used=bool(include_used),
            include_revoked=bool(include_revoked),
        )
    except Exception as exc:
        return JSONResponse({"error": f"Failed to build product QR zip: {str(exc)}"}, status_code=500)
    safe_name = legacy._slugify_catalog_text(product_id) or "product"
    return Response(
        content=zip_payload,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_qr_codes.zip"'},
    )


def download_all_qr_codes_zip_payload(size: int, include_used: bool, include_revoked: bool):
    try:
        zip_payload = legacy._export_all_saved_qr_zip(
            size=int(size),
            include_used=bool(include_used),
            include_revoked=bool(include_revoked),
        )
    except Exception as exc:
        return JSONResponse({"error": f"Failed to build QR zip: {str(exc)}"}, status_code=500)
    return Response(
        content=zip_payload,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="all_qr_codes.zip"'},
    )


def get_products_qr_batch_payload(size: int):
    try:
        zip_bytes = legacy._export_product_qr_zip(size=int(size))
    except Exception as exc:
        return JSONResponse({"error": f"Failed to build QR batch: {str(exc)}"}, status_code=500)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="products_qr_batch.zip"'},
    )


def create_product_payload(payload: ProductCreatePayload):
    if legacy.CATALOG_MANAGED_BY_XLSX:
        return JSONResponse(
            {"error": "Catalog is managed via XLSX. Update products.xlsx and restart the backend."},
            status_code=400,
        )
    product = legacy._create_product(payload)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="create",
            entity="product",
            entity_id=str(product.get("id", "")),
            description=f"Created product {product.get('id', '')}",
            actor="Admin",
        )
        connection.commit()
    finally:
        connection.close()
    dashboard_core._invalidate_dashboard_cache()
    return {"message": "Product created", "product": product}


def update_product_payload(product_id: str, payload: ProductCreatePayload):
    if legacy.CATALOG_MANAGED_BY_XLSX:
        return JSONResponse(
            {"error": "Catalog is managed via XLSX. Update products.xlsx and restart the backend."},
            status_code=400,
        )
    product = legacy._update_product(product_id, payload)
    if product is None:
        return JSONResponse({"error": "Product not found"}, status_code=404)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="update",
            entity="product",
            entity_id=str(product_id),
            description=f"Updated product {product_id}",
            actor="Admin",
        )
        connection.commit()
    finally:
        connection.close()
    dashboard_core._invalidate_dashboard_cache()
    return {"message": "Product updated", "product": product}


def delete_product_payload(product_id: str):
    deleted = legacy._delete_product(product_id)
    if not deleted:
        return JSONResponse({"error": "Product not found"}, status_code=404)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="delete",
            entity="product",
            entity_id=str(product_id),
            description=f"Deleted product {product_id}",
            actor="Admin",
        )
        connection.commit()
    finally:
        connection.close()
    dashboard_core._invalidate_dashboard_cache()
    return {"message": "Product deleted"}


def get_gifts_payload():
    gifts = legacy._load_gifts()
    return {"count": len(gifts), "gifts": gifts}


def create_gift_payload(payload: GiftCreatePayload):
    if legacy.CATALOG_MANAGED_BY_XLSX:
        return JSONResponse(
            {"error": "Catalog is managed via XLSX. Update Gifts.xlsx and restart the backend."},
            status_code=400,
        )
    gift = legacy._create_gift(payload)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="create",
            entity="gift",
            entity_id=str(gift.get("id", "")),
            description=f"Created gift {gift.get('id', '')}",
            actor="Admin",
        )
        connection.commit()
    finally:
        connection.close()
    dashboard_core._invalidate_dashboard_cache()
    return {"message": "Gift created", "gift": gift}


def update_gift_payload(gift_id: str, payload: GiftCreatePayload):
    if legacy.CATALOG_MANAGED_BY_XLSX:
        return JSONResponse(
            {"error": "Catalog is managed via XLSX. Update Gifts.xlsx and restart the backend."},
            status_code=400,
        )
    gift = legacy._update_gift(gift_id, payload)
    if gift is None:
        return JSONResponse({"error": "Gift not found"}, status_code=404)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="update",
            entity="gift",
            entity_id=str(gift_id),
            description=f"Updated gift {gift_id}",
            actor="Admin",
        )
        connection.commit()
    finally:
        connection.close()
    dashboard_core._invalidate_dashboard_cache()
    return {"message": "Gift updated", "gift": gift}


def delete_gift_payload(gift_id: str):
    deleted = legacy._delete_gift(gift_id)
    if not deleted:
        return JSONResponse({"error": "Gift not found"}, status_code=404)
    connection = bonus_db()
    try:
        legacy._audit_log(
            connection,
            action="delete",
            entity="gift",
            entity_id=str(gift_id),
            description=f"Deleted gift {gift_id}",
            actor="Admin",
        )
        connection.commit()
    finally:
        connection.close()
    dashboard_core._invalidate_dashboard_cache()
    return {"message": "Gift deleted"}
