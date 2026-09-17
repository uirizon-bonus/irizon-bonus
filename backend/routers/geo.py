from fastapi import APIRouter, Depends, Query

from backend import deps
from backend.services import geo as geo_service


router = APIRouter(tags=["geo"])


# Geocoding runs on the server so the billable key never ships inside the app.
# Customer-only: these cost money per call.
@router.get("/api/geo/reverse")
def reverse_geocode(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    language: str = Query("ru", max_length=5),
    current_id: str = Depends(deps.require_customer),
):
    return geo_service.reverse_geocode_payload(lat, lng, language)


@router.get("/api/geo/search")
def search_places(
    q: str = Query(..., min_length=3, max_length=200),
    language: str = Query("ru", max_length=5),
    session: str = Query("", max_length=100),
    current_id: str = Depends(deps.require_customer),
):
    return geo_service.search_places_payload(q, language, session)


@router.get("/api/geo/place")
def place_location(
    place_id: str = Query(..., min_length=3, max_length=300),
    language: str = Query("ru", max_length=5),
    session: str = Query("", max_length=100),
    current_id: str = Depends(deps.require_customer),
):
    return geo_service.place_location_payload(place_id, language, session)
