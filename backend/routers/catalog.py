from fastapi import APIRouter, Depends, Query

from backend import deps
from backend.models.schemas import GiftCreatePayload, ProductCreatePayload, ProductQrBulkIdsPayload, ProductQrGeneratePayload, ProductQrUnscanPayload
from backend.services import catalog as catalog_service


router = APIRouter(tags=["catalog"])


@router.get("/api/products")
def get_products():
    return catalog_service.get_products_payload()


@router.get("/api/products/{product_id}/qr", dependencies=[Depends(deps.require_admin)])
def get_product_qr(product_id: str):
    return catalog_service.get_product_qr_payload(product_id)


@router.get("/api/products/{product_id}/qr-codes", dependencies=[Depends(deps.require_admin)])
def get_product_qr_codes(
    product_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=5000),
    state: str = Query("all", description="all|unused|used|revoked"),
    search: str = Query("", description="Search by QR value or used client ID"),
    date_from: str = Query("", description="Filter created date >= YYYY-MM-DD"),
    date_to: str = Query("", description="Filter created date <= YYYY-MM-DD"),
):
    return catalog_service.get_product_qr_codes_payload(product_id, offset, limit, state, search, date_from, date_to)


@router.get("/api/qr-codes", dependencies=[Depends(deps.require_admin)])
def get_all_qr_codes(
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=5000),
    state: str = Query("all", description="all|unused|used|revoked"),
    search: str = Query("", description="Search by QR value or used client ID"),
    date_from: str = Query("", description="Filter created date >= YYYY-MM-DD"),
    date_to: str = Query("", description="Filter created date <= YYYY-MM-DD"),
):
    return catalog_service.get_all_qr_codes_payload(offset, limit, state, search, date_from, date_to)


@router.post("/api/products/{product_id}/qr-codes/generate", dependencies=[Depends(deps.require_admin)])
def generate_product_qr_codes(product_id: str, payload: ProductQrGeneratePayload):
    return catalog_service.generate_product_qr_codes_payload(product_id, payload)


@router.get("/api/products/{product_id}/qr-codes/stats", dependencies=[Depends(deps.require_admin)])
def get_product_qr_codes_stats(product_id: str):
    return catalog_service.get_product_qr_codes_stats_payload(product_id)


@router.get("/api/qr-codes/stats", dependencies=[Depends(deps.require_admin)])
def get_all_qr_codes_stats():
    return catalog_service.get_all_qr_codes_stats_payload()


@router.post("/api/products/{product_id}/qr-codes/revoke", dependencies=[Depends(deps.require_admin)])
def revoke_product_qr_codes(product_id: str, payload: ProductQrBulkIdsPayload):
    return catalog_service.revoke_product_qr_codes_payload(product_id, payload)


@router.post("/api/products/{product_id}/qr-codes/restore", dependencies=[Depends(deps.require_admin)])
def restore_product_qr_codes(product_id: str, payload: ProductQrBulkIdsPayload):
    return catalog_service.restore_product_qr_codes_payload(product_id, payload)


@router.post("/api/products/{product_id}/qr-codes/{qr_row_id}/unscan", dependencies=[Depends(deps.require_admin)])
def unscan_product_qr_code(product_id: str, qr_row_id: int, payload: ProductQrUnscanPayload):
    return catalog_service.unscan_product_qr_code_payload(product_id, qr_row_id, payload)


@router.get("/api/products/{product_id}/qr-codes.csv", dependencies=[Depends(deps.require_admin)])
def download_product_qr_codes_csv(
    product_id: str,
    include_used: bool = Query(True),
    include_revoked: bool = Query(True),
):
    return catalog_service.download_product_qr_codes_csv_payload(product_id, include_used, include_revoked)


@router.get("/api/qr-codes.csv", dependencies=[Depends(deps.require_admin)])
def download_all_qr_codes_csv(
    include_used: bool = Query(True),
    include_revoked: bool = Query(True),
):
    return catalog_service.download_all_qr_codes_csv_payload(include_used, include_revoked)


@router.get("/api/products/{product_id}/qr-codes.zip", dependencies=[Depends(deps.require_admin)])
def download_product_qr_codes_zip(
    product_id: str,
    size: int = Query(600, ge=200, le=2000),
    include_used: bool = Query(True),
    include_revoked: bool = Query(True),
    w: float = Query(None, ge=1.0, le=30.0),
    h: float = Query(None, ge=1.0, le=30.0),
):
    return catalog_service.download_product_qr_codes_zip_payload(product_id, size, include_used, include_revoked, w, h)


@router.get("/api/qr-codes.zip", dependencies=[Depends(deps.require_admin)])
def download_all_qr_codes_zip(
    size: int = Query(600, ge=200, le=2000),
    include_used: bool = Query(True),
    include_revoked: bool = Query(True),
    w: float = Query(None, ge=1.0, le=30.0),
    h: float = Query(None, ge=1.0, le=30.0),
):
    return catalog_service.download_all_qr_codes_zip_payload(size, include_used, include_revoked, w, h)


@router.post("/api/qr-codes/zip", dependencies=[Depends(deps.require_admin)])
def download_selected_qr_codes_zip(
    payload: ProductQrBulkIdsPayload,
    w: float = Query(None, ge=1.0, le=30.0),
    h: float = Query(None, ge=1.0, le=30.0),
):
    return catalog_service.download_selected_qr_codes_zip_payload(payload.ids, w, h)


@router.get("/api/qr-label.png", dependencies=[Depends(deps.require_admin)])
def render_qr_label(
    value: str = Query(..., min_length=1),
    code: str = Query(""),
    w: float = Query(None, ge=1.0, le=30.0),
    h: float = Query(None, ge=1.0, le=30.0),
):
    return catalog_service.render_qr_label_payload(value, code, w, h)


@router.get("/api/products/qr-batch.zip", dependencies=[Depends(deps.require_admin)])
def get_products_qr_batch(size: int = Query(600, ge=200, le=2000)):
    return catalog_service.get_products_qr_batch_payload(size)


@router.post("/api/products", dependencies=[Depends(deps.require_admin)])
def create_product(payload: ProductCreatePayload):
    return catalog_service.create_product_payload(payload)


@router.put("/api/products/{product_id}", dependencies=[Depends(deps.require_admin)])
def update_product(product_id: str, payload: ProductCreatePayload):
    return catalog_service.update_product_payload(product_id, payload)


@router.delete("/api/products/{product_id}", dependencies=[Depends(deps.require_admin)])
def delete_product(product_id: str):
    return catalog_service.delete_product_payload(product_id)


@router.get("/api/gifts")
def get_gifts():
    return catalog_service.get_gifts_payload()


@router.post("/api/gifts", dependencies=[Depends(deps.require_admin)])
def create_gift(payload: GiftCreatePayload):
    return catalog_service.create_gift_payload(payload)


@router.put("/api/gifts/{gift_id}", dependencies=[Depends(deps.require_admin)])
def update_gift(gift_id: str, payload: GiftCreatePayload):
    return catalog_service.update_gift_payload(gift_id, payload)


@router.delete("/api/gifts/{gift_id}", dependencies=[Depends(deps.require_admin)])
def delete_gift(gift_id: str):
    return catalog_service.delete_gift_payload(gift_id)
