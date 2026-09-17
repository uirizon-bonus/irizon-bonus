from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import requests

from backend.config import (
    GEO_PROVIDER,
    GEOCODE_CACHE_TTL_DAYS,
    GOOGLE_MAPS_SERVER_KEY,
    YANDEX_GEOCODER_KEY,
    YANDEX_SUGGEST_KEY,
    logger,
)
from backend.db import bonus_db

GEO_TIMEOUT_SEC = 12
# Addresses are only looked up for Uzbekistan.
PLACES_COUNTRY = "uz"
# lng/lat corners used to bias suggestions towards the service area.
UZ_BBOX = "55.9,37.0~73.2,45.7"

GOOGLE_GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json"
GOOGLE_AUTOCOMPLETE_ENDPOINT = "https://places.googleapis.com/v1/places:autocomplete"
GOOGLE_PLACE_DETAILS_ENDPOINT = "https://places.googleapis.com/v1/places"

YANDEX_GEOCODE_ENDPOINT = "https://geocode-maps.yandex.ru/1.x/"
YANDEX_SUGGEST_ENDPOINT = "https://suggest-maps.yandex.ru/v1/suggest"


class GeoUnavailable(RuntimeError):
    """Lookup could not run — no key, or the provider did not answer usefully.

    Never fatal for the customer: the app keeps the pin and lets them type the
    address by hand.
    """


# ── cache ───────────────────────────────────────────────────────────────────

def _cache_key(lat: float, lng: float, language: str) -> str:
    # ~1 m of precision. Nudging a pin within the same doorway reuses one answer.
    return f"{GEO_PROVIDER}:{language}:{lat:.5f},{lng:.5f}"


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


# ── Yandex ──────────────────────────────────────────────────────────────────

def _yandex_lang(language: str) -> str:
    # Yandex has no Uzbek locale; Russian is what customers here read on maps.
    return {"ru": "ru_RU", "en": "en_US"}.get(str(language or "ru").lower()[:2], "ru_RU")


def _yandex_geocode_request(params: Dict[str, Any]) -> Dict[str, Any]:
    if not YANDEX_GEOCODER_KEY:
        raise GeoUnavailable("Yandex geocoder key is not configured")
    try:
        response = requests.get(
            YANDEX_GEOCODE_ENDPOINT,
            params={"apikey": YANDEX_GEOCODER_KEY, "format": "json", **params},
            timeout=GEO_TIMEOUT_SEC,
        )
    except Exception as exc:
        raise GeoUnavailable(f"Yandex geocoder request failed: {exc}")
    if response.status_code != 200:
        logger.warning("Yandex geocoder failed (%s): %s", response.status_code, response.text[:200])
        raise GeoUnavailable(f"Yandex geocoder returned {response.status_code}")
    try:
        return response.json()
    except Exception as exc:
        raise GeoUnavailable(f"Yandex geocoder returned non-JSON: {exc}")


