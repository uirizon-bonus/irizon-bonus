

# app.py
# Unified SmartUp Export/API service for IRIZON
# Run:
#   pip install fastapi uvicorn requests pandas openpyxl
#   export SMARTUP_LOGIN="..."
#   export SMARTUP_PASSWORD="..."
#   uvicorn app:app --host 0.0.0.0 --port 8000

from __future__ import annotations

import os
from pathlib import Path
import time
import logging
import math
import io
from datetime import date
from typing import Any, Dict, Optional, Tuple, List

import requests
from requests.auth import HTTPBasicAuth

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Optional: pagination/merge to a single xlsx
import pandas as pd
import json

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# =========================
# Helpers for API responses
# =========================


# -----------------------------
# Logging
# -----------------------------
logger = logging.getLogger("smartup_api")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)


# -----------------------------
# Config
# -----------------------------
SMARTUP_LOGIN = os.getenv("SMARTUP_LOGIN", "")
SMARTUP_PASSWORD = os.getenv("SMARTUP_PASSWORD", "")

DEFAULT_FILIAL_ID = os.getenv("SMARTUP_FILIAL_ID", "8516359")   # optional preset
DEFAULT_USER_ID = os.getenv("SMARTUP_USER_ID", "7055199")       # optional preset

DEFAULT_BEGIN_DATE = os.getenv("SMARTUP_BEGIN_DATE", "01.02.2022")
DEFAULT_END_DATE = os.getenv("SMARTUP_END_DATE", "18.02.2029")

REQUEST_TIMEOUT = int(os.getenv("SMARTUP_TIMEOUT", "600"))
MAX_RETRIES = int(os.getenv("SMARTUP_MAX_RETRIES", "3"))

UA = os.getenv("SMARTUP_USER_AGENT", "Mozilla/5.0")


def _auth() -> HTTPBasicAuth:
    return HTTPBasicAuth(SMARTUP_LOGIN, SMARTUP_PASSWORD)


def _require_credentials() -> Optional[JSONResponse]:
    if not SMARTUP_LOGIN or not SMARTUP_PASSWORD:
        return JSONResponse(
            {"error": "SMARTUP_LOGIN / SMARTUP_PASSWORD env not set"},
            status_code=500
        )
    return None


def _safe_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": UA,
        "Accept": "*/*",
    })
    return s


def _parse_float(val: Any) -> float:
    """Safely parse numbers coming as strings with commas/spaces."""
    try:
        if val is None:
            return 0.0
        if isinstance(val, (int, float)):
            out = float(val)
            return out if math.isfinite(out) else 0.0
        text = str(val).replace(" ", "").replace(",", ".")
        out = float(text)
        return out if math.isfinite(out) else 0.0
    except Exception:
        return 0.0


def _safe_num(val: Any) -> float:
    """Coerce to finite float for JSON safety."""
    try:
        out = float(val)
        return out if math.isfinite(out) else 0.0
    except Exception:
        return 0.0


def _parse_date(val: Any) -> Optional[date]:
    try:
        d = pd.to_datetime(val, errors="coerce")
        if pd.isna(d):
            return None
        return d.date()
    except Exception:
        return None


def _first_day_of_month(dt: date) -> date:
    return dt.replace(day=1)


def _month_bounds_for_today() -> Tuple[date, date]:
    today = date.today()
    start = _first_day_of_month(today)
    return start, today


def _is_xlsx(content: bytes) -> bool:
    # XLSX is a ZIP archive -> starts with PK
    return bool(content) and content.startswith(b"PK")


def _request_with_retry(
    method: str,
    url: str,
    *,
    session: requests.Session,
    auth: HTTPBasicAuth,
    params: Optional[dict] = None,
    data: Optional[dict] = None,
    json: Optional[dict] = None,
    headers: Optional[dict] = None,
    timeout: int = REQUEST_TIMEOUT,
    max_retries: int = MAX_RETRIES,
) -> Tuple[Optional[requests.Response], Optional[JSONResponse]]:
    """
    Returns (response, error_json_response)
    """
    try:
        for attempt in range(max_retries):
            try:
                r = session.request(
                    method=method,
                    url=url,
                    params=params,
                    data=data,
                    json=json,
                    headers=headers,
                    auth=auth,
                    timeout=timeout,
                )

                # auth problems
                if r.status_code in (401, 403):
                    return None, JSONResponse(
                        {"error": "Auth failed", "status": r.status_code, "detail": r.text[:600]},
                        status_code=401
                    )

                # rate limit
                if r.status_code == 429:
                    sleep_s = 2.0 * (attempt + 1)
                    logger.warning("429 rate limited. sleep=%ss url=%s", sleep_s, url)
                    time.sleep(sleep_s)
                    continue

                # server errors
                if r.status_code >= 500:
                    sleep_s = 2.0 * (attempt + 1)
                    logger.warning("5xx from SmartUp. status=%s sleep=%ss url=%s", r.status_code, sleep_s, url)
                    time.sleep(sleep_s)
                    continue

                return r, None

            except requests.Timeout:
                sleep_s = 2.0 * (attempt + 1)
                logger.warning("Timeout. sleep=%ss url=%s", sleep_s, url)
                time.sleep(sleep_s)
                continue

        return None, JSONResponse({"error": "Failed after retries"}, status_code=502)

    except Exception as e:
        logger.exception("Unexpected error during request: %s", e)
        return None, JSONResponse({"error": "Unexpected error", "detail": str(e)}, status_code=500)


