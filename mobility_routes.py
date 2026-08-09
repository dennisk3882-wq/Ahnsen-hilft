from __future__ import annotations

import json
import math
import os
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Any
from urllib.parse import quote
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

import requests
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.routing import APIRoute

from platform_runtime import get_platform_snapshot
from pwa_ui import home_page, page


router = APIRouter()
LOCAL_TZ = ZoneInfo("Europe/Berlin")
DEPARTURE_HORIZON_MINUTES = 8 * 60

KNOWN_LINES = {
    "2132": {"title": "Bückeburg ↔ Bad Eilsen", "note": "über Ahnsen und Klinikum Schaumburg"},
    "2133": {"title": "Stadtverkehr Bückeburg", "note": "über Ahnsen, Klinikum und Bad Eilsen"},
    "2026": {"title": "Bückeburg ↔ Obernkirchen / Ahnsen", "note": "werktags mit Fahrten bis Ahnsen"},
}

# Die lokalen Haltestellen werden unabhängig davon angezeigt, ob jede einzelne
# Fahrt des Tages sie bedient. Die Abfahrtstafel filtert anschließend auf echte
# Fahrten der Datenquelle.
BASE_STOPS = [
    {"key": "schule", "name": "Ahnsen, Schule", "lines": ["2132", "2133"]},
    {"key": "theodor-heuss", "name": "Ahnsen, Theodor-Heuss-Straße", "lines": ["2132", "2133", "2026"]},
    {"key": "haus-eix", "name": "Ahnsen, Haus Eix", "lines": ["2132"]},
    {"key": "dorfgemeinschaftshaus", "name": "Ahnsen, Dorfgemeinschaftshaus", "lines": ["2132"]},
    {"key": "klinikum", "name": "Klinikum Schaumburg", "lines": ["2132", "2133"]},
    {"key": "schmiede", "name": "Ahnsen, Schmiede", "lines": ["2132", "2133"]},
    {"key": "wilhelmshoehe", "name": "Ahnsen, Wilhelmshöhe", "lines": ["2132", "2133"]},
]

_OSM_CACHE: dict[str, Any] = {"expires": 0.0, "stops": []}
_OSM_LOCK = threading.Lock()
_VEHICLE_CACHE: dict[str, Any] = {
    "expires": 0.0,
    "vehicles": [],
    "status": "not-configured",
    "message": "",
    "updated_at": None,
}
_VEHICLE_LOCK = threading.Lock()
_DEPARTURE_CACHE: dict[str, Any] = {
    "expires": 0.0,
    "departures": [],
    "estimated_vehicles": [],
    "status": "idle",
    "message": "",
    "updated_at": None,
    "provider": "",
}
_DEPARTURE_LOCK = threading.Lock()
_STOP_ID_CACHE: dict[str, tuple[float, dict[str, Any] | None]] = {}
_TRIP_CACHE: dict[str, tuple[float, dict[str, Any] | None]] = {}


def _bus_icon() -> str:
    return """<span class="glyph" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M7 8h10M8 18v2m8-2v2M8 14h.01M16 14h.01M9 5h6"/></svg></span>"""


