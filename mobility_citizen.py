from __future__ import annotations

import math
import re
import time
import unicodedata
from datetime import datetime
from html import escape
from typing import Any
from urllib.parse import quote

import requests
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from mobility_routes import (
    BASE_STOPS,
    KNOWN_LINES,
    LOCAL_TZ,
    _departure_api_base,
    _departure_items,
    _get_osm_stops,
    _platform_center,
    _vehicle_snapshot,
)
from platform_runtime import get_platform_snapshot
from pwa_ui import page


router = APIRouter()

OFFICIAL_TIMETABLE_URL = "https://www.shgmobil.de/fahrplaene/linie-bek/"
OFFICIAL_LIVE_URL = "https://app.shgmobil.de/"
DAY_CACHE_SECONDS = 60

_STOP_ALIASES: dict[str, tuple[str, ...]] = {
    "schule": (
        "Ahnsen Schule",
        "Ahnsen, Schule",
        "Ahnsen(B Stadthagen) Schule",
    ),
    "theodor-heuss": (
        "Ahnsen Theodor-Heuss-Straße",
        "Ahnsen, Theodor-Heuss-Straße",
        "Ahnsen(B Stadthagen) Theodor Heuss Straße",
    ),
    "haus-eix": (
        "Ahnsen Haus Eix",
        "Ahnsen, Haus Eix",
        "Ahnsen(B Stadthagen) Haus Eix",
    ),
    "dorfgemeinschaftshaus": (
        "Ahnsen Dorfgemeinschaftshaus",
        "Ahnsen, Dorfgemeinschaftshaus",
        "Ahnsen(B Stadthagen) Dorfgemeinschaftshaus",
    ),
    "klinikum": (
        "Klinikum Schaumburg",
        "Obernkirchen Klinikum Schaumburg",
        "Vehlen Klinikum Schaumburg",
    ),
    "schmiede": (
        "Ahnsen Schmiede",
        "Ahnsen, Schmiede",
        "Ahnsen(B Stadthagen) Schmiede",
    ),
    "wilhelmshoehe": (
        "Ahnsen Wilhelmshöhe",
        "Ahnsen, Wilhelmshöhe",
        "Ahnsen(B Stadthagen) Wilhelmshöhe",
    ),
}

_STOP_ID_CACHE: dict[str, tuple[float, dict[str, Any] | None]] = {}
_DAY_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def _now() -> datetime:
    return datetime.now(LOCAL_TZ)


def _norm(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-zA-Z0-9]+", " ", text.casefold())
    return " ".join(text.split())


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    value = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(value))


def _parse_iso(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=LOCAL_TZ)
        return parsed.astimezone(LOCAL_TZ)
    except ValueError:
        return None


def _line_number(value: object) -> str:
    if isinstance(value, dict):
        for key in ("name", "fahrtNr", "id", "productName"):
            candidate = str(value.get(key) or "").strip()
            match = re.search(r"(?<!\d)(2132|2133|2026)(?!\d)", candidate)
            if match:
                return match.group(1)
    else:
        match = re.search(r"(?<!\d)(2132|2133|2026)(?!\d)", str(value or ""))
        if match:
            return match.group(1)
    return ""


def _stop_by_key(key: str) -> dict[str, Any] | None:
    return next((dict(stop) for stop in BASE_STOPS if stop["key"] == key), None)


