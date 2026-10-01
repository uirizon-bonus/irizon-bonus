from fastapi.staticfiles import StaticFiles

from .config import UPLOADS_DIR
from .legacy import app
from .routers.admin_auth import router as admin_auth_router
from .routers.auth import router as auth_router
from .routers.catalog import router as catalog_router
from .routers.customers import router as customers_router
from .routers.dashboard import router as dashboard_router
from .routers.geo import router as geo_router
from .routers.market import router as market_router
from .routers.orders import router as orders_router
from .routers.push import router as push_router
from .routers.qr_scans import router as qr_scans_router
from .routers.requests import router as requests_router
from .routers.smartup import router as smartup_router
from .routers.uploads import router as uploads_router

app.include_router(admin_auth_router)
app.include_router(auth_router)
app.include_router(catalog_router)
app.include_router(customers_router)
app.include_router(dashboard_router)
app.include_router(geo_router)
app.include_router(market_router)
app.include_router(orders_router)
app.include_router(push_router)
app.include_router(qr_scans_router)
app.include_router(requests_router)
app.include_router(smartup_router)
app.include_router(uploads_router)

# Serve uploaded catalogue photos back. The directory is created up front
# because StaticFiles refuses to mount a path that is not there yet, which on a
# fresh server would take the whole API down rather than just the images.
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
