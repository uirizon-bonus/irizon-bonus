from .legacy import app
from .routers.auth import router as auth_router
from .routers.catalog import router as catalog_router
from .routers.customers import router as customers_router
from .routers.dashboard import router as dashboard_router
from .routers.market import router as market_router
from .routers.orders import router as orders_router
from .routers.push import router as push_router
from .routers.qr_scans import router as qr_scans_router
from .routers.requests import router as requests_router

app.include_router(auth_router)
app.include_router(catalog_router)
app.include_router(customers_router)
app.include_router(dashboard_router)
app.include_router(market_router)
app.include_router(orders_router)
app.include_router(push_router)
app.include_router(qr_scans_router)
app.include_router(requests_router)
