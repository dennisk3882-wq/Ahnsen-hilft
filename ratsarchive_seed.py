from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

from database import SessionLocal
from ratsarchive_models import CouncilDocument, CouncilMeeting
from ratsarchive_service import add_archive_document, create_archive_meeting, update_archive_meeting


BASE_DIR = Path(__file__).resolve().parent
SEED_DIR = BASE_DIR / "static" / "ratsarchive-seed"
MANIFEST_PATH = SEED_DIR / "manifest.json"
PROTOCOL_KIND = "Niederschrift / Protokoll"
SESSION_RE = re.compile(r"\b(\d+)\.\s*Sitzung\b", re.I)


def _load_manifest() -> list[dict]:
    if not MANIFEST_PATH.exists():
        return []
    try:
        payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []
    meetings = payload.get("meetings") if isinstance(payload, dict) else None
    if not isinstance(meetings, list):
        return []
    result = []
    for item in meetings:
        if not isinstance(item, dict) or not item.get("date"):
            continue
        if str(item.get("organization") or "Gemeinderat Ahnsen").strip() != "Gemeinderat Ahnsen":
            continue
        result.append(item)
    return result


def _meeting_datetime(seed: dict) -> datetime:
    raw = str(seed["date"]).strip()
    clock = str(seed.get("time") or "").strip()
    return datetime.fromisoformat(raw + ("T" + clock if clock else ""))


def _session_number(value: str) -> int | None:
    match = SESSION_RE.search(str(value or ""))
    return int(match.group(1)) if match else None


def _existing_meeting_id(seed: dict) -> int | None:
    target = _meeting_datetime(seed)
    start = datetime(target.year, target.month, target.day)
    end = start + timedelta(days=1)
    wanted_session = int(seed.get("session_number") or 0) or _session_number(seed.get("title", ""))

    db = SessionLocal()
    try:
        candidates = (
            db.query(CouncilMeeting)
            .filter(CouncilMeeting.organization == "Gemeinderat Ahnsen")
            .filter(CouncilMeeting.meeting_date >= start)
            .filter(CouncilMeeting.meeting_date < end)
            .order_by(CouncilMeeting.id.asc())
            .all()
        )
        if not candidates:
            return None
        if wanted_session:
            for item in candidates:
                if _session_number(item.title) == wanted_session:
                    return int(item.id)
        return int(candidates[0].id)
    finally:
        db.close()


def _reconcile_protocol_document(meeting_id: int, seed: dict, pdf_path: Path) -> tuple[int, bool, int]:
    data = pdf_path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    deleted = 0

    db = SessionLocal()
    try:
        existing_docs = (
            db.query(CouncilDocument)
            .filter(CouncilDocument.meeting_id == meeting_id)
            .filter(CouncilDocument.kind == PROTOCOL_KIND)
            .order_by(CouncilDocument.id.asc())
            .all()
        )
        exact = next((doc for doc in existing_docs if doc.sha256 == digest), None)
        if exact is not None:
            exact.title = str(seed["title"])[:300]
            exact.filename = str(seed["filename"])[:260]
            exact.source_url = str(seed.get("source_pdf") or "")[:1000]
            exact.size_bytes = len(data)
            exact.published = True
            exact.updated_at = datetime.utcnow()
            for doc in existing_docs:
                if doc.id == exact.id:
                    continue
                db.delete(doc)
                deleted += 1
            db.commit()
            return int(exact.id), False, deleted

        for doc in existing_docs:
            db.delete(doc)
            deleted += 1
        db.commit()
    finally:
        db.close()

    document_id, created = add_archive_document(
        meeting_id,
        kind=PROTOCOL_KIND,
        title=seed["title"],
        filename=seed["filename"],
        data=data,
        source_url=seed.get("source_pdf", ""),
        published=True,
    )
    return document_id, created, deleted


def seed_official_ratsarchive() -> dict:
    """Reconcile the official SD.NET session manifest with the persistent local archive."""
    result = {
        "meetings_created": 0,
        "meetings_updated": 0,
        "documents_created": 0,
        "duplicates_removed": 0,
        "missing_files": [],
        "errors": [],
    }
    for seed in _load_manifest():
        try:
            meeting_id = _existing_meeting_id(seed)
            if meeting_id is None:
                meeting_id = create_archive_meeting(
                    date_text=seed["date"],
                    time_text=seed.get("time", ""),
                    title=seed["title"],
                    organization="Gemeinderat Ahnsen",
                    location=seed.get("location", ""),
                    summary=seed.get("summary", ""),
                    source_url=seed.get("source_page", ""),
                    published=True,
                )
                result["meetings_created"] += 1
            else:
                update_archive_meeting(
                    meeting_id,
                    date_text=seed["date"],
                    time_text=seed.get("time", ""),
                    title=seed["title"],
                    organization="Gemeinderat Ahnsen",
                    location=seed.get("location", ""),
                    summary=seed.get("summary", ""),
                    source_url=seed.get("source_page", ""),
                    published=True,
                )
                result["meetings_updated"] += 1

            filename = str(seed.get("filename") or "").strip()
            if not filename:
                # The public RIS can mark an older meeting as "Niederschrift"
                # without exposing the minutes as a separate public PDF. Keep
                # any already archived legacy document, but never invent one.
                continue

            pdf_path = SEED_DIR / filename
            if not pdf_path.exists():
                result["missing_files"].append(filename)
                continue

            _document_id, created, removed = _reconcile_protocol_document(meeting_id, seed, pdf_path)
            result["duplicates_removed"] += removed
            if created:
                result["documents_created"] += 1
        except Exception as error:
            result["errors"].append(f"{seed.get('date', '?')}: {str(error)[:220]}")
    return result
