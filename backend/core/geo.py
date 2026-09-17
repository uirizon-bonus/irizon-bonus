from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import requests

from backend.config import (
    GEOCODE_CACHE_TTL_DAYS,
    GOOGLE_MAPS_SERVER_KEY,
    logger,
)
from backend.db import bonus_db

GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json"
AUTOCOMPLETE_ENDPOINT = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
PLACE_DETAILS_ENDPOINT = "https://maps.googleapis.com/maps/api/place/details/json"
GEO_TIMEOUT_SEC = 12
# Autocomplete is limited to Uzbekistan: a customer picking a street in another
# country is a mistake, not a delivery address.
PLACES_COUNTRY = "uz"


class GeoUnavailable(RuntimeError):
    """Lookup could not run — no key, or Google did not answer usefully.

    Never fatal for the customer: the app keeps the pin and lets them type the
    address by hand.
    """


def _require_key() -> str:
    if not GOOGLE_MAPS_SERVER_KEY:
        raise GeoUnavailable("Geocoding key is not configured")
    return GOOGLE_MAPS_SERVER_KEY


def _cache_key(lat: float, lng: float, language: str) -> str:
    # ~1 m of precision. Nudging a pin within the same doorway reuses one answer.
    return f"{language}:{lat:.5f},{lng:.5f}"


def _cache_get(key: str) -> Optional[str]:
    connection = bonus_db()
    try:
        row = connection.execute(
            "SELECT address, created_at FROM geocode_cache WHERE cache_key = ?",
            (key,),
        ).fetchone()
    finally:
        connection.close()
    if row is None:
        return None
    raw_created = str(row["created_at"] or "")
    try:
        created = datetime.fromisoformat(raw_created.replace("Z", "").split("+")[0].strip())
        if datetime.utcnow() - created > timedelta(days=max(1, GEOCODE_CACHE_TTL_DAYS)):
            return None
    except ValueError:
        # Unreadable timestamp: treat the entry as usable rather than paying again.
        pass
    return str(row["address"] or "")


def _cache_put(key: str, address: str) -> None:
    connection = bonus_db()
    try:
        connection.execute(
            """
            INSERT INTO geocode_cache (cache_key, address) VALUES (?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET address = excluded.address,
                                                 created_at = CURRENT_TIMESTAMP
            """,
            (key, str(address or "")),
        )
        connection.commit()
    except Exception as exc:  # a cache miss must never break a save
        logger.warning("geocode cache write failed: %s", exc)
    finally:
        connection.close()


def reverse_geocode(lat: float, lng: float, language: str = "ru") -> str:
    """Coordinates to a human address. Empty string means Google knows no address."""
    key = _require_key()
    cache_key = _cache_key(float(lat), float(lng), language)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        response = requests.get(
            GEOCODE_ENDPOINT,
            params={"latlng": f"{lat},{lng}", "language": language, "key": key},
            timeout=GEO_TIMEOUT_SEC,
        )
        payload = response.json()
    except Exception as exc:
        raise GeoUnavailable(f"Geocoding request failed: {exc}")
    status = str(payload.get("status") or "")
    if status == "ZERO_RESULTS":
        _cache_put(cache_key, "")
        return ""
    if status != "OK":
        logger.warning("Geocoding returned %s: %s", status, payload.get("error_message", ""))
        raise GeoUnavailable(f"Geocoding returned {status}")
    results = payload.get("results") or []
    address = str((results[0] if results else {}).get("formatted_address") or "")
    _cache_put(cache_key, address)
    return address


def search_places(query: str, language: str = "ru", session_token: str = "") -> List[Dict[str, Any]]:
    """Address suggestions for what the customer typed."""
    key = _require_key()
    text = str(query or "").strip()
    if len(text) < 3:
        return []
    params: Dict[str, Any] = {
        "input": text,
        "language": language,
        "components": f"country:{PLACES_COUNTRY}",
        "key": key,
    }
    # A session token bills a whole search-then-pick as one operation.
    if session_token:
        params["sessiontoken"] = session_token
    try:
        response = requests.get(AUTOCOMPLETE_ENDPOINT, params=params, timeout=GEO_TIMEOUT_SEC)
        payload = response.json()
    except Exception as exc:
        raise GeoUnavailable(f"Places request failed: {exc}")
    status = str(payload.get("status") or "")
    if status == "ZERO_RESULTS":
        return []
    if status != "OK":
        logger.warning("Places returned %s: %s", status, payload.get("error_message", ""))
        raise GeoUnavailable(f"Places returned {status}")
    return [
        {
            "placeId": str(item.get("place_id") or ""),
            "description": str(item.get("description") or ""),
        }
        for item in (payload.get("predictions") or [])
        if item.get("place_id")
    ][:8]


def place_location(place_id: str, language: str = "ru", session_token: str = "") -> Dict[str, Any]:
    """Turn a chosen suggestion into a pin the map can show."""
    key = _require_key()
    params: Dict[str, Any] = {
        "place_id": str(place_id or "").strip(),
        "language": language,
        "fields": "geometry,formatted_address",
        "key": key,
    }
    if session_token:
        params["sessiontoken"] = session_token
    try:
        response = requests.get(PLACE_DETAILS_ENDPOINT, params=params, timeout=GEO_TIMEOUT_SEC)
        payload = response.json()
    except Exception as exc:
        raise GeoUnavailable(f"Place details request failed: {exc}")
    if str(payload.get("status") or "") != "OK":
        raise GeoUnavailable(f"Place details returned {payload.get('status')}")
    result = payload.get("result") or {}
    location = ((result.get("geometry") or {}).get("location")) or {}
    if "lat" not in location or "lng" not in location:
        raise GeoUnavailable("Place details carried no coordinates")
    return {
        "lat": round(float(location["lat"]), 6),
        "lng": round(float(location["lng"]), 6),
        "address": str(result.get("formatted_address") or ""),
    }
