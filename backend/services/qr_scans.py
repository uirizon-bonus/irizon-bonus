from backend.core import transactions as transaction_core


def get_qr_scans_payload(offset: int, limit: int, customer_id: str, product_id: str, search: str):
    return transaction_core._load_qr_scan_events(
        offset=int(offset),
        limit=int(limit),
        customer_id=customer_id,
        product_id=product_id,
        search=search,
    )