def _yandex_first_geo_object(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    members = (
        ((payload or {}).get("response") or {}).get("GeoObjectCollection") or {}
    ).get("featureMember") or []
    if not members:
        return None
    return (members[0] or {}).get("GeoObject") or None


def _yandex_address_of(geo_object: Dict[str, Any]) -> str:
    meta = ((geo_object or {}).get("metaDataProperty") or {}).get("GeocoderMetaData") or {}
    return str(meta.get("text") or "")


def _yandex_point_of(geo_object: Dict[str, Any]) -> Optional[Dict[str, float]]:
    # Yandex writes points as "longitude latitude" — the opposite order to ours.
    raw = str(((geo_object or {}).get("Point") or {}).get("pos") or "").strip()
    parts = raw.split()
    if len(parts) != 2:
        return None
    try:
        return {"lat": round(float(parts[1]), 6), "lng": round(float(parts[0]), 6)}
    except ValueError:
        return None


def _yandex_reverse(lat: float, lng: float, language: str) -> str:
    payload = _yandex_geocode_request(
        {"geocode": f"{lng},{lat}", "lang": _yandex_lang(language), "results": 1}
    )
    geo_object = _yandex_first_geo_object(payload)
    return _yandex_address_of(geo_object) if geo_object else ""


def _yandex_search(query: str, language: str) -> List[Dict[str, Any]]:
    if not YANDEX_SUGGEST_KEY:
        raise GeoUnavailable("Yandex suggest key is not configured")
    try:
        response = requests.get(
            YANDEX_SUGGEST_ENDPOINT,
            params={
                "apikey": YANDEX_SUGGEST_KEY,
                "text": query,
                "lang": str(language or "ru").lower()[:2],
                "results": 8,
                "types": "geo",
                "print_address": 1,
                "attrs": "uri",
                "bbox": UZ_BBOX,
                "strict_bounds": 1,
            },
            timeout=GEO_TIMEOUT_SEC,
        )
    except Exception as exc:
        raise GeoUnavailable(f"Yandex suggest request failed: {exc}")
    if response.status_code != 200:
        logger.warning("Yandex suggest failed (%s): %s", response.status_code, response.text[:200])
        raise GeoUnavailable(f"Yandex suggest returned {response.status_code}")
    try:
        payload = response.json()
    except Exception as exc:
        raise GeoUnavailable(f"Yandex suggest returned non-JSON: {exc}")
    results: List[Dict[str, Any]] = []
    for item in payload.get("results") or []:
        # The uri is what turns a suggestion back into coordinates later.
        uri = str(item.get("uri") or "")
        address = str(((item.get("address") or {}).get("formatted_address")) or "")
        title = str(((item.get("title") or {}).get("text")) or "")
        subtitle = str(((item.get("subtitle") or {}).get("text")) or "")
        description = address or ", ".join(part for part in (title, subtitle) if part)
        if uri and description:
            results.append({"placeId": uri, "description": description})
    return results[:8]


def _yandex_place(place_id: str, language: str) -> Dict[str, Any]:
    payload = _yandex_geocode_request({"uri": place_id, "lang": _yandex_lang(language)})
    geo_object = _yandex_first_geo_object(payload)
    point = _yandex_point_of(geo_object) if geo_object else None
    if not point:
        raise GeoUnavailable("Yandex returned no coordinates for that place")
    return {**point, "address": _yandex_address_of(geo_object)}


# ── Google ──────────────────────────────────────────────────────────────────

def _google_key() -> str:
    if not GOOGLE_MAPS_SERVER_KEY:
        raise GeoUnavailable("Google server key is not configured")
    return GOOGLE_MAPS_SERVER_KEY


def _google_error(payload: Dict[str, Any]) -> str:
    return str(((payload or {}).get("error") or {}).get("message") or "")


def _google_reverse(lat: float, lng: float, language: str) -> str:
    key = _google_key()
    try:
        response = requests.get(
            GOOGLE_GEOCODE_ENDPOINT,
            params={"latlng": f"{lat},{lng}", "language": language, "key": key},
            timeout=GEO_TIMEOUT_SEC,
        )
        payload = response.json()
    except Exception as exc:
        raise GeoUnavailable(f"Geocoding request failed: {exc}")
    status = str(payload.get("status") or "")
    if status == "ZERO_RESULTS":
        return ""
    if status != "OK":
        logger.warning("Geocoding returned %s: %s", status, payload.get("error_message", ""))
        raise GeoUnavailable(f"Geocoding returned {status}")
    results = payload.get("results") or []
    return str((results[0] if results else {}).get("formatted_address") or "")


def _google_search(query: str, language: str, session_token: str) -> List[Dict[str, Any]]:
    key = _google_key()
    body: Dict[str, Any] = {
        "input": query,
        "languageCode": language,
        "includedRegionCodes": [PLACES_COUNTRY],
    }
    if session_token:
        body["sessionToken"] = session_token
    try:
        response = requests.post(
            GOOGLE_AUTOCOMPLETE_ENDPOINT,
            json=body,
            headers={"X-Goog-Api-Key": key, "Content-Type": "application/json"},
            timeout=GEO_TIMEOUT_SEC,
        )
        payload = response.json()
    except Exception as exc:
        raise GeoUnavailable(f"Places request failed: {exc}")
    if response.status_code != 200:
        logger.warning("Places autocomplete failed (%s): %s", response.status_code, _google_error(payload))
        raise GeoUnavailable(f"Places returned {response.status_code}")
    results: List[Dict[str, Any]] = []
    for item in payload.get("suggestions") or []:
        prediction = item.get("placePrediction") or {}
        place_id = str(prediction.get("placeId") or "")
        description = str(((prediction.get("text") or {}).get("text")) or "")
        if place_id and description:
            results.append({"placeId": place_id, "description": description})
    return results[:8]


def _google_place(place_id: str, language: str, session_token: str) -> Dict[str, Any]:
    key = _google_key()
    params: Dict[str, Any] = {"languageCode": language}
    if session_token:
        params["sessionToken"] = session_token
    try:
        response = requests.get(
            f"{GOOGLE_PLACE_DETAILS_ENDPOINT}/{place_id}",
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
        logger.warning("Place details failed (%s): %s", response.status_code, _google_error(payload))
        raise GeoUnavailable(f"Place details returned {response.status_code}")
    location = payload.get("location") or {}
    if "latitude" not in location or "longitude" not in location:
        raise GeoUnavailable("Place details carried no coordinates")
    return {
        "lat": round(float(location["latitude"]), 6),
        "lng": round(float(location["longitude"]), 6),
        "address": str(payload.get("formattedAddress") or ""),
    }


# ── public ──────────────────────────────────────────────────────────────────

def reverse_geocode(lat: float, lng: float, language: str = "ru") -> str:
    """Coordinates to a human address. Empty string means no address is known."""
    cache_key = _cache_key(float(lat), float(lng), language)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    if GEO_PROVIDER == "google":
        address = _google_reverse(float(lat), float(lng), language)
    else:
        address = _yandex_reverse(float(lat), float(lng), language)
    _cache_put(cache_key, address)
    return address


def search_places(query: str, language: str = "ru", session_token: str = "") -> List[Dict[str, Any]]:
    """Address suggestions for what the customer typed."""
    text = str(query or "").strip()
    if len(text) < 3:
        return []
    if GEO_PROVIDER == "google":
        return _google_search(text, language, session_token)
    return _yandex_search(text, language)


def place_location(place_id: str, language: str = "ru", session_token: str = "") -> Dict[str, Any]:
    """Turn a chosen suggestion into a pin the map can show."""
    identifier = str(place_id or "").strip()
    if not identifier:
        raise GeoUnavailable("No place id given")
    if GEO_PROVIDER == "google":
        return _google_place(identifier, language, session_token)
    return _yandex_place(identifier, language)
