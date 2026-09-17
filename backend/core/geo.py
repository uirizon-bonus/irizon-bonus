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
# Places API (New). The older /maps/api/place/* endpoints cannot be enabled on
# projects created from 2025 onwards, so this is the only address search that
# works for a fresh project.
AUTOCOMPLETE_ENDPOINT = "https://places.googleapis.com/v1/places:autocomplete"
PLACE_DETAILS_ENDPOINT = "https://places.googleapis.com/v1/places"
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


def _places_error(payload: Dict[str, Any]) -> str:
    return str(((payload or {}).get("error") or {}).get("message") or "")


def search_places(query: str, language: str = "ru", session_token: str = "") -> List[Dict[str, Any]]:
    """Address suggestions for what the customer typed."""
    key = _require_key()
    text = str(query or "").strip()
    if len(text) < 3:
        return []
    body: Dict[str, Any] = {
        "input": text,
        "languageCode": language,
        "includedRegionCodes": [PLACES_COUNTRY],
    }
    # A session token bills a whole search-then-pick as one operation.
    if session_token:
        body["sessionToken"] = session_token
    try:
        response = requests.post(
            AUTOCOMPLETE_ENDPOINT,
            json=body,
            headers={"X-Goog-Api-Key": key, "Content-Type": "application/json"},
            timeout=GEO_TIMEOUT_SEC,
        )
        payload = response.json()
    except Exception as exc:
        raise GeoUnavailable(f"Places request failed: {exc}")
    if response.status_code != 200:
        logger.warning("Places autocomplete failed (%s): %s", response.status_code, _places_error(payload))
        raise GeoUnavailable(f"Places returned {response.status_code}")
    results: List[Dict[str, Any]] = []
    for item in payload.get("suggestions") or []:
        prediction = item.get("placePrediction") or {}
        place_id = str(prediction.get("placeId") or "")
        description = str(((prediction.get("text") or {}).get("text")) or "")
        if place_id and description:
            results.append({"placeId": place_id, "description": description})
    return results[:8]


def place_location(place_id: str, language: str = "ru", session_token: str = "") -> Dict[str, Any]:
    """Turn a chosen suggestion into a pin the map can show."""
    key = _require_key()
    identifier = str(place_id or "").strip()
    if not identifier:
        raise GeoUnavailable("No place id given")
    params: Dict[str, Any] = {"languageCode": language}
    if session_token:
        params["sessionToken"] = session_token
    try:
        response = requests.get(
            f"{PLACE_DETAILS_ENDPOINT}/{identifier}",
            params=params,
            headers={
                "X-Goog-Api-Key": key,
                # Asking for two fields keeps this in the cheapest billing tier.
                "X-Goog-FieldMask": "location,formattedAddress",
            },
            timeout=GEO_TIMEOUT_SEC,
        )
        payload = response.json()
    except Exception as exc:
        raise GeoUnavailable(f"Place details request failed: {exc}")
    if response.status_code != 200:
        logger.warning("Place details failed (%s): %s", response.status_code, _places_error(payload))
        raise GeoUnavailable(f"Place details returned {response.status_code}")
    location = payload.get("location") or {}
    if "latitude" not in location or "longitude" not in location:
        raise GeoUnavailable("Place details carried no coordinates")
    return {
        "lat": round(float(location["latitude"]), 6),
        "lng": round(float(location["longitude"]), 6),
        "address": str(payload.get("formattedAddress") or ""),
    }