app = FastAPI(title="IRIZON SmartUp Unified API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ALLOW_ORIGINS", "*").split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional limits map from JSON
LIMIT_JSON_PATH = Path(__file__).resolve().parent / "src" / "data" / "client_limit.json"
A_DEBT_PATH = Path(__file__).resolve().parent / "src" / "data" / "a-category-debt.xlsx"
CASHIN_CACHE_PATH = Path(__file__).resolve().parent / "src" / "data" / "cashin_cache.parquet"
CASHIN_CACHE_TTL_SEC = 60 * 60 * 3  # 3 hours
CLIENT_STOCKS_CACHE_PATH = Path(__file__).resolve().parent / "src" / "data" / "client_stocks_cache.parquet"
CLIENT_STOCKS_CACHE_TTL_SEC = 60 * 60 * 3  # 3 hours
OFFSET_CACHE_PATH = Path(__file__).resolve().parent / "src" / "data" / "offset_cache.parquet"
OFFSET_CACHE_TTL_SEC = 60 * 60 * 3  # 3 hours

def _norm_name(raw: str) -> str:
    """Normalize client names for matching across API/JSON/XLSX."""
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
        out = {}
        for item in iterable:
            name = item.get("name")
            if not name:
                continue
            norm = _norm_name(str(name))
            out[norm] = _parse_float(item.get("limit"))
        return out
    except Exception:
        return {}


def _load_a_category_debt() -> Dict[str, float]:
    """Parse Category‑A debt sheet and return {normalized_name: debt}."""
    if not A_DEBT_PATH.exists():
        return {}

    try:
        # Read raw to detect the header row (sheet has metadata lines on top).
        raw = pd.read_excel(A_DEBT_PATH, header=None)
        header_idx_series = raw.index[raw[0] == "Клиент"]
        header_idx = int(header_idx_series[0]) if len(header_idx_series) else 0

        # Re-read using the detected header row so columns are named.
        df = pd.read_excel(A_DEBT_PATH, skiprows=header_idx)

        # Choose columns.
        name_col = next((c for c in df.columns if isinstance(c, str) and "Клиент" in c), df.columns[0])
        debt_col_candidates = [
            c for c in df.columns
            if isinstance(c, str) and ("итого" in c.lower())
        ]
        debt_col = debt_col_candidates[0] if debt_col_candidates else (df.columns[7] if len(df.columns) > 7 else None)
        if debt_col is None:
            return {}

        out: Dict[str, float] = {}
        for _, row in df.iterrows():
            name = row.get(name_col)
            if not isinstance(name, str):
                continue
            debt_val = _parse_float(row.get(debt_col))
            norm_name = _norm_name(name)
            out[norm_name] = debt_val
        return out
    except Exception as e:
        logger.warning("Failed to load A debt sheet: %s", e)
        return {}


