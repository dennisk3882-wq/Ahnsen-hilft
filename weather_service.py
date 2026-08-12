from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

import requests

from platform_runtime import get_platform_snapshot


DEFAULT_WEATHER_API_BASE = "https://api.open-meteo.com/v1/forecast"
DEFAULT_CACHE_SECONDS = 600
_WEATHER_LOCK = threading.Lock()
_WEATHER_CACHE: dict[str, Any] = {
    "key": None,
    "expires": 0.0,
    "data": None,
    "updated_at": None,
}


def _weather_code(code: Any, is_day: Any = 1) -> tuple[str, str]:
    try:
        value = int(code)
    except (TypeError, ValueError):
        return "Wetter", "🌤️"

    day = str(is_day).strip() not in {"0", "false", "False"}
    if value == 0:
        return ("Klar", "☀️") if day else ("Klar", "🌙")
    if value == 1:
        return ("Überwiegend klar", "🌤️") if day else ("Überwiegend klar", "🌙")
    if value == 2:
        return "Teilweise bewölkt", "⛅"
    if value == 3:
        return "Bewölkt", "☁️"
    if value in {45, 48}:
        return "Nebel", "🌫️"
    if value in {51, 53, 55, 56, 57}:
        return "Nieselregen", "🌦️"
    if value in {61, 63, 65, 66, 67}:
        return "Regen", "🌧️"
    if value in {71, 73, 75, 77}:
        return "Schnee", "❄️"
    if value in {80, 81, 82}:
        return "Regenschauer", "🌦️"
    if value in {85, 86}:
        return "Schneeschauer", "🌨️"
    if value in {95, 96, 99}:
        return "Gewitter", "⛈️"
    return "Wetter", "🌤️"


def _number(value: Any, digits: int = 0) -> float | int | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if digits <= 0:
        return int(round(number))
    return round(number, digits)


def _at(values: Any, index: int) -> Any:
    return values[index] if isinstance(values, list) and index < len(values) else None


def _normalize(payload: dict[str, Any], *, municipality: str, latitude: float, longitude: float) -> dict[str, Any]:
    current_raw = payload.get("current") if isinstance(payload.get("current"), dict) else {}
    current_label, current_symbol = _weather_code(current_raw.get("weather_code"), current_raw.get("is_day", 1))
    current = {
        "time": str(current_raw.get("time") or ""),
        "temperature": _number(current_raw.get("temperature_2m")),
        "feels_like": _number(current_raw.get("apparent_temperature")),
        "humidity": _number(current_raw.get("relative_humidity_2m")),
        "precipitation": _number(current_raw.get("precipitation"), 1),
        "wind": _number(current_raw.get("wind_speed_10m")),
        "weather_code": current_raw.get("weather_code"),
        "label": current_label,
        "symbol": current_symbol,
    }

    hourly_raw = payload.get("hourly") if isinstance(payload.get("hourly"), dict) else {}
    hourly_times = hourly_raw.get("time") if isinstance(hourly_raw.get("time"), list) else []
    hourly: list[dict[str, Any]] = []
    for index, stamp in enumerate(hourly_times):
        label, symbol = _weather_code(_at(hourly_raw.get("weather_code"), index), 1)
        hourly.append({
            "time": str(stamp or ""),
            "temperature": _number(_at(hourly_raw.get("temperature_2m"), index)),
            "feels_like": _number(_at(hourly_raw.get("apparent_temperature"), index)),
            "precipitation_probability": _number(_at(hourly_raw.get("precipitation_probability"), index)),
            "precipitation": _number(_at(hourly_raw.get("precipitation"), index), 1),
            "wind": _number(_at(hourly_raw.get("wind_speed_10m"), index)),
            "weather_code": _at(hourly_raw.get("weather_code"), index),
            "label": label,
            "symbol": symbol,
        })

    daily_raw = payload.get("daily") if isinstance(payload.get("daily"), dict) else {}
    daily_times = daily_raw.get("time") if isinstance(daily_raw.get("time"), list) else []
    daily: list[dict[str, Any]] = []
    for index, stamp in enumerate(daily_times):
        label, symbol = _weather_code(_at(daily_raw.get("weather_code"), index), 1)
        daily.append({
            "date": str(stamp or ""),
            "temperature_max": _number(_at(daily_raw.get("temperature_2m_max"), index)),
            "temperature_min": _number(_at(daily_raw.get("temperature_2m_min"), index)),
            "precipitation_probability_max": _number(_at(daily_raw.get("precipitation_probability_max"), index)),
            "sunrise": str(_at(daily_raw.get("sunrise"), index) or ""),
            "sunset": str(_at(daily_raw.get("sunset"), index) or ""),
            "weather_code": _at(daily_raw.get("weather_code"), index),
            "label": label,
            "symbol": symbol,
        })

    return {
        "available": bool(current.get("time") and current.get("temperature") is not None),
        "stale": False,
        "municipality": municipality,
        "latitude": latitude,
        "longitude": longitude,
        "timezone": str(payload.get("timezone") or get_platform_snapshot().get("timezone") or "Europe/Berlin"),
        "current": current,
        "hourly": hourly,
        "daily": daily[:6],
        "provider": "Open-Meteo",
        "provider_url": "https://open-meteo.com/",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "error": "",
    }


