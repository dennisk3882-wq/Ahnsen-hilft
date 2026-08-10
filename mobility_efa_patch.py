from __future__ import annotations

import math
import os
import re
import time
import unicodedata
from datetime import datetime
from typing import Any

import requests

import mobility_citizen as legacy
from mobility_routes import LOCAL_TZ, _get_osm_stops, _platform_center
from platform_runtime import get_platform_snapshot


TRANSITOUS_BASE = os.getenv("MOBILITY_TRANSITOUS_BASE", "https://api.transitous.org").strip().rstrip("/")
EFA_DM_URL = os.getenv("MOBILITY_EFA_DM_URL", "https://www.efa.de/efa/XML_DM_REQUEST").strip()
CACHE_SECONDS = 90

# Schreibweisen aus regionalen/überregionalen Fahrplanauskünften. Sie dienen
# nur als Suchhilfen; die eigentliche Haltestellen-ID wird dynamisch ermittelt.
STOP_QUERIES: dict[str, tuple[str, ...]] = {
    "schule": (
        "Ahnsen(B Stadthagen) Schule",
        "Ahnsen Schule",
        "Ahnsen, Schule",
    ),
    "theodor-heuss": (
        "Ahnsen(B Stadthagen) Theodor Heuss Straße",
        "Ahnsen Theodor-Heuss-Straße",
        "Ahnsen, Theodor-Heuss-Straße",
    ),
    "haus-eix": (
        "Ahnsen(B Stadthagen) Haus Eix",
        "Ahnsen Haus Eix",
        "Ahnsen, Haus Eix",
    ),
    "dorfgemeinschaftshaus": (
        "Ahnsen(B Stadthagen) Dorfgemeinschaftshaus",
        "Ahnsen Dorfgemeinschaftshaus",
        "Ahnsen, Dorfgemeinschaftshaus",
    ),
    "klinikum": (
        "Vehlen Klinikum Schaumburg",
        "Obernkirchen Klinikum Schaumburg",
        "Klinikum Schaumburg",
    ),
    "schmiede": (
        "Ahnsen(B Stadthagen) Schmiede",
        "Ahnsen Schmiede",
        "Ahnsen, Schmiede",
    ),
    "wilhelmshoehe": (
        "Ahnsen(B Stadthagen) Wilhelmshöhe",
        "Ahnsen Wilhelmshöhe",
        "Ahnsen, Wilhelmshöhe",
    ),
}

_TRANSITOUS_STOP_CACHE: dict[str, tuple[float, dict[str, Any] | None]] = {}
_TRANSITOUS_DAY_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_EFA_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_legacy_fetch_day = legacy._fetch_day_for_stop
_legacy_content = legacy._content


def _headers(provider: str) -> dict[str, str]:
    cfg = get_platform_snapshot()
    contact = str(cfg.get("public_base_url") or "https://github.com/dennisk3882-wq/Ahnsen-hilft")
    return {
        "Accept": "application/json",
        "User-Agent": f"Ahnsen-hilft/3.1 ({provider}; {contact})",
    }


def _norm(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-zA-Z0-9]+", " ", text.casefold())
    return " ".join(text.split())


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def _parse_iso(value: Any) -> datetime | None:
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


def _generic_line(value: object) -> str:
    match = re.search(r"(?<!\d)(\d{3,4})(?!\d)", str(value or ""))
    return match.group(1) if match else str(value or "").strip()[:12]


def _known_coordinates(stop: dict[str, Any]) -> tuple[float, float] | None:
    try:
        for item in _get_osm_stops():
            if item.get("key") != stop.get("key"):
                continue
            lat, lon = float(item["lat"]), float(item["lon"])
            return lat, lon
    except Exception:
        pass
    return None


