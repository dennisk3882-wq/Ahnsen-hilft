from __future__ import annotations

import json
import math
import os
import threading
import time
import unicodedata
from datetime import datetime, timezone
from html import escape
from typing import Any
from xml.etree import ElementTree

import requests
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.routing import APIRoute

from platform_runtime import get_platform_snapshot
from pwa_ui import home_page, page


router = APIRouter()

KNOWN_LINES = {
    "2132": {"title": "Bückeburg ↔ Bad Eilsen", "note": "über Ahnsen und Klinikum Schaumburg"},
    "2133": {"title": "Stadtverkehr Bückeburg", "note": "über Ahnsen, Klinikum und Bad Eilsen"},
    "2026": {"title": "Bückeburg ↔ Obernkirchen / Ahnsen", "note": "werktags mit Fahrten bis Ahnsen"},
}

BASE_STOPS = [
    {"key": "schule", "name": "Ahnsen, Schule", "lines": ["2132", "2133"]},
    {"key": "theodor-heuss", "name": "Ahnsen, Theodor-Heuss-Straße", "lines": ["2132", "2133", "2026"]},
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


def _bus_icon() -> str:
    return """<span class="glyph" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M7 8h10M8 18v2m8-2v2M8 14h.01M16 14h.01M9 5h6"/></svg></span>"""


def _norm(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(text.casefold().replace("-", " ").replace(",", " ").split())


def _platform_center() -> tuple[float, float]:
    cfg = get_platform_snapshot()
    lat = cfg.get("map_lat") or 52.258
    lon = cfg.get("map_lon") or 9.099
    try:
        return float(lat), float(lon)
    except (TypeError, ValueError):
        return 52.258, 9.099


def _stop_match(name: str) -> str | None:
    value = _norm(name)
    if not value:
        return None
    if "theodor heuss" in value:
        return "theodor-heuss"
    if "wilhelmshohe" in value:
        return "wilhelmshoehe"
    if "schmiede" in value:
        return "schmiede"
    if "klinikum" in value:
        return "klinikum"
    if "schule" in value and ("ahnsen" in value or len(value.split()) <= 3):
        return "schule"
    return None


def _get_osm_stops() -> list[dict[str, Any]]:
    """Resolve stop coordinates only from public OpenStreetMap objects."""
    now = time.monotonic()
    if _OSM_CACHE["expires"] > now:
        return list(_OSM_CACHE["stops"])

    with _OSM_LOCK:
        now = time.monotonic()
        if _OSM_CACHE["expires"] > now:
            return list(_OSM_CACHE["stops"])

        center_lat, center_lon = _platform_center()
        query = f"""
[out:json][timeout:8];
(
  node["highway"="bus_stop"](around:5000,{center_lat:.6f},{center_lon:.6f});
  node["public_transport"="platform"](around:5000,{center_lat:.6f},{center_lon:.6f});
);
out body;
""".strip()
        resolved: dict[str, dict[str, Any]] = {}
        try:
            response = requests.post(
                os.getenv("MOBILITY_OVERPASS_URL", "https://overpass-api.de/api/interpreter"),
                data={"data": query},
                headers={
                    "User-Agent": f"{get_platform_snapshot().get('platform_slug', 'citizen-platform')}/1.0 mobility",
                    "Accept": "application/json",
                },
                timeout=10,
            )
            response.raise_for_status()
            payload = response.json()
            for element in payload.get("elements", []):
                tags = element.get("tags") or {}
                name = str(tags.get("name") or tags.get("local_ref") or "").strip()
                key = _stop_match(name)
                if not key or key in resolved:
                    continue
                try:
                    lat = float(element["lat"])
                    lon = float(element["lon"])
                except (KeyError, TypeError, ValueError):
                    continue
                resolved[key] = {
                    "lat": lat,
                    "lon": lon,
                    "osm_name": name,
                    "ref": str(tags.get("ref") or ""),
                    "ifopt": str(tags.get("ref:IFOPT") or tags.get("ref:ifopt") or ""),
                }
        except Exception:
            resolved = {}

        stops = []
        for base in BASE_STOPS:
            item = dict(base)
            item.update(resolved.get(base["key"], {}))
            stops.append(item)

        _OSM_CACHE["stops"] = stops
        _OSM_CACHE["expires"] = time.monotonic() + 6 * 60 * 60
        return list(stops)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def _route_map() -> dict[str, str]:
    raw = os.getenv("MOBILITY_ROUTE_MAP_JSON", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return {str(key): str(value) for key, value in data.items()} if isinstance(data, dict) else {}
    except ValueError:
        return {}


def _vehicle_headers() -> dict[str, str]:
    headers = {"Accept": "application/json, application/xml, text/xml;q=0.9, */*;q=0.8"}
    bearer = os.getenv("MOBILITY_VEHICLE_BEARER_TOKEN", "").strip()
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    api_key = os.getenv("MOBILITY_VEHICLE_API_KEY", "").strip()
    if api_key:
        headers[os.getenv("MOBILITY_VEHICLE_API_KEY_HEADER", "X-API-Key").strip() or "X-API-Key"] = api_key
    return headers


def _dict_pick(data: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in data:
            return data[name]
    folded = {str(key).casefold(): value for key, value in data.items()}
    for name in names:
        if name.casefold() in folded:
            return folded[name.casefold()]
    return None


def _parse_gtfsrt_json(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    entities = _dict_pick(payload, "Entity", "entity") or []
    route_map = _route_map()
    center_lat, center_lon = _platform_center()
    result = []

    for entity in entities:
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
        if line not in KNOWN_LINES and route_ref not in KNOWN_LINES:
            continue
        if line not in KNOWN_LINES and route_ref in KNOWN_LINES:
            line = route_ref

        try:
            lat = float(_dict_pick(position, "Latitude", "latitude", "lat"))
            lon = float(_dict_pick(position, "Longitude", "longitude", "lon"))
        except (TypeError, ValueError):
            continue
        if _haversine_km(center_lat, center_lon, lat, lon) > 35:
            continue

        timestamp = _dict_pick(vehicle, "Timestamp", "timestamp")
        result.append(
            {
                "id": str(_dict_pick(descriptor, "Id", "id", "Label", "label") or _dict_pick(entity, "Id", "id") or ""),
                "line": line,
                "route_ref": route_ref,
                "trip_id": str(_dict_pick(trip, "TripId", "tripId", "trip_id") or ""),
                "lat": lat,
                "lon": lon,
                "bearing": _dict_pick(position, "Bearing", "bearing"),
                "speed": _dict_pick(position, "Speed", "speed"),
                "timestamp": timestamp,
                "direction": str(_dict_pick(trip, "DirectionId", "directionId", "direction_id") or ""),
            }
        )
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
    center_lat, center_lon = _platform_center()
    route_map = _route_map()
    result = []
    for activity in root.iter():
        if _xml_local(activity.tag).casefold() != "vehicleactivity":
            continue
        line_ref = _first_xml_text(activity, {"LineRef", "PublishedLineName"})
        line = route_map.get(line_ref, line_ref)
        if line not in KNOWN_LINES:
            continue
        lat_text = _first_xml_text(activity, {"Latitude"})
        lon_text = _first_xml_text(activity, {"Longitude"})
        try:
            lat, lon = float(lat_text), float(lon_text)
        except (TypeError, ValueError):
            continue
        if _haversine_km(center_lat, center_lon, lat, lon) > 35:
            continue
        result.append(
            {
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
            }
        )
    return result


def _fetch_vehicles() -> tuple[list[dict[str, Any]], str, str, str | None]:
    endpoint = os.getenv("MOBILITY_VEHICLE_POSITIONS_URL", "").strip()
    if not endpoint:
        return [], "not-configured", "Offizielle Fahrzeugpositions-Schnittstelle noch nicht hinterlegt.", None

    fmt = os.getenv("MOBILITY_VEHICLE_FORMAT", "auto").strip().casefold()
    try:
        response = requests.get(endpoint, headers=_vehicle_headers(), timeout=7)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").casefold()
        if fmt in {"siri", "siri-vm", "xml"} or ("xml" in content_type and fmt == "auto"):
            vehicles = _parse_siri_vm(response.content)
        else:
            vehicles = _parse_gtfsrt_json(response.json())
        updated_at = datetime.now(timezone.utc).isoformat()
        if vehicles:
            return vehicles, "ok", f"{len(vehicles)} Fahrzeugposition(en) im Raum Ahnsen empfangen.", updated_at
        return [], "ok-empty", "Schnittstelle erreichbar, aktuell aber kein passendes Fahrzeug im Raum Ahnsen.", updated_at
    except Exception as error:
        return [], "error", f"Fahrzeugpositions-Schnittstelle derzeit nicht erreichbar ({type(error).__name__}).", None


def _vehicle_snapshot() -> dict[str, Any]:
    now = time.monotonic()
    if _VEHICLE_CACHE["expires"] > now:
        return dict(_VEHICLE_CACHE)
    with _VEHICLE_LOCK:
        now = time.monotonic()
        if _VEHICLE_CACHE["expires"] > now:
            return dict(_VEHICLE_CACHE)
        vehicles, status, message, updated_at = _fetch_vehicles()
        _VEHICLE_CACHE.update(
            {
                "expires": time.monotonic() + 20,
                "vehicles": vehicles,
                "status": status,
                "message": message,
                "updated_at": updated_at,
            }
        )
        return dict(_VEHICLE_CACHE)


def _mobility_payload() -> dict[str, Any]:
    lat, lon = _platform_center()
    vehicle = _vehicle_snapshot()
    endpoint_configured = bool(os.getenv("MOBILITY_VEHICLE_POSITIONS_URL", "").strip())
    return {
        "center": {"lat": lat, "lon": lon, "zoom": int(get_platform_snapshot().get("map_zoom") or 15)},
        "stops": _get_osm_stops(),
        "lines": [{"line": key, **value} for key, value in KNOWN_LINES.items()],
        "vehicles": vehicle["vehicles"],
        "live_positions": {
            "configured": endpoint_configured,
            "status": vehicle["status"],
            "message": vehicle["message"],
            "updated_at": vehicle["updated_at"],
            "provider": os.getenv("MOBILITY_VEHICLE_PROVIDER", "SHG Mobil / freigegebene Schnittstelle").strip(),
            "format": os.getenv("MOBILITY_VEHICLE_FORMAT", "auto").strip(),
        },
        "trip_updates": {
            "provider": "VBN / Connect GTFS-Realtime",
            "status": "public-trip-updates",
            "refresh_seconds": 60,
            "note": "Öffentlich dokumentiert sind Prognosen/Verspätungen (TripUpdates); direkte GPS-Fahrzeugpositionen werden daraus nicht behauptet.",
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/api/mobilitaet")
async def mobility_api():
    return JSONResponse(_mobility_payload(), headers={"Cache-Control": "no-store"})


def _mobility_content() -> str:
    cfg = get_platform_snapshot()
    center_lat, center_lon = _platform_center()
    municipality = escape(cfg.get("municipality_name") or "Ahnsen")
    bus_icon = _bus_icon()
    lines_html = "".join(
        f"""<article class="mob-line-card" data-line="{escape(line)}">
          <span class="mob-line-badge">{escape(line)}</span>
          <div><strong>{escape(data['title'])}</strong><small>{escape(data['note'])}</small></div>
          <button class="mob-fav-line" type="button" data-favorite-line="{escape(line)}" aria-label="Linie {escape(line)} als Favorit speichern">☆</button>
        </article>"""
        for line, data in KNOWN_LINES.items()
    )
    return f"""
<style>
.mobility-view .app-main{{padding-bottom:110px}}
.mobility-head{{display:grid;gap:10px;margin:0 0 16px}}.mobility-head h1{{margin:0;font-size:clamp(1.75rem,6vw,2.35rem);color:var(--forest)}}.mobility-head p{{margin:0;color:#536258;line-height:1.55}}
.mob-stage{{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border:1px solid rgba(31,91,65,.16);border-radius:18px;background:#f4f6ec;box-shadow:0 7px 24px rgba(43,72,57,.06)}}.mob-stage-icon{{width:42px;height:42px;border-radius:14px;background:var(--forest);color:white;display:grid;place-items:center;flex:0 0 auto}}.mob-stage div{{display:grid;gap:2px}}.mob-stage strong{{color:var(--forest)}}.mob-stage small{{color:#69756e;line-height:1.35}}.mob-stage.live{{background:#edf7ef;border-color:rgba(31,112,65,.25)}}.mob-stage.error{{background:#fff3eb;border-color:#e5b394}}
.mob-map-card{{overflow:hidden;border-radius:22px;background:#fff;border:1px solid rgba(47,79,61,.12);box-shadow:0 12px 34px rgba(45,70,56,.08);margin:16px 0}}.mob-map-toolbar{{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px}}.mob-map-toolbar div{{display:grid;gap:2px}}.mob-map-toolbar strong{{color:var(--forest)}}.mob-map-toolbar small{{color:#768179}}.mob-live-dot{{display:inline-block;width:9px;height:9px;border-radius:50%;background:#9ca8a0;margin-right:6px}}.mob-live-dot.on{{background:#2f8c54;box-shadow:0 0 0 5px rgba(47,140,84,.11)}}#mobility-map{{height:min(54vh,430px);min-height:330px;background:linear-gradient(135deg,#eef0e5,#e3eadf);position:relative}}.mob-map-loading{{position:absolute;inset:0;display:grid;place-items:center;padding:28px;text-align:center;color:#637069}}.mob-map-note{{padding:10px 14px;font-size:.78rem;color:#728078;background:#fafaf6;border-top:1px solid rgba(47,79,61,.09)}}
.mob-section{{margin-top:18px}}.mob-section-head{{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:9px}}.mob-section-head h2{{margin:0;color:var(--forest);font-size:1.12rem}}.mob-section-head small{{color:#758178}}.mob-line-list,.mob-stop-list{{display:grid;gap:9px}}.mob-line-card,.mob-stop-row{{display:flex;align-items:center;gap:12px;padding:12px 13px;background:white;border:1px solid rgba(47,79,61,.12);border-radius:16px}}.mob-line-card>div,.mob-stop-row>div{{display:grid;gap:2px;min-width:0;flex:1}}.mob-line-card strong,.mob-stop-row strong{{color:#294d3b}}.mob-line-card small,.mob-stop-row small{{color:#768078;line-height:1.25}}.mob-line-badge{{min-width:58px;padding:7px 9px;border-radius:11px;background:var(--forest);color:white;font-weight:850;text-align:center;font-size:.85rem}}.mob-fav-line,.mob-fav-stop{{border:0;background:#f1f4ea;color:var(--forest);width:38px;height:38px;border-radius:12px;font-size:1.35rem;cursor:pointer}}.mob-fav-line.active,.mob-fav-stop.active{{background:#e4ecd7}}.mob-stop-mark{{width:32px;height:32px;border:2px solid var(--forest);border-radius:50%;display:grid;place-items:center;color:var(--forest);font-weight:850;flex:0 0 auto}}
.mob-source-card{{display:grid;gap:9px;padding:15px 16px;margin-top:18px;border-radius:18px;background:#f7f4e9;border:1px solid rgba(47,79,61,.1)}}.mob-source-card strong{{color:var(--forest)}}.mob-source-card p{{margin:0;color:#66736b;font-size:.86rem;line-height:1.5}}.mob-source-tags{{display:flex;flex-wrap:wrap;gap:7px}}.mob-source-tags span{{font-size:.74rem;padding:5px 8px;border-radius:999px;background:#fff;border:1px solid rgba(47,79,61,.12);color:#53665a}}.mob-bus-marker{{width:44px;height:34px!important;border-radius:12px;background:#1f5b41;color:white;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.22);display:grid!important;place-items:center;font-weight:900;font-size:.7rem}}.mob-stop-marker{{width:18px;height:18px!important;border-radius:50%;background:#f8fbf4;border:4px solid #2f7957;box-shadow:0 2px 8px rgba(0,0,0,.15)}}
@media(max-width:520px){{.mob-map-toolbar{{align-items:flex-start}}#mobility-map{{min-height:300px}}}}
</style>
<section class="page-heading compact mobility-head"><a class="back-link" href="/">← Start</a><span class="eyebrow">ÖPNV für {municipality}</span><h1>Bus &amp; Mobilität</h1><p>Haltestellen und Linien im Blick – mit einer vorbereiteten Stufe 2 für freigegebene echte Fahrzeugpositionen.</p></section>
<section class="mob-stage" id="mob-stage"><span class="mob-stage-icon">{bus_icon}</span><div><strong id="mob-stage-title">Stufe 2 wird geprüft …</strong><small id="mob-stage-text">Status der offiziellen Fahrzeugpositions-Schnittstelle wird geladen.</small></div></section>
<section class="mob-map-card"><div class="mob-map-toolbar"><div><strong>Karte {municipality}</strong><small><span class="mob-live-dot" id="mob-live-dot"></span><span id="mob-map-status">Haltestellen werden geladen</span></small></div><button class="secondary-button" id="mob-center" type="button">Auf Ahnsen zentrieren</button></div><div id="mobility-map" data-lat="{center_lat:.6f}" data-lon="{center_lon:.6f}"><div class="mob-map-loading">Karte wird geladen …</div></div><div class="mob-map-note">Karte: © OpenStreetMap-Mitwirkende. Bus-Symbole werden nur dann als „live“ gezeigt, wenn eine freigegebene Fahrzeugpositions-Schnittstelle Daten liefert.</div></section>
<section class="mob-section"><div class="mob-section-head"><h2>Linien durch Ahnsen</h2><small>Stand Fahrplan 2026</small></div><div class="mob-line-list">{lines_html}</div></section>
<section class="mob-section"><div class="mob-section-head"><h2>Haltestellen</h2><small>Favoriten bleiben auf diesem Gerät</small></div><div class="mob-stop-list" id="mob-stop-list"><div class="mob-stop-row"><div><strong>Wird geladen …</strong><small>Haltestellen aus öffentlichen Kartendaten</small></div></div></div></section>
<section class="mob-source-card"><strong>Daten sauber getrennt</strong><div class="mob-source-tags"><span>VBN GTFS / GTFS-RT</span><span>OpenStreetMap</span><span>SHG Mobil Linien</span><span>Stufe-2-Adapter</span></div><p>VBN-Prognosen und Verspätungen sind keine GPS-Fahrzeugpositionen. Deshalb zeigt Ahnsen hilft keine erfundenen „Live-Busse“. Exakte Busmarker werden erst aktiviert, wenn ein freigegebener VehiclePositions-, SIRI-VM-, VDV- oder vergleichbarer Feed hinterlegt ist.</p></section>
<script>
(() => {{
  const state={{map:null,center:[{center_lat:.6f},{center_lon:.6f}],stops:[],vehicles:[]}};
  const favKey='ahnsen-mobility-favorites-v1';
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[ch]));
  const getFavs=()=>{{try{{return JSON.parse(localStorage.getItem(favKey)||'{{"lines":[],"stops":[]}}')}}catch(_){{return{{lines:[],stops:[]}}}}}};
  const saveFavs=data=>localStorage.setItem(favKey,JSON.stringify(data));
  const refreshFavoriteButtons=()=>{{const favs=getFavs();document.querySelectorAll('[data-favorite-line]').forEach(btn=>{{const active=(favs.lines||[]).includes(btn.dataset.favoriteLine);btn.classList.toggle('active',active);btn.textContent=active?'★':'☆'}});document.querySelectorAll('[data-favorite-stop]').forEach(btn=>{{const active=(favs.stops||[]).includes(btn.dataset.favoriteStop);btn.classList.toggle('active',active);btn.textContent=active?'★':'☆'}})}};
  const toggleFavorite=(type,value)=>{{const favs=getFavs(),key=type==='line'?'lines':'stops',set=new Set(favs[key]||[]);set.has(value)?set.delete(value):set.add(value);favs[key]=Array.from(set);saveFavs(favs);refreshFavoriteButtons()}};
  document.addEventListener('click',event=>{{const lineButton=event.target.closest('[data-favorite-line]');if(lineButton)toggleFavorite('line',lineButton.dataset.favoriteLine);const stopButton=event.target.closest('[data-favorite-stop]');if(stopButton)toggleFavorite('stop',stopButton.dataset.favoriteStop)}});refreshFavoriteButtons();
  const ensureLeaflet=()=>new Promise((resolve,reject)=>{{if(window.L)return resolve();if(!document.querySelector('link[data-mob-leaflet]')){{const link=document.createElement('link');link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';link.dataset.mobLeaflet='1';document.head.appendChild(link)}}const existing=document.querySelector('script[data-mob-leaflet]');if(existing){{existing.addEventListener('load',resolve,{{once:true}});existing.addEventListener('error',reject,{{once:true}});return}}const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.defer=true;script.dataset.mobLeaflet='1';script.onload=resolve;script.onerror=reject;document.head.appendChild(script)}});
  const initMap=async()=>{{try{{await ensureLeaflet();const el=document.getElementById('mobility-map');el.innerHTML='';state.map=L.map(el,{{zoomControl:true}}).setView(state.center,14);L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png',{{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}}).addTo(state.map);document.getElementById('mob-center').addEventListener('click',()=>state.map.setView(state.center,14))}}catch(_){{document.getElementById('mobility-map').innerHTML='<div class="mob-map-loading">Die interaktive Karte konnte gerade nicht geladen werden. Haltestellen und Linien bleiben unten verfügbar.</div>'}}}};
  const renderStops=stops=>{{const list=document.getElementById('mob-stop-list');list.innerHTML=stops.map(stop=>`<article class="mob-stop-row"><span class="mob-stop-mark">H</span><div><strong>${{escapeHtml(stop.name)}}</strong><small>Linien ${{(stop.lines||[]).join(', ')}}${{stop.lat?' · auf Karte':''}}</small></div><button class="mob-fav-stop" type="button" data-favorite-stop="${{escapeHtml(stop.key)}}" aria-label="${{escapeHtml(stop.name)}} als Favorit speichern">☆</button></article>`).join('');refreshFavoriteButtons();if(!state.map)return;stops.filter(stop=>Number.isFinite(stop.lat)&&Number.isFinite(stop.lon)).forEach(stop=>{{const icon=L.divIcon({{className:'',html:'<span class="mob-stop-marker"></span>',iconSize:[18,18],iconAnchor:[9,9]}});L.marker([stop.lat,stop.lon],{{icon}}).addTo(state.map).bindPopup(`<strong>${{escapeHtml(stop.name)}}</strong><br>Linien ${{(stop.lines||[]).join(', ')}}`)}})}};
  let vehicleLayer=null;
  const renderVehicles=vehicles=>{{if(!state.map)return;if(vehicleLayer)vehicleLayer.remove();vehicleLayer=L.layerGroup().addTo(state.map);vehicles.forEach(vehicle=>{{if(!Number.isFinite(vehicle.lat)||!Number.isFinite(vehicle.lon))return;const icon=L.divIcon({{className:'',html:`<span class="mob-bus-marker">${{escapeHtml(vehicle.line||'Bus')}}</span>`,iconSize:[44,34],iconAnchor:[22,17]}});const popup=`<strong>Linie ${{escapeHtml(vehicle.line||'—')}}</strong><br>Live-Position aus freigegebener Schnittstelle${{vehicle.direction?'<br>Richtung: '+escapeHtml(vehicle.direction):''}}`;L.marker([vehicle.lat,vehicle.lon],{{icon}}).addTo(vehicleLayer).bindPopup(popup)}})}};
  const applyStatus=live=>{{const card=document.getElementById('mob-stage'),title=document.getElementById('mob-stage-title'),text=document.getElementById('mob-stage-text'),dot=document.getElementById('mob-live-dot'),mapStatus=document.getElementById('mob-map-status');card.classList.remove('live','error');dot.classList.remove('on');if(live.configured&&(live.status==='ok'||live.status==='ok-empty')){{card.classList.add('live');dot.classList.add('on');title.textContent='Stufe 2 · offizielle Live-Schnittstelle aktiv';text.textContent=live.message;mapStatus.textContent='Live-Fahrzeugdaten aktiv'}}else if(live.status==='error'){{card.classList.add('error');title.textContent='Stufe 2 · Schnittstelle vorübergehend nicht erreichbar';text.textContent=live.message;mapStatus.textContent='Live-Daten derzeit nicht verfügbar'}}else{{title.textContent='Stufe 2 vorbereitet · Freigabe der Fahrzeugdaten fehlt noch';text.textContent='Haltestellen und Linien funktionieren. Echte Buspositionen schalten sich nach Hinterlegung einer offiziellen Schnittstelle automatisch zu.';mapStatus.textContent='Haltestellenkarte · keine erfundenen Live-Positionen'}}}};
  const loadData=async first=>{{try{{const response=await fetch('/api/mobilitaet',{{cache:'no-store',credentials:'same-origin'}});if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json();state.stops=data.stops||[];state.vehicles=data.vehicles||[];applyStatus(data.live_positions||{{}});if(first)renderStops(state.stops);renderVehicles(state.vehicles)}}catch(_){{document.getElementById('mob-stage').classList.add('error');document.getElementById('mob-stage-title').textContent='Mobilitätsdaten derzeit nicht erreichbar';document.getElementById('mob-stage-text').textContent='Bitte später erneut versuchen.'}}}};
  (async()=>{{await initMap();await loadData(true);setInterval(()=>loadData(false),20000)}})();
}})();
</script>
"""


@router.get("/mobilitaet")
async def mobility_page():
    return page(
        "Bus & Mobilität",
        _mobility_content(),
        active="home",
        description="Buslinien, Haltestellen und vorbereitete Live-Fahrzeugpositionen für Ahnsen.",
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
        + '</span><div><h3>Bus &amp; Mobilität</h3><p>Haltestellen, Linien und Live-Status.</p></div>'
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
    """Install mobility routes and the home-card compatibility override once."""
    if getattr(app.state, "mobility_installed", False):
        return
    app.state.mobility_installed = True
    app.include_router(router)
    app.router.routes.insert(0, APIRoute("/", _home_with_mobility, methods=["GET"], name="pwa_home_mobility"))