def _cache_seconds() -> int:
    try:
        value = int(str(os.getenv("WEATHER_CACHE_SECONDS", DEFAULT_CACHE_SECONDS) or DEFAULT_CACHE_SECONDS))
    except ValueError:
        value = DEFAULT_CACHE_SECONDS
    return max(120, min(value, 3600))


def _request_weather() -> dict[str, Any]:
    cfg = get_platform_snapshot()
    latitude = float(cfg.get("map_lat") or 52.258)
    longitude = float(cfg.get("map_lon") or 9.099)
    municipality = str(cfg.get("municipality_name") or "Ahnsen")
    timezone_name = str(cfg.get("timezone") or "Europe/Berlin")
    base_url = str(os.getenv("WEATHER_API_BASE") or DEFAULT_WEATHER_API_BASE).strip()
    api_key = str(os.getenv("WEATHER_API_KEY") or "").strip()

    params: dict[str, Any] = {
        "latitude": f"{latitude:.6f}",
        "longitude": f"{longitude:.6f}",
        "timezone": timezone_name,
        "forecast_days": 6,
        "current": ",".join((
            "temperature_2m",
            "apparent_temperature",
            "relative_humidity_2m",
            "precipitation",
            "weather_code",
            "wind_speed_10m",
            "is_day",
        )),
        "hourly": ",".join((
            "temperature_2m",
            "apparent_temperature",
            "precipitation_probability",
            "precipitation",
            "weather_code",
            "wind_speed_10m",
        )),
        "daily": ",".join((
            "weather_code",
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_probability_max",
            "sunrise",
            "sunset",
        )),
    }
    if api_key:
        params["apikey"] = api_key

    response = requests.get(
        base_url,
        params=params,
        headers={"Accept": "application/json", "User-Agent": "Ahnsen-hilft/1.0 weather"},
        timeout=5,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Wetterdienst lieferte keine gültigen Daten")
    return _normalize(payload, municipality=municipality, latitude=latitude, longitude=longitude)


def get_weather_snapshot(*, force: bool = False) -> dict[str, Any]:
    cfg = get_platform_snapshot()
    cache_key = (
        round(float(cfg.get("map_lat") or 52.258), 5),
        round(float(cfg.get("map_lon") or 9.099), 5),
        str(cfg.get("timezone") or "Europe/Berlin"),
        str(os.getenv("WEATHER_API_BASE") or DEFAULT_WEATHER_API_BASE),
        bool(str(os.getenv("WEATHER_API_KEY") or "").strip()),
    )
    now = time.monotonic()
    if not force and _WEATHER_CACHE.get("key") == cache_key and _WEATHER_CACHE.get("expires", 0) > now and _WEATHER_CACHE.get("data"):
        return dict(_WEATHER_CACHE["data"])

    with _WEATHER_LOCK:
        now = time.monotonic()
        if not force and _WEATHER_CACHE.get("key") == cache_key and _WEATHER_CACHE.get("expires", 0) > now and _WEATHER_CACHE.get("data"):
            return dict(_WEATHER_CACHE["data"])
        try:
            data = _request_weather()
        except Exception as error:
            previous = _WEATHER_CACHE.get("data") if _WEATHER_CACHE.get("key") == cache_key else None
            if isinstance(previous, dict) and previous.get("available"):
                stale = dict(previous)
                stale["stale"] = True
                stale["error"] = "Wetterdaten konnten gerade nicht aktualisiert werden. Zuletzt geladene Werte werden angezeigt."
                _WEATHER_CACHE.update({"expires": now + 120, "data": stale})
                return stale
            return {
                "available": False,
                "stale": False,
                "municipality": str(cfg.get("municipality_name") or "Ahnsen"),
                "latitude": float(cfg.get("map_lat") or 52.258),
                "longitude": float(cfg.get("map_lon") or 9.099),
                "timezone": str(cfg.get("timezone") or "Europe/Berlin"),
                "current": {},
                "hourly": [],
                "daily": [],
                "provider": "Open-Meteo",
                "provider_url": "https://open-meteo.com/",
                "updated_at": "",
                "error": f"Wetterdaten sind derzeit nicht erreichbar ({type(error).__name__}).",
            }

        _WEATHER_CACHE.update({
            "key": cache_key,
            "expires": now + _cache_seconds(),
            "data": data,
            "updated_at": data.get("updated_at"),
        })
        return dict(data)
