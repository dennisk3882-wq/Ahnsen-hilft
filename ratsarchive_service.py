from __future__ import annotations

import hashlib
import io
from datetime import date, datetime, time as time_value
from pathlib import Path
from urllib.parse import urlparse

import requests
from pypdf import PdfReader
from sqlalchemy.exc import IntegrityError

from database import Base, SessionLocal, engine
from ratsarchive_models import CouncilDocument, CouncilMeeting


MAX_PDF_BYTES = 25 * 1024 * 1024
MAX_EXTRACTED_TEXT = 350_000
DOCUMENT_KINDS = (
    "Einladung / Tagesordnung",
    "Niederschrift / Protokoll",
    "Beschluss",
    "Vorlage",
    "Anlage",
    "Sonstiges Dokument",
)


def init_ratsarchive_db() -> None:
    Base.metadata.create_all(bind=engine)


def _parse_datetime(date_text: str, time_text: str = "") -> datetime:
    day = date.fromisoformat(str(date_text or "").strip())
    raw_time = str(time_text or "").strip()
    clock = time_value.fromisoformat(raw_time) if raw_time else time_value(0, 0)
    return datetime.combine(day, clock)


def _clean_source_url(value: str) -> str:
    text = str(value or "").strip()[:1000]
    if not text:
        return ""
    parsed = urlparse(text)
    return text if parsed.scheme in {"http", "https"} and parsed.netloc else ""


def _safe_filename(value: str) -> str:
    name = Path(str(value or "dokument.pdf").replace("\\", "/")).name.strip() or "dokument.pdf"
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    return name[:260]


def _extract_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        chunks = []
        total = 0
        for page in reader.pages:
            text = str(page.extract_text() or "").strip()
            if not text:
                continue
            remaining = MAX_EXTRACTED_TEXT - total
            if remaining <= 0:
                break
            chunks.append(text[:remaining])
            total += min(len(text), remaining)
        return "\n\n".join(chunks)[:MAX_EXTRACTED_TEXT]
    except Exception:
        return ""


def _validate_pdf(data: bytes, filename: str = "") -> None:
    if not data:
        raise ValueError("Die PDF-Datei ist leer.")
    if len(data) > MAX_PDF_BYTES:
        raise ValueError("Eine PDF darf maximal 25 MB groß sein.")
    if not data.startswith(b"%PDF-"):
        raise ValueError(f"{filename or 'Datei'} ist keine gültige PDF-Datei.")


