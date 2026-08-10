from __future__ import annotations

import math
import os
import re
import time
from datetime import datetime
from typing import Any

import requests

import mobility_citizen as legacy
from mobility_routes import LOCAL_TZ


EFA_DM_URL = os.getenv(
    "MOBILITY_EFA_DM_URL",
    "https://www.efa.de/efa/XML_DM_REQUEST",
).strip()
EFA_CACHE_SECONDS = 90

# Exakte Namen aus der öffentlichen Fahrplanauskunft zuerst. Kürzere Varianten
# bleiben als Fallback, falls der Datenbestand die Schreibweise ändert.
EFA_STOP_QUERIES: dict[str, tuple[tuple[str, str], ...]] = {
    "schule": (
        ("", "Ahnsen(B Stadthagen) Schule"),
        ("Ahnsen", "Schule"),
        ("", "Ahnsen Schule"),
    ),
    "theodor-heuss": (
        ("", "Ahnsen(B Stadthagen) Theodor Heuss Straße"),
        ("Ahnsen", "Theodor Heuss Straße"),
        ("", "Ahnsen, Theodor Heuss Str."),
    ),
    "haus-eix": (
        ("", "Ahnsen(B Stadthagen) Haus Eix"),
        ("Ahnsen", "Haus Eix"),
        ("", "Ahnsen Haus Eix"),
    ),
    "dorfgemeinschaftshaus": (
        ("", "Ahnsen(B Stadthagen) Dorfgemeinschaftshaus"),
        ("Ahnsen", "Dorfgemeinschaftshaus"),
        ("", "Ahnsen, Dorfgemeinschaftshaus"),
    ),
    "klinikum": (
        ("", "Vehlen (Obernkirch.), Klinikum Schaumburg"),
        ("Obernkirchen", "Klinikum Schaumburg"),
        ("", "Obernkirchen-Vehlen Klinikum Schaumburg"),
    ),
    "schmiede": (
        ("", "Ahnsen(B Stadthagen) Schmiede"),
        ("Ahnsen", "Schmiede"),
        ("", "Ahnsen Schmiede"),
    ),
    "wilhelmshoehe": (
        ("", "Ahnsen(B Stadthagen) Wilhelmshöhe"),
        ("Ahnsen", "Wilhelmshöhe"),
        ("", "Ahnsen Wilhelmshöhe"),
    ),
}

_EFA_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_legacy_fetch_day = legacy._fetch_day_for_stop
_legacy_content = legacy._content


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
            int(value["year"]),
            int(value["month"]),
            int(value["day"]),
            int(value.get("hour", 0)),
            int(value.get("minute", 0)),
            int(value.get("second", 0) or 0),
            tzinfo=LOCAL_TZ,
        )
    except (KeyError, TypeError, ValueError):
        return None


def _line_number(serving: dict[str, Any]) -> str:
    for key in ("number", "symbol", "name", "trainNum", "product"):
        value = str(serving.get(key) or "").strip()
        match = re.search(r"(?<!\d)(\d{3,4})(?!\d)", value)
        if match:
            return match.group(1)
    return ""


def _is_bus(serving: dict[str, Any]) -> bool:
    mot = str(serving.get("motType") or "").strip()
    if mot in {"5", "6", "7", "10", "11", "19", "20", "21"}:
        return True
    text = " ".join(
        str(serving.get(key) or "")
        for key in ("name", "trainType", "product", "type")
    ).casefold()
    return any(word in text for word in ("bus", "regionalbus", "stadtbus", "rufbus", "alf"))


def _request(place: str, name: str, when: datetime, limit: int = 80) -> dict[str, Any] | None:
    params: dict[str, Any] = {
        "outputFormat": "JSON",
        "language": "de",
        "mode": "direct",
        "type_dm": "stop",
        "name_dm": name,
        "useRealtime": "1",
        "useAllStops": "1",
        "dmLineSelectionAll": "1",
        "depArr": "departure",
        "itdDateYear": when.year,
        "itdDateMonth": when.month,
        "itdDateDay": when.day,
        "itdTimeHour": when.hour,
        "itdTimeMinute": when.minute,
        "limit": limit,
    }
    if place:
        params["place_dm"] = place
    try:
        response = requests.get(
            EFA_DM_URL,
            params=params,
            headers={
                "Accept": "application/json",
                "User-Agent": "Ahnsen-hilft/3.0 mobility-efa",
            },
            timeout=9,
        )
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _resolved(payload: dict[str, Any]) -> bool:
    if _as_list(payload.get("departureList")):
        return True
    dm = payload.get("dm") or {}
    if not isinstance(dm, dict):
        return False
    points = _as_list(dm.get("points"))
    if len(points) == 1:
        return True
    input_data = dm.get("input") or {}
    return (
        isinstance(input_data, dict)
        and bool(str(input_data.get("input") or "").strip())
        and not points
    )


