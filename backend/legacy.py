from __future__ import annotations

import io
import json
import math
import os
import re
import sqlite3
import time
import hmac
import hashlib
import secrets
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import random

import pandas as pd
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from requests.auth import HTTPBasicAuth

from backend.config import (
    A_DEBT_PATH,
    CASHIN_CACHE_PATH,
    CASHIN_CACHE_TTL_SEC,
    CATALOG_MANAGED_BY_XLSX,
    CATALOG_SEED_DEFAULTS,
    CLIENTS_CACHE_PATH,
    CLIENTS_CACHE_TTL_SEC,
    CLIENT_STOCKS_CACHE_PATH,
    CLIENT_STOCKS_CACHE_TTL_SEC,
    DASHBOARD_CACHE_TTL_SEC,
    DB_BACKEND,
    DEFAULT_BEGIN_DATE,
    DEFAULT_END_DATE,
    DEFAULT_FILIAL_ID,
    DEFAULT_USER_ID,
    DEMO_ACCOUNTS as _DEMO_ACCOUNTS,
    ESKIZ_BASE_URL,
    ESKIZ_CALLBACK_URL,
    ESKIZ_SMS_FROM,
    ESKIZ_SMS_TOKEN,
    GIFTS_XLSX_PATH,
    ITEM_QR_CODE_PREFIX,
    LIMIT_JSON_PATH,
    MAX_RETRIES,
    MOCK_OTP_CODE,
    OFFSET_CACHE_PATH,
    OFFSET_CACHE_TTL_SEC,
    ORDERS_CACHE_TTL_SEC,
    OTP_LENGTH,
    OTP_MISS_CACHE_TTL_SEC,
    OTP_PROVIDER,
    OTP_REMOTE_LOOKUP_CHUNK,
    OTP_REMOTE_LOOKUP_INCLUDE_INACTIVE,
    OTP_REMOTE_LOOKUP_MAX,
    OTP_SIGNING_SECRET,
    OTP_TTL_MINUTES,
    PRODUCTS_XLSX_PATH,
    QR_CODE_PREFIX,
    QR_CODE_SECRET,
    REQUEST_TIMEOUT,
    SMARTUP_LOGIN,
    SMARTUP_PASSWORD,
    UA,
    load_cors_origins,
    logger,
)
from backend.core.catalog import (
    DEFAULT_GIFTS,
    DEFAULT_PRODUCTS,
    _apply_qr_scan,
    _build_item_qr_code,
    _build_product_qr_code,
    _bulk_set_product_qr_revoked,
    _create_gift,
    _create_product,
    _delete_gift,
    _delete_product,
    _export_all_saved_qr_csv,
    _export_all_saved_qr_zip,
    _export_qr_zip_by_ids,
    _render_qr_png,
    _export_product_qr_zip,
    _export_product_saved_qr_csv,
    _export_product_saved_qr_zip,
    _generate_catalog_public_id,
    _generate_product_qr_codes,
    _load_all_product_qr_rows_for_export,
    _load_all_qr_codes,
    _load_catalog_deleted_ids,
    _load_gifts,
    _load_gifts_from_xlsx,
    _load_product_map,
    _load_product_qr_codes,
    _load_product_qr_rows_for_export,
    _load_product_qr_stats,
    _load_products,
    _load_products_from_xlsx,
    _mark_catalog_deleted,
    _parse_product_qr_code,
    _qr_signature,
    _slugify_catalog_text,
    _sync_catalog_from_uploaded_files,
    _unscan_product_qr_code,
    _update_gift,
    _update_product,
)
from backend.core.customers import (
    _apply_bonus_totals,
    _bootstrap_customers_from_cache,
    _create_customer,
    _customer_exists_with_phone,
    _customer_row_to_dict,
    _delete_clients_phone_index_for_client,
    _delete_customer,
    _find_client_by_phone_index,
    _find_client_by_phone_remote,
    _get_cached_client_by_id,
    _get_client_by_phone,
    _load_clients_cache,
    _load_clients_cache_file,
    _load_customer_activity,
    _load_customer_points,
    _load_customer_requests,
    _load_customer_snapshot,
    _load_customers_base,
    _load_reconciliation,
    _next_manual_customer_id,
    _normalize_customer_status,
    _normalize_phone,
    _now_text,
    _otp_config_debug,
    _phone_lookup_debug,
    _sanitize_customer_dict,
    _send_eskiz_sms,
    _sync_customers_cache_from_db,
    _upsert_clients_phone_index,
    _update_customer,
    _warm_clients_phone_index_from_cache,
    _create_otp,
    _verify_otp,
    _write_clients_cache,
)
from backend.core.transactions import (
    _apply_market_points_effect,
    _apply_request_effects,
    _create_market_order,
    _create_order,
    _create_request,
    _delete_order,
    _generate_market_order_public_id,
    _generate_order_public_id,
    _get_client_points_balance,
    _load_gift_by_id,
    _load_market_orders,
    _load_market_stats,
    _load_order_by_id,
    _load_orders,
    _load_qr_scan_events,
    _load_request_by_id,
    _load_requests,
    _normalize_market_status,
    _normalize_market_type,
    _request_status_applies_effects,
    _reverse_manual_bonus_order,
    _revert_market_points_effect,
    _revert_request_effects,
    _serialize_market_order_row,
    _serialize_manual_bonus_order,
    _serialize_request_row,
    _update_market_order_status,
    _update_request_status,
    _update_requests_status_bulk,
)
from backend.core.points import (
    _create_bonus_transaction,
    _insert_bonus_transaction,
    _load_bonus_summary_for_client,
    _load_bonus_totals,
)
from backend.db import bonus_db as _bonus_db
from backend.deps import (
    require_admin as _require_admin,
    require_admin_or_customer as _require_admin_or_customer,
    require_customer as _require_customer,
)
from backend.integrations.firebase_push import (
    ensure_firebase as _ensure_firebase,
    notify_request_status as _notify_request_status,
    send_push_notification as _send_push_notification,
    send_push_to_tokens as _send_push_to_tokens,
)
from backend.models.schemas import (
    CustomerUpsertPayload,
    MarketOrderCreatePayload,
    MarketOrderStatusPayload,
    OrderCreatePayload,
    RedemptionRequestBulkStatusPayload,
    RedemptionRequestCreatePayload,
    RedemptionRequestStatusPayload,
)

_ORDERS_CACHE: Dict[str, Dict[str, Any]] = {}
_PHONE_LOOKUP_MISS_CACHE: Dict[str, float] = {}
_CLIENTS_PHONE_INDEX_WARMED = False


def _invalidate_dashboard_cache() -> None:
    from backend.core import dashboard as dashboard_core

    dashboard_core._invalidate_dashboard_cache()

def _otp_hash(phone: str, otp: str) -> str:
    from backend.core import customers as customers_core

    return customers_core._otp_hash(phone, otp)

def _generate_otp_code() -> str:
    from backend.core import customers as customers_core

    return customers_core._generate_otp_code()

def _to_uz_phone(raw_phone: str) -> str:
    from backend.core import customers as customers_core

    return customers_core._to_uz_phone(raw_phone)


app = FastAPI(title="IRIZON Clients API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=load_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


def _init_bonus_db() -> None:
    connection = _bonus_db()
    try:
        if DB_BACKEND == "postgres":
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS bonus_transactions (
                    id BIGSERIAL PRIMARY KEY,
                    client_id TEXT NOT NULL,
                    client_name TEXT NOT NULL,
                    points INTEGER NOT NULL,
                    note TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_events (
                    id BIGSERIAL PRIMARY KEY,
                    action TEXT NOT NULL,
                    entity TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    actor TEXT NOT NULL DEFAULT 'System',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        else:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS bonus_transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    client_id TEXT NOT NULL,
                    client_name TEXT NOT NULL,
                    points INTEGER NOT NULL,
                    note TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action TEXT NOT NULL,
                    entity TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    actor TEXT NOT NULL DEFAULT 'System',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

        if DB_BACKEND == "postgres":
            existing_columns = {
                row["column_name"]
                for row in connection.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = 'bonus_transactions'
                    """
                ).fetchall()
            }
        else:
            existing_columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(bonus_transactions)").fetchall()
            }
        if "source_type" not in existing_columns:
            connection.execute("ALTER TABLE bonus_transactions ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual'")
        if "source_ref" not in existing_columns:
            connection.execute("ALTER TABLE bonus_transactions ADD COLUMN source_ref TEXT NOT NULL DEFAULT ''")
        id_column = "BIGSERIAL PRIMARY KEY" if DB_BACKEND == "postgres" else "INTEGER PRIMARY KEY AUTOINCREMENT"
        timestamp_column = "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" if DB_BACKEND == "postgres" else "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"

        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name_ru TEXT NOT NULL,
                points_value INTEGER NOT NULL,
                category TEXT NOT NULL DEFAULT '',
                is_active INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS orders (
                id {id_column},
                public_id TEXT NOT NULL UNIQUE,
                created_at {timestamp_column},
                customer_id TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                total_points INTEGER NOT NULL,
                items_count INTEGER NOT NULL,
                created_by TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Confirmed',
                note TEXT NOT NULL DEFAULT ''
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS gifts (
                id TEXT PRIMARY KEY,
                name_ru TEXT NOT NULL,
                description_ru TEXT NOT NULL DEFAULT '',
                points_cost INTEGER NOT NULL,
                category TEXT NOT NULL DEFAULT '',
                stock INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                image TEXT NOT NULL DEFAULT ''
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS catalog_deleted_items (
                item_type TEXT NOT NULL,
                item_id TEXT NOT NULL,
                deleted_at {timestamp_column},
                PRIMARY KEY (item_type, item_id)
            )
            """
        )
        if DB_BACKEND == "postgres":
            connection.execute("ALTER TABLE products DROP COLUMN IF EXISTS name_en")
            connection.execute("ALTER TABLE products DROP COLUMN IF EXISTS name_uz")
            connection.execute("ALTER TABLE gifts DROP COLUMN IF EXISTS name_en")
            connection.execute("ALTER TABLE gifts DROP COLUMN IF EXISTS name_uz")
            connection.execute("ALTER TABLE gifts DROP COLUMN IF EXISTS description_en")
            connection.execute("ALTER TABLE gifts DROP COLUMN IF EXISTS description_uz")
            connection.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT NOT NULL DEFAULT ''")
        else:
            try:
                connection.execute("ALTER TABLE products ADD COLUMN sku TEXT NOT NULL DEFAULT ''")
            except Exception:
                pass
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS order_items (
                id {id_column},
                order_public_id TEXT NOT NULL,
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                points_per_unit INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                total_points INTEGER NOT NULL
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS redemption_requests (
                id {id_column},
                public_id TEXT NOT NULL UNIQUE,
                created_at {timestamp_column},
                customer_id TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                gift_id TEXT NOT NULL,
                gift_name TEXT NOT NULL,
                gift_image TEXT NOT NULL DEFAULT '',
                points_used INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pending',
                operator TEXT NOT NULL DEFAULT '',
                reject_reason TEXT NOT NULL DEFAULT '',
                request_type TEXT NOT NULL DEFAULT 'Admin',
                stock_applied INTEGER NOT NULL DEFAULT 0,
                points_applied INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS auth_otps (
                phone TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                otp_code TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at {timestamp_column}
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS clients_phone_index (
                phone_norm TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                full_name TEXT NOT NULL DEFAULT '',
                phone_raw TEXT NOT NULL DEFAULT '',
                last_updated TEXT NOT NULL DEFAULT '',
                updated_at {timestamp_column}
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                full_name TEXT NOT NULL,
                phone_raw TEXT NOT NULL DEFAULT '',
                phone_norm TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active',
                last_updated TEXT NOT NULL DEFAULT '',
                created_at {timestamp_column},
                updated_at {timestamp_column}
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS qr_scan_events (
                id {id_column},
                client_id TEXT NOT NULL,
                client_name TEXT NOT NULL,
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                qr_code TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                points_awarded INTEGER NOT NULL,
                created_at {timestamp_column}
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS product_qr_codes (
                id {id_column},
                qr_code TEXT NOT NULL UNIQUE,
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                points_per_unit INTEGER NOT NULL,
                is_used INTEGER NOT NULL DEFAULT 0,
                used_by_client_id TEXT NOT NULL DEFAULT '',
                used_at TEXT NOT NULL DEFAULT '',
                is_revoked INTEGER NOT NULL DEFAULT 0,
                revoked_at TEXT NOT NULL DEFAULT '',
                created_at {timestamp_column}
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS points_market_orders (
                id {id_column},
                public_id TEXT NOT NULL UNIQUE,
                created_at {timestamp_column},
                client_id TEXT NOT NULL,
                client_name TEXT NOT NULL,
                type TEXT NOT NULL,
                points INTEGER NOT NULL,
                amount_uzs INTEGER NOT NULL,
                rate INTEGER NOT NULL,
                payment_method TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Pending',
                note TEXT NOT NULL DEFAULT '',
                operator TEXT NOT NULL DEFAULT 'Admin',
                points_applied INTEGER NOT NULL DEFAULT 0,
                updated_at {timestamp_column}
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS customer_sessions (
                token TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at {timestamp_column}
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS device_tokens (
                id {id_column},
                customer_id TEXT NOT NULL,
                fcm_token TEXT NOT NULL UNIQUE,
                platform TEXT DEFAULT 'android',
                updated_at {timestamp_column}
            )
            """
        )
        if DB_BACKEND == "postgres":
            product_qr_columns = {
                str(row["column_name"]): True
                for row in connection.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'product_qr_codes'
                    """
                ).fetchall()
            }
        else:
            product_qr_columns = {
                str(row["name"]): True
                for row in connection.execute("PRAGMA table_info(product_qr_codes)").fetchall()
            }
        if "is_revoked" not in product_qr_columns:
            connection.execute("ALTER TABLE product_qr_codes ADD COLUMN is_revoked INTEGER NOT NULL DEFAULT 0")
        if "revoked_at" not in product_qr_columns:
            connection.execute("ALTER TABLE product_qr_codes ADD COLUMN revoked_at TEXT NOT NULL DEFAULT ''")
        if DB_BACKEND == "postgres":
            market_columns = {
                str(row["column_name"]): True
                for row in connection.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'points_market_orders'
                    """
                ).fetchall()
            }
        else:
            market_columns = {
                str(row["name"]): True
                for row in connection.execute("PRAGMA table_info(points_market_orders)").fetchall()
            }
        if "points_applied" not in market_columns:
            connection.execute("ALTER TABLE points_market_orders ADD COLUMN points_applied INTEGER NOT NULL DEFAULT 0")
        if "updated_at" not in market_columns:
            connection.execute("ALTER TABLE points_market_orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_bonus_transactions_client_created ON bonus_transactions (client_id, created_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders (customer_id, created_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_order_items_order_public_id ON order_items (order_public_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_redemption_requests_customer_created ON redemption_requests (customer_id, created_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_qr_scan_events_client_created ON qr_scan_events (client_id, created_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_clients_phone_index_client_id ON clients_phone_index (client_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_customers_phone_norm ON customers (phone_norm)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_customers_status_updated ON customers (status, updated_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_product_qr_codes_product_used_created ON product_qr_codes (product_id, is_used, created_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_product_qr_codes_product_revoked_created ON product_qr_codes (product_id, is_revoked, created_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_market_orders_client_created ON points_market_orders (client_id, created_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_market_orders_status_created ON points_market_orders (status, created_at)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_catalog_deleted_items_type_id ON catalog_deleted_items (item_type, item_id)")

        # first_activity_at: when the customer first became active in the loyalty
        # program (first bonus / scan / redemption / login). NULL = never active.
        # Seed-time created_at is meaningless (all rows share the migration date),
        # so this is the real basis for "new this month" and lifetime metrics.
        if DB_BACKEND == "postgres":
            customer_columns = {
                str(row["column_name"])
                for row in connection.execute(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = 'customers'"
                ).fetchall()
            }
        else:
            customer_columns = {
                str(row["name"]) for row in connection.execute("PRAGMA table_info(customers)").fetchall()
            }
        if "first_activity_at" not in customer_columns:
            nullable_ts = "TIMESTAMP" if DB_BACKEND == "postgres" else "TEXT"
            connection.execute(f"ALTER TABLE customers ADD COLUMN first_activity_at {nullable_ts}")
            # One-time backfill from the earliest recorded activity per customer.
            connection.execute(
                """
                UPDATE customers SET first_activity_at = sub.first_at
                FROM (
                    SELECT client_id, MIN(created_at) AS first_at FROM (
                        SELECT client_id, created_at FROM bonus_transactions
                        UNION ALL SELECT client_id, created_at FROM qr_scan_events
                        UNION ALL SELECT customer_id AS client_id, created_at FROM redemption_requests
                        UNION ALL SELECT client_id, created_at FROM customer_sessions
                    ) act GROUP BY client_id
                ) sub
                WHERE customers.id = sub.client_id AND customers.first_activity_at IS NULL
                """
            )
        connection.execute(
            """
            DELETE FROM products
            WHERE id IN (
                SELECT item_id FROM catalog_deleted_items WHERE item_type = 'product'
            )
            """
        )
        connection.execute(
            """
            DELETE FROM gifts
            WHERE id IN (
                SELECT item_id FROM catalog_deleted_items WHERE item_type = 'gift'
            )
            """
        )
        if CATALOG_SEED_DEFAULTS:
            deleted_product_ids = _load_catalog_deleted_ids(connection, "product")
            products_seeded = connection.execute(
                "SELECT 1 FROM system_settings WHERE key = 'products_seeded'"
            ).fetchone()
            if not products_seeded:
                connection.executemany(
                    """
                    INSERT OR IGNORE INTO products (
                        id, name_ru, points_value, category, is_active
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            product["id"],
                            product["name"]["RU"],
                            int(product["pointsValue"]),
                            str(product["category"]),
                            1 if product["isActive"] else 0,
                        )
                        for product in DEFAULT_PRODUCTS
                        if str(product["id"]) not in deleted_product_ids
                    ],
                )
                connection.execute(
                    "INSERT OR IGNORE INTO system_settings (key, value) VALUES ('products_seeded', '1')"
                )
            deleted_gift_ids = _load_catalog_deleted_ids(connection, "gift")
            gifts_seeded = connection.execute(
                "SELECT 1 FROM system_settings WHERE key = 'gifts_seeded'"
            ).fetchone()
            if not gifts_seeded:
                connection.executemany(
                    """
                    INSERT OR IGNORE INTO gifts (
                        id, name_ru, description_ru, points_cost, category, stock, is_active, image
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            gift["id"],
                            gift["name"]["RU"],
                            gift["description"]["RU"],
                            int(gift["pointsCost"]),
                            str(gift["category"]),
                            int(gift["stock"]),
                            1 if gift["isActive"] else 0,
                            str(gift["image"]),
                        )
                        for gift in DEFAULT_GIFTS
                        if str(gift["id"]) not in deleted_gift_ids
                    ],
                )
                connection.execute(
                    "INSERT OR IGNORE INTO system_settings (key, value) VALUES ('gifts_seeded', '1')"
                )
        if CATALOG_MANAGED_BY_XLSX:
            _sync_catalog_from_uploaded_files(connection)
        _bootstrap_customers_from_cache(connection)
        connection.commit()
    finally:
        connection.close()
    _sync_customers_cache_from_db()


def _audit_log(
    connection: Any,
    *,
    action: str,
    entity: str,
    entity_id: str = "",
    description: str = "",
    actor: str = "System",
) -> None:
    connection.execute(
        """
        INSERT INTO audit_events (action, entity, entity_id, description, actor)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            str(action or ""),
            str(entity or ""),
            str(entity_id or ""),
            str(description or ""),
            str(actor or "System"),
        ),
    )


def _auth() -> HTTPBasicAuth:
    return HTTPBasicAuth(SMARTUP_LOGIN, SMARTUP_PASSWORD)


def _require_credentials() -> Optional[JSONResponse]:
    if not SMARTUP_LOGIN or not SMARTUP_PASSWORD:
        return JSONResponse(
            {"error": "SMARTUP_LOGIN / SMARTUP_PASSWORD env not set"},
            status_code=500,
        )
    return None


def _safe_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": UA,
            "Accept": "*/*",
        }
    )
    return session


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


def _safe_num(value: Any) -> float:
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else 0.0
    except Exception:
        return 0.0


_init_bonus_db()
logger.info("Database backend initialized: %s", DB_BACKEND)


def _is_xlsx(content: bytes) -> bool:
    from backend.core import dashboard as dashboard_core

    return dashboard_core._is_xlsx(content)


def _month_bounds_for_today() -> Tuple[date, date]:
    from backend.core import dashboard as dashboard_core

    return dashboard_core._month_bounds_for_today()


def _request_with_retry(
    method: str,
    url: str,
    *,
    session: requests.Session,
    auth: HTTPBasicAuth,
    params: Optional[dict] = None,
    data: Optional[dict] = None,
    json_payload: Optional[dict] = None,
    headers: Optional[dict] = None,
    timeout: int = REQUEST_TIMEOUT,
    max_retries: int = MAX_RETRIES,
) -> Tuple[Optional[requests.Response], Optional[JSONResponse]]:
    from backend.core import dashboard as dashboard_core

    return dashboard_core._request_with_retry(
        method,
        url,
        session=session,
        auth=auth,
        params=params,
        data=data,
        json_payload=json_payload,
        headers=headers,
        timeout=timeout,
        max_retries=max_retries,
    )


def _norm_name(raw: str) -> str:
    from backend.core import dashboard as dashboard_core

    return dashboard_core._norm_name(raw)


def _load_limit_json() -> Dict[str, float]:
    from backend.core import dashboard as dashboard_core

    return dashboard_core._load_limit_json()


def _load_a_category_debt() -> Dict[str, float]:
    from backend.core import dashboard as dashboard_core

    return dashboard_core._load_a_category_debt()


CASHIN_LIST_P = {
    "do": 2,
    "column": ["cashin_number", "cashin_date", "room_names", "client_name", "amount", "note", "created_by_name"],
    "label": ["РќРѕРјРµСЂ РѕРїР»Р°С‚С‹", "Р”Р°С‚Р°", "РўРµРєСѓС‰РёРµ СЂР°Р±РѕС‡РёРµ Р·РѕРЅС‹", "РљР»РёРµРЅС‚", "РЎСѓРјРјР°", "РџСЂРёРјРµС‡Р°РЅРёРµ", "РЎРѕР·РґР°Р»"],
    "size": ["1.965656", "2.157551", "3.043207", "3.364723", "3.000000", "2.216152", "2.973761"],
    "img": [None, None, None, None, None, None, None],
    "filter": [],
    "sort": ["-cashin_time"],
    "rt": "xlsx",
}


def _fetch_cashin_monthly(refresh: bool = False) -> Dict[str, float]:
    from backend.core import dashboard as dashboard_core

    return dashboard_core._fetch_cashin_monthly(refresh=refresh)


def _fetch_client_stocks(refresh: bool = False) -> Dict[str, Dict[str, Any]]:
    from backend.core import dashboard as dashboard_core

    return dashboard_core._fetch_client_stocks(refresh=refresh)


OFFSET_LIST_BASE_P = {
    "do": 2,
    "column": ["person_name", "currency_name", "debt_amount", "advance_amount", "total_amount"],
    "label": ["РљР»РёРµРЅС‚", "Р’Р°Р»СЋС‚Р°", "Р—Р°РґРѕР»Р¶РµРЅРЅРѕСЃС‚СЊ", "РџСЂРµРґРѕРїР»Р°С‚Р°", "Р‘Р°Р»Р°РЅСЃ"],
    "size": ["4.999968", "1.464000", "1.644000", "2.253600", "1.644000"],
    "img": [None, None, None, None, None],
    "filter": [],
    "sort": ["person_name"],
    "rt": "xlsx",
}


def _fetch_offset_debt(refresh: bool = False, chunk: int = 5000) -> Dict[str, float]:
    from backend.core import dashboard as dashboard_core

    return dashboard_core._fetch_offset_debt(refresh=refresh, chunk=chunk)


def _build_clients(refresh: bool = False, offset: int = 0, limit: int = 500):
    from backend.core import dashboard as dashboard_core

    return dashboard_core._build_clients(refresh=refresh, offset=offset, limit=limit)


def _build_dashboard_summary() -> Dict[str, Any]:
    from backend.core import dashboard as dashboard_core

    return dashboard_core._build_dashboard_summary()