def create_archive_meeting(
    *,
    date_text: str,
    time_text: str,
    title: str,
    organization: str,
    location: str,
    summary: str,
    source_url: str,
    published: bool = True,
) -> int:
    meeting_date = _parse_datetime(date_text, time_text)
    db = SessionLocal()
    try:
        item = CouncilMeeting(
            meeting_date=meeting_date,
            title=str(title or "Sitzung des Gemeinderates Ahnsen").strip()[:300],
            organization=str(organization or "Gemeinderat Ahnsen").strip()[:200],
            location=str(location or "").strip()[:240],
            summary=str(summary or "").strip()[:12000],
            source_url=_clean_source_url(source_url),
            published=bool(published),
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return int(item.id)
    finally:
        db.close()


def update_archive_meeting(
    meeting_id: int,
    *,
    date_text: str,
    time_text: str,
    title: str,
    organization: str,
    location: str,
    summary: str,
    source_url: str,
    published: bool,
) -> bool:
    meeting_date = _parse_datetime(date_text, time_text)
    db = SessionLocal()
    try:
        item = db.query(CouncilMeeting).filter(CouncilMeeting.id == meeting_id).first()
        if not item:
            return False
        item.meeting_date = meeting_date
        item.title = str(title or "Sitzung des Gemeinderates Ahnsen").strip()[:300]
        item.organization = str(organization or "Gemeinderat Ahnsen").strip()[:200]
        item.location = str(location or "").strip()[:240]
        item.summary = str(summary or "").strip()[:12000]
        item.source_url = _clean_source_url(source_url)
        item.published = bool(published)
        item.updated_at = datetime.utcnow()
        db.commit()
        return True
    finally:
        db.close()


def add_archive_document(
    meeting_id: int,
    *,
    kind: str,
    title: str,
    filename: str,
    data: bytes,
    source_url: str = "",
    published: bool = True,
) -> tuple[int, bool]:
    clean_filename = _safe_filename(filename)
    _validate_pdf(data, clean_filename)
    digest = hashlib.sha256(data).hexdigest()
    clean_kind = str(kind or "Niederschrift / Protokoll").strip()[:100]
    if clean_kind not in DOCUMENT_KINDS:
        clean_kind = "Sonstiges Dokument"
    db = SessionLocal()
    try:
        meeting = db.query(CouncilMeeting.id).filter(CouncilMeeting.id == meeting_id).first()
        if not meeting:
            raise ValueError("Die ausgewählte Sitzung wurde nicht gefunden.")
        existing = (
            db.query(CouncilDocument)
            .filter(CouncilDocument.meeting_id == meeting_id)
            .filter(CouncilDocument.sha256 == digest)
            .first()
        )
        if existing:
            return int(existing.id), False
        item = CouncilDocument(
            meeting_id=meeting_id,
            kind=clean_kind,
            title=str(title or clean_filename).strip()[:300],
            filename=clean_filename,
            mime_type="application/pdf",
            file_data=data,
            size_bytes=len(data),
            sha256=digest,
            extracted_text=_extract_text(data),
            source_url=_clean_source_url(source_url),
            published=bool(published),
        )
        db.add(item)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = (
                db.query(CouncilDocument)
                .filter(CouncilDocument.meeting_id == meeting_id)
                .filter(CouncilDocument.sha256 == digest)
                .first()
            )
            if existing:
                return int(existing.id), False
            raise
        db.refresh(item)
        return int(item.id), True
    finally:
        db.close()


def add_archive_document_from_url(
    meeting_id: int,
    *,
    kind: str,
    title: str,
    url: str,
    published: bool = True,
) -> tuple[int, bool]:
    source_url = _clean_source_url(url)
    if not source_url:
        raise ValueError("Bitte eine gültige öffentliche PDF-Adresse angeben.")
    response = requests.get(
        source_url,
        headers={"User-Agent": "Ahnsen-digital/1.0 (+https://ahnsen-digital.onrender.com)", "Accept": "application/pdf,*/*;q=0.8"},
        timeout=20,
        allow_redirects=True,
    )
    response.raise_for_status()
    data = response.content
    filename = Path(urlparse(response.url).path).name or "ratsdokument.pdf"
    return add_archive_document(
        meeting_id,
        kind=kind,
        title=title or filename,
        filename=filename,
        data=data,
        source_url=source_url,
        published=published,
    )


def delete_archive_document(document_id: int) -> bool:
    db = SessionLocal()
    try:
        item = db.query(CouncilDocument).filter(CouncilDocument.id == document_id).first()
        if not item:
            return False
        db.delete(item)
        db.commit()
        return True
    finally:
        db.close()


def delete_archive_meeting(meeting_id: int) -> bool:
    db = SessionLocal()
    try:
        item = db.query(CouncilMeeting).filter(CouncilMeeting.id == meeting_id).first()
        if not item:
            return False
        db.query(CouncilDocument).filter(CouncilDocument.meeting_id == meeting_id).delete(synchronize_session=False)
        db.delete(item)
        db.commit()
        return True
    finally:
        db.close()


def get_archive_document(document_id: int, *, admin: bool = False) -> dict | None:
    db = SessionLocal()
    try:
        query = db.query(CouncilDocument, CouncilMeeting).join(CouncilMeeting, CouncilMeeting.id == CouncilDocument.meeting_id)
        query = query.filter(CouncilDocument.id == document_id)
        if not admin:
            query = query.filter(CouncilDocument.published.is_(True)).filter(CouncilMeeting.published.is_(True))
        row = query.first()
        if not row:
            return None
        document, meeting = row
        return {
            "id": document.id,
            "meeting_id": meeting.id,
            "filename": document.filename,
            "mime_type": document.mime_type or "application/pdf",
            "data": bytes(document.file_data or b""),
            "size_bytes": int(document.size_bytes or 0),
        }
    finally:
        db.close()


def get_admin_archive(limit: int = 300) -> list[dict]:
    db = SessionLocal()
    try:
        meetings = db.query(CouncilMeeting).order_by(CouncilMeeting.meeting_date.desc()).limit(limit).all()
        result = []
        for meeting in meetings:
            documents = (
                db.query(CouncilDocument)
                .filter(CouncilDocument.meeting_id == meeting.id)
                .order_by(CouncilDocument.kind.asc(), CouncilDocument.id.asc())
                .all()
            )
            result.append({
                "id": meeting.id,
                "date": meeting.meeting_date.strftime("%Y-%m-%d"),
                "time": meeting.meeting_date.strftime("%H:%M") if meeting.meeting_date.time() != time_value(0, 0) else "",
                "date_label": meeting.meeting_date.strftime("%d.%m.%Y"),
                "title": meeting.title,
                "organization": meeting.organization,
                "location": meeting.location,
                "summary": meeting.summary,
                "source_url": meeting.source_url,
                "published": bool(meeting.published),
                "documents": [
                    {
                        "id": doc.id,
                        "kind": doc.kind,
                        "title": doc.title,
                        "filename": doc.filename,
                        "size_bytes": int(doc.size_bytes or 0),
                        "text_indexed": bool(doc.extracted_text),
                        "source_url": doc.source_url,
                        "published": bool(doc.published),
                    }
                    for doc in documents
                ],
            })
        return result
    finally:
        db.close()


def get_archive_snapshot(*, query: str = "", year: str = "", lookback_years: int = 5) -> dict:
    selected_year = None
    try:
        selected_year = int(str(year).strip()) if str(year).strip() else None
    except ValueError:
        selected_year = None
    needle = str(query or "").strip().casefold()
    current_year = datetime.now().year
    first_year = current_year - max(1, int(lookback_years))

    db = SessionLocal()
    try:
        all_meetings = (
            db.query(CouncilMeeting)
            .filter(CouncilMeeting.published.is_(True))
            .filter(CouncilMeeting.meeting_date >= datetime(first_year, 1, 1))
            .order_by(CouncilMeeting.meeting_date.desc())
            .all()
        )
        result = []
        for meeting in all_meetings:
            if selected_year and meeting.meeting_date.year != selected_year:
                continue
            documents = (
                db.query(CouncilDocument)
                .filter(CouncilDocument.meeting_id == meeting.id)
                .filter(CouncilDocument.published.is_(True))
                .order_by(CouncilDocument.kind.asc(), CouncilDocument.id.asc())
                .all()
            )
            if needle:
                haystack = " ".join([
                    meeting.title or "",
                    meeting.organization or "",
                    meeting.location or "",
                    meeting.summary or "",
                    " ".join((doc.kind or "") + " " + (doc.title or "") + " " + (doc.filename or "") + " " + (doc.extracted_text or "") for doc in documents),
                ]).casefold()
                if needle not in haystack:
                    continue
            has_time = meeting.meeting_date.time() != time_value(0, 0)
            result.append({
                "id": f"local:{meeting.id}",
                "name": meeting.title,
                "start": meeting.meeting_date.isoformat(),
                "date_label": meeting.meeting_date.strftime("%d.%m.%Y"),
                "time_label": meeting.meeting_date.strftime("%H:%M Uhr") if has_time else "",
                "year": meeting.meeting_date.year,
                "location": meeting.location,
                "organization": meeting.organization,
                "summary": meeting.summary,
                "web": "",
                "documents": [
                    {
                        "kind": doc.kind,
                        "name": doc.title or doc.filename,
                        "url": f"/politik-rat/dokument/{doc.id}",
                        "download_url": f"/politik-rat/dokument/{doc.id}",
                        "mime_type": doc.mime_type or "application/pdf",
                        "size_bytes": int(doc.size_bytes or 0),
                        "local": True,
                    }
                    for doc in documents
                ],
                "agenda": [],
            })
        years = list(range(current_year, first_year - 1, -1))
        return {
            "mode": "local",
            "available": True,
            "error": "",
            "system_name": "Lokales Ratsarchiv Ahnsen hilft",
            "meetings": result,
            "meeting_count_all": len(all_meetings),
            "years": years,
            "selected_year": selected_year,
            "query": str(query or "").strip()[:120],
            "lookback_years": lookback_years,
            "organization_match": "Ahnsen",
        }
    finally:
        db.close()