def _match_score(item: dict[str, Any], stop: dict[str, Any], query: str) -> float:
    if str(item.get("type") or "").upper() != "STOP":
        return -999.0
    item_id = str(item.get("id") or "").strip()
    if not item_id:
        return -999.0
    name = str(item.get("name") or "").strip()
    actual, wanted = _norm(name), _norm(query)
    score = float(item.get("score") or 0) / 1000.0
    if actual == wanted:
        score += 180
    elif actual and (actual in wanted or wanted in actual):
        score += 105
    wanted_words = set(_norm(stop.get("name")).split())
    score += len(wanted_words & set(actual.split())) * 14
    modes = {str(value).upper() for value in (item.get("modes") or [])}
    if "BUS" in modes:
        score += 35
    coords = _known_coordinates(stop)
    if coords:
        try:
            distance = _haversine(coords[0], coords[1], float(item["lat"]), float(item["lon"]))
            if distance > 8:
                return -999.0
            score += max(0.0, 60.0 - distance * 18)
        except (KeyError, TypeError, ValueError):
            pass
    return score


def _resolve_transitous_stop(stop: dict[str, Any]) -> dict[str, Any] | None:
    cached = _TRANSITOUS_STOP_CACHE.get(stop["key"])
    if cached and cached[0] > time.monotonic():
        return dict(cached[1]) if cached[1] else None

    candidates: list[tuple[float, dict[str, Any]]] = []
    coords = _known_coordinates(stop)

    # Koordinaten sind stabiler als Schreibweisen. Zuerst wird daher direkt um
    # die öffentliche OSM-Haltestelle herum nach einem Fahrplanhalt gesucht.
    if coords:
        try:
            response = requests.get(
                f"{TRANSITOUS_BASE}/api/v1/reverse-geocode",
                params={"place": f"{coords[0]:.6f},{coords[1]:.6f}", "type": "STOP"},
                headers=_headers("Transitous reverse geocode"),
                timeout=8,
            )
            response.raise_for_status()
            payload = response.json()
            if isinstance(payload, list):
                for item in payload:
                    if isinstance(item, dict):
                        score = _match_score(item, stop, stop["name"])
                        if score > -900:
                            candidates.append((score + 30, item))
        except Exception:
            pass

    center_lat, center_lon = _platform_center()
    for query in STOP_QUERIES.get(stop["key"], (stop["name"],)):
        try:
            response = requests.get(
                f"{TRANSITOUS_BASE}/api/v1/geocode",
                params={
                    "text": query,
                    "language": "de",
                    "type": "STOP",
                    "place": f"{center_lat:.6f},{center_lon:.6f}",
                    "placeBias": 4,
                },
                headers=_headers("Transitous geocode"),
                timeout=8,
            )
            response.raise_for_status()
            payload = response.json()
        except Exception:
            continue
        if not isinstance(payload, list):
            continue
        for item in payload:
            if not isinstance(item, dict):
                continue
            score = _match_score(item, stop, query)
            if score > -900:
                candidates.append((score, item))
        if candidates and max(candidates, key=lambda row: row[0])[0] >= 160:
            break

    if candidates:
        _, best = max(candidates, key=lambda row: row[0])
        resolved = {
            "id": str(best.get("id") or "").strip(),
            "name": str(best.get("name") or stop["name"]).strip(),
            "lat": best.get("lat"),
            "lon": best.get("lon"),
        }
    else:
        resolved = None

    _TRANSITOUS_STOP_CACHE[stop["key"]] = (
        time.monotonic() + (24 * 60 * 60 if resolved else 3 * 60),
        resolved,
    )
    return dict(resolved) if resolved else None


