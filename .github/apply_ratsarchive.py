from pathlib import Path
from textwrap import dedent


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


Path("ratsarchive_models.py").write_text(dedent(r'''
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint

from database import Base


class CouncilMeeting(Base):
    __tablename__ = "council_archive_meetings"

    id = Column(Integer, primary_key=True)
    meeting_date = Column(DateTime, index=True, nullable=False)
    title = Column(String(300), nullable=False)
    organization = Column(String(200), default="Gemeinderat Ahnsen", nullable=False)
    location = Column(String(240), default="", nullable=False)
    summary = Column(Text, default="", nullable=False)
    source_url = Column(String(1000), default="", nullable=False)
    source_label = Column(String(180), default="Ratsinformationssystem Samtgemeinde Eilsen", nullable=False)
    published = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CouncilDocument(Base):
    __tablename__ = "council_archive_documents"
    __table_args__ = (UniqueConstraint("meeting_id", "sha256", name="uq_council_document_hash"),)

    id = Column(Integer, primary_key=True)
    meeting_id = Column(Integer, ForeignKey("council_archive_meetings.id"), index=True, nullable=False)
    kind = Column(String(100), default="Niederschrift / Protokoll", nullable=False)
    title = Column(String(300), nullable=False)
    filename = Column(String(260), nullable=False)
    mime_type = Column(String(100), default="application/pdf", nullable=False)
    file_data = Column(LargeBinary, nullable=False)
    size_bytes = Column(Integer, default=0, nullable=False)
    sha256 = Column(String(64), nullable=False)
    extracted_text = Column(Text, default="", nullable=False)
    source_url = Column(String(1000), default="", nullable=False)
    published = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
''').lstrip(), encoding="utf-8")


Path("ratsarchive_service.py").write_text(dedent(r'''
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
        headers={"User-Agent": "Ahnsen-hilft/1.0 (+https://ahnsen-hilft.onrender.com)", "Accept": "application/pdf,*/*;q=0.8"},
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
''').lstrip(), encoding="utf-8")


replace_once(
    "pwa_core.py",
    "from community_crud import audit_event, init_community_db, save_preference\n",
    "from community_crud import audit_event, init_community_db, save_preference\nfrom ratsarchive_service import init_ratsarchive_db\n",
)
replace_once(
    "pwa_core.py",
    "    init_community_db()\n    init_translation_db()\n",
    "    init_community_db()\n    init_ratsarchive_db()\n    init_translation_db()\n",
)

replace_once(
    "ratsinfo_service.py",
    "import requests\n",
    "import requests\n\nfrom ratsarchive_service import get_archive_snapshot\n",
)
replace_once(
    "ratsinfo_service.py",
    "def get_ratsinfo_snapshot(*, query: str = \"\", year: str = \"\") -> dict:\n    now = time.monotonic()\n",
    "def get_ratsinfo_snapshot(*, query: str = \"\", year: str = \"\") -> dict:\n    local = get_archive_snapshot(query=query, year=year, lookback_years=DEFAULT_LOOKBACK_YEARS)\n    if local.get(\"meeting_count_all\") or not OPARL_SYSTEM_URL:\n        result = _base_snapshot()\n        result.update(local)\n        return result\n\n    now = time.monotonic()\n",
)