def _normalize(raw: dict[str, Any], stop: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    serving = raw.get("servingLine") or {}
    if not isinstance(serving, dict) or not _is_bus(serving):
        return None
    line = _line_number(serving)
    if not line:
        return None

    planned = _efa_datetime(raw.get("dateTime"))
    actual = _efa_datetime(raw.get("realDateTime")) or planned
    if not planned or not actual or planned.date() != now.date():
        return None

    direction = str(
        serving.get("direction")
        or serving.get("destination")
        or serving.get("directionTo")
        or "Richtung laut Fahrplan"
    ).strip()

    delay_raw = serving.get("delay")
    try:
        delay = (
            int(delay_raw)
            if delay_raw not in (None, "")
            else int(round((actual - planned).total_seconds() / 60))
        )
    except (TypeError, ValueError):
        delay = int(round((actual - planned).total_seconds() / 60))

    rt_status = str(
        raw.get("realtimeStatus") or serving.get("realtimeStatus") or ""
    ).casefold()
    cancelled = (
        bool(raw.get("cancelled"))
        or "cancel" in rt_status
        or "ausfall" in rt_status
    )
    realtime = (
        raw.get("realDateTime") is not None
        or str(serving.get("realtime") or "") in {"1", "true", "True"}
    )

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
        "source": "EFA",
    }


def _fetch_efa(stop: dict[str, Any]) -> dict[str, Any] | None:
    now = legacy._now()
    cache_key = f"{stop['key']}:{now.date().isoformat()}"
    cached = _EFA_CACHE.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return dict(cached[1])

    chosen: tuple[str, str] | None = None
    probe_payload: dict[str, Any] | None = None
    probe_time = now.replace(hour=12, minute=0, second=0, microsecond=0)

    for place, name in EFA_STOP_QUERIES.get(stop["key"], (("", stop["name"]),)):
        payload = _request(place, name, probe_time, 50)
        if payload and _resolved(payload):
            chosen = (place, name)
            probe_payload = payload
            break

    if not chosen:
        return None

    raw_items: list[dict[str, Any]] = []
    if probe_payload:
        raw_items.extend(
            item
            for item in _as_list(probe_payload.get("departureList"))
            if isinstance(item, dict)
        )

    # Mehrere Tagesanker statt eines providerabhängigen 24h-Zeitfensters.
    for hour in (0, 6, 18):
        when = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        payload = _request(chosen[0], chosen[1], when, 100)
        if not payload:
            continue
        raw_items.extend(
            item
            for item in _as_list(payload.get("departureList"))
            if isinstance(item, dict)
        )

    departures = []
    for raw in raw_items:
        item = _normalize(raw, stop, now)
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
        "stop": stop,
        "departures": departures,
        "generated_at": now.isoformat(),
        "provider": "EFA",
    }
    _EFA_CACHE[cache_key] = (time.monotonic() + EFA_CACHE_SECONDS, result)
    return dict(result)


def fetch_day(stop: dict[str, Any]) -> dict[str, Any]:
    efa = _fetch_efa(stop)
    if efa is not None:
        return efa
    fallback = _legacy_fetch_day(stop)
    fallback = dict(fallback)
    fallback["provider"] = fallback.get("provider") or "Fahrplanauskunft-Fallback"
    if fallback.get("status") == "error":
        fallback["message"] = (
            "Die Fahrplanauskunft ist gerade nicht erreichbar. Bitte später erneut aktualisieren."
        )
    return fallback


def content() -> str:
    # Verhindert den auf dem Handy sichtbaren horizontalen Seitenversatz der
    # Tagesansicht. Nur die Filter-Chips selbst dürfen horizontal scrollen.
    mobile_fix = """
<style>
.mob-citizen{overflow-x:hidden!important}
.mob-citizen *{box-sizing:border-box}
.mob-citizen .app-main,.cit-board,.cit-day,.cit-map-details,.cit-lines{max-width:100%!important;min-width:0!important;overflow-x:hidden}
.cit-stop-row,.cit-day-head,.cit-filters{min-width:0!important;max-width:100%!important}
.cit-stop-select,.cit-direction{display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
.cit-line-filters{max-width:100%!important;overflow-x:auto!important;overflow-y:hidden!important}
.cit-day-head>div{min-width:0!important}.cit-day-head h2{overflow-wrap:anywhere}
</style>
"""
    return mobile_fix + _legacy_content()


legacy._fetch_day_for_stop = fetch_day
legacy._content = content
router = legacy.router
