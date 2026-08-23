from __future__ import annotations

import hashlib
import io
import os
import re
import threading
import time
import zipfile
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from typing import Any
from urllib.parse import urljoin
from xml.etree import ElementTree as ET

import requests
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint, func

from database import Base, SessionLocal, engine
from pwa_crud import (
    delivery_already_sent,
    get_users_for_push_category,
    mark_delivery_sent,
)
from push_service import send_user_notification
from platform_runtime import get_platform_snapshot


DWD_CAP_INDEX_URL = os.getenv(
    "DWD_CAP_INDEX_URL",
    "https://opendata.dwd.de/weather/alerts/cap/COMMUNEUNION_DWD_STAT/",
).strip()
BBK_MOWAS_RSS_URL = os.getenv(
    "BBK_MOWAS_RSS_URL",
    "https://warnung.bund.de/api31/mowas/rss/032570000000.rss",
).strip()
WARNING_LOCATION_NAME = os.getenv("WARNING_LOCATION_NAME", "Ahnsen").strip() or "Ahnsen"
WARNING_AREA_LABEL = os.getenv("WARNING_AREA_LABEL", "Ahnsen / Landkreis Schaumburg").strip()
WARNING_POLL_SECONDS = max(120, int(os.getenv("WARNING_POLL_SECONDS", "300") or "300"))
WARNING_BACKGROUND_ENABLED = os.getenv("WARNING_BACKGROUND_ENABLED", "true").casefold() not in {"0", "false", "no", "off"}
WARNING_REQUEST_TIMEOUT = max(3, min(20, int(os.getenv("WARNING_REQUEST_TIMEOUT", "10") or "10")))
WARNING_USER_AGENT = os.getenv(
    "WARNING_USER_AGENT",
    "Ahnsen-digital/1.0 (+https://ahnsen-digital.onrender.com)",
).strip()

DWD_SOURCE_URL = "https://www.dwd.de/warnungen"
BBK_SOURCE_URL = "https://warnung.bund.de"

SEVERITY_LEVELS = {
    "minor": 1,
    "moderate": 2,
    "severe": 3,
    "extreme": 4,
}
LEVEL_LABELS = {
    1: "Stufe 1 · Hinweis",
    2: "Stufe 2 · Warnung",
    3: "Stufe 3 · Unwetter / ernste Gefahr",
    4: "Stufe 4 · extreme Gefahr",
}


class OfficialWarning(Base):
    __tablename__ = "official_warnings"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_official_warning_source_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(20), index=True, nullable=False)
    external_id = Column(String(240), nullable=False)
    content_hash = Column(String(64), default="", nullable=False)
    category = Column(String(60), index=True, nullable=False)
    level = Column(Integer, default=2, nullable=False)
    title = Column(String(240), nullable=False)
    event = Column(String(180), default="", nullable=False)
    area = Column(String(240), default="", nullable=False)
    description = Column(Text, default="", nullable=False)
    instruction = Column(Text, default="", nullable=False)
    source_url = Column(Text, default="", nullable=False)
    starts_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    is_cancel = Column(Boolean, default=False, nullable=False)
    first_seen_at = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    pushed_at = Column(DateTime, nullable=True)
    pushed_devices = Column(Integer, default=0, nullable=False)


class WarningPoll(Base):
    __tablename__ = "warning_polls"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(20), index=True, nullable=False)
    status = Column(String(20), nullable=False)
    detail = Column(Text, default="", nullable=False)
    warning_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)


def init_warning_db() -> None:
    Base.metadata.create_all(bind=engine)


def _clean_text(value: Any, limit: int = 6000) -> str:
    text = re.sub(r"\s+", " ", unescape(str(value or ""))).strip()
    return text[:limit]


def _parse_iso(value: str | None) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError:
        return None


def _parse_rfc2822(value: str | None) -> datetime | None:
    try:
        parsed = parsedate_to_datetime(str(value or ""))
        if parsed.tzinfo:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except Exception:
        return None


def _hash_payload(item: dict[str, Any]) -> str:
    raw = "|".join(
        str(item.get(key) or "")
        for key in ("source", "external_id", "title", "description", "instruction", "level", "active", "ends_at")
    )
    return hashlib.sha256(raw.encode("utf-8", "replace")).hexdigest()


def _level_from_severity(value: str | None, default: int = 2) -> int:
    return SEVERITY_LEVELS.get(str(value or "").strip().casefold(), default)


