from fastapi.responses import JSONResponse

from backend.core import geo as geo_core


def _unavailable() -> JSONResponse:
    # Not an error the customer caused: the app falls back to a typed address.
    return JSONResponse(
        {"error": "Geocoding is unavailable", "code": "geocoding_unavailable"},
        status_code=503,
    )


def reverse_geocode_payload(lat: float, lng: float, language: str):
    try:
        address = geo_core.reverse_geocode(float(lat), float(lng), language=language)
    except geo_core.GeoUnavailable:
        return _unavailable()
    return {"address": address, "lat": round(float(lat), 6), "lng": round(float(lng), 6)}


def search_places_payload(query: str, language: str, session_token: str):
    try:
        results = geo_core.search_places(query, language=language, session_token=session_token)
    except geo_core.GeoUnavailable:
        return _unavailable()
    return {"count": len(results), "results": results}


def place_location_payload(place_id: str, language: str, session_token: str):
    try:
        place = geo_core.place_location(place_id, language=language, session_token=session_token)
    except geo_core.GeoUnavailable:
        return _unavailable()
    return {"place": place}