def _fetch_cashin_monthly(refresh: bool = False) -> Dict[str, float]:
    """
    Pull cash-in list from SmartUp, keep only current month rows,
    and sum amounts per normalized client name.
    Uses a small parquet cache to avoid frequent downloads.
    """
    # Cache check
    if not refresh and CASHIN_CACHE_PATH.exists():
        try:
            mtime = CASHIN_CACHE_PATH.stat().st_mtime
            if time.time() - mtime < CASHIN_CACHE_TTL_SEC:
                df_cached = pd.read_parquet(CASHIN_CACHE_PATH)
                if not df_cached.empty:
                    out_cached = {}
                    for _, row in df_cached.iterrows():
                        out_cached[_norm_name(row["client_name"])] = _safe_num(row["amount"])
                    return out_cached
        except Exception:
            pass

    url = "https://smartup.online/b/trade/tcs/cashin_list:table"
    s = _safe_session()
    headers = {"Content-Type": "application/json"}
    payload = {"d": None, "p": dict(CASHIN_LIST_P)}

    r, e = _request_with_retry("POST", url, session=s, auth=_auth(), json=payload, headers=headers)
    if e or r is None:
        return {}
    try:
        r.raise_for_status()
    except Exception:
        return {}

    if not _is_xlsx(r.content):
        return {}

    df = pd.read_excel(io.BytesIO(r.content))
    if df.empty:
        return {}

    # Standardize column names
    if set(df.columns) == set(range(len(CASHIN_LIST_P["label"]))):
        df.columns = CASHIN_LIST_P["label"]

    # Determine column names we need
    name_cols = [c for c in df.columns if str(c).lower().startswith("клиент")] or ["client_name"]
    date_cols = [c for c in df.columns if "Дата" in str(c) or "date" in str(c).lower()]
    amount_cols = [c for c in df.columns if "Сумма" in str(c) or "amount" in str(c).lower()]
    name_col = name_cols[0]
    date_col = date_cols[0] if date_cols else None
    amount_col = amount_cols[0]

    # Parse dates and filter to current month
    start, today = _month_bounds_for_today()
    df["_amount"] = df[amount_col].apply(_safe_num)
    if date_col:
        df["_date"] = pd.to_datetime(df[date_col], errors="coerce", dayfirst=True).dt.date
        df = df[(df["_date"] >= start) & (df["_date"] <= today)]

    if df.empty:
        return {}

    df["_name_norm"] = df[name_col].apply(_norm_name)
    grouped = df.groupby("_name_norm")["_amount"].sum()
    out = {k: _safe_num(v) for k, v in grouped.items() if k}

    try:
        cache_df = pd.DataFrame([{"client_name": k, "amount": v} for k, v in out.items()])
        if not cache_df.empty:
            cache_df.to_parquet(CASHIN_CACHE_PATH, index=False)
    except Exception:
        pass

    return out


def _fetch_client_stocks(refresh: bool = False) -> Dict[str, Dict[str, Any]]:
    """
    Fetch client stocks xlsx, extract the *latest* balance date per client,
    days since that date, status, balance amount.
    Returns {norm_name: {last_date, days, status, balance}}
    """
    # Cache
    if not refresh and CLIENT_STOCKS_CACHE_PATH.exists():
        try:
            mtime = CLIENT_STOCKS_CACHE_PATH.stat().st_mtime
            if time.time() - mtime < CLIENT_STOCKS_CACHE_TTL_SEC:
                df_cached = pd.read_parquet(CLIENT_STOCKS_CACHE_PATH)
                if not df_cached.empty:
                    out_cached: Dict[str, Dict[str, Any]] = {}
                    for _, row in df_cached.iterrows():
                        out_cached[_norm_name(row["client_name"])] = {
                            "last_date": row.get("last_date"),
                            "days": int(row.get("days") or 0),
                            "status": row.get("status") or "Ma’lumot yo’q",
                            "balance": _safe_num(row.get("balance")),
                        }
                    return out_cached
        except Exception:
            pass

    # Fetch XLSX
    url = "https://smartup.online/b/trade/rep/tvt/client_stocks:run"
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
    s = _safe_session()
    r, e = _request_with_retry("POST", url, session=s, auth=_auth(), data=form, timeout=120)
    if e or r is None:
        return {}
    try:
        r.raise_for_status()
    except Exception:
        return {}
    if not _is_xlsx(r.content):
        return {}

    df = pd.read_excel(io.BytesIO(r.content))
    if df.empty:
        return {}

    # Attempt to standardize column names
    df.columns = [str(c) for c in df.columns]
    name_col = next((c for c in df.columns if "Клиент" in c or "client" in c.lower()), df.columns[0])
    date_col = next((c for c in df.columns if "Дата" in c or "дата" in c.lower()), None)
    days_col = next((c for c in df.columns if "дней" in c.lower() or "day" in c.lower()), None)
    balance_col = next((c for c in df.columns if "баланс" in c.lower() or "остат" in c.lower() or "сумма итого" in c.lower()), None)
    if balance_col is None and len(df.columns) > 1:
        balance_col = df.columns[-1]  # fallback to last column (usually balance)

    # Normalize and pick latest record per client
    df["_name_norm"] = df[name_col].apply(_norm_name)
    if date_col:
        df["_date"] = pd.to_datetime(df[date_col], errors="coerce", dayfirst=True).dt.date
        df_sorted = df.sort_values(["_name_norm", "_date"])
    else:
        df_sorted = df
    latest = df_sorted.groupby("_name_norm").tail(1) if not df_sorted.empty else df_sorted

    out: Dict[str, Dict[str, Any]] = {}
    today = date.today()
    for _, row in latest.iterrows():
        name_norm = row.get("_name_norm")
        if not name_norm:
            continue
        last_date = row.get("_date") if date_col else None
        balance = _safe_num(row.get(balance_col)) if balance_col else 0.0
        if days_col:
            days_val = int(_safe_num(row.get(days_col)))
        elif last_date:
            days_val = (today - last_date).days
        else:
            days_val = 0
        status = "OK"
        if last_date is None:
            status = "Ma’lumot yo’q"
        elif days_val > 14:
            status = "Kechikkan"

        out[name_norm] = {
            "last_date": last_date.isoformat() if isinstance(last_date, date) else "",
            "days": days_val,
            "status": status,
            "balance": balance,
        }

    # cache
    try:
        cache_df = pd.DataFrame([
            {
                "client_name": k,
                "last_date": v["last_date"],
                "days": v["days"],
                "status": v["status"],
                "balance": v["balance"],
            }
            for k, v in out.items()
        ])
        if not cache_df.empty:
            cache_df.to_parquet(CLIENT_STOCKS_CACHE_PATH, index=False)
    except Exception:
        pass

    return out