def _norm(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(text.casefold().replace("-", " ").replace(",", " ").split())


def _platform_center() -> tuple[float, float]:
    cfg = get_platform_snapshot()
    try:
        return float(cfg.get("map_lat") or 52.258), float(cfg.get("map_lon") or 9.099)
    except (TypeError, ValueError):
        return 52.258, 9.099


def _stop_match(name: str) -> str | None:
    value = _norm(name)
    if "theodor heuss" in value:
        return "theodor-heuss"
    if "haus eix" in value:
        return "haus-eix"
    if "dorfgemeinschaftshaus" in value and "ahnsen" in value:
        return "dorfgemeinschaftshaus"
    if "wilhelmshohe" in value:
        return "wilhelmshoehe"
    if "schmiede" in value:
        return "schmiede"
    if "klinikum" in value:
        return "klinikum"
    if "schule" in value and ("ahnsen" in value or len(value.split()) <= 3):
        return "schule"
    return None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def _departure_api_base() -> str:
    return os.getenv("MOBILITY_DEPARTURE_API_BASE", "https://v6.db.transport.rest").strip().rstrip("/")


def _departure_provider() -> str:
    return os.getenv("MOBILITY_DEPARTURE_PROVIDER", "DB Vendo / transport.rest").strip() or "Fahrplanauskunft"


def _location_candidates(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("locations", "results", "stops"):
            if isinstance(payload.get(key), list):
                return [item for item in payload[key] if isinstance(item, dict)]
    return []


def _public_location_fallback(stop: dict[str, Any]) -> dict[str, Any] | None:
    """Fallback coordinates from the public timetable search if OSM misses a stop."""
    center_lat, center_lon = _platform_center()
    try:
        response = requests.get(
            f"{_departure_api_base()}/locations",
            params={"query": stop["name"], "results": 8, "poi": "false", "addresses": "false", "language": "de"},
            headers={"Accept": "application/json", "User-Agent": "Ahnsen-hilft/1.0 mobility-stops"},
            timeout=5,
        )
        response.raise_for_status()
    except Exception:
        return None
    target_key = stop["key"]
    best: tuple[float, dict[str, Any]] | None = None
    for item in _location_candidates(response.json()):
        name = str(item.get("name") or "").strip()
        if not name or _stop_match(name) != target_key:
            continue
        location = item.get("location") or {}
        try:
            lat = float(location.get("latitude"))
            lon = float(location.get("longitude"))
        except (TypeError, ValueError):
            continue
        distance = _haversine_km(center_lat, center_lon, lat, lon)
        if distance > 25:
            continue
        score = 100.0 - distance
        if "ahnsen" in _norm(name):
            score += 20
        if best is None or score > best[0]:
            best = (score, {"lat": lat, "lon": lon, "timetable_name": name})
    return best[1] if best else None


def _get_osm_stops() -> list[dict[str, Any]]:
    now = time.monotonic()
    if _OSM_CACHE["expires"] > now:
        return [dict(item) for item in _OSM_CACHE["stops"]]
    with _OSM_LOCK:
        if _OSM_CACHE["expires"] > time.monotonic():
            return [dict(item) for item in _OSM_CACHE["stops"]]
        center_lat, center_lon = _platform_center()
        query = f'''[out:json][timeout:8];(
node["highway"="bus_stop"](around:5000,{center_lat:.6f},{center_lon:.6f});
node["public_transport"="platform"](around:5000,{center_lat:.6f},{center_lon:.6f});
);out body;'''
        resolved: dict[str, dict[str, Any]] = {}
        try:
            response = requests.post(
                os.getenv("MOBILITY_OVERPASS_URL", "https://overpass-api.de/api/interpreter"),
                data={"data": query},
                headers={"User-Agent": f"{get_platform_snapshot().get('platform_slug', 'citizen-platform')}/1.0 mobility", "Accept": "application/json"},
                timeout=10,
            )
            response.raise_for_status()
            for element in response.json().get("elements", []):
                tags = element.get("tags") or {}
                name = str(tags.get("name") or tags.get("local_ref") or "").strip()
                key = _stop_match(name)
                if not key or key in resolved:
                    continue
                try:
                    lat, lon = float(element["lat"]), float(element["lon"])
                except (KeyError, TypeError, ValueError):
                    continue
                resolved[key] = {
                    "lat": lat,
                    "lon": lon,
                    "osm_name": name,
                    "ref": str(tags.get("ref") or ""),
                    "ifopt": str(tags.get("ref:IFOPT") or tags.get("ref:ifopt") or ""),
                    "coordinate_source": "OpenStreetMap",
                }
        except Exception:
            pass

        stops: list[dict[str, Any]] = []
        for base in BASE_STOPS:
            item = dict(base)
            located = resolved.get(base["key"])
            if located:
                item.update(located)
            else:
                fallback = _public_location_fallback(base)
                if fallback:
                    item.update(fallback)
                    item["coordinate_source"] = _departure_provider()
            stops.append(item)
        _OSM_CACHE.update({"stops": stops, "expires": time.monotonic() + 6 * 60 * 60})
        return [dict(item) for item in stops]


def _route_map() -> dict[str, str]:
    try:
        data = json.loads(os.getenv("MOBILITY_ROUTE_MAP_JSON", "") or "{}")
        return {str(key): str(value) for key, value in data.items()} if isinstance(data, dict) else {}
    except ValueError:
        return {}


def _dict_pick(data: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in data:
            return data[name]
    folded = {str(key).casefold(): value for key, value in data.items()}
    for name in names:
        if name.casefold() in folded:
            return folded[name.casefold()]
    return None


def _vehicle_headers() -> dict[str, str]:
    headers = {"Accept": "application/json, application/xml, text/xml;q=0.9, */*;q=0.8"}
    bearer = os.getenv("MOBILITY_VEHICLE_BEARER_TOKEN", "").strip()
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    api_key = os.getenv("MOBILITY_VEHICLE_API_KEY", "").strip()
    if api_key:
        headers[os.getenv("MOBILITY_VEHICLE_API_KEY_HEADER", "X-API-Key").strip() or "X-API-Key"] = api_key
    return headers


# Stufe 2: ausschließlich echte, freigegebene Fahrzeugpositionen.
def _parse_gtfsrt_json(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    route_map = _route_map()
    result = []
    center_lat, center_lon = _platform_center()
    for entity in _dict_pick(payload, "Entity", "entity") or []:
        if not isinstance(entity, dict):
            continue
        vehicle = _dict_pick(entity, "Vehicle", "vehicle")
        if not isinstance(vehicle, dict):
            continue
        trip = _dict_pick(vehicle, "Trip", "trip") or {}
        position = _dict_pick(vehicle, "Position", "position") or {}
        descriptor = _dict_pick(vehicle, "Vehicle", "vehicle") or {}
        if not isinstance(trip, dict) or not isinstance(position, dict):
            continue
        route_ref = str(_dict_pick(trip, "RouteId", "routeId", "route_id") or "").strip()
        line = route_map.get(route_ref, route_ref)
        if line not in KNOWN_LINES:
            continue
        try:
            lat = float(_dict_pick(position, "Latitude", "latitude", "lat"))
            lon = float(_dict_pick(position, "Longitude", "longitude", "lon"))
        except (TypeError, ValueError):
            continue
        if _haversine_km(center_lat, center_lon, lat, lon) > 35:
            continue
        result.append({
            "id": str(_dict_pick(descriptor, "Id", "id", "Label", "label") or _dict_pick(entity, "Id", "id") or ""),
            "line": line,
            "route_ref": route_ref,
            "trip_id": str(_dict_pick(trip, "TripId", "tripId", "trip_id") or ""),
            "lat": lat,
            "lon": lon,
            "bearing": _dict_pick(position, "Bearing", "bearing"),
            "speed": _dict_pick(position, "Speed", "speed"),
            "timestamp": _dict_pick(vehicle, "Timestamp", "timestamp"),
            "direction": str(_dict_pick(trip, "DirectionId", "directionId", "direction_id") or ""),
            "position_type": "exact",
        })
    return result


def _xml_local(tag: str) -> str:
    return str(tag).rsplit("}", 1)[-1]


def _first_xml_text(node: ElementTree.Element, names: set[str]) -> str:
    wanted = {name.casefold() for name in names}
    for child in node.iter():
        if _xml_local(child.tag).casefold() in wanted and child.text:
            return child.text.strip()
    return ""


def _parse_siri_vm(raw: bytes) -> list[dict[str, Any]]:
    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError:
        return []
    route_map = _route_map()
    result = []
    center_lat, center_lon = _platform_center()
    for activity in root.iter():
        if _xml_local(activity.tag).casefold() != "vehicleactivity":
            continue
        line_ref = _first_xml_text(activity, {"LineRef", "PublishedLineName"})
        line = route_map.get(line_ref, line_ref)
        if line not in KNOWN_LINES:
            continue
        try:
            lat = float(_first_xml_text(activity, {"Latitude"}))
            lon = float(_first_xml_text(activity, {"Longitude"}))
        except (TypeError, ValueError):
            continue
        if _haversine_km(center_lat, center_lon, lat, lon) > 35:
            continue
        result.append({
            "id": _first_xml_text(activity, {"VehicleRef"}),
            "line": line,
            "route_ref": line_ref,
            "trip_id": _first_xml_text(activity, {"DatedVehicleJourneyRef", "FramedVehicleJourneyRef"}),
            "lat": lat,
            "lon": lon,
            "bearing": _first_xml_text(activity, {"Bearing"}),
            "speed": "",
            "timestamp": _first_xml_text(activity, {"RecordedAtTime"}),
            "direction": _first_xml_text(activity, {"DirectionName", "DirectionRef", "DestinationName"}),
            "position_type": "exact",
        })
    return result


def _fetch_vehicles() -> tuple[list[dict[str, Any]], str, str, str | None]:
    endpoint = os.getenv("MOBILITY_VEHICLE_POSITIONS_URL", "").strip()
    if not endpoint:
        return [], "not-configured", "Offizielle Fahrzeugpositions-Schnittstelle noch nicht hinterlegt.", None
    try:
        response = requests.get(endpoint, headers=_vehicle_headers(), timeout=7)
        response.raise_for_status()
        fmt = os.getenv("MOBILITY_VEHICLE_FORMAT", "auto").strip().casefold()
        content_type = response.headers.get("content-type", "").casefold()
        if fmt in {"siri", "siri-vm", "xml"} or (fmt == "auto" and "xml" in content_type):
            vehicles = _parse_siri_vm(response.content)
        else:
            vehicles = _parse_gtfsrt_json(response.json())
        updated = datetime.now(timezone.utc).isoformat()
        if vehicles:
            return vehicles, "ok", f"{len(vehicles)} echte Fahrzeugposition(en) im Raum Ahnsen empfangen.", updated
        return [], "ok-empty", "GPS-Schnittstelle erreichbar, aktuell aber kein passendes Fahrzeug im Raum Ahnsen.", updated
    except Exception as error:
        return [], "error", f"Fahrzeugpositions-Schnittstelle derzeit nicht erreichbar ({type(error).__name__}).", None


def _vehicle_snapshot() -> dict[str, Any]:
    if _VEHICLE_CACHE["expires"] > time.monotonic():
        return dict(_VEHICLE_CACHE)
    with _VEHICLE_LOCK:
        if _VEHICLE_CACHE["expires"] > time.monotonic():
            return dict(_VEHICLE_CACHE)
        vehicles, status, message, updated_at = _fetch_vehicles()
        _VEHICLE_CACHE.update({
            "expires": time.monotonic() + 20,
            "vehicles": vehicles,
            "status": status,
            "message": message,
            "updated_at": updated_at,
        })
        return dict(_VEHICLE_CACHE)


def _parse_iso(value: Any) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=LOCAL_TZ)
    return parsed.astimezone(LOCAL_TZ)


def _line_number(line: Any) -> str:
    if not isinstance(line, dict):
        return ""
    for candidate in (line.get("name"), line.get("fahrtNr"), line.get("id")):
        digits = "".join(ch if ch.isdigit() else " " for ch in str(candidate or ""))
        for token in digits.split():
            if token in KNOWN_LINES:
                return token
    return ""


def _select_stop_candidate(stop: dict[str, Any], payload: Any) -> dict[str, Any] | None:
    target = _norm(stop.get("name", ""))
    target_key = stop["key"]
    center_lat = float(stop.get("lat") or _platform_center()[0])
    center_lon = float(stop.get("lon") or _platform_center()[1])
    best: tuple[float, dict[str, Any]] | None = None
    for item in _location_candidates(payload):
        if item.get("type") not in {None, "stop", "station"}:
            continue
        item_id = str(item.get("id") or "").strip()
        name = str(item.get("name") or "").strip()
        if not item_id or not name:
            continue
        location = item.get("location") or {}
        try:
            lat = float(location.get("latitude"))
            lon = float(location.get("longitude"))
        except (TypeError, ValueError):
            lat = lon = None
        score = 0.0
        name_norm = _norm(name)
        if name_norm == target:
            score += 120
        if _stop_match(name) == target_key:
            score += 100
        if "ahnsen" in name_norm:
            score += 35
        if lat is not None and lon is not None:
            distance = _haversine_km(center_lat, center_lon, lat, lon)
            if distance > 25:
                continue
            score += max(0.0, 30.0 - distance * 3)
        if best is None or score > best[0]:
            best = (score, {"id": item_id, "name": name, "lat": lat, "lon": lon})
    return best[1] if best and best[0] >= 70 else None


def _resolve_departure_stop(stop: dict[str, Any]) -> dict[str, Any] | None:
    try:
        overrides = json.loads(os.getenv("MOBILITY_DEPARTURE_STOP_IDS_JSON", "") or "{}")
    except ValueError:
        overrides = {}
    override = overrides.get(stop["key"]) if isinstance(overrides, dict) else None
    if isinstance(override, str) and override.strip():
        return {"id": override.strip(), "name": stop["name"], "lat": stop.get("lat"), "lon": stop.get("lon")}
    if isinstance(override, dict) and str(override.get("id") or "").strip():
        return {
            "id": str(override["id"]).strip(),
            "name": str(override.get("name") or stop["name"]),
            "lat": override.get("lat", stop.get("lat")),
            "lon": override.get("lon", stop.get("lon")),
        }
    cached = _STOP_ID_CACHE.get(stop["key"])
    if cached and cached[0] > time.monotonic():
        return dict(cached[1]) if cached[1] else None
    try:
        response = requests.get(
            f"{_departure_api_base()}/locations",
            params={"query": stop["name"], "results": 8, "poi": "false", "addresses": "false", "language": "de"},
            headers={"Accept": "application/json", "User-Agent": "Ahnsen-hilft/1.0 mobility-stage1"},
            timeout=5,
        )
        response.raise_for_status()
        resolved = _select_stop_candidate(stop, response.json())
    except Exception:
        resolved = None
    _STOP_ID_CACHE[stop["key"]] = (time.monotonic() + (86400 if resolved else 600), resolved)
    return dict(resolved) if resolved else None


def _departure_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict) and isinstance(payload.get("departures"), list):
        return [item for item in payload["departures"] if isinstance(item, dict)]
    return []


def _normalize_departure(raw: dict[str, Any], stop: dict[str, Any], source_stop: dict[str, Any]) -> dict[str, Any] | None:
    line = _line_number(raw.get("line"))
    if line not in KNOWN_LINES:
        return None
    when = _parse_iso(raw.get("when") or raw.get("plannedWhen"))
    planned = _parse_iso(raw.get("plannedWhen") or raw.get("when"))
    if not when or not planned or when < datetime.now(LOCAL_TZ) - timedelta(minutes=3):
        return None
    try:
        delay_seconds = int(raw.get("delay")) if raw.get("delay") is not None else int((when - planned).total_seconds())
    except (TypeError, ValueError):
        delay_seconds = None
    return {
        "stop_key": stop["key"],
        "stop_name": stop["name"],
        "source_stop_id": source_stop.get("id"),
        "line": line,
        "direction": str(raw.get("direction") or raw.get("provenance") or "").strip(),
        "when": when.isoformat(),
        "planned_when": planned.isoformat(),
        "time": when.strftime("%H:%M"),
        "planned_time": planned.strftime("%H:%M"),
        "delay_seconds": delay_seconds,
        "delay_minutes": int(round(delay_seconds / 60)) if delay_seconds is not None else None,
        "minutes": max(0, int(math.ceil((when - datetime.now(LOCAL_TZ)).total_seconds() / 60))),
        "cancelled": bool(raw.get("cancelled")),
        "trip_id": str(raw.get("tripId") or "").strip(),
        "realtime": raw.get("when") is not None and (raw.get("delay") is not None or raw.get("plannedWhen") is not None),
        "raw_stopovers": raw.get("stopovers") if isinstance(raw.get("stopovers"), list) else None,
    }


def _fetch_trip(trip_id: str) -> dict[str, Any] | None:
    if not trip_id:
        return None
    cached = _TRIP_CACHE.get(trip_id)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    try:
        response = requests.get(
            f"{_departure_api_base()}/trips/{quote(trip_id, safe='')}",
            params={"stopovers": "true", "remarks": "false", "language": "de"},
            headers={"Accept": "application/json", "User-Agent": "Ahnsen-hilft/1.0 mobility-stage1"},
            timeout=5,
        )
        response.raise_for_status()
        payload = response.json()
        trip = payload.get("trip") if isinstance(payload, dict) and isinstance(payload.get("trip"), dict) else payload
        if not isinstance(trip, dict):
            trip = None
    except Exception:
        trip = None
    _TRIP_CACHE[trip_id] = (time.monotonic() + (60 if trip else 30), trip)
    return trip


def _stopover_time(item: dict[str, Any]) -> datetime | None:
    return _parse_iso(item.get("departure") or item.get("arrival") or item.get("plannedDeparture") or item.get("plannedArrival"))


def _stopover_location(item: dict[str, Any]) -> tuple[float, float] | None:
    location = ((item.get("stop") or {}).get("location") or {})
    try:
        return float(location.get("latitude")), float(location.get("longitude"))
    except (TypeError, ValueError):
        return None


def _estimated_position(stopovers: list[dict[str, Any]], now: datetime) -> tuple[float, float, str, str] | None:
    points = []
    for stopover in stopovers:
        if not isinstance(stopover, dict):
            continue
        event_time = _stopover_time(stopover)
        location = _stopover_location(stopover)
        if event_time and location:
            points.append((event_time, location[0], location[1], str((stopover.get("stop") or {}).get("name") or "").strip()))
    points.sort(key=lambda item: item[0])
    for left, right in zip(points, points[1:]):
        if left[0] <= now <= right[0]:
            duration = max(1.0, (right[0] - left[0]).total_seconds())
            ratio = min(1.0, max(0.0, (now - left[0]).total_seconds() / duration))
            lat = left[1] + (right[1] - left[1]) * ratio
            lon = left[2] + (right[2] - left[2]) * ratio
            return lat, lon, left[3], right[3]
    return None


def _fetch_departures() -> tuple[list[dict[str, Any]], list[dict[str, Any]], str, str, str | None]:
    stops = _get_osm_stops()
    departures: list[dict[str, Any]] = []
    resolved_count = 0
    lookup_failures = 0
    request_failures = 0

    def load_stop(stop: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
        source_stop = _resolve_departure_stop(stop)
        if not source_stop:
            return "lookup-error", []
        try:
            response = requests.get(
                f"{_departure_api_base()}/stops/{quote(str(source_stop['id']), safe='')}/departures",
                params={
                    "duration": DEPARTURE_HORIZON_MINUTES,
                    "results": 30,
                    "stopovers": "true",
                    "remarks": "true",
                    "language": "de",
                },
                headers={"Accept": "application/json", "User-Agent": "Ahnsen-hilft/1.0 mobility-stage1"},
                timeout=6,
            )
            response.raise_for_status()
            items = []
            for raw in _departure_items(response.json()):
                item = _normalize_departure(raw, stop, source_stop)
                if item:
                    items.append(item)
            return "ok", items
        except Exception:
            return "request-error", []

    with ThreadPoolExecutor(max_workers=min(7, len(stops) or 1)) as pool:
        futures = [pool.submit(load_stop, stop) for stop in stops]
        for future in as_completed(futures):
            try:
                status, items = future.result()
            except Exception:
                status, items = "request-error", []
            resolved_count += int(status in {"ok", "request-error"})
            lookup_failures += int(status == "lookup-error")
            request_failures += int(status == "request-error")
            departures.extend(items)

    unique = {(item["stop_key"], item["line"], item["when"], item["direction"]): item for item in departures}
    departures = sorted(unique.values(), key=lambda item: item["when"])

    estimates: list[dict[str, Any]] = []
    seen: set[str] = set()
    now = datetime.now(LOCAL_TZ)
    center_lat, center_lon = _platform_center()
    for item in departures:
        trip_id = item.get("trip_id") or ""
        if not trip_id or trip_id in seen or len(estimates) >= 8:
            continue
        seen.add(trip_id)
        stopovers = item.pop("raw_stopovers", None) or []
        if len(stopovers) < 2:
            stopovers = (_fetch_trip(trip_id) or {}).get("stopovers") or []
        position = _estimated_position(stopovers, now)
        if not position:
            continue
        lat, lon, from_name, to_name = position
        if _haversine_km(center_lat, center_lon, lat, lon) <= 35:
            estimates.append({
                "id": f"estimate-{trip_id}",
                "trip_id": trip_id,
                "line": item["line"],
                "lat": lat,
                "lon": lon,
                "direction": item.get("direction") or "",
                "position_type": "estimated",
                "basis": "Fahrplan/Echtzeitprognose",
                "between": [from_name, to_name],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
    for item in departures:
        item.pop("raw_stopovers", None)

    updated = datetime.now(timezone.utc).isoformat()
    horizon_hours = DEPARTURE_HORIZON_MINUTES // 60
    if departures:
        live_count = sum(1 for item in departures if item.get("realtime"))
        message = f"{len(departures)} Abfahrten für die nächsten {horizon_hours} Stunden geladen"
        if live_count:
            message += f", davon {live_count} mit Prognose/Echtzeitbezug."
        else:
            message += "."
        return departures, estimates, "ok", message, updated
    if request_failures and request_failures >= resolved_count:
        return [], [], "error", "Die Haltestellen wurden gefunden, die Abfahrtsquelle antwortet aber derzeit nicht zuverlässig.", None
    if resolved_count:
        return [], [], "empty", f"Für die nächsten {horizon_hours} Stunden wurden aktuell keine Fahrten der Linien 2132, 2133 oder 2026 geliefert.", updated
    if lookup_failures:
        return [], [], "error", "Die Abfahrtsquelle konnte die Ahnsener Haltestellen derzeit nicht zuverlässig auflösen.", None
    return [], [], "empty", "Aktuell sind keine Abfahrtsdaten verfügbar.", updated


def _departure_snapshot() -> dict[str, Any]:
    if _DEPARTURE_CACHE["expires"] > time.monotonic():
        return dict(_DEPARTURE_CACHE)
    with _DEPARTURE_LOCK:
        if _DEPARTURE_CACHE["expires"] > time.monotonic():
            return dict(_DEPARTURE_CACHE)
        departures, estimates, status, message, updated_at = _fetch_departures()
        try:
            ttl = max(20, min(120, int(os.getenv("MOBILITY_DEPARTURE_CACHE_SECONDS", "45") or 45)))
        except ValueError:
            ttl = 45
        _DEPARTURE_CACHE.update({
            "expires": time.monotonic() + ttl,
            "departures": departures,
            "estimated_vehicles": estimates,
            "status": status,
            "message": message,
            "updated_at": updated_at,
            "provider": _departure_provider(),
        })
        return dict(_DEPARTURE_CACHE)


def _mobility_payload() -> dict[str, Any]:
    lat, lon = _platform_center()
    exact = _vehicle_snapshot()
    stage1 = _departure_snapshot()
    return {
        "center": {"lat": lat, "lon": lon, "zoom": int(get_platform_snapshot().get("map_zoom") or 15)},
        "stops": _get_osm_stops(),
        "lines": [{"line": key, **value} for key, value in KNOWN_LINES.items()],
        "departures": stage1["departures"],
        "estimated_vehicles": stage1["estimated_vehicles"],
        "vehicles": exact["vehicles"],
        "stage1": {
            "status": stage1["status"],
            "message": stage1["message"],
            "updated_at": stage1["updated_at"],
            "provider": stage1["provider"],
            "horizon_minutes": DEPARTURE_HORIZON_MINUTES,
            "position_note": "Geschätzte Buspositionen werden aus Fahrplan-/Prognosezeiten zwischen bekannten Haltestellen interpoliert und immer mit ~ markiert.",
        },
        "live_positions": {
            "configured": bool(os.getenv("MOBILITY_VEHICLE_POSITIONS_URL", "").strip()),
            "status": exact["status"],
            "message": exact["message"],
            "updated_at": exact["updated_at"],
            "provider": os.getenv("MOBILITY_VEHICLE_PROVIDER", "SHG Mobil / freigegebene Schnittstelle").strip(),
            "format": os.getenv("MOBILITY_VEHICLE_FORMAT", "auto").strip(),
        },
        "vbn_realtime": {
            "provider": "VBN / Connect GTFS-Realtime",
            "documented_url": "https://gtfsr.vbn.de/gtfsr_connect.json",
            "refresh_seconds": 60,
            "note": "VBN veröffentlicht Prognosen/Verspätungen als GTFS-Realtime. Der Feed wird nicht als GPS-Quelle ausgegeben.",
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/api/mobilitaet")
async def mobility_api():
    return JSONResponse(_mobility_payload(), headers={"Cache-Control": "no-store"})


_MOBILITY_TEMPLATE = r'''
<style>
.mobility-view .app-main{padding-bottom:110px}.mobility-head{display:grid;gap:10px;margin:0 0 16px}.mobility-head h1{margin:0;font-size:clamp(1.75rem,6vw,2.35rem);color:var(--forest)}.mobility-head p{margin:0;color:#536258;line-height:1.55}
.mob-stage{display:flex;gap:12px;padding:14px 16px;border:1px solid rgba(31,91,65,.16);border-radius:18px;background:#f4f6ec;box-shadow:0 7px 24px rgba(43,72,57,.06)}.mob-stage-icon{width:42px;height:42px;border-radius:14px;background:var(--forest);color:#fff;display:grid;place-items:center;flex:0 0 auto}.mob-stage div{display:grid;gap:2px}.mob-stage strong{color:var(--forest)}.mob-stage small{color:#69756e;line-height:1.35}.mob-stage.live{background:#edf7ef}.mob-stage.estimate{background:#f8f5e8;border-color:#d8c994}.mob-stage.error{background:#fff3eb;border-color:#e5b394}
.mob-departures{margin:16px 0;padding:15px;border-radius:22px;background:#fff;border:1px solid rgba(47,79,61,.12);box-shadow:0 12px 34px rgba(45,70,56,.07)}.mob-dep-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}.mob-dep-head h2{margin:0;color:var(--forest);font-size:1.16rem}.mob-dep-head small{display:block;color:#778279;margin-top:3px}.mob-data-badge{height:max-content;border-radius:999px;padding:5px 8px;background:#eef4e9;color:#41604c;font-size:.7rem;font-weight:780}.mob-stop-tabs{display:flex;gap:7px;overflow:auto;padding:1px 0 10px;scrollbar-width:none}.mob-stop-tab{white-space:nowrap;border:1px solid rgba(47,79,61,.15);background:#f8f8f2;color:#496052;border-radius:999px;padding:8px 11px;font-weight:720;font-size:.78rem}.mob-stop-tab.active{background:var(--forest);color:#fff}.mob-dep-list{display:grid;gap:8px}.mob-dep-row{display:grid;grid-template-columns:58px 1fr auto;align-items:center;gap:10px;padding:11px;border-radius:15px;background:#fbfbf7;border:1px solid rgba(47,79,61,.09)}.mob-dep-main{min-width:0;display:grid;gap:3px}.mob-dep-main strong,.mob-dep-main small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mob-dep-main strong{color:#294d3b}.mob-dep-main small{color:#78827b}.mob-dep-time{text-align:right;display:grid;gap:2px}.mob-dep-time strong{color:#254a38}.mob-dep-time small{font-size:.72rem;color:#758078}.mob-delay{justify-self:end;padding:3px 6px;border-radius:999px;background:#edf5e8;color:#316744;font-size:.68rem;font-weight:800}.mob-delay.late{background:#fff0e7;color:#9a4a20}.mob-dep-empty{padding:16px;border-radius:14px;background:#f7f5ed;color:#68746d;line-height:1.45}
.mob-map-card{overflow:hidden;border-radius:22px;background:#fff;border:1px solid rgba(47,79,61,.12);box-shadow:0 12px 34px rgba(45,70,56,.08);margin:16px 0}.mob-map-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px}.mob-map-toolbar div{display:grid;gap:2px}.mob-map-toolbar strong{color:var(--forest)}.mob-map-toolbar small{color:#768179}.mob-live-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#9ca8a0;margin-right:6px}.mob-live-dot.on{background:#2f8c54;box-shadow:0 0 0 5px rgba(47,140,84,.11)}.mob-live-dot.estimate{background:#b99a42;box-shadow:0 0 0 5px rgba(185,154,66,.12)}#mobility-map{height:min(54vh,430px);min-height:330px;background:linear-gradient(135deg,#eef0e5,#e3eadf);position:relative}.mob-map-loading{position:absolute;inset:0;display:grid;place-items:center;padding:28px;text-align:center;color:#637069}.mob-map-note,.mob-map-legend{padding:10px 14px;font-size:.76rem;color:#728078;background:#fafaf6;border-top:1px solid rgba(47,79,61,.09)}.mob-map-legend{display:flex;flex-wrap:wrap;gap:7px;border-top:0;padding-bottom:0}.mob-map-legend span{background:#fff;border:1px solid rgba(47,79,61,.1);border-radius:999px;padding:4px 7px}
.mob-section{margin-top:18px}.mob-section-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:9px}.mob-section-head h2{margin:0;color:var(--forest);font-size:1.12rem}.mob-section-head small{color:#758178}.mob-line-list,.mob-stop-list{display:grid;gap:9px}.mob-line-card,.mob-stop-row{display:flex;align-items:center;gap:12px;padding:12px 13px;background:#fff;border:1px solid rgba(47,79,61,.12);border-radius:16px}.mob-line-card>div,.mob-stop-row>div{display:grid;gap:2px;min-width:0;flex:1}.mob-line-card strong,.mob-stop-row strong{color:#294d3b}.mob-line-card small,.mob-stop-row small{color:#768078}.mob-line-badge{min-width:58px;padding:7px 9px;border-radius:11px;background:var(--forest);color:#fff;font-weight:850;text-align:center;font-size:.85rem}.mob-fav-line,.mob-fav-stop{border:0;background:#f1f4ea;color:var(--forest);width:38px;height:38px;border-radius:12px;font-size:1.35rem}.mob-fav-line.active,.mob-fav-stop.active{background:#e4ecd7}.mob-stop-mark{width:32px;height:32px;border:2px solid var(--forest);border-radius:50%;display:grid;place-items:center;color:var(--forest);font-weight:850;flex:0 0 auto}.mob-bus-marker{width:48px;height:34px!important;border-radius:12px;background:#1f5b41;color:#fff;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.22);display:grid!important;place-items:center;font-weight:900;font-size:.68rem}.mob-bus-marker.estimated{background:#f4e7ad;color:#4d4327;border-style:dashed;border-color:#5f5537}.mob-stop-marker{width:18px;height:18px!important;border-radius:50%;background:#f8fbf4;border:4px solid #2f7957;box-shadow:0 2px 8px rgba(0,0,0,.15)}.mob-source-card{display:grid;gap:9px;padding:15px 16px;margin-top:18px;border-radius:18px;background:#f7f4e9;border:1px solid rgba(47,79,61,.1)}.mob-source-card strong{color:var(--forest)}.mob-source-card p{margin:0;color:#66736b;font-size:.86rem;line-height:1.5}
</style>
<section class="page-heading compact mobility-head"><a class="back-link" href="/">← Start</a><span class="eyebrow">ÖPNV für __MUNICIPALITY__</span><h1>Bus &amp; Mobilität</h1><p>Nächste Abfahrten, Verspätungen und klar gekennzeichnete Positionsschätzungen. Echte GPS-Positionen bleiben separat Stufe 2.</p></section>
<section class="mob-stage" id="mob-stage"><span class="mob-stage-icon">__BUS_ICON__</span><div><strong id="mob-stage-title">Mobilitätsdaten werden geladen …</strong><small id="mob-stage-text">Stufe 1: Fahrplan/Echtzeit-Schätzung · Stufe 2: echte Fahrzeugposition.</small></div></section>
<section class="mob-departures"><div class="mob-dep-head"><div><h2>Nächste Abfahrten</h2><small id="mob-dep-status">Fahrplandaten werden geladen …</small></div><span class="mob-data-badge" id="mob-dep-badge">Stufe 1</span></div><div class="mob-stop-tabs" id="mob-stop-tabs"></div><div class="mob-dep-list" id="mob-dep-list"><div class="mob-dep-empty">Abfahrten werden geladen …</div></div></section>
<section class="mob-map-card"><div class="mob-map-toolbar"><div><strong>Karte __MUNICIPALITY__</strong><small><span class="mob-live-dot" id="mob-live-dot"></span><span id="mob-map-status">Haltestellen werden geladen</span></small></div><button class="secondary-button" id="mob-center" type="button">Auf Ahnsen zentrieren</button></div><div id="mobility-map"><div class="mob-map-loading">Karte wird geladen …</div></div><div class="mob-map-legend"><span>H = Haltestelle</span><span>~2132 = geschätzt</span><span>2132 GPS = echt</span></div><div class="mob-map-note">Das ~ vor einer Linie bedeutet ausdrücklich: aus Fahrplan/Prognose zwischen bekannten Haltestellen geschätzt, nicht GPS. Karte: © OpenStreetMap-Mitwirkende.</div></section>
<section class="mob-section"><div class="mob-section-head"><h2>Linien durch Ahnsen</h2><small>lokale Auswahl</small></div><div class="mob-line-list">__LINES__</div></section>
<section class="mob-section"><div class="mob-section-head"><h2>Haltestellen</h2><small>Favoriten bleiben auf diesem Gerät</small></div><div class="mob-stop-list" id="mob-stop-list"><div class="mob-stop-row"><div><strong>Wird geladen …</strong></div></div></div></section>
<section class="mob-source-card"><strong>Was bedeutet die Anzeige?</strong><p><b>Stufe 1</b> zeigt Abfahrten und darf die ungefähre Position eines gerade fahrenden Busses aus Fahrplan-/Prognosezeiten schätzen; solche Marker tragen immer <b>~</b>. <b>Stufe 2</b> zeigt nur echte Koordinaten aus einer freigegebenen Fahrzeugpositionsschnittstelle.</p></section>
<script>
(() => {
const S={map:null,center:[__CENTER_LAT__,__CENTER_LON__],stops:[],departures:[],estimated:[],vehicles:[],selectedStop:'schule',horizon:480};let layer=null;const favKey='ahnsen-mobility-favorites-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const favs=()=>{try{return JSON.parse(localStorage.getItem(favKey)||'{"lines":[],"stops":[]}')}catch(_){return{lines:[],stops:[]}}};const save=x=>localStorage.setItem(favKey,JSON.stringify(x));
function refreshFavs(){const f=favs();document.querySelectorAll('[data-favorite-line]').forEach(b=>{const a=(f.lines||[]).includes(b.dataset.favoriteLine);b.classList.toggle('active',a);b.textContent=a?'★':'☆'});document.querySelectorAll('[data-favorite-stop]').forEach(b=>{const a=(f.stops||[]).includes(b.dataset.favoriteStop);b.classList.toggle('active',a);b.textContent=a?'★':'☆'})}
function toggle(type,val){const f=favs(),k=type==='line'?'lines':'stops',s=new Set(f[k]||[]);s.has(val)?s.delete(val):s.add(val);f[k]=[...s];save(f);refreshFavs()}document.addEventListener('click',e=>{const l=e.target.closest('[data-favorite-line]');if(l)toggle('line',l.dataset.favoriteLine);const s=e.target.closest('[data-favorite-stop]');if(s)toggle('stop',s.dataset.favoriteStop)});refreshFavs();
const leaflet=()=>new Promise((ok,no)=>{if(window.L)return ok();if(!document.querySelector('link[data-mob-leaflet]')){const x=document.createElement('link');x.rel='stylesheet';x.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';x.dataset.mobLeaflet='1';document.head.appendChild(x)}const old=document.querySelector('script[data-mob-leaflet]');if(old){old.addEventListener('load',ok,{once:true});old.addEventListener('error',no,{once:true});return}const x=document.createElement('script');x.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';x.dataset.mobLeaflet='1';x.onload=ok;x.onerror=no;document.head.appendChild(x)});
async function initMap(){try{await leaflet();const el=document.getElementById('mobility-map');el.innerHTML='';S.map=L.map(el).setView(S.center,14);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(S.map);document.getElementById('mob-center').onclick=()=>S.map.setView(S.center,14)}catch(_){document.getElementById('mobility-map').innerHTML='<div class="mob-map-loading">Karte konnte gerade nicht geladen werden.</div>'}}
function renderStops(){const list=document.getElementById('mob-stop-list');list.innerHTML=S.stops.map(s=>`<article class="mob-stop-row"><span class="mob-stop-mark">H</span><div><strong>${esc(s.name)}</strong><small>Linien ${(s.lines||[]).join(', ')}${Number.isFinite(s.lat)?' · auf Karte':' · Position wird noch aufgelöst'}</small></div><button class="mob-fav-stop" data-favorite-stop="${esc(s.key)}">☆</button></article>`).join('');refreshFavs();if(S.map)S.stops.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon)).forEach(s=>{const i=L.divIcon({className:'',html:'<span class="mob-stop-marker"></span>',iconSize:[18,18],iconAnchor:[9,9]});L.marker([s.lat,s.lon],{icon:i}).addTo(S.map).bindPopup(`<strong>${esc(s.name)}</strong><br>Linien ${(s.lines||[]).join(', ')}`)})}
function tabs(){const el=document.getElementById('mob-stop-tabs');if(!S.stops.some(s=>s.key===S.selectedStop)&&S.stops[0])S.selectedStop=S.stops[0].key;el.innerHTML=S.stops.map(s=>`<button class="mob-stop-tab ${s.key===S.selectedStop?'active':''}" data-stop="${esc(s.key)}">${esc(s.name.replace('Ahnsen, ','').replace('Klinikum Schaumburg','Klinikum'))}</button>`).join('');el.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>{S.selectedStop=b.dataset.stop;tabs();deps()})}
function deps(){const el=document.getElementById('mob-dep-list'),items=S.departures.filter(x=>x.stop_key===S.selectedStop).slice(0,8),hours=Math.round(S.horizon/60);if(!items.length){el.innerHTML=`<div class="mob-dep-empty">Für diese Haltestelle wurde in den nächsten ${hours} Stunden aktuell keine passende Abfahrt der Linien 2132, 2133 oder 2026 geliefert.</div>`;return}el.innerHTML=items.map(x=>{const d=Number.isFinite(x.delay_minutes)?x.delay_minutes:null,chip=d===null?'':`<span class="mob-delay ${d>1?'late':''}">${d>0?'+'+d:d} Min.</span>`;return `<article class="mob-dep-row"><span class="mob-line-badge">${esc(x.line)}</span><div class="mob-dep-main"><strong>${esc(x.direction||'Richtung laut Fahrplan')}</strong><small>${x.realtime?'Prognose · Plan '+esc(x.planned_time):'Fahrplan'}${x.cancelled?' · fällt aus':''}</small></div><div class="mob-dep-time"><strong>${esc(x.time)}</strong><small>${x.minutes<=0?'jetzt':'in '+x.minutes+' Min.'}</small>${chip}</div></article>`}).join('')}
function vehicles(){if(!S.map)return;if(layer)layer.remove();layer=L.layerGroup().addTo(S.map);S.estimated.forEach(v=>{if(!Number.isFinite(v.lat)||!Number.isFinite(v.lon))return;const i=L.divIcon({className:'',html:`<span class="mob-bus-marker estimated">~${esc(v.line)}</span>`,iconSize:[48,34],iconAnchor:[24,17]}),between=(v.between||[]).filter(Boolean).join(' → ');L.marker([v.lat,v.lon],{icon:i}).addTo(layer).bindPopup(`<strong>~ Linie ${esc(v.line)}</strong><br>geschätzte Position${between?'<br>'+esc(between):''}`)});S.vehicles.forEach(v=>{if(!Number.isFinite(v.lat)||!Number.isFinite(v.lon))return;const i=L.divIcon({className:'',html:`<span class="mob-bus-marker">${esc(v.line)} GPS</span>`,iconSize:[48,34],iconAnchor:[24,17]});L.marker([v.lat,v.lon],{icon:i}).addTo(layer).bindPopup(`<strong>Linie ${esc(v.line)}</strong><br>echte Fahrzeugposition`)})}
function status(a,b){const c=document.getElementById('mob-stage'),t=document.getElementById('mob-stage-title'),p=document.getElementById('mob-stage-text'),dot=document.getElementById('mob-live-dot'),m=document.getElementById('mob-map-status');c.classList.remove('live','estimate','error');dot.classList.remove('on','estimate');S.horizon=Number(a.horizon_minutes||480);document.getElementById('mob-dep-status').textContent=a.message||'Abfahrtsstatus unbekannt';document.getElementById('mob-dep-badge').textContent=a.status==='ok'?'Stufe 1 aktiv':'Stufe 1';if(b.configured&&(b.status==='ok'||b.status==='ok-empty')){c.classList.add('live');dot.classList.add('on');t.textContent='Stufe 2 · echte Fahrzeugpositionen aktiv';p.textContent=b.message;m.textContent=S.vehicles.length?'echte Positionen aktiv':'GPS-Schnittstelle aktiv'}else if(S.estimated.length){c.classList.add('estimate');dot.classList.add('estimate');t.textContent='Stufe 1 · Positionsschätzung aktiv';p.textContent='Buspositionen mit ~ sind berechnet, nicht per GPS gemessen. '+(a.message||'');m.textContent='~ geschätzte Buspositionen'}else if(a.status==='ok'){c.classList.add('estimate');t.textContent='Stufe 1 · nächste Abfahrten aktiv';p.textContent='Abfahrtszeiten sind vorhanden. Ein Bus erscheint erst als ~ auf der Karte, wenn er laut Zeitdaten gerade zwischen zwei Haltestellen unterwegs ist.';m.textContent='Haltestellenkarte · aktuell kein Bus zwischen zwei Stopps'}else if(a.status==='empty'){c.classList.add('estimate');t.textContent='Stufe 1 · derzeit keine Fahrt im Suchzeitraum';p.textContent=a.message;m.textContent='Haltestellenkarte · keine Fahrt im Suchzeitraum'}else{c.classList.add('error');t.textContent='Stufe 1 · Datenquelle derzeit nicht verfügbar';p.textContent=a.message||'Aktuelle Abfahrtsdaten sind gerade nicht verfügbar.';m.textContent='Haltestellenkarte'}}
async function load(first){try{const r=await fetch('/api/mobilitaet',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();S.stops=d.stops||[];S.departures=d.departures||[];S.estimated=d.estimated_vehicles||[];S.vehicles=d.vehicles||[];if(first){renderStops();tabs()}status(d.stage1||{},d.live_positions||{});deps();vehicles()}catch(_){document.getElementById('mob-stage').classList.add('error');document.getElementById('mob-stage-title').textContent='Mobilitätsdaten derzeit nicht erreichbar'}}
(async()=>{await initMap();await load(true);setInterval(()=>load(false),30000)})();
})();
</script>
'''


def _mobility_content() -> str:
    cfg = get_platform_snapshot()
    center_lat, center_lon = _platform_center()
    municipality = escape(cfg.get("municipality_name") or "Ahnsen")
    lines_html = "".join(
        f'''<article class="mob-line-card"><span class="mob-line-badge">{escape(line)}</span><div><strong>{escape(data["title"])}</strong><small>{escape(data["note"])}</small></div><button class="mob-fav-line" type="button" data-favorite-line="{escape(line)}">☆</button></article>'''
        for line, data in KNOWN_LINES.items()
    )
    return (
        _MOBILITY_TEMPLATE
        .replace("__MUNICIPALITY__", municipality)
        .replace("__BUS_ICON__", _bus_icon())
        .replace("__LINES__", lines_html)
        .replace("__CENTER_LAT__", f"{center_lat:.6f}")
        .replace("__CENTER_LON__", f"{center_lon:.6f}")
    )


@router.get("/mobilitaet")
async def mobility_page():
    return page(
        "Bus & Mobilität",
        _mobility_content(),
        active="home",
        description="Abfahrten, Verspätungen, geschätzte und – sofern freigegeben – echte Fahrzeugpositionen für Ahnsen.",
        body_class="mobility-view",
    )


async def _home_with_mobility():
    from pwa_core import _public_data

    response = home_page(_public_data())
    html = response.body.decode("utf-8")
    if 'href="/mobilitaet"' in html:
        return response
    card = (
        '<a class="service-card" href="/mobilitaet"><span class="service-icon">'
        + _bus_icon()
        + '</span><div><h3>Bus &amp; Mobilität</h3><p>Abfahrten, Verspätungen und Buspositionen.</p></div>'
        '<span class="card-arrow"><span class="glyph" aria-hidden="true">›</span></span></a>'
    )
    marker = '<section class="service-grid" aria-label="Digitale Dienste">'
    start = html.find(marker)
    if start >= 0:
        end = html.find("</section>", start)
        if end >= 0:
            html = html[:end] + card + html[end:]
    return HTMLResponse(html)


def install_mobility(app) -> None:
    if getattr(app.state, "mobility_installed", False):
        return
    app.state.mobility_installed = True
    app.include_router(router)
    app.router.routes.insert(0, APIRoute("/", _home_with_mobility, methods=["GET"], name="pwa_home_mobility"))