def _location_candidates(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("locations", "results", "stops"):
            if isinstance(payload.get(key), list):
                return [item for item in payload[key] if isinstance(item, dict)]
    return []


def _candidate_score(item: dict[str, Any], stop: dict[str, Any], alias: str) -> float:
    item_id = str(item.get("id") or "").strip()
    name = str(item.get("name") or "").strip()
    if not item_id or not name or item.get("type") not in {None, "stop", "station"}:
        return -999.0

    wanted = _norm(alias)
    actual = _norm(name)
    score = 0.0
    if actual == wanted:
        score += 160
    elif wanted in actual or actual in wanted:
        score += 90

    stop_words = set(_norm(stop["name"]).split())
    actual_words = set(actual.split())
    score += len(stop_words & actual_words) * 12
    if "ahnsen" in actual_words:
        score += 35

    location = item.get("location") or {}
    try:
        lat = float(location.get("latitude"))
        lon = float(location.get("longitude"))
        center_lat, center_lon = _platform_center()
        distance = _haversine_km(center_lat, center_lon, lat, lon)
        if distance > 25:
            return -999.0
        score += max(0.0, 35.0 - distance * 4)
    except (TypeError, ValueError):
        pass
    return score


def _resolve_stop(stop: dict[str, Any]) -> dict[str, Any] | None:
    cached = _STOP_ID_CACHE.get(stop["key"])
    if cached and cached[0] > time.monotonic():
        return dict(cached[1]) if cached[1] else None

    aliases = _STOP_ALIASES.get(stop["key"], (stop["name"],))
    best: tuple[float, dict[str, Any]] | None = None
    for alias in aliases:
        try:
            response = requests.get(
                f"{_departure_api_base()}/locations",
                params={
                    "query": alias,
                    "results": 10,
                    "poi": "false",
                    "addresses": "false",
                    "language": "de",
                },
                headers={"Accept": "application/json", "User-Agent": "Ahnsen-hilft/2.0 citizen-departures"},
                timeout=6,
            )
            response.raise_for_status()
            candidates = _location_candidates(response.json())
        except Exception:
            continue

        for item in candidates:
            score = _candidate_score(item, stop, alias)
            if score < 70:
                continue
            location = item.get("location") or {}
            try:
                lat = float(location.get("latitude"))
                lon = float(location.get("longitude"))
            except (TypeError, ValueError):
                lat = lon = None
            result = {
                "id": str(item.get("id") or "").strip(),
                "name": str(item.get("name") or stop["name"]).strip(),
                "lat": lat,
                "lon": lon,
            }
            if best is None or score > best[0]:
                best = (score, result)
        if best and best[0] >= 145:
            break

    resolved = best[1] if best else None
    _STOP_ID_CACHE[stop["key"]] = (
        time.monotonic() + (24 * 60 * 60 if resolved else 10 * 60),
        resolved,
    )
    return dict(resolved) if resolved else None


def _normalize_departure(raw: dict[str, Any], stop: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    line = _line_number(raw.get("line"))
    if line not in KNOWN_LINES:
        return None

    actual = _parse_iso(raw.get("when") or raw.get("plannedWhen"))
    planned = _parse_iso(raw.get("plannedWhen") or raw.get("when"))
    if not actual or not planned or actual.date() != now.date():
        return None

    delay_seconds = raw.get("delay")
    try:
        if delay_seconds is None:
            delay_seconds = int((actual - planned).total_seconds())
        else:
            delay_seconds = int(delay_seconds)
    except (TypeError, ValueError):
        delay_seconds = None

    delay_minutes = int(round(delay_seconds / 60)) if delay_seconds is not None else None
    direction = str(raw.get("direction") or raw.get("provenance") or "").strip()
    if not direction:
        direction = KNOWN_LINES[line]["title"].split("↔")[-1].strip()

    return {
        "stop_key": stop["key"],
        "stop_name": stop["name"],
        "line": line,
        "direction": direction,
        "when": actual.isoformat(),
        "planned_when": planned.isoformat(),
        "time": actual.strftime("%H:%M"),
        "planned_time": planned.strftime("%H:%M"),
        "delay_minutes": delay_minutes,
        "minutes": int(math.ceil((actual - now).total_seconds() / 60)),
        "cancelled": bool(raw.get("cancelled")),
        "realtime": raw.get("when") is not None and (raw.get("delay") is not None or raw.get("plannedWhen") is not None),
        "past": actual < now,
    }


def _fetch_day_for_stop(stop: dict[str, Any]) -> dict[str, Any]:
    now = _now()
    cache_key = f"{stop['key']}:{now.date().isoformat()}"
    cached = _DAY_CACHE.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return dict(cached[1])

    resolved = _resolve_stop(stop)
    if not resolved:
        result = {
            "status": "error",
            "message": "Die Haltestelle konnte in der Fahrplanauskunft gerade nicht eindeutig gefunden werden.",
            "stop": stop,
            "departures": [],
            "generated_at": now.isoformat(),
        }
        _DAY_CACHE[cache_key] = (time.monotonic() + 90, result)
        return dict(result)

    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        response = requests.get(
            f"{_departure_api_base()}/stops/{quote(str(resolved['id']), safe='')}/departures",
            params={
                "when": start.isoformat(),
                "duration": 1439,
                "results": 160,
                "bus": "true",
                "suburban": "false",
                "subway": "false",
                "tram": "false",
                "ferry": "false",
                "express": "false",
                "regional": "false",
                "national": "false",
                "stopovers": "false",
                "remarks": "true",
                "language": "de",
            },
            headers={"Accept": "application/json", "User-Agent": "Ahnsen-hilft/2.0 citizen-departures"},
            timeout=8,
        )
        response.raise_for_status()
        departures = []
        for raw in _departure_items(response.json()):
            item = _normalize_departure(raw, stop, now)
            if item:
                departures.append(item)
    except Exception:
        result = {
            "status": "error",
            "message": "Aktuelle Abfahrtszeiten konnten gerade nicht geladen werden.",
            "stop": stop,
            "departures": [],
            "generated_at": now.isoformat(),
        }
        _DAY_CACHE[cache_key] = (time.monotonic() + 45, result)
        return dict(result)

    unique = {
        (item["line"], item["when"], item["direction"]): item
        for item in departures
    }
    departures = sorted(unique.values(), key=lambda item: item["when"])
    status = "ok" if departures else "empty"
    message = (
        f"{len(departures)} Abfahrten für heute gefunden."
        if departures
        else "Für heute wurden aktuell keine Fahrten der Ahnsener Buslinien geliefert."
    )
    result = {
        "status": status,
        "message": message,
        "stop": {**stop, "resolved_name": resolved.get("name")},
        "departures": departures,
        "generated_at": now.isoformat(),
    }
    _DAY_CACHE[cache_key] = (time.monotonic() + DAY_CACHE_SECONDS, result)
    return dict(result)


@router.get("/api/mobilitaet/abfahrten")
async def citizen_departures(stop: str = Query(default="schule", max_length=60)):
    selected = _stop_by_key(stop) or _stop_by_key("schule")
    return JSONResponse(_fetch_day_for_stop(selected), headers={"Cache-Control": "no-store"})


@router.get("/api/mobilitaet/karte")
async def citizen_map_data():
    exact = _vehicle_snapshot()
    return JSONResponse(
        {
            "center": {"lat": _platform_center()[0], "lon": _platform_center()[1]},
            "stops": _get_osm_stops(),
            "vehicles": exact.get("vehicles") or [],
            "live_status": exact.get("status") or "not-configured",
            "live_message": exact.get("message") or "",
        },
        headers={"Cache-Control": "no-store"},
    )


def _stop_options() -> str:
    return "".join(
        f'<option value="{escape(stop["key"])}">{escape(stop["name"])}</option>'
        for stop in BASE_STOPS
    )


def _line_cards() -> str:
    return "".join(
        f'''<article class="cit-line-card"><span>{escape(line)}</span><div><strong>{escape(data["title"])}</strong><small>{escape(data["note"])}</small></div></article>'''
        for line, data in KNOWN_LINES.items()
    )


_CITIZEN_TEMPLATE = r'''
<style>
.mob-citizen .app-main{padding-bottom:180px}.cit-head{padding-bottom:12px}.cit-head h1{margin-bottom:8px}.cit-head p{max-width:620px;margin:0;color:var(--muted);font-size:1rem;line-height:1.55}.cit-board{overflow:hidden;margin-top:8px;border:1px solid var(--line);border-radius:28px;background:#fff;box-shadow:var(--soft-shadow)}.cit-board-top{padding:20px;background:linear-gradient(145deg,#f9fcf7,#edf6eb);border-bottom:1px solid var(--line)}.cit-label{display:block;color:var(--sage);font-size:.72rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.cit-stop-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end;margin-top:7px}.cit-stop-row label{display:grid;gap:7px;color:var(--forest);font-size:.78rem;font-weight:850}.cit-stop-select{width:100%;min-height:54px;padding:0 42px 0 14px;border:1px solid #cbd8cc;border-radius:16px;color:var(--forest);background:#fff;font-size:1rem;font-weight:850;outline:none}.cit-fav{width:54px;height:54px;border:1px solid #cbd8cc;border-radius:16px;background:#fff;color:var(--forest);font-size:1.6rem;cursor:pointer}.cit-board-body{padding:18px 20px 20px}.cit-title-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.cit-title-row h2{margin:0;color:var(--forest);font-size:1.25rem}.cit-status{display:block;margin-top:4px;color:var(--muted);font-size:.78rem}.cit-refresh{border:0;background:transparent;color:var(--forest);font-weight:850;cursor:pointer}.cit-departures,.cit-day-list{display:grid;gap:9px}.cit-dep{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:11px;align-items:center;padding:12px;border:1px solid #e6ebe4;border-radius:17px;background:#fbfcf9}.cit-dep.past{opacity:.48}.cit-dep.cancelled{background:#fff4f1;border-color:#efc7bf}.cit-line{display:grid;place-items:center;min-width:58px;min-height:44px;padding:5px 8px;border-radius:13px;color:#fff;background:var(--forest);font-weight:900}.cit-route{min-width:0}.cit-route strong{display:block;overflow:hidden;color:#294d3b;text-overflow:ellipsis;white-space:nowrap}.cit-route small{display:block;margin-top:3px;color:#77817a;font-size:.76rem}.cit-time{text-align:right}.cit-time strong{display:block;color:#173e2d;font-size:1.05rem}.cit-time small{display:block;margin-top:2px;color:#6f7b72;font-size:.72rem;white-space:nowrap}.cit-delay{display:inline-flex;margin-top:4px;padding:3px 6px;border-radius:999px;background:#eaf5e8;color:#2f6845;font-size:.65rem;font-weight:900}.cit-delay.late{background:#fff0e7;color:#9a4a20}.cit-empty{padding:20px;border-radius:17px;background:#f7f5ed;color:#647168;line-height:1.55}.cit-empty strong{display:block;margin-bottom:6px;color:var(--forest)}.cit-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:14px}.cit-action{display:flex;align-items:center;justify-content:center;min-height:48px;padding:11px 12px;border:1px solid #c7d5c8;border-radius:15px;color:var(--forest);background:#fff;text-decoration:none;font-size:.8rem;font-weight:900;cursor:pointer}.cit-action.primary{border-color:var(--forest);color:#fff;background:var(--forest)}.cit-day{margin-top:16px;padding:18px 20px;border:1px solid var(--line);border-radius:26px;background:#fff;box-shadow:var(--soft-shadow)}.cit-day[hidden]{display:none!important}.cit-day-head{display:flex;align-items:start;justify-content:space-between;gap:12px}.cit-day-head h2{margin:4px 0 0;color:var(--forest);font-size:1.25rem}.cit-close{border:0;background:#eef4eb;color:var(--forest);width:40px;height:40px;border-radius:13px;font-size:1.2rem;cursor:pointer}.cit-filters{display:grid;grid-template-columns:1fr;gap:9px;margin:14px 0}.cit-line-filters{display:flex;gap:7px;overflow:auto;padding:1px 1px 5px;scrollbar-width:none}.cit-filter{white-space:nowrap;border:1px solid #d4ddd3;border-radius:999px;background:#f8faf6;color:#506158;padding:8px 11px;font-size:.75rem;font-weight:850}.cit-filter.active{border-color:var(--forest);background:var(--forest);color:#fff}.cit-direction{width:100%;min-height:44px;padding:0 12px;border:1px solid #d4ddd3;border-radius:13px;background:#fff;color:#385143;font-weight:750}.cit-count{margin:0 0 10px;color:var(--muted);font-size:.75rem}.cit-map-details,.cit-lines{margin-top:16px;border:1px solid var(--line);border-radius:25px;background:#fff;box-shadow:var(--soft-shadow)}.cit-map-details summary{display:grid;grid-template-columns:46px 1fr 24px;gap:12px;align-items:center;padding:16px 18px;cursor:pointer;list-style:none}.cit-map-details summary::-webkit-details-marker{display:none}.cit-map-icon{width:46px;height:46px;display:grid;place-items:center;border-radius:15px;background:var(--soft);color:var(--forest);font-size:1.35rem}.cit-map-details summary strong,.cit-map-details summary small{display:block}.cit-map-details summary strong{color:var(--forest)}.cit-map-details summary small{margin-top:3px;color:var(--muted);font-size:.76rem}.cit-map-wrap{border-top:1px solid var(--line);padding:0 14px 14px}.cit-map-status{padding:12px 2px;color:var(--muted);font-size:.78rem}.cit-map{height:310px;overflow:hidden;border-radius:18px;background:#edf1e8;position:relative}.cit-map-loading{position:absolute;inset:0;display:grid;place-items:center;padding:24px;color:#69756e;text-align:center}.cit-map-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.cit-lines{padding:18px 20px}.cit-lines h2{margin:4px 0 12px;color:var(--forest);font-size:1.18rem}.cit-line-grid{display:grid;gap:8px}.cit-line-card{display:grid;grid-template-columns:54px 1fr;gap:11px;align-items:center;padding:11px;border-radius:16px;background:#f8faf6}.cit-line-card>span{display:grid;place-items:center;min-height:40px;border-radius:12px;background:var(--forest);color:#fff;font-weight:900}.cit-line-card strong,.cit-line-card small{display:block}.cit-line-card strong{color:#294d3b}.cit-line-card small{margin-top:3px;color:var(--muted);font-size:.75rem}.cit-bus-marker{display:grid!important;place-items:center;width:46px;height:32px!important;border:3px solid #fff;border-radius:12px;background:var(--forest);color:#fff;font-size:.67rem;font-weight:900;box-shadow:0 4px 14px rgba(0,0,0,.22)}.cit-stop-marker{width:17px;height:17px!important;border:4px solid #2f7957;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.15)}
@media(max-width:560px){.mob-citizen .app-main{padding-inline:14px;padding-bottom:190px}.cit-board-top,.cit-board-body,.cit-day,.cit-lines{padding-left:15px;padding-right:15px}.cit-stop-row{grid-template-columns:1fr 50px}.cit-fav{width:50px;height:54px}.cit-dep{grid-template-columns:52px minmax(0,1fr) auto;gap:8px;padding:10px}.cit-line{min-width:52px;min-height:42px}.cit-route strong{font-size:.88rem}.cit-actions,.cit-map-actions{grid-template-columns:1fr}.cit-map{height:280px}}
</style>
<section class="page-heading compact cit-head"><a class="back-link" href="/">← Start</a><span class="eyebrow">Unterwegs in __MUNICIPALITY__</span><h1>Bus &amp; Mobilität</h1><p>Wann fährt der nächste Bus? Haltestelle auswählen und die Abfahrten des Tages direkt sehen.</p></section>
<section class="cit-board" aria-label="Abfahrtstafel"><div class="cit-board-top"><span class="cit-label">Deine Haltestelle</span><div class="cit-stop-row"><label>Haltestelle<select id="cit-stop" class="cit-stop-select">__STOP_OPTIONS__</select></label><button class="cit-fav" id="cit-fav" type="button" aria-label="Haltestelle als Favorit speichern">☆</button></div></div><div class="cit-board-body"><div class="cit-title-row"><div><span class="cit-label">Jetzt &amp; gleich</span><h2>Nächste Abfahrten</h2><small class="cit-status" id="cit-status">Abfahrten werden geladen …</small></div><button class="cit-refresh" id="cit-refresh" type="button">↻ Aktualisieren</button></div><div class="cit-departures" id="cit-next"><div class="cit-empty">Abfahrten werden geladen …</div></div><div class="cit-actions"><button class="cit-action primary" id="cit-show-day" type="button">Alle Abfahrten heute</button><a class="cit-action" href="__OFFICIAL_TIMETABLE__" target="_blank" rel="noopener">Offizieller Fahrplan</a></div></div></section>
<section class="cit-day" id="cit-day" hidden><div class="cit-day-head"><div><span class="cit-label">Tagesfahrplan</span><h2 id="cit-day-title">Alle Abfahrten heute</h2></div><button class="cit-close" id="cit-close-day" type="button" aria-label="Tagesansicht schließen">×</button></div><div class="cit-filters"><div class="cit-line-filters" id="cit-line-filters"></div><select class="cit-direction" id="cit-direction" aria-label="Nach Fahrtrichtung filtern"><option value="">Alle Fahrtrichtungen</option></select></div><p class="cit-count" id="cit-count"></p><div class="cit-day-list" id="cit-day-list"></div></section>
<details class="cit-map-details" id="cit-map-details"><summary><span class="cit-map-icon">⌖</span><span><strong>Karte &amp; Live-Tracking</strong><small>Haltestellen und – wenn verfügbar – aktuelle Buspositionen anzeigen</small></span><span>›</span></summary><div class="cit-map-wrap"><div class="cit-map-status" id="cit-map-status">Karte wird erst beim Öffnen geladen.</div><div class="cit-map" id="cit-map"><div class="cit-map-loading">Karte öffnen, um Haltestellen und Live-Positionen zu laden.</div></div><div class="cit-map-actions"><button class="cit-action" id="cit-center" type="button">Auf Ahnsen zentrieren</button><a class="cit-action primary" href="__OFFICIAL_LIVE__" target="_blank" rel="noopener">SHG Live-Karte öffnen</a></div></div></details>
<section class="cit-lines"><span class="cit-label">Linien in Ahnsen</span><h2>2132 · 2133 · 2026</h2><div class="cit-line-grid">__LINE_CARDS__</div></section>
<script>
(() => {
const STORE='ahnsen-mobility-stop-v2';
const S={stop:'schule',departures:[],line:'',direction:'',map:null,mapLoaded:false,center:[__CENTER_LAT__,__CENTER_LON__]};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const select=document.getElementById('cit-stop'),next=document.getElementById('cit-next'),status=document.getElementById('cit-status'),day=document.getElementById('cit-day'),dayList=document.getElementById('cit-day-list'),direction=document.getElementById('cit-direction');
try{S.stop=localStorage.getItem(STORE)||'schule'}catch(_){S.stop='schule'}if([...select.options].some(o=>o.value===S.stop))select.value=S.stop;else S.stop=select.value;
function depRow(x){const d=Number.isFinite(x.delay_minutes)?x.delay_minutes:null,delay=d===null||d===0?'':`<span class="cit-delay ${d>1?'late':''}">${d>0?'+':''}${d} Min.</span>`,relative=x.past?'abgefahren':x.minutes<=0?'jetzt':`in ${x.minutes} Min.`;return `<article class="cit-dep ${x.past?'past':''} ${x.cancelled?'cancelled':''}"><span class="cit-line">${esc(x.line)}</span><div class="cit-route"><strong>${esc(x.direction||'Richtung laut Fahrplan')}</strong><small>${x.cancelled?'Fällt aus':x.realtime?'Aktuelle Prognose · Plan '+esc(x.planned_time):'Fahrplan'}</small></div><div class="cit-time"><strong>${esc(x.time)}</strong><small>${relative}</small>${delay}</div></article>`}
function officialFallback(message){return `<div class="cit-empty"><strong>Abfahrtszeiten gerade nicht verfügbar</strong>${esc(message||'Die Fahrplanauskunft antwortet momentan nicht zuverlässig.')}<div class="cit-actions"><a class="cit-action primary" href="__OFFICIAL_TIMETABLE__" target="_blank" rel="noopener">Offiziellen Fahrplan öffnen</a><a class="cit-action" href="__OFFICIAL_LIVE__" target="_blank" rel="noopener">SHG Live öffnen</a></div></div>`}
function renderNext(data){const upcoming=S.departures.filter(x=>!x.past).slice(0,4);status.textContent=data.status==='ok'?'Heute · automatisch aktualisiert':data.message||'Status nicht verfügbar';next.innerHTML=upcoming.length?upcoming.map(depRow).join(''):data.status==='ok'?'<div class="cit-empty"><strong>Heute keine weitere Abfahrt</strong>Für diese Haltestelle ist heute keine weitere Fahrt in den geladenen Daten vorhanden.</div>':officialFallback(data.message)}
function lineFilters(){const el=document.getElementById('cit-line-filters'),lines=[...new Set(S.departures.map(x=>x.line))];el.innerHTML=['',...lines].map(l=>`<button class="cit-filter ${l===S.line?'active':''}" type="button" data-line="${esc(l)}">${l||'Alle Linien'}</button>`).join('');el.querySelectorAll('[data-line]').forEach(b=>b.onclick=()=>{S.line=b.dataset.line||'';lineFilters();renderDay()})}
function directionOptions(){const values=[...new Set(S.departures.filter(x=>!S.line||x.line===S.line).map(x=>x.direction).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));if(S.direction&&!values.includes(S.direction))S.direction='';direction.innerHTML='<option value="">Alle Fahrtrichtungen</option>'+values.map(v=>`<option value="${esc(v)}" ${v===S.direction?'selected':''}>${esc(v)}</option>`).join('')}
function renderDay(){directionOptions();const rows=S.departures.filter(x=>(!S.line||x.line===S.line)&&(!S.direction||x.direction===S.direction));document.getElementById('cit-count').textContent=`${rows.length} ${rows.length===1?'Abfahrt':'Abfahrten'} angezeigt`;dayList.innerHTML=rows.length?rows.map(depRow).join(''):'<div class="cit-empty">Für diesen Filter gibt es heute keine Abfahrt.</div>'}
async function load(){status.textContent='Abfahrten werden geladen …';try{const r=await fetch(`/api/mobilitaet/abfahrten?stop=${encodeURIComponent(S.stop)}`,{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();S.departures=data.departures||[];renderNext(data);lineFilters();renderDay();document.getElementById('cit-day-title').textContent=`Alle Abfahrten heute · ${select.options[select.selectedIndex].text}`;}catch(_){S.departures=[];next.innerHTML=officialFallback('Die Verbindung zur Fahrplanauskunft konnte nicht hergestellt werden.');status.textContent='Fahrplanauskunft nicht erreichbar';lineFilters();renderDay()}}
select.addEventListener('change',()=>{S.stop=select.value;try{localStorage.setItem(STORE,S.stop)}catch(_){}S.line='';S.direction='';load()});document.getElementById('cit-refresh').onclick=load;document.getElementById('cit-show-day').onclick=()=>{day.hidden=false;renderDay();day.scrollIntoView({behavior:'smooth',block:'start'})};document.getElementById('cit-close-day').onclick=()=>{day.hidden=true;document.querySelector('.cit-board').scrollIntoView({behavior:'smooth',block:'start'})};direction.onchange=()=>{S.direction=direction.value;renderDay()};
const fav=document.getElementById('cit-fav');function favState(){let stored='';try{stored=localStorage.getItem(STORE)||''}catch(_){}fav.textContent=stored===S.stop?'★':'☆'}fav.onclick=()=>{try{localStorage.setItem(STORE,S.stop)}catch(_){}favState()};favState();
const leaflet=()=>new Promise((ok,no)=>{if(window.L)return ok();if(!document.querySelector('link[data-cit-leaflet]')){const l=document.createElement('link');l.rel='stylesheet';l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';l.dataset.citLeaflet='1';document.head.appendChild(l)}const old=document.querySelector('script[data-cit-leaflet]');if(old){old.addEventListener('load',ok,{once:true});old.addEventListener('error',no,{once:true});return}const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.dataset.citLeaflet='1';s.onload=ok;s.onerror=no;document.head.appendChild(s)});
async function loadMap(){if(S.mapLoaded)return;S.mapLoaded=true;const mapEl=document.getElementById('cit-map'),mapStatus=document.getElementById('cit-map-status');try{const [_,r]=await Promise.all([leaflet(),fetch('/api/mobilitaet/karte',{cache:'no-store'})]);if(!r.ok)throw Error();const data=await r.json();mapEl.innerHTML='';S.map=L.map(mapEl).setView(S.center,14);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(S.map);(data.stops||[]).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)).forEach(x=>{const i=L.divIcon({className:'',html:'<span class="cit-stop-marker"></span>',iconSize:[17,17],iconAnchor:[8,8]});L.marker([x.lat,x.lon],{icon:i}).addTo(S.map).bindPopup(`<strong>${esc(x.name)}</strong>`) });const vehicles=(data.vehicles||[]).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon));vehicles.forEach(x=>{const i=L.divIcon({className:'',html:`<span class="cit-bus-marker">${esc(x.line||'Bus')}</span>`,iconSize:[46,32],iconAnchor:[23,16]});L.marker([x.lat,x.lon],{icon:i}).addTo(S.map).bindPopup(`<strong>Linie ${esc(x.line||'')}</strong><br>${esc(x.direction||'Live-Position')}`)});mapStatus.textContent=vehicles.length?`${vehicles.length} aktuelle Busposition${vehicles.length===1?'':'en'} verfügbar.`:'Aktuell ist keine Live-Busposition verfügbar. Die Haltestellen werden trotzdem angezeigt.';document.getElementById('cit-center').onclick=()=>S.map.setView(S.center,14);setTimeout(()=>S.map.invalidateSize(),80)}catch(_){mapStatus.textContent='Die Karte konnte gerade nicht geladen werden.';mapEl.innerHTML='<div class="cit-map-loading">Karte momentan nicht verfügbar.</div>'}}
document.getElementById('cit-map-details').addEventListener('toggle',e=>{if(e.currentTarget.open)loadMap()});
load();setInterval(load,60000);
})();
</script>
'''


def _content() -> str:
    cfg = get_platform_snapshot()
    municipality = escape(cfg.get("municipality_name") or "Ahnsen")
    center_lat, center_lon = _platform_center()
    return (
        _CITIZEN_TEMPLATE
        .replace("__MUNICIPALITY__", municipality)
        .replace("__STOP_OPTIONS__", _stop_options())
        .replace("__LINE_CARDS__", _line_cards())
        .replace("__OFFICIAL_TIMETABLE__", OFFICIAL_TIMETABLE_URL)
        .replace("__OFFICIAL_LIVE__", OFFICIAL_LIVE_URL)
        .replace("__CENTER_LAT__", f"{center_lat:.6f}")
        .replace("__CENTER_LON__", f"{center_lon:.6f}")
    )


@router.get("/mobilitaet", name="citizen_mobility")
async def mobility_page():
    return page(
        "Bus & Mobilität",
        _content(),
        active="mobility",
        description="Nächste Busabfahrten und Tagesfahrplan für die Haltestellen in Ahnsen.",
        body_class="mob-citizen",
    )
