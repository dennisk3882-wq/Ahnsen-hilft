from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timedelta
from urllib.parse import urlparse

import requests


OFFICIAL_INFO_URL = "https://www.samtgemeinde-eilsen.de/content/samtgemeinde/politik/ratsinformationssystem.html"
OFFICIAL_PORTAL_URL = "https://samtgemeinde-eilsen.ratsinfomanagement.net/"
DEFAULT_LOOKBACK_YEARS = 5
CACHE_SECONDS = max(60, int(os.getenv("RATSINFO_CACHE_SECONDS", "600") or "600"))
OPARL_SYSTEM_URL = os.getenv("RATSINFO_OPARL_SYSTEM_URL", "").strip()
ORGANIZATION_MATCH = os.getenv("RATSINFO_ORGANIZATION_MATCH", "Ahnsen").strip() or "Ahnsen"
REQUEST_TIMEOUT = max(3, int(os.getenv("RATSINFO_TIMEOUT_SECONDS", "8") or "8"))
MAX_LIST_PAGES = max(1, min(50, int(os.getenv("RATSINFO_MAX_LIST_PAGES", "15") or "15")))
MAX_MEETINGS = max(20, min(1000, int(os.getenv("RATSINFO_MAX_MEETINGS", "350") or "350")))

_cache_lock = threading.Lock()
_cache: dict[str, object] = {"expires": 0.0, "snapshot": None}


def _safe_url(value) -> str:
    value = str(value or "").strip()
    if not value:
        return ""
    parsed = urlparse(value)
    return value if parsed.scheme in {"http", "https"} and parsed.netloc else ""


