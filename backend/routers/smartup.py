from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from backend import deps, legacy
from backend.core import admin_users
from backend.core import smartup_sync
from backend.db import bonus_db

router = APIRouter()


@router.get("/api/smartup/inventory", dependencies=[Depends(deps.require_admin)])
def search_smartup_inventory(
    q: str = Query(default="", max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    in_stock: bool = Query(default=False),
):
    """Search the mirrored SmartUp catalogue, so linking a product is a search
    rather than typing a code from memory. Served from our copy — no API call."""
    return {
        "items": smartup_sync.search_inventory(q, limit=limit, in_stock_only=in_stock),
        "sync": smartup_sync.last_sync_state(),
    }


@router.get("/api/smartup/sync", dependencies=[Depends(deps.require_admin)])
def get_smartup_sync_state():
    return smartup_sync.last_sync_state()


@router.post("/api/smartup/sync", dependencies=[Depends(deps.require_admin)])
def run_smartup_sync(force: bool = Query(default=False)):
    """Refresh the catalogue and Основной склад stock from SmartUp.

    Rate-limited by default: the company shares 500 API calls a day across every
    integration, so a sync that just ran is reported back instead of repeated.
    """
    try:
        summary = smartup_sync.sync_if_stale(force=force)
    except smartup_sync.SmartUpUnavailable as exc:
        return JSONResponse(exc.as_payload(), status_code=502)

    if not summary.get("skipped"):
        connection = bonus_db()
        try:
            legacy._audit_log(
                connection,
                action="smartup_sync",
                entity="smartup_inventory",
                entity_id=str(summary.get("warehouseId", "")),
                description=(
                    f"Synced {summary.get('catalogueCount', 0)} SmartUp products, "
                    f"{summary.get('productsUpdated', 0)} linked products restocked"
                ),
                actor=admin_users.current_actor(),
            )
            connection.commit()
        finally:
            connection.close()
    return summary