def _category_from_text(text: str, source: str) -> str:
    lowered = text.casefold()
    if any(word in lowered for word in ("hochwasser", "überschwemm", "überflutung", "pegel", "sturmflut")):
        return "push_hochwasser"
    if source == "DWD" or any(
        word in lowered
        for word in ("gewitter", "sturm", "orkan", "hagel", "starkregen", "glätte", "schnee", "frost", "hitze", "wetter")
    ):
        return "push_unwetter"
    return "push_bevoelkerungsschutz"


def _dwd_latest_zip_url(session: requests.Session) -> str:
    index_url = os.getenv("DWD_CAP_INDEX_URL", "").strip() or get_platform_snapshot().get("dwd_cap_index_url") or DWD_CAP_INDEX_URL
    response = session.get(index_url, timeout=WARNING_REQUEST_TIMEOUT)
    response.raise_for_status()
    candidates = re.findall(r'href=["\']([^"\']+PREMIUMDWD_COMMUNEUNION_DE\.zip)["\']', response.text, flags=re.I)
    if not candidates:
        candidates = re.findall(r'href=["\']([^"\']+_DE\.zip)["\']', response.text, flags=re.I)
    if not candidates:
        raise RuntimeError("Im DWD-Verzeichnis wurde keine deutsche CAP-ZIP-Datei gefunden.")
    return urljoin(index_url, sorted(candidates)[-1])


def _cap_text(element: ET.Element, name: str) -> str:
    node = element.find(f"{{*}}{name}")
    return _clean_text(node.text if node is not None else "")


def _parse_dwd_zip(content: bytes) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    cfg = get_platform_snapshot()
    location_terms = [part.strip().casefold() for part in str(cfg.get("warning_terms") or cfg.get("warning_location_name") or WARNING_LOCATION_NAME).split("|") if part.strip()]
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        for name in archive.namelist():
            if not name.lower().endswith(".xml"):
                continue
            try:
                root = ET.fromstring(archive.read(name))
            except ET.ParseError:
                continue
            identifier = _cap_text(root, "identifier") or name
            msg_type = _cap_text(root, "msgType")
            sent = _parse_iso(_cap_text(root, "sent"))
            infos = root.findall("{*}info")
            info = None
            for candidate in infos:
                language = _cap_text(candidate, "language").casefold()
                if language.startswith("de"):
                    info = candidate
                    break
            if info is None and infos:
                info = infos[0]
            if info is None:
                continue

            matched_areas = []
            for area in info.findall("{*}area"):
                area_desc = _cap_text(area, "areaDesc")
                area_cf = area_desc.casefold()
                if any(term in area_cf for term in location_terms):
                    matched_areas.append(area_desc)
            if not matched_areas:
                continue

            event = _cap_text(info, "event")
            headline = _cap_text(info, "headline") or event or "Amtliche Wetterwarnung"
            description = _cap_text(info, "description")
            instruction = _cap_text(info, "instruction")
            severity = _cap_text(info, "severity")
            level = _level_from_severity(severity, 2)
            cancel = msg_type.casefold() == "cancel" or "entwarn" in headline.casefold()
            item = {
                "source": "DWD",
                "external_id": identifier[:240],
                "category": _category_from_text(f"{event} {headline} {description}", "DWD"),
                "level": 1 if cancel else level,
                "title": headline[:240],
                "event": event[:180],
                "area": ", ".join(dict.fromkeys(matched_areas))[:240],
                "description": description,
                "instruction": instruction,
                "source_url": DWD_SOURCE_URL,
                "starts_at": _parse_iso(_cap_text(info, "onset")) or _parse_iso(_cap_text(info, "effective")),
                "ends_at": _parse_iso(_cap_text(info, "expires")),
                "sent_at": sent,
                "active": not cancel,
                "is_cancel": cancel,
            }
            item["content_hash"] = _hash_payload(item)
            result.append(item)
    return result


def fetch_dwd_warnings() -> list[dict[str, Any]]:
    session = requests.Session()
    session.headers.update({"User-Agent": WARNING_USER_AGENT, "Accept": "text/html,application/zip,application/xml"})
    zip_url = _dwd_latest_zip_url(session)
    response = session.get(zip_url, timeout=WARNING_REQUEST_TIMEOUT)
    response.raise_for_status()
    return _parse_dwd_zip(response.content)