def _json(url: str) -> dict:
    response = requests.get(
        url,
        headers={
            "Accept": "application/json, application/ld+json;q=0.9",
            "User-Agent": "Ahnsen-hilft/1.0 (+https://ahnsen-hilft.onrender.com)",
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("OParl-Antwort ist kein JSON-Objekt")
    return payload


def _external_list(url: str, *, limit: int = MAX_MEETINGS) -> list[dict]:
    items: list[dict] = []
    next_url = _safe_url(url)
    seen: set[str] = set()
    pages = 0
    while next_url and next_url not in seen and pages < MAX_LIST_PAGES and len(items) < limit:
        seen.add(next_url)
        payload = _json(next_url)
        data = payload.get("data") or []
        if isinstance(data, list):
            items.extend(item for item in data if isinstance(item, dict))
        links = payload.get("links") or {}
        next_url = _safe_url(links.get("next")) if isinstance(links, dict) else ""
        pages += 1
    return items[:limit]


def _dt(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _file_entry(file_obj, kind: str) -> dict | None:
    if not isinstance(file_obj, dict):
        return None
    access = _safe_url(file_obj.get("accessUrl"))
    download = _safe_url(file_obj.get("downloadUrl"))
    web = _safe_url(file_obj.get("web"))
    target = download or access or web
    if not target:
        return None
    return {
        "kind": kind,
        "name": str(file_obj.get("name") or file_obj.get("fileName") or kind).strip()[:180],
        "url": access or web or target,
        "download_url": download or target,
        "mime_type": str(file_obj.get("mimeType") or "").strip()[:80],
    }


def _meeting_documents(meeting: dict) -> list[dict]:
    result: list[dict] = []
    for key, kind in (
        ("invitation", "Einladung / Tagesordnung"),
        ("resultsProtocol", "Niederschrift / Ergebnisprotokoll"),
        ("verbatimProtocol", "Wortprotokoll"),
    ):
        entry = _file_entry(meeting.get(key), kind)
        if entry:
            result.append(entry)
    for item in meeting.get("auxiliaryFile") or []:
        entry = _file_entry(item, "Anlage")
        if entry:
            result.append(entry)
    seen: set[str] = set()
    unique = []
    for item in result:
        key = item.get("download_url") or item.get("url")
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def _agenda(meeting: dict) -> list[dict]:
    rows = []
    for item in meeting.get("agendaItem") or []:
        if not isinstance(item, dict):
            continue
        public = item.get("public")
        if public is False:
            continue
        resolution_file = _file_entry(item.get("resolutionFile"), "Beschluss")
        rows.append(
            {
                "number": str(item.get("number") or "").strip()[:40],
                "name": str(item.get("name") or "Tagesordnungspunkt").strip()[:500],
                "result": str(item.get("result") or "").strip()[:2000],
                "resolution_text": str(item.get("resolutionText") or "").strip()[:4000],
                "resolution_file": resolution_file,
            }
        )
    return rows


def _meeting_location(meeting: dict) -> str:
    location = meeting.get("location")
    if isinstance(location, dict):
        for key in ("description", "room", "streetAddress"):
            value = str(location.get(key) or "").strip()
            if value:
                return value[:240]
    return ""


def _organization_map(body: dict) -> dict[str, str]:
    url = _safe_url(body.get("organization"))
    if not url:
        return {}
    result = {}
    try:
        for item in _external_list(url, limit=500):
            item_id = _safe_url(item.get("id"))
            name = str(item.get("name") or item.get("shortName") or "").strip()
            if item_id and name:
                result[item_id] = name
    except Exception:
        return {}
    return result


def _meeting_urls_for_body(body: dict, organizations: dict[str, str]) -> list[str]:
    match = ORGANIZATION_MATCH.casefold()
    urls = []
    org_list_url = _safe_url(body.get("organization"))
    if org_list_url:
        try:
            for org in _external_list(org_list_url, limit=500):
                name = str(org.get("name") or org.get("shortName") or "")
                if match in name.casefold():
                    url = _safe_url(org.get("meeting"))
                    if url:
                        urls.append(url)
        except Exception:
            pass
    if urls:
        return list(dict.fromkeys(urls))
    body_meeting = _safe_url(body.get("meeting"))
    return [body_meeting] if body_meeting else []


def _meeting_matches(meeting: dict, organizations: dict[str, str], body_name: str) -> bool:
    needle = ORGANIZATION_MATCH.casefold()
    if needle in body_name.casefold():
        return True
    if needle in str(meeting.get("name") or "").casefold():
        return True
    for org_url in meeting.get("organization") or []:
        if needle in organizations.get(str(org_url), "").casefold():
            return True
    return False


def _load_oparl_snapshot() -> dict:
    system = _json(OPARL_SYSTEM_URL)
    body_url = _safe_url(system.get("body"))
    if not body_url:
        raise ValueError("OParl-System enthält keine Body-Liste")
    bodies = _external_list(body_url, limit=50)
    if not bodies:
        raise ValueError("OParl liefert keine Körperschaften")

    cutoff = datetime.now().date() - timedelta(days=366 * DEFAULT_LOOKBACK_YEARS)
    meetings: list[dict] = []
    meeting_ids: set[str] = set()

    for body in bodies:
        body_name = str(body.get("name") or body.get("shortName") or "")
        organizations = _organization_map(body)
        for meeting_url in _meeting_urls_for_body(body, organizations):
            try:
                raw_meetings = _external_list(meeting_url, limit=MAX_MEETINGS)
            except Exception:
                continue
            for meeting in raw_meetings:
                if not _meeting_matches(meeting, organizations, body_name):
                    continue
                start = _dt(meeting.get("start"))
                if start and start.date() < cutoff:
                    continue
                meeting_id = _safe_url(meeting.get("id")) or str(meeting.get("name") or "") + str(meeting.get("start") or "")
                if meeting_id in meeting_ids:
                    continue
                meeting_ids.add(meeting_id)
                organization_names = [
                    organizations.get(str(org), "")
                    for org in (meeting.get("organization") or [])
                    if organizations.get(str(org), "")
                ]
                meetings.append(
                    {
                        "id": meeting_id,
                        "name": str(meeting.get("name") or "Ratssitzung").strip()[:300],
                        "start": start.isoformat() if start else "",
                        "date_label": start.strftime("%d.%m.%Y") if start else "Termin offen",
                        "time_label": start.strftime("%H:%M Uhr") if start else "",
                        "year": start.year if start else None,
                        "location": _meeting_location(meeting),
                        "organization": ", ".join(organization_names)[:300],
                        "web": _safe_url(meeting.get("web")) or meeting_id,
                        "documents": _meeting_documents(meeting),
                        "agenda": _agenda(meeting),
                    }
                )

    meetings.sort(key=lambda item: item.get("start") or "", reverse=True)
    return {
        "mode": "oparl",
        "available": True,
        "error": "",
        "system_name": str(system.get("name") or "Ratsinformationssystem").strip()[:200],
        "meetings": meetings[:MAX_MEETINGS],
    }


def _base_snapshot() -> dict:
    return {
        "official_info_url": OFFICIAL_INFO_URL,
        "official_portal_url": OFFICIAL_PORTAL_URL,
        "oparl_system_url": OPARL_SYSTEM_URL,
        "oparl_configured": bool(OPARL_SYSTEM_URL),
        "organization_match": ORGANIZATION_MATCH,
        "lookback_years": DEFAULT_LOOKBACK_YEARS,
        "checked_at": datetime.now().isoformat(timespec="seconds"),
    }


def get_ratsinfo_snapshot(*, query: str = "", year: str = "") -> dict:
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get("snapshot")
        if cached and now < float(_cache.get("expires") or 0):
            snapshot = dict(cached)
        else:
            snapshot = _base_snapshot()
            if OPARL_SYSTEM_URL:
                try:
                    snapshot.update(_load_oparl_snapshot())
                except Exception as error:
                    snapshot.update({"mode": "portal", "available": False, "error": str(error)[:300], "meetings": []})
            else:
                snapshot.update({"mode": "portal", "available": False, "error": "", "meetings": []})
            _cache["snapshot"] = dict(snapshot)
            _cache["expires"] = now + CACHE_SECONDS

    meetings = list(snapshot.get("meetings") or [])
    all_years = sorted({int(item["year"]) for item in meetings if item.get("year")}, reverse=True)
    current_year = datetime.now().year
    for candidate in range(current_year, current_year - DEFAULT_LOOKBACK_YEARS - 1, -1):
        if candidate not in all_years:
            all_years.append(candidate)
    all_years = sorted(set(all_years), reverse=True)

    selected_year = None
    try:
        selected_year = int(year) if str(year).strip() else None
    except ValueError:
        selected_year = None

    needle = str(query or "").strip().casefold()
    filtered = []
    for item in meetings:
        if selected_year and item.get("year") != selected_year:
            continue
        if needle:
            haystack = " ".join(
                [
                    str(item.get("name") or ""),
                    str(item.get("organization") or ""),
                    str(item.get("location") or ""),
                    " ".join(str(doc.get("name") or "") for doc in item.get("documents") or []),
                    " ".join(str(top.get("name") or "") + " " + str(top.get("result") or "") + " " + str(top.get("resolution_text") or "") for top in item.get("agenda") or []),
                ]
            ).casefold()
            if needle not in haystack:
                continue
        filtered.append(item)

    result = dict(snapshot)
    result["meetings"] = filtered
    result["meeting_count_all"] = len(meetings)
    result["years"] = all_years
    result["selected_year"] = selected_year
    result["query"] = str(query or "").strip()[:120]
    return result