replace_once(
    "community_routes.py",
    "from fastapi.responses import JSONResponse, RedirectResponse\n",
    "from fastapi.responses import JSONResponse, RedirectResponse, Response\n",
)
replace_once(
    "community_routes.py",
    "from ratsinfo_service import get_ratsinfo_snapshot\n",
    "from ratsinfo_service import get_ratsinfo_snapshot\nfrom ratsarchive_service import (\n    MAX_PDF_BYTES,\n    add_archive_document,\n    add_archive_document_from_url,\n    create_archive_meeting,\n    delete_archive_document,\n    delete_archive_meeting,\n    get_admin_archive,\n    get_archive_document,\n    update_archive_meeting,\n)\n",
)
replace_once(
    "community_routes.py",
    "@router.get(\"/api/politik-rat\")\nasync def public_politics_data(q: str = \"\", jahr: str = \"\"):\n",
    "@router.get(\"/politik-rat/dokument/{document_id}\")\nasync def public_politics_document(document_id: int):\n    document = get_archive_document(document_id)\n    if not document:\n        raise HTTPException(status_code=404, detail=\"Dokument nicht gefunden\")\n    filename = quote(str(document.get(\"filename\") or \"ratsdokument.pdf\"))\n    return Response(\n        content=document[\"data\"],\n        media_type=document.get(\"mime_type\") or \"application/pdf\",\n        headers={\n            \"Content-Disposition\": f\"attachment; filename*=UTF-8''{filename}\",\n            \"Cache-Control\": \"public, max-age=3600\",\n            \"X-Content-Type-Options\": \"nosniff\",\n        },\n    )\n\n\n@router.get(\"/api/politik-rat\")\nasync def public_politics_data(q: str = \"\", jahr: str = \"\"):\n",
)
replace_once(
    "community_routes.py",
    "@router.get(\"/intern/politik\")\nasync def admin_politics(request: Request):\n    _admin(request)\n    return admin_politics_page(get_civic_items(include_inactive=True))\n\n\n@router.post(\"/intern/politik\")\n",
    "@router.get(\"/intern/politik\")\nasync def admin_politics(request: Request, hinweis: str = \"\"):\n    _admin(request)\n    return admin_politics_page(get_civic_items(include_inactive=True), get_admin_archive(), message=hinweis)\n\n\nasync def _store_archive_uploads(form, meeting_id: int) -> tuple[int, list[str]]:\n    added = 0\n    errors = []\n    kind = _clean(form.get(\"document_kind\"), 100) or \"Niederschrift / Protokoll\"\n    document_title = _clean(form.get(\"document_title\"), 300)\n    document_source_url = _clean(form.get(\"document_source_url\"), 1000)\n    for upload in form.getlist(\"documents\"):\n        filename = str(getattr(upload, \"filename\", \"\") or \"\").strip()\n        if not filename:\n            continue\n        try:\n            data = await upload.read(MAX_PDF_BYTES + 1)\n            _id, created = add_archive_document(\n                meeting_id,\n                kind=kind,\n                title=document_title or filename,\n                filename=filename,\n                data=data,\n                source_url=document_source_url,\n            )\n            added += 1 if created else 0\n        except Exception as error:\n            errors.append(f\"{filename}: {str(error)[:160]}\")\n    direct_url = _clean(form.get(\"document_url\"), 1000)\n    if direct_url:\n        try:\n            _id, created = add_archive_document_from_url(\n                meeting_id,\n                kind=kind,\n                title=document_title,\n                url=direct_url,\n            )\n            added += 1 if created else 0\n        except Exception as error:\n            errors.append(f\"URL-Import: {str(error)[:180]}\")\n    return added, errors\n\n\n@router.post(\"/intern/politik/archiv\")\nasync def admin_create_archive_meeting(request: Request):\n    _admin(request)\n    form = await request.form()\n    try:\n        meeting_id = create_archive_meeting(\n            date_text=_clean(form.get(\"meeting_date\"), 10),\n            time_text=_clean(form.get(\"meeting_time\"), 5),\n            title=_clean(form.get(\"title\"), 300),\n            organization=_clean(form.get(\"organization\"), 200),\n            location=_clean(form.get(\"location\"), 240),\n            summary=_clean(form.get(\"summary\"), 12000),\n            source_url=_clean(form.get(\"source_url\"), 1000),\n            published=form.get(\"published\") == \"on\",\n        )\n    except Exception as error:\n        return RedirectResponse(url=\"/intern/politik?hinweis=\" + quote(f\"Sitzung konnte nicht gespeichert werden: {str(error)[:180]}\"), status_code=303)\n    added, errors = await _store_archive_uploads(form, meeting_id)\n    audit_event(\"Verwaltung\", \"Ratssitzung archiviert\", \"council_meeting\", str(meeting_id), f\"{added} Dokumente\")\n    message = f\"Sitzung gespeichert · {added} neue PDF-Datei(en).\"\n    if errors:\n        message += \" Hinweise: \" + \" | \".join(errors[:3])\n    return RedirectResponse(url=\"/intern/politik?hinweis=\" + quote(message), status_code=303)\n\n\n@router.post(\"/intern/politik/archiv/{meeting_id}\")\nasync def admin_update_archive_meeting(request: Request, meeting_id: int):\n    _admin(request)\n    form = await request.form()\n    try:\n        updated = update_archive_meeting(\n            meeting_id,\n            date_text=_clean(form.get(\"meeting_date\"), 10),\n            time_text=_clean(form.get(\"meeting_time\"), 5),\n            title=_clean(form.get(\"title\"), 300),\n            organization=_clean(form.get(\"organization\"), 200),\n            location=_clean(form.get(\"location\"), 240),\n            summary=_clean(form.get(\"summary\"), 12000),\n            source_url=_clean(form.get(\"source_url\"), 1000),\n            published=form.get(\"published\") == \"on\",\n        )\n    except Exception as error:\n        return RedirectResponse(url=\"/intern/politik?hinweis=\" + quote(f\"Änderung fehlgeschlagen: {str(error)[:180]}\"), status_code=303)\n    if updated:\n        audit_event(\"Verwaltung\", \"Ratssitzung bearbeitet\", \"council_meeting\", str(meeting_id))\n    return RedirectResponse(url=\"/intern/politik?hinweis=\" + quote(\"Sitzung aktualisiert.\" if updated else \"Sitzung nicht gefunden.\"), status_code=303)\n\n\n@router.post(\"/intern/politik/archiv/{meeting_id}/dokument\")\nasync def admin_add_archive_document(request: Request, meeting_id: int):\n    _admin(request)\n    form = await request.form()\n    added, errors = await _store_archive_uploads(form, meeting_id)\n    if added:\n        audit_event(\"Verwaltung\", \"Ratsdokument hinzugefügt\", \"council_meeting\", str(meeting_id), f\"{added} Dokumente\")\n    message = f\"{added} neue PDF-Datei(en) gespeichert.\"\n    if errors:\n        message += \" Hinweise: \" + \" | \".join(errors[:3])\n    return RedirectResponse(url=\"/intern/politik?hinweis=\" + quote(message), status_code=303)\n\n\n@router.post(\"/intern/politik/dokument/{document_id}/loeschen\")\nasync def admin_delete_archive_document(request: Request, document_id: int):\n    _admin(request)\n    if delete_archive_document(document_id):\n        audit_event(\"Verwaltung\", \"Ratsdokument gelöscht\", \"council_document\", str(document_id))\n    return RedirectResponse(url=\"/intern/politik?hinweis=\" + quote(\"Dokument entfernt.\"), status_code=303)\n\n\n@router.post(\"/intern/politik/archiv/{meeting_id}/loeschen\")\nasync def admin_delete_archive_meeting(request: Request, meeting_id: int):\n    _admin(request)\n    if delete_archive_meeting(meeting_id):\n        audit_event(\"Verwaltung\", \"Ratssitzung gelöscht\", \"council_meeting\", str(meeting_id))\n    return RedirectResponse(url=\"/intern/politik?hinweis=\" + quote(\"Archiv-Sitzung entfernt.\"), status_code=303)\n\n\n@router.post(\"/intern/politik\")\n",
)