def _rss_item_text(item: ET.Element, tag: str) -> str:
    node = item.find(tag)
    return _clean_text(node.text if node is not None else "")


def _parse_bbk_rss(content: bytes) -> list[dict[str, Any]]:
    root = ET.fromstring(content)
    result: list[dict[str, Any]] = []
    for item in root.findall(".//item"):
        title = _rss_item_text(item, "title")
        description = _rss_item_text(item, "description")
        link = _rss_item_text(item, "link") or BBK_SOURCE_URL
        guid = _rss_item_text(item, "guid") or hashlib.sha256(f"{title}|{link}".encode()).hexdigest()
        pub_date = _parse_rfc2822(_rss_item_text(item, "pubDate"))
        cancel = "entwarn" in title.casefold()
        combined = f"{title} {description}"
        level = 1 if cancel else 2
        if any(word in combined.casefold() for word in ("extreme gefahr", "lebensgefahr", "akute gefahr für leib und leben")):
            level = 4
        elif any(word in combined.casefold() for word in ("große gefahr", "erhebliche gefahr", "schwere gefahr")):
            level = 3
        warning = {
            "source": "BBK",
            "external_id": guid[:240],
            "category": _category_from_text(combined, "BBK"),
            "level": level,
            "title": title[:240] or "Amtliche Warnung des Bevölkerungsschutzes",
            "event": "Bevölkerungsschutz",
            "area": str(get_platform_snapshot().get("warning_area_label") or WARNING_AREA_LABEL)[:240],
            "description": description,
            "instruction": "Bitte beachte die amtlichen Handlungsempfehlungen in der Originalmeldung.",
            "source_url": link[:3000],
            "starts_at": pub_date,
            "ends_at": None,
            "sent_at": pub_date,
            "active": not cancel,
            "is_cancel": cancel,
        }
        warning["content_hash"] = _hash_payload(warning)
        result.append(warning)
    return result


