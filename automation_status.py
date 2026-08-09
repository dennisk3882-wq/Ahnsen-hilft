from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests


BASE_DIR = Path(__file__).resolve().parent
RATS_MANIFEST = BASE_DIR / "static" / "ratsarchive-seed" / "manifest.json"
GITHUB_REPOSITORY = os.getenv("GITHUB_AUTOMATION_REPOSITORY", "dennisk3882-wq/Ahnsen-hilft")
RATS_WORKFLOW = os.getenv("GITHUB_RATSARCHIVE_WORKFLOW", "ratsarchive-sync.yml")
GITHUB_ACTIONS_TOKEN = os.getenv("GITHUB_ACTIONS_TOKEN", "").strip()
_CACHE_LOCK = threading.Lock()
_CACHE: dict[str, Any] = {"at": 0.0, "value": None}
CACHE_SECONDS = 180


def _parse_github_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _local_time_label(value: datetime | None) -> str:
    if value is None:
        return "Noch kein Lauf"
    return value.astimezone(ZoneInfo("Europe/Berlin")).strftime("%d.%m.%Y · %H:%M Uhr")


def _next_rats_run(now: datetime | None = None) -> datetime:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    candidate = current.replace(hour=4, minute=17, second=0, microsecond=0)
    if candidate <= current:
        candidate += timedelta(days=1)
    return candidate


def _manifest_metrics() -> dict[str, Any]:
    result = {"meeting_count": 0, "pdf_count": 0, "latest_meeting": "–"}
    try:
        payload = json.loads(RATS_MANIFEST.read_text(encoding="utf-8"))
        meetings = list(payload.get("meetings") or [])
        result["meeting_count"] = len(meetings)
        result["pdf_count"] = sum(1 for item in meetings if str(item.get("filename") or "").strip())
        dated = sorted(
            (item for item in meetings if str(item.get("date") or "").strip()),
            key=lambda item: str(item.get("date") or ""),
            reverse=True,
        )
        if dated:
            raw = str(dated[0].get("date") or "")
            try:
                result["latest_meeting"] = datetime.strptime(raw, "%Y-%m-%d").strftime("%d.%m.%Y")
            except ValueError:
                result["latest_meeting"] = raw
    except Exception:
        pass
    return result


def _github_runs() -> list[dict[str, Any]]:
    url = f"https://api.github.com/repos/{GITHUB_REPOSITORY}/actions/workflows/{RATS_WORKFLOW}/runs"
    response = requests.get(
        url,
        params={"per_page": 10},
        headers={"Accept": "application/vnd.github+json", "User-Agent": "Ahnsen-hilft-systemstatus"},
        timeout=5,
    )
    response.raise_for_status()
    payload = response.json()
    return list(payload.get("workflow_runs") or [])


def _ratsarchive_status() -> dict[str, Any]:
    metrics = _manifest_metrics()
    now = datetime.now(timezone.utc)
    latest = None
    latest_success = None
    api_error = ""
    try:
        runs = _github_runs()
        latest = runs[0] if runs else None
        latest_success = next((run for run in runs if run.get("conclusion") == "success"), None)
    except Exception as error:
        api_error = f"GitHub-Status derzeit nicht abrufbar: {type(error).__name__}"

    latest_at = _parse_github_time((latest or {}).get("updated_at") or (latest or {}).get("run_started_at"))
    success_at = _parse_github_time((latest_success or {}).get("updated_at") or (latest_success or {}).get("run_started_at"))
    conclusion = str((latest or {}).get("conclusion") or "")
    run_status = str((latest or {}).get("status") or "")

    if api_error:
        status = "warn"
        detail = api_error
    elif latest and run_status in {"queued", "in_progress", "waiting", "pending"}:
        status = "ok"
        detail = "Synchronisierung läuft gerade."
    elif latest and conclusion == "failure":
        status = "error"
        detail = "Der letzte Ratsarchiv-Lauf ist fehlgeschlagen."
    elif latest and conclusion in {"cancelled", "timed_out", "action_required"}:
        status = "warn"
        detail = f"Letzter Lauf: {conclusion}."
    elif success_at and now - success_at > timedelta(hours=48):
        status = "warn"
        detail = "Der letzte erfolgreiche Lauf ist älter als 48 Stunden."
    elif latest_success:
        status = "ok"
        detail = "Der tägliche Ratsarchiv-Abgleich arbeitet planmäßig."
    else:
        status = "warn"
        detail = "Automatik ist eingerichtet; ein erfolgreicher planmäßiger Lauf ist noch nicht protokolliert."

    next_run = _next_rats_run(now)
    return {
        "key": "ratsarchive",
        "name": "Ratsarchiv · SD.NET",
        "status": status,
        "detail": detail,
        "schedule": "täglich · 04:17 UTC",
        "next_run": _local_time_label(next_run),
        "last_run": _local_time_label(latest_at),
        "last_success": _local_time_label(success_at),
        "latest_conclusion": conclusion or run_status or "noch kein Lauf",
        "meeting_count": metrics["meeting_count"],
        "pdf_count": metrics["pdf_count"],
        "latest_meeting": metrics["latest_meeting"],
        "run_url": str((latest or {}).get("html_url") or ""),
        "manual_enabled": bool(GITHUB_ACTIONS_TOKEN),
    }


def get_automation_status(force: bool = False) -> list[dict[str, Any]]:
    now = time.monotonic()
    with _CACHE_LOCK:
        cached = _CACHE.get("value")
        if not force and cached is not None and now - float(_CACHE.get("at") or 0) < CACHE_SECONDS:
            return [dict(item) for item in cached]
        value = [_ratsarchive_status()]
        _CACHE["at"] = now
        _CACHE["value"] = value
        return [dict(item) for item in value]


def trigger_ratsarchive_sync() -> tuple[bool, str]:
    if not GITHUB_ACTIONS_TOKEN:
        return False, "Manueller Start ist nicht konfiguriert. Der tägliche automatische Lauf bleibt aktiv."
    url = f"https://api.github.com/repos/{GITHUB_REPOSITORY}/actions/workflows/{RATS_WORKFLOW}/dispatches"
    try:
        response = requests.post(
            url,
            json={"ref": "main"},
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {GITHUB_ACTIONS_TOKEN}",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "Ahnsen-hilft-systemstatus",
            },
            timeout=8,
        )
        if response.status_code == 204:
            with _CACHE_LOCK:
                _CACHE["at"] = 0.0
                _CACHE["value"] = None
            return True, "Ratsarchiv-Synchronisierung wurde gestartet."
        return False, f"GitHub hat den manuellen Start abgelehnt (HTTP {response.status_code})."
    except requests.RequestException as error:
        return False, f"Manueller Start nicht möglich: {type(error).__name__}."