def _fetch_offset_debt(refresh: bool = False, chunk: int = 5000) -> Dict[str, float]:
    """
    Fetch offset list (debts) and return {norm_name: debt_amount}.
    Uses cache to avoid frequent downloads.
    """
    if not refresh and OFFSET_CACHE_PATH.exists():
        try:
            mtime = OFFSET_CACHE_PATH.stat().st_mtime
            if time.time() - mtime < OFFSET_CACHE_TTL_SEC:
                df_cached = pd.read_parquet(OFFSET_CACHE_PATH)
                if not df_cached.empty:
                    return {
                        _norm_name(row["client_name"]): _safe_num(row["debt"])
                        for _, row in df_cached.iterrows()
                    }
        except Exception:
            pass

    url = "https://smartup.online/b/anor/mdeal/order/offset/offset_list:table"
    headers = {"Content-Type": "application/json"}
    s = _safe_session()
    parts: List[pd.DataFrame] = []
    offset = 0

    while True:
        p = dict(OFFSET_LIST_BASE_P)
        p["offset"] = offset
        p["limit"] = chunk
        payload = {"d": None, "p": p}
        r, e = _request_with_retry("POST", url, session=s, auth=_auth(), json=payload, headers=headers, timeout=120)
        if e or r is None:
            break
        try:
            r.raise_for_status()
        except Exception:
            break
        if not _is_xlsx(r.content):
            break
        df_part = pd.read_excel(io.BytesIO(r.content))
        if df_part.empty:
            break
        parts.append(df_part)
        if len(df_part) < chunk:
            break
        offset += chunk
        time.sleep(0.4)

    if not parts:
        return {}
    df = pd.concat(parts, ignore_index=True)
    df.columns = [str(c) for c in df.columns]
    name_col = next((c for c in df.columns if "Клиент" in c or "person" in c.lower()), df.columns[0])
    debt_col = next((c for c in df.columns if "задолж" in c.lower() or "debt" in c.lower()), None)
    if debt_col is None and len(df.columns) > 2:
        debt_col = df.columns[2]

    out: Dict[str, float] = {}
    for _, row in df.iterrows():
        name_raw = row.get(name_col)
        if not isinstance(name_raw, str):
            continue
        norm = _norm_name(name_raw)
        debt_val = _safe_num(row.get(debt_col)) if debt_col else 0.0
        out[norm] = debt_val

    try:
        cache_df = pd.DataFrame([{"client_name": k, "debt": v} for k, v in out.items()])
        if not cache_df.empty:
            cache_df.to_parquet(OFFSET_CACHE_PATH, index=False)
    except Exception:
        pass

    return out