replace_once(
    "community_dashboard.py",
    "def admin_politics_page(items) -> HTMLResponse:\n    rows = \"\".join(f'<div class=\"admin-row\"><strong>{escape(i.kind)} · {escape(i.title)}</strong><br><small>{escape(i.date_text)} {escape(i.location)}</small><p>{escape(i.body)}</p></div>' for i in items) or '<div class=\"admin-row\">Noch keine Einträge.</div>'\n    body = f\"\"\"<section><span class=\"eyebrow\">Transparenz</span><h1>Politik & Rat</h1></section><section class=\"admin-grid\"><article class=\"admin-section\"><h2>Eintrag veröffentlichen</h2><form class=\"admin-form\" method=\"post\" action=\"/intern/politik\"><label>Typ<select name=\"kind\"><option>Sitzung</option><option>Beschluss</option><option>Tagesordnung</option><option>Bekanntmachung</option><option>Information</option></select></label><label>Titel<input name=\"title\" maxlength=\"200\" required></label><label>Datum / Zeit<input name=\"date_text\" maxlength=\"80\" placeholder=\"z. B. 14.08.2026, 19:00 Uhr\"></label><label>Ort<input name=\"location\" maxlength=\"160\"></label><label>Beschreibung<textarea name=\"body\" maxlength=\"6000\"></textarea></label><label>Originalquelle / URL<input name=\"source_url\" maxlength=\"500\"></label><button class=\"admin-button\" type=\"submit\">Veröffentlichen</button></form></article><article class=\"admin-section\"><h2>Veröffentlichte Einträge</h2><div class=\"admin-list\">{rows}</div></article></section>\"\"\"\n    return _page(\"Politik & Rat\", \"politik\", body)\n",
    dedent(r'''def admin_politics_page(items, archive=None, message: str = "") -> HTMLResponse:
    archive = list(archive or [])
    notice = f'<div class="admin-row"><strong>{escape(message)}</strong></div>' if message else ""
    archive_cards = []
    kinds = ("Niederschrift / Protokoll", "Einladung / Tagesordnung", "Beschluss", "Vorlage", "Anlage", "Sonstiges Dokument")
    kind_options = "".join(f'<option>{escape(kind)}</option>' for kind in kinds)
    for meeting in archive:
        documents = []
        for doc in meeting.get("documents") or []:
            mb = int(doc.get("size_bytes") or 0) / (1024 * 1024)
            index_badge = "Text indexiert" if doc.get("text_indexed") else "PDF gespeichert"
            documents.append(
                f'<div class="admin-row"><strong>📄 {escape(str(doc.get("kind") or "Dokument"))} · {escape(str(doc.get("title") or doc.get("filename") or "PDF"))}</strong>'
                f'<br><small>{mb:.2f} MB · {index_badge}</small><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px">'
                f'<a class="admin-button secondary" href="/politik-rat/dokument/{int(doc["id"])}">PDF herunterladen</a>'
                f'<form method="post" action="/intern/politik/dokument/{int(doc["id"])}/loeschen" onsubmit="return confirm(\'Dokument wirklich löschen?\')"><button class="admin-button secondary" type="submit">Löschen</button></form></div></div>'
            )
        docs_html = "".join(documents) or '<div class="admin-row">Noch kein PDF hinterlegt.</div>'
        checked = " checked" if meeting.get("published") else ""
        archive_cards.append(f'''<article class="admin-section">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><span class="status-chip">{escape(str(meeting.get("date_label") or ""))}</span><h2>{escape(str(meeting.get("title") or "Ratssitzung"))}</h2><small>{escape(str(meeting.get("organization") or ""))} · {escape(str(meeting.get("location") or ""))}</small></div><form method="post" action="/intern/politik/archiv/{int(meeting["id"])}/loeschen" onsubmit="return confirm('Sitzung inklusive aller PDFs wirklich löschen?')"><button class="admin-button secondary" type="submit">Sitzung löschen</button></form></div>
          <details style="margin-top:14px"><summary><strong>Sitzung bearbeiten</strong></summary><form class="admin-form" method="post" action="/intern/politik/archiv/{int(meeting["id"])}" style="margin-top:12px"><label>Datum<input type="date" name="meeting_date" value="{escape(str(meeting.get("date") or ""))}" required></label><label>Uhrzeit<input type="time" name="meeting_time" value="{escape(str(meeting.get("time") or ""))}"></label><label>Titel<input name="title" maxlength="300" value="{escape(str(meeting.get("title") or ""), quote=True)}" required></label><label>Gremium<input name="organization" maxlength="200" value="{escape(str(meeting.get("organization") or "Gemeinderat Ahnsen"), quote=True)}"></label><label>Ort<input name="location" maxlength="240" value="{escape(str(meeting.get("location") or ""), quote=True)}"></label><label>Kurzbeschreibung / Hinweise<textarea name="summary" maxlength="12000">{escape(str(meeting.get("summary") or ""))}</textarea></label><label>Amtliche Quellseite<input name="source_url" maxlength="1000" value="{escape(str(meeting.get("source_url") or ""), quote=True)}"></label><label><input type="checkbox" name="published"{checked}> Öffentlich anzeigen</label><button class="admin-button" type="submit">Sitzung speichern</button></form></details>
          <h3 style="margin-top:18px">Dokumente</h3><div class="admin-list">{docs_html}</div>
          <details style="margin-top:14px"><summary><strong>Weitere PDF hinzufügen</strong></summary><form class="admin-form" method="post" enctype="multipart/form-data" action="/intern/politik/archiv/{int(meeting["id"])}/dokument" style="margin-top:12px"><label>Dokumenttyp<select name="document_kind">{kind_options}</select></label><label>Dokumenttitel<input name="document_title" maxlength="300" placeholder="optional – sonst Dateiname"></label><label>PDF-Datei(en)<input type="file" name="documents" accept="application/pdf,.pdf" multiple></label><label>Oder direkte öffentliche PDF-URL<input type="url" name="document_url" maxlength="1000" placeholder="https://…pdf"></label><label>Originalquelle des Dokuments<input type="url" name="document_source_url" maxlength="1000"></label><button class="admin-button" type="submit">PDF speichern</button></form></details>
        </article>''')
    archive_html = "".join(archive_cards) or '<div class="admin-row"><strong>Noch keine Sitzung im lokalen Archiv.</strong><p>Lege oben die erste Sitzung an und lade die veröffentlichten PDF-Unterlagen hoch.</p></div>'

    rows = "".join(f'<div class="admin-row"><strong>{escape(i.kind)} · {escape(i.title)}</strong><br><small>{escape(i.date_text)} {escape(i.location)}</small><p>{escape(i.body)}</p></div>' for i in items) or '<div class="admin-row">Noch keine redaktionellen Einträge.</div>'
    body = f'''<section><span class="eyebrow">Transparenz</span><h1>Politik & Rat</h1><p>Lokales Ratsarchiv für öffentliche Sitzungen, Einladungen, Tagesordnungen und Protokolle.</p></section>{notice}
    <section class="admin-section"><span class="eyebrow">Lokales Ratsarchiv</span><h2>Neue Sitzung archivieren</h2><p>Die PDFs werden dauerhaft in der PWA-Datenbank gespeichert. Beim Upload wird der PDF-Text automatisch für die Suche indexiert.</p><form class="admin-form" method="post" enctype="multipart/form-data" action="/intern/politik/archiv"><label>Datum *<input type="date" name="meeting_date" required></label><label>Uhrzeit<input type="time" name="meeting_time"></label><label>Titel *<input name="title" maxlength="300" value="Sitzung des Gemeinderates Ahnsen" required></label><label>Gremium<input name="organization" maxlength="200" value="Gemeinderat Ahnsen"></label><label>Ort<input name="location" maxlength="240" placeholder="z. B. Dorfgemeinschaftshaus Ahnsen"></label><label>Kurzbeschreibung / Hinweise<textarea name="summary" maxlength="12000"></textarea></label><label>Amtliche Quellseite<input type="url" name="source_url" maxlength="1000" placeholder="optional"></label><hr><label>Dokumenttyp<select name="document_kind">{kind_options}</select></label><label>Dokumenttitel<input name="document_title" maxlength="300" placeholder="optional – sonst Dateiname"></label><label>PDF-Datei(en)<input type="file" name="documents" accept="application/pdf,.pdf" multiple></label><label>Oder direkte öffentliche PDF-URL<input type="url" name="document_url" maxlength="1000" placeholder="https://…pdf"></label><label>Originalquelle des Dokuments<input type="url" name="document_source_url" maxlength="1000"></label><label><input type="checkbox" name="published" checked> Sofort öffentlich anzeigen</label><button class="admin-button" type="submit">Sitzung & PDFs speichern</button></form></section>
    <section><span class="eyebrow">Archivbestand</span><h2>Gespeicherte Ratssitzungen</h2>{archive_html}</section>
    <section class="admin-grid"><article class="admin-section"><h2>Zusätzlichen Hinweis veröffentlichen</h2><form class="admin-form" method="post" action="/intern/politik"><label>Typ<select name="kind"><option>Sitzung</option><option>Beschluss</option><option>Tagesordnung</option><option>Bekanntmachung</option><option>Information</option></select></label><label>Titel<input name="title" maxlength="200" required></label><label>Datum / Zeit<input name="date_text" maxlength="80"></label><label>Ort<input name="location" maxlength="160"></label><label>Beschreibung<textarea name="body" maxlength="6000"></textarea></label><label>Originalquelle / URL<input name="source_url" maxlength="500"></label><button class="admin-button" type="submit">Veröffentlichen</button></form></article><article class="admin-section"><h2>Redaktionelle Einträge</h2><div class="admin-list">{rows}</div></article></section>'''
    return _page("Politik & Rat", "politik", body)
'''),
)

