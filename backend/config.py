import logging
import os
from pathlib import Path
from typing import Any, Dict

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("clients_api")


APP_DISPLAY_NAME = os.getenv("APP_DISPLAY_NAME", "IRIZON BONUS").strip() or "IRIZON BONUS"
OTP_PROVIDER = os.getenv("OTP_PROVIDER", "mock").strip().lower()
OTP_LENGTH = int(os.getenv("OTP_LENGTH", "6"))
OTP_SIGNING_SECRET = os.getenv("OTP_SIGNING_SECRET", "otp-secret")
ESKIZ_BASE_URL = os.getenv("ESKIZ_BASE_URL", "https://notify.eskiz.uz/api").rstrip("/")
ESKIZ_SMS_TOKEN = os.getenv("ESKIZ_SMS_TOKEN", "").strip()
if ESKIZ_SMS_TOKEN.lower().startswith("bearer "):
    ESKIZ_SMS_TOKEN = ESKIZ_SMS_TOKEN[7:].strip()
ESKIZ_SMS_FROM = os.getenv("ESKIZ_SMS_FROM", "4546").strip()
ESKIZ_CALLBACK_URL = os.getenv("ESKIZ_CALLBACK_URL", "").strip()
OTP_TTL_MINUTES = int(os.getenv("OTP_TTL_MINUTES", os.getenv("MOCK_OTP_TTL_MINUTES", "10")))
OTP_REMOTE_LOOKUP_CHUNK = int(os.getenv("OTP_REMOTE_LOOKUP_CHUNK", "1000"))
OTP_REMOTE_LOOKUP_MAX = int(os.getenv("OTP_REMOTE_LOOKUP_MAX", "12000"))
OTP_REMOTE_LOOKUP_INCLUDE_INACTIVE = os.getenv("OTP_REMOTE_LOOKUP_INCLUDE_INACTIVE", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "y",
    "on",
}
OTP_MISS_CACHE_TTL_SEC = int(os.getenv("OTP_MISS_CACHE_TTL_SEC", "300"))

SMARTUP_LOGIN = os.getenv("SMARTUP_LOGIN", "")
SMARTUP_PASSWORD = os.getenv("SMARTUP_PASSWORD", "")

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "").strip()
SESSION_TTL_MINUTES = int(os.getenv("SESSION_TTL_MINUTES", "1440"))
FIREBASE_SERVICE_ACCOUNT = os.getenv("FIREBASE_SERVICE_ACCOUNT", "firebase-service-account.json")

DEFAULT_FILIAL_ID = os.getenv("SMARTUP_FILIAL_ID", "8516359")
DEFAULT_USER_ID = os.getenv("SMARTUP_USER_ID", "7055199")
DEFAULT_BEGIN_DATE = os.getenv("SMARTUP_BEGIN_DATE", "01.02.2022")
DEFAULT_END_DATE = os.getenv("SMARTUP_END_DATE", "18.02.2029")

REQUEST_TIMEOUT = int(os.getenv("SMARTUP_TIMEOUT", "600"))
MAX_RETRIES = int(os.getenv("SMARTUP_MAX_RETRIES", "3"))
UA = os.getenv("SMARTUP_USER_AGENT", "Mozilla/5.0")

BASE_DIR = Path(__file__).resolve().parents[1]
LIMIT_JSON_PATH = BASE_DIR / "src" / "data" / "client_limit.json"
A_DEBT_PATH = BASE_DIR / "src" / "data" / "a-category-debt.xlsx"
CASHIN_CACHE_PATH = BASE_DIR / "src" / "data" / "cashin_cache.parquet"
CASHIN_CACHE_TTL_SEC = 60 * 60 * 3
CLIENT_STOCKS_CACHE_PATH = BASE_DIR / "src" / "data" / "client_stocks_cache.parquet"
CLIENT_STOCKS_CACHE_TTL_SEC = 60 * 60 * 3
OFFSET_CACHE_PATH = BASE_DIR / "src" / "data" / "offset_cache.parquet"
OFFSET_CACHE_TTL_SEC = 60 * 60 * 3
BONUS_DB_PATH = BASE_DIR / "irizon_bonus.sqlite3"
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DB_BACKEND = "postgres" if DATABASE_URL.startswith(("postgres://", "postgresql://")) else "sqlite"
CLIENTS_CACHE_PATH = BASE_DIR / "src" / "data" / "clients_cache.json"
CLIENTS_CACHE_TTL_SEC = int(os.getenv("CLIENTS_CACHE_TTL_SEC", str(60 * 15)))
ORDERS_CACHE_TTL_SEC = int(os.getenv("ORDERS_CACHE_TTL_SEC", "30"))
DASHBOARD_CACHE_TTL_SEC = int(os.getenv("DASHBOARD_CACHE_TTL_SEC", "20"))
PRODUCTS_XLSX_PATH = BASE_DIR / "products.xlsx"
GIFTS_XLSX_PATH = BASE_DIR / "Gifts.xlsx"
MOCK_OTP_CODE = os.getenv("MOCK_OTP_CODE", "111111")
MOCK_OTP_TTL_MINUTES = int(os.getenv("MOCK_OTP_TTL_MINUTES", "10"))

QR_CODE_PREFIX = os.getenv("QR_CODE_PREFIX", "IRIZON-PRODUCT")
QR_CODE_SECRET = os.getenv("QR_CODE_SECRET", "irizon-qr-secret")
ITEM_QR_CODE_PREFIX = os.getenv("ITEM_QR_CODE_PREFIX", "IRIZON-ITEM")
CATALOG_MANAGED_BY_XLSX = os.getenv("CATALOG_MANAGED_BY_XLSX", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "y",
    "on",
}
CATALOG_SEED_DEFAULTS = os.getenv("CATALOG_SEED_DEFAULTS", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "y",
    "on",
}


def _build_demo_accounts() -> Dict[str, str]:
    result: Dict[str, str] = {}
    for entry in os.getenv("DEMO_ACCOUNTS", "").split(","):
        entry = entry.strip()
        if ":" in entry:
            phone, code = entry.split(":", 1)
            raw = "".join(character for character in phone.strip() if character.isdigit())
            normalized = raw[-9:] if (raw.startswith("998") and len(raw) >= 12) else (raw[-9:] if len(raw) >= 9 else raw)
            result[normalized] = code.strip()
    return result


DEMO_ACCOUNTS: Dict[str, str] = _build_demo_accounts()


def load_cors_origins() -> list[str]:
    raw_value = os.getenv("CORS_ALLOW_ORIGINS", "*")
    origins = [
        origin.strip().rstrip("/")
        for origin in raw_value.split(",")
        if origin.strip()
    ]
    return origins or ["*"]

