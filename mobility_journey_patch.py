from __future__ import annotations

import re
import time
from datetime import datetime
from typing import Any

import requests
from fastapi import Query
from fastapi.responses import JSONResponse

import mobility_citizen as legacy
import mobility_efa_patch as data_patch
from mobility_routes import BASE_STOPS, _get_osm_stops, _platform_center


router = legacy.router
_TRANSITOUS_BASE = data_patch.TRANSITOUS_BASE
_HEADERS = data_patch._headers
_original_content = data_patch.content
_original_normalize_transitous = data_patch._normalize_transitous

_DESTINATION_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_ROUTE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_TRIP_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
POPULAR_DESTINATIONS = (
    "Bückeburg Bahnhof",
    "Bückeburg ZOB",
    "Bad Eilsen",
    "Obernkirchen",
    "Klinikum Schaumburg",
)


def _clean_text(value: object) -> str:
    text = str(value or "").replace("\nü.", " · über ").replace(" ü. ", " · über ")
    return re.sub(r"\s+", " ", text).strip()


def _normalize_transitous_with_trip(raw: dict[str, Any], stop: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    item = _original_normalize_transitous(raw, stop, now)
    if not item:
        return None
    item["trip_id"] = str(raw.get("tripId") or "").strip()
    item["direction"] = _clean_text(item.get("direction"))
    trip_to = raw.get("tripTo") or {}
    if isinstance(trip_to, dict):
        item["final_stop"] = _clean_text(trip_to.get("name"))
    return item


data_patch._normalize_transitous = _normalize_transitous_with_trip


def _stop_by_key(key: str) -> dict[str, Any] | None:
    return next((dict(stop) for stop in BASE_STOPS if stop.get("key") == key), None)


def _place_name(place: Any) -> str:
    if not isinstance(place, dict):
        return ""
    return _clean_text(place.get("name") or place.get("stopName") or place.get("id"))


def _place_time(place: Any, *, departure: bool) -> str:
    if not isinstance(place, dict):
        return ""
    keys = (
        ("departure", "scheduledDeparture", "arrival", "scheduledArrival")
        if departure
        else ("arrival", "scheduledArrival", "departure", "scheduledDeparture")
    )
    for key in keys:
        parsed = data_patch._parse_iso(place.get(key))
        if parsed:
            return parsed.strftime("%H:%M")
    return ""


def _geocode(text: str, limit: int = 10) -> list[dict[str, Any]]:
    query = _clean_text(text)
    if len(query) < 2:
        return []
    cache_key = query.casefold()
    cached = _DESTINATION_CACHE.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return [dict(item) for item in cached[1]]

    center_lat, center_lon = _platform_center()
    try:
        response = requests.get(
            f"{_TRANSITOUS_BASE}/api/v1/geocode",
            params={
                "text": query,
                "language": "de",
                "type": "STOP",
                "place": f"{center_lat:.6f},{center_lon:.6f}",
                "placeBias": 10,
            },
            headers=_HEADERS("Transitous journey geocode"),
            timeout=8,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return []

    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    if isinstance(payload, list):
        for raw in payload:
            if not isinstance(raw, dict) or str(raw.get("type") or "").upper() != "STOP":
                continue
            stop_id = str(raw.get("id") or "").strip()
            name = _clean_text(raw.get("name"))
            if not stop_id or not name or stop_id in seen:
                continue
            modes = {str(mode).upper() for mode in (raw.get("modes") or [])}
            if modes and not modes.intersection({"BUS", "COACH", "FLEX", "RAIL", "SUBURBAN", "REGIONAL_RAIL", "REGIONAL_FAST_RAIL"}):
                continue
            seen.add(stop_id)
            rows.append({
                "id": stop_id,
                "name": name,
                "lat": raw.get("lat"),
                "lon": raw.get("lon"),
                "modes": sorted(modes),
            })
            if len(rows) >= limit:
                break
    _DESTINATION_CACHE[cache_key] = (time.monotonic() + 15 * 60, rows)
    return [dict(item) for item in rows]


def _popular_destinations() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for query in POPULAR_DESTINATIONS:
        for item in _geocode(query, 4):
            if item["id"] in seen:
                continue
            seen.add(item["id"])
            rows.append(item)
            break
    return rows


def _format_leg(raw: dict[str, Any]) -> dict[str, Any]:
    mode = str(raw.get("mode") or "").upper()
    start = data_patch._parse_iso(raw.get("startTime"))
    end = data_patch._parse_iso(raw.get("endTime"))
    scheduled_start = data_patch._parse_iso(raw.get("scheduledStartTime")) or start
    scheduled_end = data_patch._parse_iso(raw.get("scheduledEndTime")) or end
    line = _clean_text(raw.get("routeShortName") or raw.get("displayName") or raw.get("tripShortName"))
    trip_to = raw.get("tripTo") or {}
    direction = _clean_text(raw.get("headsign") or (trip_to.get("name") if isinstance(trip_to, dict) else ""))
    stops = []
    places = [raw.get("from"), *(raw.get("intermediateStops") or []), raw.get("to")]
    for place in places:
        if not isinstance(place, dict):
            continue
        name = _place_name(place)
        if not name:
            continue
        row = {
            "name": name,
            "arrival": _place_time(place, departure=False),
            "departure": _place_time(place, departure=True),
        }
        if not stops or stops[-1]["name"] != name:
            stops.append(row)
    return {
        "mode": mode,
        "line": line,
        "direction": direction,
        "from": _place_name(raw.get("from")),
        "to": _place_name(raw.get("to")),
        "departure": start.strftime("%H:%M") if start else "",
        "arrival": end.strftime("%H:%M") if end else "",
        "scheduled_departure": scheduled_start.strftime("%H:%M") if scheduled_start else "",
        "scheduled_arrival": scheduled_end.strftime("%H:%M") if scheduled_end else "",
        "realtime": bool(raw.get("realTime")),
        "cancelled": bool(raw.get("cancelled")),
        "duration_minutes": int(round(float(raw.get("duration") or 0) / 60)),
        "trip_id": str(raw.get("tripId") or "").strip(),
        "stops": stops,
    }


def _normalize_itinerary(raw: dict[str, Any]) -> dict[str, Any] | None:
    start = data_patch._parse_iso(raw.get("startTime"))
    end = data_patch._parse_iso(raw.get("endTime"))
    if not start or not end:
        return None
    legs = [_format_leg(leg) for leg in (raw.get("legs") or []) if isinstance(leg, dict)]
    transit_legs = [leg for leg in legs if leg["mode"] not in {"WALK", "BIKE", "CAR"}]
    if not transit_legs:
        return None
    main = transit_legs[0]
    duration = int(round(float(raw.get("duration") or (end - start).total_seconds()) / 60))
    transfers = int(raw.get("transfers") or 0)
    return {
        "departure": start.strftime("%H:%M"),
        "arrival": end.strftime("%H:%M"),
        "duration_minutes": max(0, duration),
        "transfers": transfers,
        "direct": transfers == 0 and len(transit_legs) == 1,
        "line": main.get("line") or "",
        "direction": main.get("direction") or main.get("to") or "",
        "from": legs[0].get("from") if legs else "",
        "to": legs[-1].get("to") if legs else "",
        "legs": legs,
    }


def _route_time(time_value: str) -> datetime:
    now = legacy._now()
    value = _clean_text(time_value)
    if not value:
        return now
    try:
        hour, minute = (int(part) for part in value.split(":", 1))
        return now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    except Exception:
        return now


def _plan_route(start_key: str, destination_id: str, time_value: str = "") -> dict[str, Any]:
    start_stop = _stop_by_key(start_key) or _stop_by_key("schule")
    if not start_stop:
        return {"status": "error", "message": "Start-Haltestelle nicht verfügbar.", "connections": []}
    resolved = data_patch._resolve_transitous_stop(start_stop)
    if not resolved:
        return {"status": "error", "message": "Die Start-Haltestelle konnte nicht aufgelöst werden.", "connections": []}
    when = _route_time(time_value)
    cache_key = f"{start_key}:{destination_id}:{when.strftime('%Y%m%d%H%M')}"
    cached = _ROUTE_CACHE.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return dict(cached[1])
    try:
        response = requests.get(
            f"{_TRANSITOUS_BASE}/api/v5/plan",
            params={
                "fromPlace": resolved["id"],
                "toPlace": destination_id,
                "time": when.isoformat(),
                "arriveBy": "false",
                "transitModes": "TRANSIT",
                "directModes": "",
                "maxTransfers": 2,
                "numItineraries": 5,
                "maxItineraries": 5,
                "timetableView": "true",
                "joinInterlinedLegs": "true",
                "detailedTransfers": "false",
                "language": "de",
            },
            headers=_HEADERS("Transitous journey plan"),
            timeout=12,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return {"status": "error", "message": "Die Verbindungssuche ist gerade nicht erreichbar.", "connections": []}
    connections = []
    if isinstance(payload, dict):
        for raw in payload.get("itineraries") or []:
            if isinstance(raw, dict) and (item := _normalize_itinerary(raw)):
                connections.append(item)
    connections = sorted(connections, key=lambda item: (item["departure"], item["arrival"]))[:5]
    result = {
        "status": "ok" if connections else "empty",
        "message": f"{len(connections)} Verbindungen gefunden." if connections else "Für diese Auswahl wurde keine Verbindung gefunden.",
        "start": {**start_stop, "resolved_name": resolved.get("name")},
        "connections": connections,
        "generated_at": legacy._now().isoformat(),
        "provider": "Transitous / MOTIS",
    }
    _ROUTE_CACHE[cache_key] = (time.monotonic() + 60, result)
    return dict(result)


def _trip_stops(trip_id: str) -> dict[str, Any]:
    trip_id = str(trip_id or "").strip()
    if not trip_id:
        return {"status": "error", "message": "Für diese Fahrt ist kein Fahrtverlauf verfügbar.", "stops": []}
    cached = _TRIP_CACHE.get(trip_id)
    if cached and cached[0] > time.monotonic():
        return dict(cached[1])
    try:
        response = requests.get(
            f"{_TRANSITOUS_BASE}/api/v5/trip",
            params={
                "tripId": trip_id,
                "withScheduledSkippedStops": "true",
                "joinInterlinedLegs": "false",
                "language": "de",
            },
            headers=_HEADERS("Transitous trip details"),
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return {"status": "error", "message": "Der Fahrtverlauf konnte gerade nicht geladen werden.", "stops": []}
    legs = []
    if isinstance(payload, dict):
        legs = [_format_leg(leg) for leg in (payload.get("legs") or []) if isinstance(leg, dict)]
    transit = [leg for leg in legs if leg["mode"] not in {"WALK", "BIKE", "CAR"}]
    stops: list[dict[str, Any]] = []
    for leg in transit:
        for row in leg.get("stops") or []:
            if not stops or stops[-1]["name"] != row["name"]:
                stops.append(row)
    main = transit[0] if transit else {}
    result = {
        "status": "ok" if stops else "empty",
        "message": "Fahrtverlauf geladen." if stops else "Für diese Fahrt wurden keine Zwischenhalte geliefert.",
        "line": main.get("line") or "",
        "direction": main.get("direction") or main.get("to") or "",
        "stops": stops,
    }
    _TRIP_CACHE[trip_id] = (time.monotonic() + 10 * 60, result)
    return dict(result)


@router.get("/api/mobilitaet/haltestellen", name="journey_local_stops")
async def journey_local_stops():
    located = {item.get("key"): item for item in _get_osm_stops()}
    rows = []
    for stop in BASE_STOPS:
        item = located.get(stop["key"]) or {}
        rows.append({"key": stop["key"], "name": stop["name"], "lat": item.get("lat"), "lon": item.get("lon")})
    return JSONResponse({"stops": rows}, headers={"Cache-Control": "no-store"})


@router.get("/api/mobilitaet/ziele", name="journey_destinations")
async def journey_destinations(q: str = Query(default="", max_length=100)):
    rows = _geocode(q, 12) if len(_clean_text(q)) >= 2 else _popular_destinations()
    return JSONResponse({"destinations": rows}, headers={"Cache-Control": "no-store"})


@router.get("/api/mobilitaet/verbindungen", name="journey_connections")
async def journey_connections(start: str = Query(default="schule", max_length=60), ziel: str = Query(..., min_length=1, max_length=300), zeit: str = Query(default="", max_length=10)):
    return JSONResponse(_plan_route(start, ziel, zeit), headers={"Cache-Control": "no-store"})


@router.get("/api/mobilitaet/fahrt", name="journey_trip_details")
async def journey_trip_details(stop: str = Query(default="schule", max_length=60), line: str = Query(..., max_length=30), time_value: str = Query(..., alias="time", max_length=10), direction: str = Query(default="", max_length=160)):
    selected = _stop_by_key(stop) or _stop_by_key("schule")
    data = data_patch.fetch_day(selected) if selected else {"departures": []}
    direction_norm = _clean_text(direction).casefold()
    match = None
    for item in data.get("departures") or []:
        if str(item.get("line") or "") != line or str(item.get("time") or "") != time_value:
            continue
        item_direction = _clean_text(item.get("direction")).casefold()
        if direction_norm and item_direction != direction_norm:
            continue
        match = item
        break
    if not match:
        return JSONResponse({"status": "error", "message": "Diese Fahrt wurde nicht mehr gefunden.", "stops": []}, headers={"Cache-Control": "no-store"})
    return JSONResponse(_trip_stops(str(match.get("trip_id") or "")), headers={"Cache-Control": "no-store"})


_PLANNER_HTML = r'''
<section class="journey-card" id="journey-card">
  <span class="cit-label">Verbindung finden</span>
  <div class="journey-head"><div><h2>Wie kommst du ans Ziel?</h2><p>Start wählen oder automatisch die nächste Haltestelle erkennen lassen.</p></div><span class="journey-badge">Route</span></div>
  <div class="journey-grid">
    <label class="journey-field"><span>Von</span><select id="journey-from" class="journey-control">__START_OPTIONS__</select></label>
    <button id="journey-locate" class="journey-location" type="button">⌖ <span>Standort verwenden</span></button>
    <label class="journey-field journey-to-field"><span>Nach</span><input id="journey-to" class="journey-control" type="search" placeholder="z. B. Bückeburg Bahnhof" autocomplete="off"><input id="journey-to-id" type="hidden"><div id="journey-suggestions" class="journey-suggestions" hidden></div></label>
    <label class="journey-field journey-time-field"><span>Abfahrt</span><input id="journey-time" class="journey-control" type="time"></label>
  </div>
  <button id="journey-go" class="journey-go" type="button" disabled>Beste Verbindung suchen</button>
  <small id="journey-location-status" class="journey-location-status">Startpunkt kann jederzeit manuell geändert werden.</small>
  <div id="journey-results" class="journey-results" hidden></div>
</section>
<div class="trip-sheet-backdrop" id="trip-sheet-backdrop" hidden><section class="trip-sheet" role="dialog" aria-modal="true" aria-labelledby="trip-sheet-title"><div class="trip-sheet-head"><div><span class="cit-label">Fahrtverlauf</span><h2 id="trip-sheet-title">Haltestellen</h2></div><button id="trip-sheet-close" class="cit-close" type="button" aria-label="Schließen">×</button></div><div id="trip-sheet-body"><div class="cit-empty">Fahrtverlauf wird geladen …</div></div></section></div>
'''

_PLANNER_CSS = r'''
<style>
.journey-card{margin:8px 0 16px;padding:20px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(145deg,#f9fcf7,#edf6eb);box-shadow:var(--soft-shadow)}.journey-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin:5px 0 16px}.journey-head h2{margin:0;color:var(--forest);font-size:1.35rem}.journey-head p{margin:4px 0 0;color:var(--muted);font-size:.82rem;line-height:1.45}.journey-badge{padding:7px 10px;border-radius:999px;background:#fff;color:var(--forest);font-size:.72rem;font-weight:900}.journey-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.journey-field{position:relative;display:grid;gap:6px;min-width:0}.journey-field>span{color:#4b6355;font-size:.72rem;font-weight:850}.journey-control{width:100%;min-width:0;min-height:52px;padding:0 14px;border:1px solid #cbd8cc;border-radius:16px;background:#fff;color:var(--forest);font-size:.92rem;font-weight:800;outline:none}.journey-location{align-self:end;min-height:52px;padding:0 14px;border:1px solid #cbd8cc;border-radius:16px;background:#fff;color:var(--forest);font-weight:850}.journey-to-field{grid-column:1/-1}.journey-time-field{grid-column:1/-1;max-width:210px}.journey-suggestions{position:absolute;z-index:40;top:100%;left:0;right:0;margin-top:5px;max-height:260px;overflow:auto;border:1px solid #d5ded3;border-radius:15px;background:#fff;box-shadow:0 12px 30px rgba(25,70,48,.14)}.journey-suggestion{display:block;width:100%;padding:12px 14px;border:0;border-bottom:1px solid #edf0ea;background:#fff;color:#294d3b;text-align:left;font-size:.82rem;font-weight:780}.journey-suggestion:last-child{border-bottom:0}.journey-go{width:100%;min-height:52px;margin-top:13px;border:0;border-radius:16px;background:var(--forest);color:#fff;font-size:.92rem;font-weight:900}.journey-go:disabled{opacity:.45}.journey-location-status{display:block;margin-top:8px;color:var(--muted);font-size:.7rem}.journey-results{margin-top:16px}.journey-results h3{margin:0 0 10px;color:var(--forest)}.journey-result{padding:14px;border:1px solid #dfe8dd;border-radius:18px;background:#fff}.journey-result+.journey-result{margin-top:9px}.journey-result.best{border-color:#9fc5a7;background:#fbfef9}.journey-result-time{color:var(--forest);font-size:1.2rem;font-weight:900}.journey-result-meta{color:var(--muted);font-size:.72rem}.journey-result-line{margin-top:9px;color:#294d3b;font-size:.96rem;font-weight:900}.journey-result-line span{display:inline-grid;place-items:center;min-width:46px;margin-right:7px;padding:5px 8px;border-radius:10px;background:var(--forest);color:#fff}.journey-legs{display:grid;gap:7px;margin-top:10px}.journey-leg{padding:9px 10px;border-radius:12px;background:#f6f8f3;color:#4f5d55;font-size:.75rem}.journey-leg strong{color:#294d3b}.cit-dep{cursor:pointer;transition:transform .15s ease,border-color .15s ease}.cit-dep:active{transform:scale(.99)}.trip-sheet-backdrop{position:fixed;z-index:5000;inset:0;display:flex;align-items:flex-end;background:rgba(11,37,25,.42);padding:18px}.trip-sheet-backdrop[hidden]{display:none!important}.trip-sheet{width:min(680px,100%);max-height:82vh;margin:0 auto;overflow:auto;padding:20px;border-radius:28px 28px 18px 18px;background:#fff;box-shadow:0 -10px 40px rgba(0,0,0,.2)}.trip-sheet-head{display:flex;justify-content:space-between;gap:12px;align-items:start;position:sticky;top:-20px;background:#fff;padding:20px 0 12px;z-index:2}.trip-sheet-head h2{margin:4px 0 0;color:var(--forest)}.trip-stop-list{display:grid;gap:0;margin-top:8px}.trip-stop{display:grid;grid-template-columns:54px 18px 1fr;gap:9px;align-items:start;min-height:52px}.trip-stop-time{color:#294d3b;font-weight:850}.trip-stop-dot{position:relative;width:12px;height:12px;margin-top:4px;border:3px solid #3c7e59;border-radius:50%;background:#fff}.trip-stop:not(:last-child) .trip-stop-dot:after{content:"";position:absolute;top:10px;left:2px;width:2px;height:43px;background:#c8dccb}.trip-stop-name{color:#4d5f55;font-weight:750}.trip-stop.current .trip-stop-name{color:var(--forest);font-weight:900}.trip-stop.current .trip-stop-dot{background:var(--forest)}
@media(max-width:560px){.journey-card{padding:16px}.journey-grid{grid-template-columns:1fr}.journey-location,.journey-time-field{grid-column:1/-1;max-width:none}.journey-location{width:100%}.trip-sheet-backdrop{padding:0}.trip-sheet{border-radius:26px 26px 0 0;max-height:86vh}}
</style>
'''

_PLANNER_JS = r'''
<script>
(() => {
const from=document.getElementById('journey-from'),to=document.getElementById('journey-to'),toId=document.getElementById('journey-to-id'),suggest=document.getElementById('journey-suggestions'),go=document.getElementById('journey-go'),results=document.getElementById('journey-results'),locate=document.getElementById('journey-locate'),locStatus=document.getElementById('journey-location-status'),timeInput=document.getElementById('journey-time');if(!from||!to)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const pad=n=>String(n).padStart(2,'0');const now=new Date();timeInput.value=`${pad(now.getHours())}:${pad(now.getMinutes())}`;
const departureSelect=document.getElementById('cit-stop');if(departureSelect&&[...from.options].some(o=>o.value===departureSelect.value))from.value=departureSelect.value;from.onchange=()=>{if(departureSelect&&departureSelect.value!==from.value){departureSelect.value=from.value;departureSelect.dispatchEvent(new Event('change',{bubbles:true}))}};
let timer=null;async function destinations(q=''){try{const r=await fetch(`/api/mobilitaet/ziele?q=${encodeURIComponent(q)}`,{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json(),rows=d.destinations||[];suggest.innerHTML=rows.map(x=>`<button type="button" class="journey-suggestion" data-id="${esc(x.id)}" data-name="${esc(x.name)}">${esc(x.name)}</button>`).join('');suggest.hidden=!rows.length;suggest.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{to.value=b.dataset.name||'';toId.value=b.dataset.id||'';suggest.hidden=true;go.disabled=!toId.value})}catch(_){suggest.hidden=true}}
to.addEventListener('focus',()=>destinations(to.value.trim()));to.addEventListener('input',()=>{toId.value='';go.disabled=true;clearTimeout(timer);timer=setTimeout(()=>destinations(to.value.trim()),250)});document.addEventListener('click',e=>{if(!e.target.closest('.journey-to-field'))suggest.hidden=true});
function hav(a,b,c,d){const R=6371,p=x=>x*Math.PI/180,dp=p(c-a),dl=p(d-b),v=Math.sin(dp/2)**2+Math.cos(p(a))*Math.cos(p(c))*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(v))}async function nearest(pos){try{const r=await fetch('/api/mobilitaet/haltestellen',{cache:'no-store'}),d=await r.json();const rows=(d.stops||[]).filter(x=>Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lon)));if(!rows.length)throw Error();rows.forEach(x=>x.distance=hav(pos.coords.latitude,pos.coords.longitude,Number(x.lat),Number(x.lon)));rows.sort((a,b)=>a.distance-b.distance);const n=rows[0];if(n&&[...from.options].some(o=>o.value===n.key)){from.value=n.key;from.dispatchEvent(new Event('change'));locStatus.textContent=`Nächste Haltestelle erkannt: ${n.name} · ca. ${n.distance<1?Math.round(n.distance*1000)+' m':n.distance.toFixed(1)+' km'}`}}catch(_){locStatus.textContent='Die nächste Haltestelle konnte gerade nicht ermittelt werden.'}}
function useLocation(){if(!navigator.geolocation){locStatus.textContent='Standort wird auf diesem Gerät nicht unterstützt.';return}locStatus.textContent='Standort wird ermittelt …';navigator.geolocation.getCurrentPosition(nearest,()=>locStatus.textContent='Standort nicht verfügbar. Start bitte manuell auswählen.',{enableHighAccuracy:true,timeout:10000,maximumAge:60000})}locate.onclick=useLocation;if(navigator.permissions&&navigator.permissions.query){navigator.permissions.query({name:'geolocation'}).then(p=>{if(p.state==='granted')useLocation()}).catch(()=>{})}
function legHtml(l){if(l.mode==='WALK')return `<div class="journey-leg">🚶 Fußweg · ${l.duration_minutes||0} Min. bis ${esc(l.to)}</div>`;return `<div class="journey-leg"><strong>${esc(l.departure)} · ${esc(l.line||l.mode)} → ${esc(l.direction||l.to)}</strong><br>${esc(l.from)} → ${esc(l.to)} · an ${esc(l.arrival)}</div>`}function resultHtml(x,i){const transfer=x.transfers===0?'direkt':`${x.transfers}× umsteigen`,line=x.line?`<span>${esc(x.line)}</span>${esc(x.direction||x.to)}`:esc(x.direction||x.to);return `<article class="journey-result ${i===0?'best':''}"><div class="journey-result-time">${esc(x.departure)} → ${esc(x.arrival)}</div><div class="journey-result-meta">${x.duration_minutes} Min. · ${transfer}${i===0?' · beste Verbindung':''}</div><div class="journey-result-line">${line}</div><div class="journey-legs">${(x.legs||[]).map(legHtml).join('')}</div></article>`}
go.onclick=async()=>{if(!toId.value)return;go.disabled=true;go.textContent='Verbindung wird gesucht …';results.hidden=false;results.innerHTML='<div class="cit-empty">Beste Verbindungen werden berechnet …</div>';try{const r=await fetch(`/api/mobilitaet/verbindungen?start=${encodeURIComponent(from.value)}&ziel=${encodeURIComponent(toId.value)}&zeit=${encodeURIComponent(timeInput.value)}`,{cache:'no-store'}),d=await r.json();results.innerHTML=d.connections?.length?`<h3>Deine Verbindungen</h3>${d.connections.map(resultHtml).join('')}`:`<div class="cit-empty"><strong>Keine Verbindung gefunden</strong>${esc(d.message||'Bitte Start, Ziel oder Zeit ändern.')}</div>`}catch(_){results.innerHTML='<div class="cit-empty"><strong>Verbindungssuche nicht erreichbar</strong>Bitte später erneut versuchen.</div>'}finally{go.disabled=!toId.value;go.textContent='Beste Verbindung suchen'}};
const sheet=document.getElementById('trip-sheet-backdrop'),sheetBody=document.getElementById('trip-sheet-body'),sheetTitle=document.getElementById('trip-sheet-title');document.getElementById('trip-sheet-close').onclick=()=>sheet.hidden=true;sheet.onclick=e=>{if(e.target===sheet)sheet.hidden=true};function stopList(d,current){sheetTitle.textContent=d.line?`Linie ${d.line} → ${d.direction||''}`:'Fahrtverlauf';sheetBody.innerHTML=d.stops?.length?`<div class="trip-stop-list">${d.stops.map(s=>{const isCurrent=String(s.name||'').toLowerCase().includes(String(current||'').replace('Ahnsen, ','').toLowerCase());return `<div class="trip-stop ${isCurrent?'current':''}"><span class="trip-stop-time">${esc(s.departure||s.arrival||'')}</span><span class="trip-stop-dot"></span><span class="trip-stop-name">${esc(s.name)}</span></div>`}).join('')}</div>`:`<div class="cit-empty">${esc(d.message||'Keine Haltestellenfolge verfügbar.')}</div>`}
async function openTrip(card){const line=card.querySelector('.cit-line')?.textContent?.trim()||'',tm=card.querySelector('.cit-time strong')?.textContent?.trim()||'',dir=card.querySelector('.cit-route strong')?.textContent?.trim()||'',sel=document.getElementById('cit-stop'),stop=sel?.value||'schule',current=sel?.options[sel.selectedIndex]?.text||'';if(!line||!tm)return;sheet.hidden=false;sheetTitle.textContent=`Linie ${line}`;sheetBody.innerHTML='<div class="cit-empty">Fahrtverlauf wird geladen …</div>';try{const r=await fetch(`/api/mobilitaet/fahrt?stop=${encodeURIComponent(stop)}&line=${encodeURIComponent(line)}&time=${encodeURIComponent(tm)}&direction=${encodeURIComponent(dir)}`,{cache:'no-store'}),d=await r.json();stopList(d,current)}catch(_){sheetBody.innerHTML='<div class="cit-empty">Der Fahrtverlauf konnte gerade nicht geladen werden.</div>'}}['cit-next','cit-day-list'].forEach(id=>document.getElementById(id)?.addEventListener('click',e=>{const card=e.target.closest('.cit-dep');if(card)openTrip(card)}));destinations('');
})();
</script>
'''


def content() -> str:
    html = _original_content()
    planner = _PLANNER_HTML.replace("__START_OPTIONS__", legacy._stop_options())
    marker = '<section class="cit-board" aria-label="Abfahrtstafel">'
    html = html.replace(marker, planner + marker, 1) if marker in html else planner + html
    return _PLANNER_CSS + html + _PLANNER_JS


legacy._content = content
