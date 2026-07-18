from __future__ import annotations

import io
import json
import math
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import requests
from fastapi.responses import JSONResponse
from requests.auth import HTTPBasicAuth

from backend.config import (
    A_DEBT_PATH,
    CASHIN_CACHE_PATH,
    CASHIN_CACHE_TTL_SEC,
    CLIENTS_CACHE_PATH,
    CLIENTS_CACHE_TTL_SEC,
    CLIENT_STOCKS_CACHE_PATH,
    CLIENT_STOCKS_CACHE_TTL_SEC,
    DB_BACKEND,
    DEFAULT_BEGIN_DATE,
    DEFAULT_END_DATE,
    DEFAULT_FILIAL_ID,
    DEFAULT_USER_ID,
    LIMIT_JSON_PATH,
    MAX_RETRIES,
    OFFSET_CACHE_PATH,
    OFFSET_CACHE_TTL_SEC,
    REQUEST_TIMEOUT,
    SMARTUP_LOGIN,
    SMARTUP_PASSWORD,
    UA,
    logger,
)
from backend.core.customers import _load_clients_cache, _load_customers_base, _sync_customers_cache_from_db, _upsert_clients_phone_index
from backend.db import bonus_db

_DASHBOARD_CACHE: Dict[str, Any] = {"ts": 0.0, "payload": None}


def _invalidate_dashboard_cache() -> None:
    _DASHBOARD_CACHE["ts"] = 0.0
    _DASHBOARD_CACHE["payload"] = None


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
    session.headers.update({"User-Agent": UA, "Accept": "*/*"})
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


def _is_xlsx(content: bytes) -> bool:
    return bool(content) and content.startswith(b"PK")


def _month_bounds_for_today() -> Tuple[date, date]:
    today = date.today()
    return today.replace(day=1), today


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
    try:
        for attempt in range(max_retries):
            try:
                response = session.request(
                    method=method,
                    url=url,
                    params=params,
                    data=data,
                    json=json_payload,
                    headers=headers,
                    auth=auth,
                    timeout=timeout,
                )
                if response.status_code in (401, 403):
                    return None, JSONResponse(
                        {"error": "Auth failed", "status": response.status_code, "detail": response.text[:600]},
                        status_code=401,
                    )
                if response.status_code == 429 or response.status_code >= 500:
                    time.sleep(2.0 * (attempt + 1))
                    continue
                return response, None
            except requests.Timeout:
                time.sleep(2.0 * (attempt + 1))
                continue
        return None, JSONResponse({"error": "Failed after retries"}, status_code=502)
    except Exception as exc:
        logger.exception("Unexpected request error: %s", exc)
        return None, JSONResponse({"error": "Unexpected error", "detail": str(exc)}, status_code=500)


def _norm_name(raw: str) -> str:
    if not isinstance(raw, str):
        return ""
    return " ".join(raw.replace("_", " ").split()).strip().lower()


def _load_limit_json() -> Dict[str, float]:
    if not LIMIT_JSON_PATH.exists():
        return {}
    try:
        data = json.loads(LIMIT_JSON_PATH.read_text())
        if isinstance(data, list):
            iterable = data
        elif isinstance(data, dict) and "limits" in data:
            iterable = data["limits"]
        else:
            iterable = []
        result: Dict[str, float] = {}
        for item in iterable:
            name = item.get("name")
            if not name:
                continue
            result[_norm_name(str(name))] = _parse_float(item.get("limit"))
        return result
    except Exception:
        return {}


def _load_a_category_debt() -> Dict[str, float]:
    if not A_DEBT_PATH.exists():
        return {}
    try:
        raw = pd.read_excel(A_DEBT_PATH, header=None)
        header_idx_series = raw.index[raw[0] == "Р С™Р В»Р С‘Р ВµР Р…РЎвЂљ"]
        header_idx = int(header_idx_series[0]) if len(header_idx_series) else 0
        df = pd.read_excel(A_DEBT_PATH, skiprows=header_idx)
        name_col = next((c for c in df.columns if isinstance(c, str) and "Р С™Р В»Р С‘Р ВµР Р…РЎвЂљ" in c), df.columns[0])
        debt_col_candidates = [c for c in df.columns if isinstance(c, str) and ("Р С‘РЎвЂљР С•Р С–Р С•" in c.lower())]
        debt_col = debt_col_candidates[0] if debt_col_candidates else (df.columns[7] if len(df.columns) > 7 else None)
        if debt_col is None:
            return {}
        result: Dict[str, float] = {}
        for _, row in df.iterrows():
            name = row.get(name_col)
            if not isinstance(name, str):
                continue
            result[_norm_name(name)] = _parse_float(row.get(debt_col))
        return result
    except Exception as exc:
        logger.warning("Failed to load A debt sheet: %s", exc)
        return {}


CASHIN_LIST_P = {
    "do": 2,
    "column": ["cashin_number", "cashin_date", "room_names", "client_name", "amount", "note", "created_by_name"],
    "label": ["Р СњР С•Р СР ВµРЎР‚ Р С•Р С—Р В»Р В°РЎвЂљРЎвЂ№", "Р вЂќР В°РЎвЂљР В°", "Р СћР ВµР С”РЎС“РЎвЂ°Р С‘Р Вµ РЎР‚Р В°Р В±Р С•РЎвЂЎР С‘Р Вµ Р В·Р С•Р Р…РЎвЂ№", "Р С™Р В»Р С‘Р ВµР Р…РЎвЂљ", "Р РЋРЎС“Р СР СР В°", "Р СџРЎР‚Р С‘Р СР ВµРЎвЂЎР В°Р Р…Р С‘Р Вµ", "Р РЋР С•Р В·Р Т‘Р В°Р В»"],
    "size": ["1.965656", "2.157551", "3.043207", "3.364723", "3.000000", "2.216152", "2.973761"],
    "img": [None, None, None, None, None, None, None],
    "filter": [],
    "sort": ["-cashin_time"],
    "rt": "xlsx",
}


def _fetch_cashin_monthly(refresh: bool = False) -> Dict[str, float]:
    if not refresh and CASHIN_CACHE_PATH.exists():
        try:
            if time.time() - CASHIN_CACHE_PATH.stat().st_mtime < CASHIN_CACHE_TTL_SEC:
                cached_df = pd.read_parquet(CASHIN_CACHE_PATH)
                return {_norm_name(row["client_name"]): _safe_num(row["amount"]) for _, row in cached_df.iterrows()}
        except Exception:
            pass

    response, error = _request_with_retry(
        "POST",
        "https://smartup.online/b/trade/tcs/cashin_list:table",
        session=_safe_session(),
        auth=_auth(),
        json_payload={"d": None, "p": dict(CASHIN_LIST_P)},
        headers={"Content-Type": "application/json"},
    )
    if error or response is None:
        return {}
    try:
        response.raise_for_status()
    except Exception:
        return {}
    if not _is_xlsx(response.content):
        return {}

    df = pd.read_excel(io.BytesIO(response.content)).copy()
    if df.empty:
        return {}
    if set(df.columns) == set(range(len(CASHIN_LIST_P["label"]))):
        df.columns = CASHIN_LIST_P["label"]
    columns = [str(column) for column in df.columns]
    name_col = next((column for column in df.columns if "Р С™Р В»Р С‘Р ВµР Р…РЎвЂљ" in str(column) or "client" in str(column).lower()), df.columns[3] if len(df.columns) > 3 else df.columns[0])
    date_col = next((column for column in df.columns if "Р вЂќР В°РЎвЂљР В°" in str(column) or "date" in str(column).lower()), df.columns[1] if len(df.columns) > 1 else None)
    amount_col = next((column for column in df.columns if "Р РЋРЎС“Р СР СР В°" in str(column) or "amount" in str(column).lower()), df.columns[4] if len(df.columns) > 4 else (df.columns[-1] if len(df.columns) > 0 else None))
    if name_col is None or amount_col is None:
        logger.warning("Cashin export columns not detected. columns=%s", columns)
        return {}

    start, today = _month_bounds_for_today()
    df = df.assign(_amount=df[amount_col].apply(_safe_num))
    if date_col:
        df = df.assign(_date=pd.to_datetime(df[date_col], errors="coerce", dayfirst=True).dt.date)
        df = df[(df["_date"] >= start) & (df["_date"] <= today)]
    if df.empty:
        return {}

    df = df.assign(_name_norm=df[name_col].apply(_norm_name))
    grouped = df.groupby("_name_norm")["_amount"].sum()
    result = {key: _safe_num(value) for key, value in grouped.items() if key}

    try:
        pd.DataFrame([{"client_name": key, "amount": value} for key, value in result.items()]).to_parquet(CASHIN_CACHE_PATH, index=False)
    except Exception:
        pass
    return result


def _fetch_client_stocks(refresh: bool = False) -> Dict[str, Dict[str, Any]]:
    if not refresh and CLIENT_STOCKS_CACHE_PATH.exists():
        try:
            if time.time() - CLIENT_STOCKS_CACHE_PATH.stat().st_mtime < CLIENT_STOCKS_CACHE_TTL_SEC:
                cached_df = pd.read_parquet(CLIENT_STOCKS_CACHE_PATH)
                return {
                    _norm_name(row["client_name"]): {
                        "last_date": row.get("last_date"),
                        "days": int(row.get("days") or 0),
                        "status": row.get("status") or "",
                        "balance": _safe_num(row.get("balance")),
                    }
                    for _, row in cached_df.iterrows()
                }
        except Exception:
            pass

    form = {
        "begin_date": DEFAULT_BEGIN_DATE,
        "end_date": DEFAULT_END_DATE,
        "person_kind": "B",
        "person_group_id": "",
        "report_kind": "H",
        "stock_recording_method": "I",
        "rt": "xlsx",
        "product_group_id": "11708",
        "column_kind": "P",
        "-project_code": "trade",
        "-project_hash": "01",
        "-filial_id": DEFAULT_FILIAL_ID,
        "-user_id": DEFAULT_USER_ID,
        "-lang_code": "ru",
    }

    response, error = _request_with_retry(
        "POST",
        "https://smartup.online/b/trade/rep/tvt/client_stocks:run",
        session=_safe_session(),
        auth=_auth(),
        data=form,
        timeout=120,
    )
    if error or response is None:
        return {}
    try:
        response.raise_for_status()
    except Exception:
        return {}
    if not _is_xlsx(response.content):
        return {}

    df = pd.read_excel(io.BytesIO(response.content)).copy()
    if df.empty:
        return {}
    df.columns = [str(column) for column in df.columns]
    name_col = next((c for c in df.columns if "Р С™Р В»Р С‘Р ВµР Р…РЎвЂљ" in c or "client" in c.lower()), df.columns[0])
    date_col = next((c for c in df.columns if "Р вЂќР В°РЎвЂљР В°" in c or "Р Т‘Р В°РЎвЂљР В°" in c.lower()), None)
    days_col = next((c for c in df.columns if "Р Т‘Р Р…Р ВµР в„–" in c.lower() or "day" in c.lower()), None)
    balance_col = next((c for c in df.columns if "Р В±Р В°Р В»Р В°Р Р…РЎРѓ" in c.lower() or "Р С•РЎРѓРЎвЂљР В°РЎвЂљ" in c.lower() or "РЎРѓРЎС“Р СР СР В° Р С‘РЎвЂљР С•Р С–Р С•" in c.lower()), None)
    if balance_col is None and len(df.columns) > 1:
        balance_col = df.columns[-1]

    df = df.assign(_name_norm=df[name_col].apply(_norm_name))
    if date_col:
        df = df.assign(_date=pd.to_datetime(df[date_col], errors="coerce", dayfirst=True).dt.date)
        df = df.sort_values(["_name_norm", "_date"])
    latest_df = df.groupby("_name_norm").tail(1) if not df.empty else df

    today = date.today()
    result: Dict[str, Dict[str, Any]] = {}
    for _, row in latest_df.iterrows():
        name_norm = row.get("_name_norm")
        if not name_norm:
            continue
        last_date = row.get("_date") if date_col else None
        days_value = int(_safe_num(row.get(days_col))) if days_col else ((today - last_date).days if last_date else 0)
        result[name_norm] = {
            "last_date": last_date.isoformat() if isinstance(last_date, date) else "",
            "days": days_value,
            "status": "Kechikkan" if last_date and days_value > 14 else ("OK" if last_date else ""),
            "balance": _safe_num(row.get(balance_col)) if balance_col else 0.0,
        }

    try:
        pd.DataFrame(
            [
                {
                    "client_name": key,
                    "last_date": value["last_date"],
                    "days": value["days"],
                    "status": value["status"],
                    "balance": value["balance"],
                }
                for key, value in result.items()
            ]
        ).to_parquet(CLIENT_STOCKS_CACHE_PATH, index=False)
    except Exception:
        pass

    return result


OFFSET_LIST_BASE_P = {
    "do": 2,
    "column": ["person_name", "currency_name", "debt_amount", "advance_amount", "total_amount"],
    "label": ["Р С™Р В»Р С‘Р ВµР Р…РЎвЂљ", "Р вЂ™Р В°Р В»РЎР‹РЎвЂљР В°", "Р вЂ”Р В°Р Т‘Р С•Р В»Р В¶Р ВµР Р…Р Р…Р С•РЎРѓРЎвЂљРЎРЉ", "Р СџРЎР‚Р ВµР Т‘Р С•Р С—Р В»Р В°РЎвЂљР В°", "Р вЂР В°Р В»Р В°Р Р…РЎРѓ"],
    "size": ["4.999968", "1.464000", "1.644000", "2.253600", "1.644000"],
    "img": [None, None, None, None, None],
    "filter": [],
    "sort": ["person_name"],
    "rt": "xlsx",
}


def _fetch_offset_debt(refresh: bool = False, chunk: int = 5000) -> Dict[str, float]:
    if not refresh and OFFSET_CACHE_PATH.exists():
        try:
            if time.time() - OFFSET_CACHE_PATH.stat().st_mtime < OFFSET_CACHE_TTL_SEC:
                cached_df = pd.read_parquet(OFFSET_CACHE_PATH)
                return {_norm_name(row["client_name"]): _safe_num(row["debt"]) for _, row in cached_df.iterrows()}
        except Exception:
            pass

    session = _safe_session()
    headers = {"Content-Type": "application/json"}
    parts: List[pd.DataFrame] = []
    offset = 0

    while True:
        payload = {"d": None, "p": {**OFFSET_LIST_BASE_P, "offset": offset, "limit": chunk}}
        response, error = _request_with_retry(
            "POST",
            "https://smartup.online/b/anor/mdeal/order/offset/offset_list:table",
            session=session,
            auth=_auth(),
            json_payload=payload,
            headers=headers,
            timeout=120,
        )
        if error or response is None:
            break
        try:
            response.raise_for_status()
        except Exception:
            break
        if not _is_xlsx(response.content):
            break

        part_df = pd.read_excel(io.BytesIO(response.content))
        if part_df.empty:
            break
        parts.append(part_df)
        if len(part_df) < chunk:
            break
        offset += chunk
        time.sleep(0.4)

    if not parts:
        return {}

    df = pd.concat(parts, ignore_index=True)
    df.columns = [str(column) for column in df.columns]
    name_col = next((c for c in df.columns if "Р С™Р В»Р С‘Р ВµР Р…РЎвЂљ" in c or "person" in c.lower()), df.columns[0])
    debt_col = next((c for c in df.columns if "Р В·Р В°Р Т‘Р С•Р В»Р В¶" in c.lower() or "debt" in c.lower()), None)
    if debt_col is None and len(df.columns) > 2:
        debt_col = df.columns[2]

    result: Dict[str, float] = {}
    for _, row in df.iterrows():
        client_name = row.get(name_col)
        if not isinstance(client_name, str):
            continue
        result[_norm_name(client_name)] = _safe_num(row.get(debt_col)) if debt_col else 0.0

    try:
        pd.DataFrame([{"client_name": key, "debt": value} for key, value in result.items()]).to_parquet(OFFSET_CACHE_PATH, index=False)
    except Exception:
        pass

    return result


def _load_audit_activity(*, limit: int = 200, search: str = "", activity_type: str = "all") -> List[Dict[str, Any]]:
    connection = bonus_db()
    try:
        tx_rows = connection.execute(
            """
            SELECT id, points, note, source_type, source_ref, created_at, client_name, client_id
            FROM bonus_transactions
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT ?
            """,
            (int(limit),),
        ).fetchall()
        audit_rows = connection.execute(
            """
            SELECT id, action, entity, entity_id, description, actor, created_at
            FROM audit_events
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT ?
            """,
            (int(limit),),
        ).fetchall()
    finally:
        connection.close()

    activities: List[Dict[str, Any]] = []
    normalized_type = str(activity_type or "all").strip().lower()
    normalized_search = str(search or "").strip().lower()

    for row in tx_rows:
        source_type = str(row["source_type"] or "manual")
        if source_type == "order":
            mapped_type = "order_confirmed"
            description = str(row["note"] or row["source_ref"] or "Order confirmed")
        elif source_type == "request":
            mapped_type = "gift_redeemed"
            description = str(row["note"] or row["source_ref"] or "Gift redeemed")
        elif source_type == "request_reversal":
            mapped_type = "request_status_change"
            description = str(row["note"] or row["source_ref"] or "Request updated")
        else:
            mapped_type = "customer_added"
            description = str(row["note"] or "Manual bonus adjustment")

        if normalized_type != "all" and normalized_type != mapped_type:
            continue

        record_id = f"ACT-{row['id']}"
        timestamp = str(row["created_at"] or "")
        if normalized_search:
            haystack = " ".join(
                [
                    record_id,
                    description,
                    str(row["client_name"] or ""),
                    str(row["client_id"] or ""),
                    str(row["source_ref"] or ""),
                ]
            ).lower()
            if normalized_search not in haystack:
                continue

        activities.append(
            {
                "id": record_id,
                "type": mapped_type,
                "description": description,
                "time": timestamp,
                "user": "System",
            }
        )

    for row in audit_rows:
        mapped_type = "system_change"
        description = str(row["description"] or f"{row['action']} {row['entity']} {row['entity_id']}")
        user_label = str(row["actor"] or "System")
        record_id = f"AUD-{row['id']}"
        timestamp = str(row["created_at"] or "")

        if normalized_type != "all" and normalized_type != mapped_type:
            continue
        if normalized_search:
            haystack = " ".join(
                [
                    record_id,
                    description,
                    str(row["entity"] or ""),
                    str(row["entity_id"] or ""),
                    str(row["action"] or ""),
                    user_label,
                ]
            ).lower()
            if normalized_search not in haystack:
                continue

        activities.append(
            {
                "id": record_id,
                "type": mapped_type,
                "description": description,
                "time": timestamp,
                "user": user_label,
            }
        )

    return activities


def _build_clients(refresh: bool = False, offset: int = 0, limit: int = 500):
    try:
        if refresh:
            _sync_customers_cache_from_db()
        base_clients = _load_customers_base(offset=offset, limit=limit)
        _upsert_clients_phone_index(base_clients)
        return base_clients, None
    except Exception as exc:
        logger.exception("Failed to load customers from DB")
        return None, JSONResponse({"error": f"Failed to load customers: {exc}"}, status_code=500)


def _build_dashboard_summary() -> Dict[str, Any]:
    today = datetime.utcnow().date()
    week_start = today - timedelta(days=6)
    week_start_iso = f"{week_start.isoformat()} 00:00:00"
    month_start = today.replace(day=1)
    month_start_iso = f"{month_start.isoformat()} 00:00:00"

    day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    points_by_day: Dict[str, Dict[str, Any]] = {}
    for index in range(7):
        day_value = week_start + timedelta(days=index)
        points_by_day[day_value.isoformat()] = {"name": day_labels[day_value.weekday()], "issued": 0, "redeemed": 0}

    connection = bonus_db()
    try:
        orders_totals_row = connection.execute(
            """
            SELECT COALESCE(SUM(total_points), 0) AS total_points
            FROM orders
            WHERE status NOT IN ('Cancelled', 'Reversed')
            """
        ).fetchone()
        requests_stats_row = connection.execute(
            """
            SELECT
                SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN status IN ('Approved', 'Shipped', 'Completed') THEN 1 ELSE 0 END) AS redemption_count
            FROM redemption_requests
            """
        ).fetchone()

        order_rows = connection.execute(
            """
            SELECT created_at, total_points, status
            FROM orders
            WHERE created_at >= ?
            ORDER BY created_at ASC
            """,
            (week_start_iso,),
        ).fetchall()
        for row in order_rows:
            status = str(row["status"] or "")
            if status in {"Cancelled", "Reversed"}:
                continue
            day_key = str(row["created_at"] or "")[:10]
            if day_key in points_by_day:
                points_by_day[day_key]["issued"] += int(row["total_points"] or 0)

        request_rows = connection.execute(
            """
            SELECT created_at, points_used, status
            FROM redemption_requests
            WHERE created_at >= ?
            ORDER BY created_at ASC
            """,
            (week_start_iso,),
        ).fetchall()
        for row in request_rows:
            status = str(row["status"] or "")
            if status not in {"Approved", "Shipped", "Completed"}:
                continue
            day_key = str(row["created_at"] or "")[:10]
            if day_key in points_by_day:
                points_by_day[day_key]["redeemed"] += abs(int(row["points_used"] or 0))

        gift_rows = connection.execute(
            """
            SELECT category, COUNT(*) AS total
            FROM gifts
            WHERE is_active = 1
            GROUP BY category
            ORDER BY total DESC, category ASC
            LIMIT 6
            """
        ).fetchall()
        gift_stats = [{"name": str(row["category"] or "Other"), "value": int(row["total"] or 0)} for row in gift_rows]

        top_rows = connection.execute(
            """
            SELECT
                client_id,
                MAX(client_name) AS full_name,
                COALESCE(SUM(points), 0) AS total_points,
                COALESCE(SUM(CASE WHEN points > 0 AND created_at >= ? THEN points ELSE 0 END), 0) AS earned_this_month
            FROM bonus_transactions
            GROUP BY client_id
            ORDER BY total_points DESC
            LIMIT 5
            """,
            (month_start_iso,),
        ).fetchall()
        top_customers = [
            {
                "id": str(row["client_id"] or ""),
                "fullName": str(row["full_name"] or ""),
                "totalPoints": int(row["total_points"] or 0),
                "earnedThisMonth": int(row["earned_this_month"] or 0),
            }
            for row in top_rows
        ]
    finally:
        connection.close()

    total_customers = 0
    try:
        cached_clients = _load_clients_cache(include_stale=True) or []
        total_customers = len(cached_clients)
    except Exception:
        total_customers = 0
    if total_customers == 0:
        count_connection = bonus_db()
        try:
            row = count_connection.execute("SELECT COUNT(*) AS total FROM customers").fetchone()
            total_customers = int(row["total"] or 0)
        finally:
            count_connection.close()

    activities = _load_audit_activity(limit=8, search="", activity_type="all")

    return {
        "stats": {
            "totalCustomers": int(total_customers),
            "pointsIssued": int(orders_totals_row["total_points"] or 0),
            "redemptions": int(requests_stats_row["redemption_count"] or 0),
            "pendingRequests": int(requests_stats_row["pending_count"] or 0),
        },
        "pointsData": list(points_by_day.values()),
        "giftStats": gift_stats,
        "activities": activities,
        "topCustomers": top_customers,
        "generatedAt": datetime.utcnow().isoformat(),
    }