OFFSET_LIST_BASE_P = {
    "do": 2,
    "column": ["person_name", "currency_name", "debt_amount", "advance_amount", "total_amount"],
    "label": ["Клиент", "Валюта", "Задолженность", "Предоплата", "Баланс"],
    "size": ["4.999968", "1.464000", "1.644000", "2.253600", "1.644000"],
    "img": [None, None, None, None, None],
    "filter": [],
    "sort": ["person_name"],
    "rt": "xlsx",
}
CASHIN_LIST_P = {
    "do": 2,
    "column": ["cashin_number", "cashin_date", "room_names", "client_name", "amount", "note", "created_by_name"],
    "label": ["Номер оплаты", "Дата", "Текущие рабочие зоны", "Клиент", "Сумма", "Примечание", "Создал"],
    "size": ["1.965656", "2.157551", "3.043207", "3.364723", "3.000000", "2.216152", "2.973761"],
    "img": [None, None, None, None, None, None, None],
    "filter": [],
    "sort": ["-cashin_time"],
    "rt": "xlsx",
}
def _build_clients(refresh: bool = False, offset: int = 0, limit: int = 500):
    err = _require_credentials()
    if err:
        return None, err

    url = "https://smartup.online/b/anor/mr/person/legal_person_list:table"

    # payload = {
    #     "p": {
    #         "column": [
    #             "person_id", "name", "main_phone", "modified_on", "room_names", "address", "code",
    #             "group_name2", "group_name3", "state", "state_name", "latlng", "head_state"
    #         ],
    #         "filter": ["and", [
    #             ["group_id2", "=", ["119101", "119102", "119103"]],
    #             ["room_ids", "=", ["103620", "114341", "112860", "108983", "114342", "100548"]],
    #             ["state", "=", ["A"]],
    #         ]],
    #         "sort": [],
    #         "offset": offset,
    #         "limit": limit,
    #     },
    #     "d": {"is_filial": "N"},
    # }

    payload = {"p":{"column":["person_id","name","main_phone","modified_on","room_names","group_name2","group_name3","state","state_name","latlng","head_state"],"filter":["state","=","A"],"sort":[],"offset":0,"limit":2000},"d":{"is_filial":"N"}}

    s = _safe_session()
    headers = {"Content-Type": "application/json"}

    r, e = _request_with_retry("POST", url, session=s, auth=_auth(), json=payload, headers=headers, timeout=120)
    if e:
        return None, e
    assert r is not None

    try:
        r.raise_for_status()
    except Exception:
        return None, JSONResponse({"error": "HTTP error", "status": r.status_code, "detail": r.text[:800]}, status_code=502)

    try:
        raw = r.json()
    except Exception:
        return None, JSONResponse(
            {
                "error": "Expected JSON but got something else",
                "content_type": r.headers.get("content-type"),
                "preview": r.text[:800],
            },
            status_code=502
        )

    rows = raw.get("data") if isinstance(raw, dict) else None
    if not (rows and isinstance(rows, list)):
        return None, JSONResponse({"error": "Unexpected clients payload"}, status_code=502)

    limits = _load_limit_json()
    a_debt = _load_a_category_debt()
    cashin = _fetch_cashin_monthly(refresh=refresh)
    stocks = _fetch_client_stocks(refresh=refresh)
    offset_debt = _fetch_offset_debt(refresh=refresh)
    clients = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 2:
            continue
        client_id = row[0]
        name = row[1] or ""
        phone = row[2] if len(row) > 2 and row[2] else ""
        modified_on = row[3] if len(row) > 3 and row[3] else ""
        name_norm = _norm_name(name)
        category = row[7] if len(row) > 7 and row[7] else "C"
        if category == "A":
            debt_val = a_debt.get(name_norm, 0.0)
        elif category == "B":
            debt_val = offset_debt.get(name_norm, 0.0)
        else:
            debt_val = 0.0
        debt_quarter = debt_val / 4.0
        income = cashin.get(name_norm, 0.0)
        stock = stocks.get(name_norm, {})
        clients.append({
            "id": str(client_id),
            "fullName": name,
            "phone": str(phone or ""),
            "totalPoints": 0.0,
            "pointsEarned": 0.0,
            "pointsRedeemed": 0.0,
            "status": "active",
            "lastUpdated": str(modified_on or stock.get("last_date", "")),
            "name": name,
            "category": category,
            "limit": _safe_num(limits.get(name_norm, 0.0)),
            "debt": _safe_num(debt_val),
            "lastBalanceDate": stock.get("last_date", ""),
            "daysPassed": int(stock.get("days") or 0),
            "status": stock.get("status", "Ma’lumot yo’q"),
            "thisMonthIncome": _safe_num(income),
            "balanceAmount": _safe_num(stock.get("balance", 0.0)),
            "debtQuarter": _safe_num(debt_quarter),
            "incomePlusQuarterDebt": _safe_num(income + debt_quarter),
        })
    return clients, None


@app.get("/api/clients")
def get_clients(
    offset: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=5000),
    refresh: bool = Query(False, description="Force refresh of cached cashin/debt data"),
):
    clients, error_resp = _build_clients(refresh=refresh, offset=offset, limit=limit)
    if error_resp:
        return error_resp
    return {"count": len(clients), "clients": clients}