replace_once(
    "community_ui.py",
    "    auto_mode = ratsinfo.get(\"mode\") == \"oparl\" and bool(ratsinfo.get(\"available\"))\n",
    "    archive_mode = ratsinfo.get(\"mode\") == \"local\" and bool(ratsinfo.get(\"available\"))\n    auto_mode = ratsinfo.get(\"mode\") == \"oparl\" and bool(ratsinfo.get(\"available\"))\n    data_mode = archive_mode or auto_mode\n",
)
replace_once(
    "community_ui.py",
    "            buttons.append(\n                f'<a class=\"council-doc download\" href=\"{download}\" target=\"_blank\" rel=\"noopener\"><span>↓</span><span><small>{kind}</small><strong>{name}</strong><em>Originaldatei der Samtgemeinde herunterladen ↗</em></span></a>'\n            )\n",
    "            local = bool(document.get(\"local\"))\n            attrs = ' download' if local else ' target=\"_blank\" rel=\"noopener\"'\n            label = \"PDF aus dem lokalen Ratsarchiv herunterladen\" if local else \"Originaldatei der Samtgemeinde herunterladen ↗\"\n            buttons.append(\n                f'<a class=\"council-doc download\" href=\"{download}\"{attrs}><span>↓</span><span><small>{kind}</small><strong>{name}</strong><em>{label}</em></span></a>'\n            )\n",
)
replace_once(
    "community_ui.py",
    "        document_area = document_buttons(documents)\n        meeting_cards.append(\n",
    "        document_area = document_buttons(documents)\n        summary = str(meeting.get(\"summary\") or \"\")\n        archive_note = \"Die veröffentlichten PDF-Unterlagen liegen im lokalen Ratsarchiv von Ahnsen hilft und werden direkt von dieser PWA ausgeliefert.\" if archive_mode else \"Alle Sitzungsdetails bleiben in Ahnsen hilft. Nur ein Dokument-Download öffnet die amtliche Originaldatei.\"\n        meeting_cards.append(\n",
)
replace_once(
    "community_ui.py",
    "                    <div class=\"council-internal-note\">Alle Sitzungsdetails bleiben in Ahnsen hilft. Nur ein Dokument-Download öffnet die amtliche Originaldatei.</div>\n                    {f'<div class=\"council-doc-grid\">{document_area}</div>' if document_area else '<p class=\"council-doc-empty\">Für diese Sitzung wurden über die Schnittstelle noch keine öffentlichen Dateien geliefert.</p>'}\n",
    "                    {f'<p>{escape(summary)}</p>' if summary else ''}\n                    <div class=\"council-internal-note\">{escape(archive_note)}</div>\n                    {f'<div class=\"council-doc-grid\">{document_area}</div>' if document_area else '<p class=\"council-doc-empty\">Für diese Sitzung ist noch kein öffentliches PDF hinterlegt.</p>'}\n",
)
replace_once(
    "community_ui.py",
    "    elif auto_mode:\n        meeting_area = '<div class=\"community-empty\"><strong>Keine Sitzung im gewählten Filter gefunden.</strong><p>Ändere Jahr oder Suchbegriff. Die amtlichen Daten werden automatisch aus dem Ratsinformationssystem übernommen.</p></div>'\n    else:\n",
    "    elif data_mode:\n        meeting_area = '<div class=\"community-empty\"><strong>Keine Sitzung im gewählten Filter gefunden.</strong><p>Ändere Jahr oder Suchbegriff. Neu archivierte Sitzungen erscheinen hier automatisch.</p></div>'\n    else:\n",
)
replace_once(
    "community_ui.py",
    "    source_badge = '<span class=\"community-chip done\">● Amtliche Sitzungsdaten automatisch synchronisiert</span>' if auto_mode else '<span class=\"community-chip warn\">● Automatischer Datenabruf noch nicht freigeschaltet</span>'\n    status_text = (\n        f'{ratsinfo.get(\"meeting_count_all\", len(meetings))} Sitzungen aus der amtlichen Schnittstelle verfügbar.'\n        if auto_mode\n        else 'Die Oberfläche bleibt vollständig in Ahnsen hilft; für das vollständige Archiv wird noch eine freigegebene amtliche Datenschnittstelle benötigt.'\n    )\n",
    "    if archive_mode:\n        source_badge = '<span class=\"community-chip done\">● Lokales Ratsarchiv aktiv</span>'\n        status_text = f'{ratsinfo.get(\"meeting_count_all\", len(meetings))} veröffentlichte Sitzungen im lokalen Archiv.'\n    elif auto_mode:\n        source_badge = '<span class=\"community-chip done\">● Amtliche Sitzungsdaten automatisch synchronisiert</span>'\n        status_text = f'{ratsinfo.get(\"meeting_count_all\", len(meetings))} Sitzungen aus der amtlichen Schnittstelle verfügbar.'\n    else:\n        source_badge = '<span class=\"community-chip warn\">● Ratsarchiv wird aufgebaut</span>'\n        status_text = 'Die Oberfläche bleibt vollständig in Ahnsen hilft.'\n",
)
replace_once(
    "community_ui.py",
    "<div class=\"council-source-side\"><span class=\"eyebrow\">Datenstatus</span><strong>{'5-Jahres-Archiv aktiv' if auto_mode else 'Archiv wartet auf amtliche Datenschnittstelle'}</strong><small>{escape(status_text)}</small>",
    "<div class=\"council-source-side\"><span class=\"eyebrow\">Datenstatus</span><strong>{'Lokales 5-Jahres-Archiv aktiv' if archive_mode else ('5-Jahres-Archiv aktiv' if auto_mode else 'Ratsarchiv wird aufgebaut')}</strong><small>{escape(status_text)}</small>",
)
replace_once(
    "community_ui.py",
    "<p>{'Gefilterte Ergebnisse aus der amtlichen Schnittstelle – vollständig innerhalb von Ahnsen hilft.' if auto_mode else 'Suche und Jahresfilter bleiben hier in Ahnsen hilft. Sobald die Samtgemeinde einen freigegebenen maschinenlesbaren Datenzugang bereitstellt, wird das vollständige 5-Jahres-Archiv automatisch eingeblendet.'}</p>",
    "<p>{'Gespeicherte öffentliche Sitzungen und PDF-Unterlagen – vollständig innerhalb von Ahnsen hilft.' if archive_mode else ('Gefilterte Ergebnisse aus der amtlichen Schnittstelle – vollständig innerhalb von Ahnsen hilft.' if auto_mode else 'Suche und Jahresfilter bleiben hier in Ahnsen hilft.')}</p>",
)

replace_once(
    "community_search.py",
    "            \"kind\": \"ratssitzung\",\n        })\n",
    "            \"kind\": \"ratssitzung\",\n            \"fixed_score\": 12,\n        })\n",
)

print("local ratsarchive patch applied")
