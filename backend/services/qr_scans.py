from backend.core import transactions as transaction_core


def get_qr_scans_payload(offset: int, limit: int, customer_id: str, product_id: str, search: str, date_from: str = "", date_to: str = ""):
    return transaction_core._load_qr_scan_events(
        offset=int(offset),
        limit=int(limit),
        customer_id=customer_id,
        product_id=product_id,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )
