from __future__ import annotations

import hashlib
import hmac
import json
import re
import random
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import requests

from backend.config import (
    CLIENTS_CACHE_PATH,
    CLIENTS_CACHE_TTL_SEC,
    ESKIZ_BASE_URL,
    ESKIZ_CALLBACK_URL,
    ESKIZ_SMS_FROM,
    ESKIZ_SMS_TOKEN,
    MOCK_OTP_CODE,
    OTP_LENGTH,
    OTP_MISS_CACHE_TTL_SEC,
    OTP_PROVIDER,
    OTP_REMOTE_LOOKUP_CHUNK,
    OTP_REMOTE_LOOKUP_INCLUDE_INACTIVE,
    OTP_REMOTE_LOOKUP_MAX,
    OTP_SIGNING_SECRET,
    OTP_TTL_MINUTES,
    DEMO_ACCOUNTS as _DEMO_ACCOUNTS,
    logger,
)
from backend.core import points as points_core
from backend.db import bonus_db
from backend.models.schemas import CustomerUpsertPayload

_PHONE_LOOKUP_MISS_CACHE: Dict[str, float] = {}
_CLIENTS_PHONE_INDEX_WARMED = False


def _load_clients_cache_file(include_stale: bool = False) -> Optional[List[Dict[str, Any]]]:
    if not CLIENTS_CACHE_PATH.exists():
        return None
    try:
        if not include_stale and time.time() - CLIENTS_CACHE_PATH.stat().st_mtime > CLIENTS_CACHE_TTL_SEC:
            return None
        payload = json.loads(CLIENTS_CACHE_PATH.read_text(encoding="utf-8"))
        clients = payload.get("clients") if isinstance(payload, dict) else None
        return clients if isinstance(clients, list) else None
    except Exception:
        return None


def _write_clients_cache(clients: List[Dict[str, Any]]) -> None:
    try:
        CLIENTS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CLIENTS_CACHE_PATH.write_text(
            json.dumps({"fetched_at": time.time(), "clients": clients}, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("Failed to write clients cache: %s", exc)


def _now_text() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _normalize_customer_status(value: Any) -> str:
    normalized = str(value or "active").strip().lower()
    return "blocked" if normalized == "blocked" else "active"


def _sanitize_customer_dict(customer: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(customer.get("id") or "").strip(),
        "fullName": str(customer.get("fullName") or customer.get("name") or "").strip(),
        "phone": str(customer.get("phone") or "").strip(),
        "status": _normalize_customer_status(customer.get("status")),
        "lastUpdated": str(customer.get("lastUpdated") or customer.get("updated_at") or "").strip(),
    }


def _customer_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": str(row["id"] or "").strip(),
        "fullName": str(row["full_name"] or "").strip(),
        "phone": str(row["phone_raw"] or "").strip(),
        "status": _normalize_customer_status(row["status"]),
        "lastUpdated": str(row["last_updated"] or row["updated_at"] or "").strip(),
    }


def _bootstrap_customers_from_cache(connection: Any) -> None:
    existing = connection.execute("SELECT COUNT(*) AS total FROM customers").fetchone()
    if int(existing["total"] or 0) > 0:
        return

    seed_rows: List[Tuple[str, str, str, str, str, str]] = []
    seen_ids: set[str] = set()

    cached_clients = _load_clients_cache_file(include_stale=True) or []
    for client in cached_clients:
        customer = _sanitize_customer_dict(client)
        customer_id = customer["id"]
        if not customer_id or customer_id in seen_ids:
            continue
        seed_rows.append(
            (
                customer_id,
                customer["fullName"] or customer_id,
                customer["phone"],
                _normalize_phone(customer["phone"]),
                customer["status"],
                customer["lastUpdated"] or _now_text(),
            )
        )
        seen_ids.add(customer_id)

    if not seed_rows:
        phone_index_rows = connection.execute(
            """
            SELECT client_id, full_name, phone_raw, last_updated
            FROM clients_phone_index
            ORDER BY updated_at DESC, client_id ASC
            """
        ).fetchall()
        for row in phone_index_rows:
            customer_id = str(row["client_id"] or "").strip()
            if not customer_id or customer_id in seen_ids:
                continue
            phone_raw = str(row["phone_raw"] or "").strip()
            seed_rows.append(
                (
                    customer_id,
                    str(row["full_name"] or customer_id).strip(),
                    phone_raw,
                    _normalize_phone(phone_raw),
                    "active",
                    str(row["last_updated"] or _now_text()).strip(),
                )
            )
            seen_ids.add(customer_id)

    if not seed_rows:
        return

    connection.executemany(
        """
        INSERT INTO customers (id, full_name, phone_raw, phone_norm, status, last_updated)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            full_name = excluded.full_name,
            phone_raw = excluded.phone_raw,
            phone_norm = excluded.phone_norm,
            status = excluded.status,
            last_updated = excluded.last_updated,
            updated_at = CURRENT_TIMESTAMP
        """,
        seed_rows,
    )


def _load_customers_base(*, offset: int = 0, limit: int = 5000) -> List[Dict[str, Any]]:
    connection = bonus_db()
    try:
        _bootstrap_customers_from_cache(connection)
        rows = connection.execute(
            """
            SELECT id, full_name, phone_raw, status, last_updated, updated_at
            FROM customers
            ORDER BY LOWER(full_name) ASC, id ASC
            LIMIT ? OFFSET ?
            """,
            (int(limit), int(offset)),
        ).fetchall()
    finally:
        connection.close()
    return [_customer_row_to_dict(row) for row in rows]


def _sync_customers_cache_from_db() -> None:
    connection = bonus_db()
    try:
        _bootstrap_customers_from_cache(connection)
        rows = connection.execute(
            """
            SELECT id, full_name, phone_raw, status, last_updated, updated_at
            FROM customers
            ORDER BY LOWER(full_name) ASC, id ASC
            """
        ).fetchall()
    finally:
        connection.close()
    _write_clients_cache([_customer_row_to_dict(row) for row in rows])


def _load_clients_cache(include_stale: bool = False) -> Optional[List[Dict[str, Any]]]:
    try:
        customers = _load_customers_base(offset=0, limit=100000)
        if customers:
            return customers
    except Exception as exc:
        logger.warning("Failed to load customers from DB, falling back to cache file: %s", exc)
    return _load_clients_cache_file(include_stale=include_stale)


def _apply_bonus_totals(base_clients: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    bonus_totals = points_core._load_bonus_totals()
    clients: List[Dict[str, Any]] = []
    for client in base_clients:
        next_client = dict(client)
        bonus_summary = bonus_totals.get(str(next_client.get("id")), {})
        earned_points = int(bonus_summary.get("points_earned", 0) or 0)
        last_bonus_at = str(bonus_summary.get("last_bonus_at", "") or "")
        if last_bonus_at and not next_client.get("lastUpdated"):
            next_client["lastUpdated"] = last_bonus_at
        next_client["totalPoints"] = earned_points
        next_client["pointsEarned"] = earned_points
        next_client["pointsRedeemed"] = 0.0
        clients.append(next_client)
    return clients


def _load_customer_points() -> List[Dict[str, Any]]:
    bonus_totals = points_core._load_bonus_totals()
    return [
        {
            "clientId": client_id,
            "totalPoints": int(summary.get("points_earned", 0) or 0),
            "pointsEarned": int(summary.get("points_earned", 0) or 0),
            "pointsRedeemed": 0.0,
            "lastBonusAt": str(summary.get("last_bonus_at", "") or ""),
        }
        for client_id, summary in bonus_totals.items()
    ]


def _normalize_phone(value: Any) -> str:
    digits = "".join(character for character in str(value or "") if character.isdigit())
    if digits.startswith("998") and len(digits) >= 12:
        return digits[-9:]
    return digits[-9:] if len(digits) >= 9 else digits


def _upsert_clients_phone_index(clients: List[Dict[str, Any]]) -> None:
    rows: List[Tuple[str, str, str, str, str]] = []
    for client in clients:
        phone_norm = _normalize_phone(client.get("phone"))
        if len(phone_norm) < 9:
            continue
        rows.append(
            (
                phone_norm,
                str(client.get("id") or ""),
                str(client.get("fullName") or client.get("name") or ""),
                str(client.get("phone") or ""),
                str(client.get("lastUpdated") or ""),
            )
        )
    if not rows:
        return

    connection = bonus_db()
    try:
        connection.executemany(
            """
            INSERT INTO clients_phone_index (phone_norm, client_id, full_name, phone_raw, last_updated, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(phone_norm) DO UPDATE SET
                client_id = excluded.client_id,
                full_name = excluded.full_name,
                phone_raw = excluded.phone_raw,
                last_updated = excluded.last_updated,
                updated_at = CURRENT_TIMESTAMP
            """,
            rows,
        )
        connection.commit()
    finally:
        connection.close()


def _delete_clients_phone_index_for_client(client_id: str) -> None:
    connection = bonus_db()
    try:
        connection.execute("DELETE FROM clients_phone_index WHERE client_id = ?", (str(client_id),))
        connection.commit()
    finally:
        connection.close()


def _customer_exists_with_phone(phone_norm: str, exclude_client_id: str = "") -> Optional[str]:
    if len(phone_norm) < 9:
        return None
    connection = bonus_db()
    try:
        params: Tuple[Any, ...]
        query = "SELECT id FROM customers WHERE phone_norm = ?"
        params = (phone_norm,)
        if exclude_client_id:
            query += " AND id <> ?"
            params = (phone_norm, str(exclude_client_id))
        row = connection.execute(query, params).fetchone()
    finally:
        connection.close()
    return str(row["id"] or "") if row is not None else None


def _next_manual_customer_id(connection: Any) -> str:
    rows = connection.execute("SELECT id FROM customers WHERE id LIKE 'CUST-%'").fetchall()
    max_suffix = 0
    for row in rows:
        match = re.match(r"^CUST-(\d+)$", str(row["id"] or "").strip())
        if match:
            max_suffix = max(max_suffix, int(match.group(1)))
    return f"CUST-{max_suffix + 1:04d}"


def _create_customer(payload: CustomerUpsertPayload) -> Dict[str, Any]:
    from backend import legacy as _legacy

    phone_raw = str(payload.phone or "").strip()
    phone_norm = _normalize_phone(phone_raw)
    if phone_norm and len(phone_norm) < 9:
        raise ValueError("Phone number must contain at least 9 digits")
    duplicate_id = _customer_exists_with_phone(phone_norm) if phone_norm else None
    if duplicate_id:
        raise ValueError(f"Phone number already belongs to customer {duplicate_id}")

    connection = bonus_db()
    try:
        _bootstrap_customers_from_cache(connection)
        customer_id = str(payload.id or "").strip() or _next_manual_customer_id(connection)
        existing = connection.execute("SELECT 1 FROM customers WHERE id = ?", (customer_id,)).fetchone()
        if existing is not None:
            raise ValueError(f"Customer ID already exists: {customer_id}")

        last_updated = str(payload.last_updated or "").strip() or _now_text()
        status = _normalize_customer_status(payload.status)
        connection.execute(
            """
            INSERT INTO customers (id, full_name, phone_raw, phone_norm, status, last_updated)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                customer_id,
                str(payload.full_name or "").strip(),
                phone_raw,
                phone_norm,
                status,
                last_updated,
            ),
        )
        _legacy._audit_log(
            connection,
            action="create",
            entity="customer",
            entity_id=customer_id,
            description=f"Customer created: {str(payload.full_name or '').strip()}",
            actor="Admin",
        )
        connection.commit()
    finally:
        connection.close()

    created = {
        "id": customer_id,
        "fullName": str(payload.full_name or "").strip(),
        "phone": phone_raw,
        "status": status,
        "lastUpdated": last_updated,
    }
    _delete_clients_phone_index_for_client(customer_id)
    _upsert_clients_phone_index([created])
    _PHONE_LOOKUP_MISS_CACHE.pop(phone_norm, None)
    _sync_customers_cache_from_db()
    from backend.core import dashboard as dashboard_core
    dashboard_core._invalidate_dashboard_cache()
    return _load_customer_snapshot(customer_id) or {
        **created,
        "totalPoints": 0,
        "pointsEarned": 0,
        "pointsRedeemed": 0.0,
    }


def _update_customer(client_id: str, payload: CustomerUpsertPayload) -> Dict[str, Any]:
    from backend import legacy as _legacy

    customer_id = str(client_id).strip()
    phone_raw = str(payload.phone or "").strip()
    phone_norm = _normalize_phone(phone_raw)
    if phone_norm and len(phone_norm) < 9:
        raise ValueError("Phone number must contain at least 9 digits")
    duplicate_id = _customer_exists_with_phone(phone_norm, exclude_client_id=customer_id) if phone_norm else None
    if duplicate_id:
        raise ValueError(f"Phone number already belongs to customer {duplicate_id}")

    connection = bonus_db()
    try:
        _bootstrap_customers_from_cache(connection)
        existing = connection.execute(
            "SELECT id, full_name, phone_raw, phone_norm, status, last_updated FROM customers WHERE id = ?",
            (customer_id,),
        ).fetchone()
        if existing is None:
            raise LookupError("Customer not found")

        last_updated = str(payload.last_updated or "").strip() or _now_text()
        status = _normalize_customer_status(payload.status)
        connection.execute(
            """
            UPDATE customers
            SET full_name = ?, phone_raw = ?, phone_norm = ?, status = ?, last_updated = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                str(payload.full_name or "").strip(),
                phone_raw,
                phone_norm,
                status,
                last_updated,
                customer_id,
            ),
        )
        _legacy._audit_log(
            connection,
            action="update",
            entity="customer",
            entity_id=customer_id,
            description=f"Customer updated: {str(payload.full_name or '').strip()}",
            actor="Admin",
        )
        connection.commit()
        old_phone_norm = _normalize_phone(existing["phone_raw"])
    finally:
        connection.close()

    _delete_clients_phone_index_for_client(customer_id)
    updated = {
        "id": customer_id,
        "fullName": str(payload.full_name or "").strip(),
        "phone": phone_raw,
        "status": status,
        "lastUpdated": last_updated,
    }
    _upsert_clients_phone_index([updated])
    _PHONE_LOOKUP_MISS_CACHE.pop(old_phone_norm, None)
    _PHONE_LOOKUP_MISS_CACHE.pop(phone_norm, None)
    _sync_customers_cache_from_db()
    from backend.core import dashboard as dashboard_core
    dashboard_core._invalidate_dashboard_cache()
    snapshot = _load_customer_snapshot(customer_id)
    if snapshot is None:
        raise LookupError("Customer not found")
    return snapshot


def _delete_customer(client_id: str) -> None:
    from backend import legacy as _legacy

    customer_id = str(client_id).strip()
    connection = bonus_db()
    try:
        _bootstrap_customers_from_cache(connection)
        existing = connection.execute(
            "SELECT id, full_name, phone_raw FROM customers WHERE id = ?",
            (customer_id,),
        ).fetchone()
        if existing is None:
            raise LookupError("Customer not found")

        linked_entities = [
            ("bonus_transactions", "SELECT COUNT(*) AS total FROM bonus_transactions WHERE client_id = ?"),
            ("orders", "SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?"),
            ("redemption_requests", "SELECT COUNT(*) AS total FROM redemption_requests WHERE customer_id = ?"),
            ("points_market_orders", "SELECT COUNT(*) AS total FROM points_market_orders WHERE client_id = ?"),
            ("qr_scan_events", "SELECT COUNT(*) AS total FROM qr_scan_events WHERE client_id = ?"),
        ]
        for label, query in linked_entities:
            row = connection.execute(query, (customer_id,)).fetchone()
            if int(row["total"] or 0) > 0:
                raise ValueError(f"Cannot delete customer with existing {label}")

        connection.execute("DELETE FROM customer_sessions WHERE client_id = ?", (customer_id,))
        connection.execute("DELETE FROM device_tokens WHERE customer_id = ?", (customer_id,))
        connection.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
        _legacy._audit_log(
            connection,
            action="delete",
            entity="customer",
            entity_id=customer_id,
            description=f"Customer deleted: {str(existing['full_name'] or customer_id)}",
            actor="Admin",
        )
        connection.commit()
        phone_norm = _normalize_phone(existing["phone_raw"])
    finally:
        connection.close()

    _delete_clients_phone_index_for_client(customer_id)
    _PHONE_LOOKUP_MISS_CACHE.pop(phone_norm, None)
    _sync_customers_cache_from_db()
    from backend.core import dashboard as dashboard_core
    dashboard_core._invalidate_dashboard_cache()


def _warm_clients_phone_index_from_cache() -> None:
    global _CLIENTS_PHONE_INDEX_WARMED
    if _CLIENTS_PHONE_INDEX_WARMED:
        return
    _CLIENTS_PHONE_INDEX_WARMED = True
    cached_clients = _load_clients_cache(include_stale=True) or []
    if cached_clients:
        _upsert_clients_phone_index(cached_clients)


def _find_client_by_phone_index(phone: str) -> Optional[Dict[str, Any]]:
    normalized_phone = _normalize_phone(phone)
    if len(normalized_phone) < 9:
        return None
    connection = bonus_db()
    try:
        row = connection.execute(
            """
            SELECT id, full_name, phone_raw, status, last_updated, updated_at
            FROM customers
            WHERE phone_norm = ?
            """,
            (normalized_phone,),
        ).fetchone()
    finally:
        connection.close()
    if row is None:
        return None
    return _customer_row_to_dict(row)


def _get_cached_client_by_id(client_id: str) -> Optional[Dict[str, Any]]:
    connection = bonus_db()
    try:
        row = connection.execute(
            "SELECT id, full_name, phone_raw, status, last_updated, updated_at FROM customers WHERE id = ?",
            (str(client_id),),
        ).fetchone()
    finally:
        connection.close()
    if row is not None:
        return _customer_row_to_dict(row)

    cached_clients = _load_clients_cache_file(include_stale=True)
    if cached_clients is not None:
        match = next((client for client in cached_clients if str(client.get("id")) == str(client_id)), None)
        if match is not None:
            return _sanitize_customer_dict(match)
    return None


def _find_client_by_phone_remote(phone: str) -> Optional[Dict[str, Any]]:
    from backend import legacy as _legacy

    credentials_error = _legacy._require_credentials()
    if credentials_error:
        return None

    normalized_phone = _normalize_phone(phone)
    if len(normalized_phone) < 9:
        return None

    chunk = max(200, int(OTP_REMOTE_LOOKUP_CHUNK or 1000))
    max_rows = max(chunk, int(OTP_REMOTE_LOOKUP_MAX or 12000))

    def _scan_remote(active_only: bool) -> Optional[Dict[str, Any]]:
        offset = 0
        while offset < max_rows:
            request_params: Dict[str, Any] = {
                "column": ["person_id", "name", "main_phone", "modified_on", "state"],
                "sort": [],
                "offset": offset,
                "limit": chunk,
            }
            if active_only:
                request_params["filter"] = ["state", "=", "A"]

            payload = {"p": request_params, "d": {"is_filial": "N"}}
            response, error = _legacy._request_with_retry(
                "POST",
                "https://smartup.online/b/anor/mr/person/legal_person_list:table",
                session=_legacy._safe_session(),
                auth=_legacy._auth(),
                json_payload=payload,
                headers={"Content-Type": "application/json"},
                timeout=40,
            )
            if error or response is None:
                return None
            try:
                response.raise_for_status()
                raw = response.json()
            except Exception:
                return None

            rows = raw.get("data") if isinstance(raw, dict) else None
            if not isinstance(rows, list) or not rows:
                return None

            for row in rows:
                if not isinstance(row, list) or len(row) < 3:
                    continue
                row_phone = _normalize_phone(row[2] if len(row) > 2 else "")
                if row_phone != normalized_phone:
                    continue
                client = {
                    "id": str(row[0] or ""),
                    "fullName": str(row[1] or ""),
                    "phone": str(row[2] or ""),
                    "status": "active",
                    "lastUpdated": str(row[3] if len(row) > 3 else ""),
                }
                _upsert_clients_phone_index([client])
                return client

            if len(rows) < chunk:
                return None
            offset += chunk
        return None

    active_client = _scan_remote(active_only=True)
    if active_client is not None:
        return active_client

    if OTP_REMOTE_LOOKUP_INCLUDE_INACTIVE:
        # This is expensive on large SmartUp accounts, so keep it opt-in.
        return _scan_remote(active_only=False)

    return None


def _get_client_by_phone(phone: str) -> Optional[Dict[str, Any]]:
    normalized_phone = _normalize_phone(phone)
    if len(normalized_phone) < 9:
        return None

    indexed = _find_client_by_phone_index(normalized_phone)
    if indexed is not None:
        return indexed

    _warm_clients_phone_index_from_cache()
    indexed = _find_client_by_phone_index(normalized_phone)
    if indexed is not None:
        return indexed

    cached_clients = _load_clients_cache()
    search_pool = cached_clients if cached_clients is not None else []

    for client in search_pool:
        if _normalize_phone(client.get("phone")) == normalized_phone:
            _upsert_clients_phone_index([client])
            return client

    stale_cached_clients = _load_clients_cache(include_stale=True) or []
    for client in stale_cached_clients:
        if _normalize_phone(client.get("phone")) == normalized_phone:
            _upsert_clients_phone_index([client])
            return client

    now = time.time()
    missed_at = _PHONE_LOOKUP_MISS_CACHE.get(normalized_phone)
    if missed_at is not None and now - missed_at < OTP_MISS_CACHE_TTL_SEC:
        return None

    _PHONE_LOOKUP_MISS_CACHE[normalized_phone] = now
    return None


def _phone_lookup_debug(phone: str, include_remote: bool = False) -> Dict[str, Any]:
    normalized_phone = _normalize_phone(phone)
    fresh_cache = _load_clients_cache()
    stale_cache = _load_clients_cache(include_stale=True)
    fresh_pool = fresh_cache if isinstance(fresh_cache, list) else []
    stale_pool = stale_cache if isinstance(stale_cache, list) else []

    def _matches(pool: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        found: List[Dict[str, str]] = []
        for client in pool:
            if _normalize_phone(client.get("phone")) != normalized_phone:
                continue
            found.append(
                {
                    "id": str(client.get("id") or ""),
                    "fullName": str(client.get("fullName") or client.get("name") or ""),
                    "phone": str(client.get("phone") or ""),
                    "lastUpdated": str(client.get("lastUpdated") or ""),
                }
            )
        return found[:10]

    cache_mtime = 0.0
    if CLIENTS_CACHE_PATH.exists():
        try:
            cache_mtime = CLIENTS_CACHE_PATH.stat().st_mtime
        except Exception:
            cache_mtime = 0.0

    index_before = _find_client_by_phone_index(normalized_phone)
    _warm_clients_phone_index_from_cache()
    index_after = _find_client_by_phone_index(normalized_phone)
    missed_at = _PHONE_LOOKUP_MISS_CACHE.get(normalized_phone)
    remote_match = None

    return {
        "input": phone,
        "normalized": normalized_phone,
        "cachePath": str(CLIENTS_CACHE_PATH),
        "cacheExists": CLIENTS_CACHE_PATH.exists(),
        "cacheAgeSeconds": int(time.time() - cache_mtime) if cache_mtime else None,
        "freshCacheCount": len(fresh_pool),
        "staleCacheCount": len(stale_pool),
        "freshCacheMatches": _matches(fresh_pool),
        "staleCacheMatches": _matches(stale_pool),
        "indexBeforeWarm": index_before,
        "indexAfterWarm": index_after,
        "missCacheActive": bool(missed_at is not None and time.time() - missed_at < OTP_MISS_CACHE_TTL_SEC),
        "missCacheAgeSeconds": int(time.time() - missed_at) if missed_at else None,
        "remoteChecked": include_remote,
        "remoteMatch": remote_match,
    }


def _otp_config_debug() -> Dict[str, Any]:
    token = ESKIZ_SMS_TOKEN or ""
    return {
        "otpProvider": OTP_PROVIDER,
        "eskizBaseUrl": ESKIZ_BASE_URL,
        "eskizFrom": ESKIZ_SMS_FROM,
        "eskizCallbackUrlConfigured": bool(ESKIZ_CALLBACK_URL),
        "eskizTokenConfigured": bool(token),
        "eskizTokenLength": len(token),
        "eskizTokenLast4": token[-4:] if token else "",
        "eskizTokenSha256Prefix": hashlib.sha256(token.encode("utf-8")).hexdigest()[:12] if token else "",
    }


def _load_customer_snapshot(client_id: str) -> Optional[Dict[str, Any]]:
    client = _get_cached_client_by_id(client_id)
    bonus_summary = points_core._load_bonus_summary_for_client(str(client_id))
    total_points = int(bonus_summary.get("points_earned", 0) or 0)
    last_bonus_at = str(bonus_summary.get("last_bonus_at", "") or "")

    if client is None:
        if not bonus_summary:
            return None
        return {
            "id": str(client_id),
            "fullName": str(bonus_summary.get("client_name", client_id) or client_id),
            "phone": "",
            "status": "active",
            "lastUpdated": last_bonus_at,
            "totalPoints": total_points,
            "pointsEarned": total_points,
            "pointsRedeemed": 0.0,
        }

    return {
        "id": str(client.get("id", client_id)),
        "fullName": str(client.get("fullName") or client.get("name") or client_id),
        "phone": str(client.get("phone") or ""),
        "status": str(client.get("status") or "active"),
        "lastUpdated": str(client.get("lastUpdated") or last_bonus_at),
        "totalPoints": total_points,
        "pointsEarned": total_points,
        "pointsRedeemed": 0.0,
    }


def _load_customer_requests(client_id: str) -> List[Dict[str, Any]]:
    from backend.core import transactions as transaction_core

    return [request for request in transaction_core._load_requests() if str(request.get("customerId")) == str(client_id)]


def _load_customer_activity(client_id: str) -> List[Dict[str, Any]]:
    connection = bonus_db()
    try:
        rows = connection.execute(
            """
            SELECT id, points, note, source_type, source_ref, created_at
            FROM bonus_transactions
            WHERE client_id = ?
            ORDER BY datetime(created_at) DESC, id DESC
            """,
            (str(client_id),),
        ).fetchall()
    finally:
        connection.close()

    activities: List[Dict[str, Any]] = []
    for row in rows:
        points = int(row["points"] or 0)
        source_type = str(row["source_type"] or "manual")
        if source_type == "order":
            activity_type = "order_confirmed"
            description = str(row["note"] or row["source_ref"] or "Order confirmed")
        elif source_type == "request":
            activity_type = "gift_redeemed"
            description = str(row["note"] or row["source_ref"] or "Gift redeemed")
        elif source_type == "request_reversal":
            activity_type = "request_status_change"
            description = str(row["note"] or row["source_ref"] or "Request updated")
        elif source_type in ("qr_scan", "qr_unscan"):
            activity_type = source_type
            description = str(row["note"] or ("QR scan" if source_type == "qr_scan" else "QR unscan rollback"))
        else:
            activity_type = "customer_added"
            description = str(row["note"] or "Manual bonus adjustment")

        activities.append(
            {
                "id": f"ACT-{row['id']}",
                "type": activity_type,
                "description": description,
                "time": str(row["created_at"] or ""),
                "user": "System",
                "points": points,
            }
        )
    return activities


def _send_eskiz_sms(phone_998: str, message: str) -> None:
    if not ESKIZ_SMS_TOKEN:
        raise ValueError("ESKIZ_SMS_TOKEN is empty")
    if not ESKIZ_SMS_FROM:
        raise ValueError("ESKIZ_SMS_FROM is empty")

    endpoint = f"{ESKIZ_BASE_URL}/message/sms/send"
    payload: Dict[str, Any] = {
        "mobile_phone": phone_998,
        "message": message,
        "from": ESKIZ_SMS_FROM,
    }
    if ESKIZ_CALLBACK_URL:
        payload["callback_url"] = ESKIZ_CALLBACK_URL

    try:
        response = requests.post(
            endpoint,
            data=payload,
            headers={"Authorization": f"Bearer {ESKIZ_SMS_TOKEN}"},
            timeout=30,
        )
    except requests.RequestException as exc:
        raise ValueError(f"OTP SMS network error: {exc}") from exc
    content_type = response.headers.get("content-type", "")
    body: Any = {}
    if "application/json" in content_type.lower():
        try:
            body = response.json()
        except Exception:
            body = {}
    provider_detail = ""
    if isinstance(body, dict):
        provider_detail = str(
            body.get("message")
            or body.get("error")
            or body.get("detail")
            or body.get("status")
            or ""
        ).strip()
    if not provider_detail:
        provider_detail = response.text.strip()[:500]
    if not response.ok:
        logger.warning(
            "Eskiz SMS send failed status=%s phone=%s detail=%s",
            response.status_code,
            phone_998,
            provider_detail or "<empty response>",
        )
        detail_suffix = f": {provider_detail}" if provider_detail else ""
        raise ValueError(f"OTP SMS send failed ({response.status_code}){detail_suffix}")
    if isinstance(body, dict) and body.get("status") == "error":
        raise ValueError(provider_detail or "OTP SMS provider returned error")


def _create_otp(phone: str) -> Dict[str, Any]:
    normalized_phone = _normalize_phone(phone)
    is_demo = normalized_phone in _DEMO_ACCOUNTS

    client = _get_client_by_phone(phone)
    if client is None:
        if not is_demo:
            raise ValueError("Customer with this phone number was not found. Refresh clients in admin and try again.")
        client = {"id": f"DEMO-{normalized_phone}", "fullName": "Demo User", "phone": normalized_phone}

    expires_at = (datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()
    if is_demo:
        otp_code = _DEMO_ACCOUNTS[normalized_phone]
        otp_to_store = otp_code
    elif OTP_PROVIDER == "mock":
        otp_code = MOCK_OTP_CODE
        otp_to_store = otp_code
    else:
        otp_code = _generate_otp_code()
        otp_to_store = _otp_hash(normalized_phone, otp_code)

    connection = bonus_db()
    try:
        connection.execute(
            """
            INSERT INTO auth_otps (phone, client_id, otp_code, expires_at, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(phone) DO UPDATE SET
                client_id = excluded.client_id,
                otp_code = excluded.otp_code,
                expires_at = excluded.expires_at,
                created_at = CURRENT_TIMESTAMP
            """,
            (normalized_phone, str(client["id"]), otp_to_store, expires_at),
        )
        connection.commit()
    finally:
        connection.close()

    if not is_demo and OTP_PROVIDER == "eskiz":
        phone_998 = _to_uz_phone(phone)
        message = f"IRIZON platformasiga kirish uchun tasdiqlash kodi: {otp_code}"
        _send_eskiz_sms(phone_998=phone_998, message=message)

    payload: Dict[str, Any] = {
        "phone": normalized_phone,
        "clientId": str(client["id"]),
        "expiresAt": expires_at,
    }
    if OTP_PROVIDER == "mock" or is_demo:
        payload["mockOtp"] = otp_code
    return payload


def _verify_otp(phone: str, otp: str) -> Dict[str, Any]:
    normalized_phone = _normalize_phone(phone)
    entered_otp = str(otp or "").strip()
    hashed_otp = _otp_hash(normalized_phone, entered_otp)
    connection = bonus_db()
    try:
        otp_row = connection.execute(
            "SELECT phone, client_id, otp_code, expires_at FROM auth_otps WHERE phone = ?",
            (normalized_phone,),
        ).fetchone()
        if otp_row is None:
            raise ValueError("OTP was not requested for this phone number")
        stored_otp = str(otp_row["otp_code"] or "")
        if not hmac.compare_digest(stored_otp, hashed_otp) and not hmac.compare_digest(stored_otp, entered_otp):
            raise ValueError("Invalid OTP code")
        expires_raw = str(otp_row["expires_at"] or "")
        expires_at = datetime.fromisoformat(expires_raw.replace("Z", "+00:00"))
        now_time = datetime.now(expires_at.tzinfo) if expires_at.tzinfo else datetime.utcnow()
        if now_time > expires_at:
            raise ValueError("OTP code expired")
        connection.execute("DELETE FROM auth_otps WHERE phone = ?", (normalized_phone,))
        connection.commit()
    finally:
        connection.close()

    client_id = str(otp_row["client_id"])
    if client_id.startswith("DEMO-"):
        demo_phone = client_id[len("DEMO-"):]
        return {
            "id": client_id,
            "fullName": "Demo User",
            "phone": demo_phone,
            "status": "active",
            "pointsEarned": 0,
            "pointsSpent": 0,
            "pointsBalance": 0,
            "lastBonusAt": "",
            "createdAt": "",
        }
    customer = _load_customer_snapshot(client_id)
    if customer is None:
        raise ValueError("Customer not found")
    return customer


def _load_reconciliation(client_id: str, start_date: str, end_date: str) -> Dict[str, Any]:
    client = _get_cached_client_by_id(client_id)
    # The detailed rows come from the database; we keep the logic here to preserve the existing response shape.
    connection = bonus_db()
    try:
        detailed_rows = connection.execute(
            """
            SELECT id, points, note, source_type, source_ref, created_at, client_name
            FROM bonus_transactions
            WHERE client_id = ?
            ORDER BY datetime(created_at) ASC, id ASC
            """,
            (str(client_id),),
        ).fetchall()
    finally:
        connection.close()

    client_name = str(client["fullName"]) if client is not None else ""
    if not client_name and detailed_rows:
        client_name = str(detailed_rows[-1]["client_name"] or "")

    all_rows: List[Dict[str, Any]] = []
    running_balance = 0
    for row in detailed_rows:
        points = int(row["points"] or 0)
        source_type = str(row["source_type"] or "manual")
        source_ref = str(row["source_ref"] or "")
        note = str(row["note"] or "")
        date_value = str(row["created_at"] or "")

        if source_type == "order":
            row_type = "Order"
            document_name = source_ref or note or f"Order TX-{row['id']}"
        elif source_type == "request":
            row_type = "Gift"
            document_name = note or source_ref or f"Request TX-{row['id']}"
        elif source_type == "manual":
            row_type = "Accrual"
            document_name = note or f"Manual bonus TX-{row['id']}"
        else:
            row_type = "Adjustment"
            document_name = note or source_ref or f"Adjustment TX-{row['id']}"

        earned = points if points > 0 else 0
        spent = abs(points) if points < 0 else 0
        running_balance += points

        all_rows.append(
            {
                "id": f"TX-{row['id']}",
                "date": date_value,
                "documentName": document_name,
                "documentId": source_ref or f"TX-{row['id']}",
                "type": row_type,
                "earned": earned,
                "spent": spent,
                "balanceAfter": running_balance,
            }
        )

    opening_balance = 0
    filtered_rows: List[Dict[str, Any]] = []
    for row in all_rows:
        row_date = str(row["date"]).split(" ")[0]
        if row_date < start_date:
            opening_balance = int(row["balanceAfter"])
            continue
        if row_date > end_date:
            continue
        filtered_rows.append(row)

    closing_balance = opening_balance if not filtered_rows else int(filtered_rows[-1]["balanceAfter"])
    total_earned = sum(int(row["earned"]) for row in filtered_rows)
    total_spent = sum(int(row["spent"]) for row in filtered_rows)

    return {
        "customer": {
            "id": str(client_id),
            "fullName": client_name or str(client_id),
        },
        "rows": filtered_rows,
        "summary": {
            "openingBalance": opening_balance,
            "closingBalance": closing_balance,
            "earned": total_earned,
            "spent": total_spent,
            "orders": len([row for row in filtered_rows if row["type"] == "Order"]),
            "gifts": len([row for row in filtered_rows if row["type"] == "Gift"]),
        },
    }


def _generate_otp_code() -> str:
    otp_length = max(4, int(OTP_LENGTH or 6))
    min_val = 10 ** (otp_length - 1)
    max_val = (10 ** otp_length) - 1
    return str(random.randint(min_val, max_val))


def _otp_hash(phone: str, otp: str) -> str:
    payload = f"{phone}:{otp}".encode("utf-8")
    return hmac.new(OTP_SIGNING_SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def _to_uz_phone(raw_phone: str) -> str:
    digits = "".join(ch for ch in str(raw_phone or "") if ch.isdigit())
    if digits.startswith("998") and len(digits) >= 12:
        return digits[:12]
    if len(digits) >= 9:
        return "998" + digits[-9:]
    raise ValueError("Phone format is invalid")