def _normalize_transitous(raw: dict[str, Any], stop: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    if str(raw.get("mode") or "").upper() not in {"BUS", "COACH", "FLEX"}:
        return None
    place = raw.get("place") or {}
    if not isinstance(place, dict):
        return None
    actual = _parse_iso(place.get("departure") or place.get("arrival"))
    planned = _parse_iso(place.get("scheduledDeparture") or place.get("scheduledArrival") or place.get("departure"))
    if not actual or not planned or planned.date() != now.date():
        return None

    line = _generic_line(raw.get("routeShortName") or raw.get("displayName") or raw.get("tripShortName"))
    if not line:
        return None
    trip_to = raw.get("tripTo") or {}
    direction = str(raw.get("headsign") or (trip_to.get("name") if isinstance(trip_to, dict) else "") or "Richtung laut Fahrplan").strip()
    delay = int(round((actual - planned).total_seconds() / 60))
    cancelled = bool(raw.get("cancelled") or raw.get("tripCancelled"))
    realtime = bool(raw.get("realTime"))
    return {
        "stop_key": stop["key"],
        "stop_name": stop["name"],
        "line": line,
        "direction": direction,
        "when": actual.isoformat(),
        "planned_when": planned.isoformat(),
        "time": actual.strftime("%H:%M"),
        "planned_time": planned.strftime("%H:%M"),
        "delay_minutes": delay,
        "minutes": int(math.ceil((actual - now).total_seconds() / 60)),
        "cancelled": cancelled,
        "realtime": realtime,
        "past": actual < now,
        "source": "Transitous",
    }


def _fetch_transitous(stop: dict[str, Any]) -> dict[str, Any] | None:
    now = legacy._now()
    cache_key = f"{stop['key']}:{now.date().isoformat()}"
    cached = _TRANSITOUS_DAY_CACHE.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return dict(cached[1])

    resolved = _resolve_transitous_stop(stop)
    if not resolved:
        return None

    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        response = requests.get(
            f"{TRANSITOUS_BASE}/api/v5/stoptimes",
            params={
                "stopId": resolved["id"],
                "time": start.isoformat(),
                "arriveBy": "false",
                "direction": "LATER",
                "mode": "BUS,FLEX",
                "n": 220,
                "language": "de",
            },
            headers=_headers("Transitous stoptimes"),
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None
    departures = []
    for raw in payload.get("stopTimes") or []:
        if not isinstance(raw, dict):
            continue
        item = _normalize_transitous(raw, stop, now)
        if item:
            departures.append(item)

    departures = sorted(
        {
            (item["line"], item["planned_when"], item["direction"]): item
            for item in departures
        }.values(),
        key=lambda item: item["when"],
    )
    result = {
        "status": "ok" if departures else "empty",
        "message": (
            f"{len(departures)} Abfahrten für heute gefunden."
            if departures
            else "Für diese Haltestelle sind heute keine Busabfahrten hinterlegt."
        ),
        "stop": {**stop, "resolved_name": resolved.get("name")},
        "departures": departures,
        "generated_at": now.isoformat(),
        "provider": "Transitous",
    }
    _TRANSITOUS_DAY_CACHE[cache_key] = (time.monotonic() + CACHE_SECONDS, result)
    return dict(result)


# ---- EFA fallback ---------------------------------------------------------

def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    return []


def _efa_datetime(value: Any) -> datetime | None:
    if not isinstance(value, dict):
        return None
    try:
        return datetime(
            int(value["year"]), int(value["month"]), int(value["day"]),
            int(value.get("hour", 0)), int(value.get("minute", 0)),
            int(value.get("second", 0) or 0), tzinfo=LOCAL_TZ,
        )
    except (KeyError, TypeError, ValueError):
        return None


def _efa_line(serving: dict[str, Any]) -> str:
    for key in ("number", "symbol", "name", "trainNum", "product"):
        line = _generic_line(serving.get(key))
        if line:
            return line
    return ""


def _efa_request(name: str, when: datetime, limit: int = 100) -> dict[str, Any] | None:
    params = {
        "outputFormat": "JSON", "language": "de", "mode": "direct",
        "type_dm": "stop", "name_dm": name, "useRealtime": "1",
        "useAllStops": "1", "dmLineSelectionAll": "1", "depArr": "departure",
        "itdDateYear": when.year, "itdDateMonth": when.month, "itdDateDay": when.day,
        "itdTimeHour": when.hour, "itdTimeMinute": when.minute, "limit": limit,
    }
    try:
        response = requests.get(EFA_DM_URL, params=params, headers=_headers("EFA fallback"), timeout=9)
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _normalize_efa(raw: dict[str, Any], stop: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    serving = raw.get("servingLine") or {}
    if not isinstance(serving, dict):
        return None
    line = _efa_line(serving)
    if not line:
        return None
    planned = _efa_datetime(raw.get("dateTime"))
    actual = _efa_datetime(raw.get("realDateTime")) or planned
    if not planned or not actual or planned.date() != now.date():
        return None
    direction = str(serving.get("direction") or serving.get("destination") or "Richtung laut Fahrplan").strip()
    delay = int(round((actual - planned).total_seconds() / 60))
    realtime = raw.get("realDateTime") is not None
    status = str(raw.get("realtimeStatus") or serving.get("realtimeStatus") or "").casefold()
    cancelled = bool(raw.get("cancelled")) or "cancel" in status or "ausfall" in status
    return {
        "stop_key": stop["key"], "stop_name": stop["name"], "line": line,
        "direction": direction, "when": actual.isoformat(), "planned_when": planned.isoformat(),
        "time": actual.strftime("%H:%M"), "planned_time": planned.strftime("%H:%M"),
        "delay_minutes": delay, "minutes": int(math.ceil((actual - now).total_seconds() / 60)),
        "cancelled": cancelled, "realtime": realtime, "past": actual < now, "source": "EFA",
    }


def _fetch_efa(stop: dict[str, Any]) -> dict[str, Any] | None:
    now = legacy._now()
    cache_key = f"{stop['key']}:{now.date().isoformat()}"
    cached = _EFA_CACHE.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return dict(cached[1])
    for name in STOP_QUERIES.get(stop["key"], (stop["name"],)):
        raw_items: list[dict[str, Any]] = []
        successful = False
        for hour in (0, 6, 12, 18):
            payload = _efa_request(name, now.replace(hour=hour, minute=0, second=0, microsecond=0))
            if not payload:
                continue
            successful = True
            raw_items.extend(item for item in _as_list(payload.get("departureList")) if isinstance(item, dict))
        if not successful:
            continue
        departures = [item for raw in raw_items if (item := _normalize_efa(raw, stop, now))]
        departures = sorted(
            {(x["line"], x["planned_when"], x["direction"]): x for x in departures}.values(),
            key=lambda x: x["when"],
        )
        if not departures:
            continue
        result = {
            "status": "ok", "message": f"{len(departures)} Abfahrten für heute gefunden.",
            "stop": stop, "departures": departures, "generated_at": now.isoformat(), "provider": "EFA",
        }
        _EFA_CACHE[cache_key] = (time.monotonic() + CACHE_SECONDS, result)
        return dict(result)
    return None


def fetch_day(stop: dict[str, Any]) -> dict[str, Any]:
    transitous = _fetch_transitous(stop)
    if transitous is not None and transitous.get("status") == "ok":
        return transitous
    efa = _fetch_efa(stop)
    if efa is not None and efa.get("status") == "ok":
        return efa
    if transitous is not None:
        return transitous
    fallback = dict(_legacy_fetch_day(stop))
    fallback["provider"] = fallback.get("provider") or "Fahrplanauskunft-Fallback"
    if fallback.get("status") == "error":
        fallback["message"] = "Die Fahrplanauskunft ist gerade nicht erreichbar. Bitte später erneut aktualisieren."
    return fallback


def content() -> str:
    # Verhindert den auf dem Handy sichtbaren horizontalen Seitenversatz. Nur
    # die kleinen Linienfilter dürfen innerhalb ihrer Zeile horizontal scrollen.
    mobile_fix = """
<style>
html,body,.mob-citizen{max-width:100%;overflow-x:hidden!important}
.mob-citizen *{box-sizing:border-box}
.mob-citizen .app-main,.cit-board,.cit-day,.cit-map-details,.cit-lines{width:100%;max-width:100%!important;min-width:0!important;overflow-x:hidden}
.cit-stop-row,.cit-day-head,.cit-filters,.cit-title-row{min-width:0!important;max-width:100%!important}
.cit-stop-select,.cit-direction{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
.cit-line-filters{width:100%;max-width:100%!important;overflow-x:auto!important;overflow-y:hidden!important;overscroll-behavior-inline:contain}
.cit-day-head>div,.cit-title-row>div,.cit-route{min-width:0!important}.cit-day-head h2{overflow-wrap:anywhere}
.cit-data-credit{margin:12px 2px 0;color:var(--muted);font-size:.68rem;line-height:1.4}.cit-data-credit a{color:var(--forest);font-weight:800}
</style>
"""
    html = _legacy_content()
    credit = '<p class="cit-data-credit">Fahrplandaten aus offenen ÖPNV-Daten · <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Datenquellen</a></p>'
    html = html.replace('</section>\n<script>\n(() => {', f'{credit}</section>\n<script>\n(() => {{', 1)
    return mobile_fix + html


legacy._fetch_day_for_stop = fetch_day
legacy._content = content
router = legacy.router