def fetch_bbk_warnings() -> list[dict[str, Any]]:
    feed_url = os.getenv("BBK_MOWAS_RSS_URL", "").strip() or get_platform_snapshot().get("bbk_mowas_rss_url") or BBK_MOWAS_RSS_URL
    if not str(feed_url).startswith("https://"):
        raise RuntimeError("BBK / MoWaS RSS-URL muss HTTPS verwenden.")
    response = requests.get(
        feed_url,
        headers={"User-Agent": WARNING_USER_AGENT, "Accept": "application/rss+xml,application/xml,text/xml"},
        timeout=WARNING_REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return _parse_bbk_rss(response.content)


def _record_poll(source: str, status: str, detail: str, warning_count: int = 0) -> None:
    init_warning_db()
    db = SessionLocal()
    try:
        db.add(
            WarningPoll(
                source=source[:20],
                status=status[:20],
                detail=_clean_text(detail, 2000),
                warning_count=max(0, int(warning_count or 0)),
                created_at=datetime.utcnow(),
            )
        )
        db.commit()
    finally:
        db.close()


def _upsert_warning(item: dict[str, Any]) -> tuple[OfficialWarning, bool, bool]:
    init_warning_db()
    db = SessionLocal()
    try:
        existing = (
            db.query(OfficialWarning)
            .filter(OfficialWarning.source == item["source"])
            .filter(OfficialWarning.external_id == item["external_id"])
            .first()
        )
        now = datetime.utcnow()
        is_new = existing is None
        changed = False
        if existing is None:
            existing = OfficialWarning(
                source=item["source"],
                external_id=item["external_id"],
                first_seen_at=now,
            )
            db.add(existing)
        else:
            changed = existing.content_hash != item["content_hash"]

        for field in (
            "content_hash", "category", "level", "title", "event", "area", "description", "instruction",
            "source_url", "starts_at", "ends_at", "sent_at", "active", "is_cancel",
        ):
            setattr(existing, field, item.get(field))
        existing.last_seen_at = now
        db.commit()
        db.refresh(existing)
        db.expunge(existing)
        return existing, is_new, changed
    finally:
        db.close()


def _warning_title_key(value: str) -> str:
    title = re.sub(r"^entwarnung\\s*:\\s*", "", _clean_text(value).casefold())
    return re.sub(r"[^a-z0-9äöüß]+", " ", title).strip()


def _deactivate_cancelled_warnings(cancel_warning: OfficialWarning) -> int:
    """Ordnet eine separate MoWaS-Entwarnung ihrer ursprünglichen Warnung zu."""
    if not cancel_warning.is_cancel:
        return 0
    cancel_key = _warning_title_key(cancel_warning.title)
    if len(cancel_key) < 12:
        return 0
    db = SessionLocal()
    try:
        candidates = (
            db.query(OfficialWarning)
            .filter(OfficialWarning.source == cancel_warning.source)
            .filter(OfficialWarning.active.is_(True))
            .filter(OfficialWarning.is_cancel.is_(False))
            .all()
        )
        changed = 0
        for candidate in candidates:
            candidate_key = _warning_title_key(candidate.title)
            if candidate_key == cancel_key or candidate_key.startswith(cancel_key) or cancel_key.startswith(candidate_key):
                candidate.active = False
                candidate.last_seen_at = datetime.utcnow()
                changed += 1
        if changed:
            db.commit()
        return changed
    finally:
        db.close()


def _deactivate_missing_source_warnings(source: str, active_external_ids: set[str]) -> int:
    """Beendet Warnungen, die nach erfolgreichem Abruf nicht mehr im aktuellen Feed stehen."""
    db = SessionLocal()
    try:
        query = (
            db.query(OfficialWarning)
            .filter(OfficialWarning.source == source)
            .filter(OfficialWarning.active.is_(True))
            .filter(OfficialWarning.is_cancel.is_(False))
        )
        changed = 0
        for warning in query.all():
            if warning.external_id not in active_external_ids:
                warning.active = False
                warning.last_seen_at = datetime.utcnow()
                changed += 1
        if changed:
            db.commit()
        return changed
    finally:
        db.close()


def _warning_push_body(warning: OfficialWarning) -> str:
    prefix = "Entwarnung" if warning.is_cancel else LEVEL_LABELS.get(warning.level, "Amtliche Warnung")
    event = warning.event or warning.title
    area = warning.area or get_platform_snapshot().get("warning_area_label") or WARNING_AREA_LABEL
    return _clean_text(f"{prefix}: {event}. Gebiet: {area}", 460)


def _send_warning_push(warning: OfficialWarning) -> int:
    sent = 0
    delivery_suffix = warning.content_hash[:14]
    delivery_key = f"official-warning:{warning.source}:{warning.external_id}:{delivery_suffix}"[:180]
    for user in get_users_for_push_category(warning.category):
        threshold = int(getattr(user, "warn_min_level", 2) or 2)
        if not warning.is_cancel and warning.level < threshold:
            continue
        if delivery_already_sent(user.id, delivery_key):
            continue
        count = send_user_notification(
            user.id,
            f"⚠ {warning.title}" if not warning.is_cancel else f"✓ {warning.title}",
            _warning_push_body(warning),
            url=f"/warnungen#{warning.id}",
            tag=f"amtliche-warnung-{warning.source.lower()}-{warning.id}",
            category=warning.category,
        )
        if count:
            mark_delivery_sent(user.id, delivery_key)
            sent += count
    if sent:
        db = SessionLocal()
        try:
            row = db.query(OfficialWarning).filter(OfficialWarning.id == warning.id).first()
            if row:
                row.pushed_at = datetime.utcnow()
                row.pushed_devices = int(row.pushed_devices or 0) + sent
                db.commit()
        finally:
            db.close()
    return sent


def poll_warning_sources(send_push: bool = True) -> dict[str, Any]:
    init_warning_db()
    summary: dict[str, Any] = {"sources": {}, "new": 0, "changed": 0, "pushed_devices": 0, "warnings": 0}
    source_functions = (("DWD", fetch_dwd_warnings), ("BBK", fetch_bbk_warnings))
    for source, fetcher in source_functions:
        try:
            items = fetcher()
            summary["sources"][source] = {"status": "ok", "count": len(items), "detail": "Quelle erreichbar"}
            _record_poll(source, "ok", "Quelle erfolgreich abgefragt.", len(items))
        except Exception as error:
            detail = f"{type(error).__name__}: {str(error)[:500]}"
            summary["sources"][source] = {"status": "error", "count": 0, "detail": detail}
            _record_poll(source, "error", detail, 0)
            continue

        for item in items:
            warning, is_new, changed = _upsert_warning(item)
            if warning.is_cancel:
                summary["changed"] += _deactivate_cancelled_warnings(warning)
            summary["warnings"] += 1
            if is_new:
                summary["new"] += 1
            if changed:
                summary["changed"] += 1
            if send_push and (is_new or changed):
                summary["pushed_devices"] += _send_warning_push(warning)
        active_external_ids = {str(item["external_id"]) for item in items if item.get("active")}
        summary["changed"] += _deactivate_missing_source_warnings(source, active_external_ids)

    try:
        from system_diagnostics import record_system_event

        failed = [name for name, state in summary["sources"].items() if state["status"] != "ok"]
        record_system_event(
            "warning_poll",
            "warn" if failed else "ok",
            "Amtliche Warnquellen geprüft." if not failed else "Warnquellen teilweise nicht erreichbar: " + ", ".join(failed),
            summary,
        )
    except Exception:
        pass
    return summary


def get_active_warnings(limit: int = 20) -> list[OfficialWarning]:
    init_warning_db()
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        rows = (
            db.query(OfficialWarning)
            .filter(OfficialWarning.active.is_(True))
            .filter((OfficialWarning.ends_at.is_(None)) | (OfficialWarning.ends_at >= now))
            .order_by(OfficialWarning.level.desc(), OfficialWarning.sent_at.desc(), OfficialWarning.first_seen_at.desc())
            .limit(max(1, min(int(limit or 20), 100)))
            .all()
        )
        for row in rows:
            db.expunge(row)
        return rows
    finally:
        db.close()


def get_recent_warnings(limit: int = 50) -> list[OfficialWarning]:
    init_warning_db()
    db = SessionLocal()
    try:
        rows = (
            db.query(OfficialWarning)
            .order_by(OfficialWarning.last_seen_at.desc())
            .limit(max(1, min(int(limit or 50), 200)))
            .all()
        )
        for row in rows:
            db.expunge(row)
        return rows
    finally:
        db.close()


def get_warning_stats() -> dict[str, Any]:
    init_warning_db()
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        active = db.query(OfficialWarning).filter(OfficialWarning.active.is_(True)).filter(
            (OfficialWarning.ends_at.is_(None)) | (OfficialWarning.ends_at >= now)
        ).count()
        total = db.query(OfficialWarning).count()
        pushed = db.query(func.coalesce(func.sum(OfficialWarning.pushed_devices), 0)).scalar() or 0
        last_polls = {}
        for source in ("DWD", "BBK"):
            row = db.query(WarningPoll).filter(WarningPoll.source == source).order_by(WarningPoll.created_at.desc()).first()
            last_polls[source] = {
                "status": row.status if row else "unknown",
                "detail": row.detail if row else "Noch keine Abfrage protokolliert.",
                "warning_count": row.warning_count if row else 0,
                "created_at": row.created_at if row else None,
            }
        return {"active": active, "total": total, "pushed_devices": int(pushed), "sources": last_polls}
    finally:
        db.close()


def probe_warning_sources() -> dict[str, Any]:
    result = {}
    for source, fetcher in (("DWD", fetch_dwd_warnings), ("BBK", fetch_bbk_warnings)):
        started = time.perf_counter()
        try:
            items = fetcher()
            result[source] = {
                "status": "ok",
                "detail": f"Quelle erreichbar; {len(items)} aktuell passende Warnung(en).",
                "duration_ms": int((time.perf_counter() - started) * 1000),
            }
        except Exception as error:
            result[source] = {
                "status": "error",
                "detail": f"{type(error).__name__}: {str(error)[:300]}",
                "duration_ms": int((time.perf_counter() - started) * 1000),
            }
    return result


_monitor_started = False
_monitor_lock = threading.Lock()


def start_warning_monitor() -> bool:
    global _monitor_started
    if not WARNING_BACKGROUND_ENABLED:
        return False
    with _monitor_lock:
        if _monitor_started:
            return True
        _monitor_started = True

    def runner() -> None:
        # Startup is kept fast; first live poll happens shortly after the web service is ready.
        time.sleep(8)
        while True:
            try:
                poll_warning_sources(send_push=True)
            except Exception as error:
                _record_poll("SYSTEM", "error", f"Warnmonitor: {type(error).__name__}: {error}", 0)
            time.sleep(WARNING_POLL_SECONDS)

    threading.Thread(target=runner, name="ahnsen-warning-monitor", daemon=True).start()
    return True
