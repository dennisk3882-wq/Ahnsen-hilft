from __future__ import annotations

from datetime import datetime
from pathlib import Path

from database import SessionLocal
from ratsarchive_models import CouncilMeeting
from ratsarchive_service import add_archive_document, create_archive_meeting


BASE_DIR = Path(__file__).resolve().parent
SEED_DIR = BASE_DIR / "static" / "ratsarchive-seed"

OFFICIAL_PROTOCOLS = (
    {
        "date": "2026-05-05",
        "time": "19:30",
        "title": "Öffentliche Niederschrift der 18. Sitzung des Gemeinderates Ahnsen",
        "organization": "Gemeinderat Ahnsen",
        "location": "Dorfgemeinschaftshaus Ahnsen, 31708 Ahnsen, Versammlungsraum",
        "summary": "Amtliche öffentliche Niederschrift der 18. Sitzung des Gemeinderates Ahnsen vom 05.05.2026 (19:30 bis 20:40 Uhr). Original-PDF aus dem Ratsinformationssystem der Samtgemeinde Eilsen, dort am 04.06.2026 exportiert und unverändert als lokale Archivkopie bereitgestellt.",
        "source_page": "https://samtgemeinde-eilsen.ratsinfomanagement.net/tops/?__=UGhVM0hpd2NXNFdFcExjZS0b_zYl2QMJ3h4RM5bBmzA",
        "source_pdf": "https://samtgemeinde-eilsen.ratsinfomanagement.net/sdnetrim/UGhVM0hpd2NXNFdFcExjZe1oFS5141Lot6Hr_OekK8BcACRXmZZeRo9Wlco20P62/Oeffentliche_Niederschrift_Gemeinderat_Ahnsen_05.05.2026.pdf",
        "filename": "2026-05-05_oeffentliche_niederschrift_gemeinderat_ahnsen.pdf",
    },
    {
        "date": "2023-03-02",
        "title": "Protokoll über die 6. Sitzung des Gemeinderates der Gemeinde Ahnsen",
        "organization": "Gemeinderat Ahnsen",
        "location": "Dorfgemeinschaftshaus Ahnsen",
        "summary": "Originalprotokoll aus dem öffentlich zugänglichen Protokollarchiv der Gemeinde Ahnsen.",
        "source_page": "https://www.ahnsen-schaumburg.de/gemeinde/protokolle/",
        "source_pdf": "https://www.ahnsen-schaumburg.de/assets/downloads/2023/Protokoll%206ste%2002-03-23.pdf",
        "filename": "2023-03-02_protokoll_6_sitzung.pdf",
    },
    {
        "date": "2022-11-23",
        "title": "Protokoll über die 5. Sitzung des Gemeinderates der Gemeinde Ahnsen",
        "organization": "Gemeinderat Ahnsen",
        "location": "Dorfgemeinschaftshaus Ahnsen",
        "summary": "Originalprotokoll aus dem öffentlich zugänglichen Protokollarchiv der Gemeinde Ahnsen.",
        "source_page": "https://www.ahnsen-schaumburg.de/gemeinde/protokolle/",
        "source_pdf": "https://www.ahnsen-schaumburg.de/assets/downloads/w7e6610121d0a0005415f9d2662eb225/Protokoll%2023.11.2022.pdf",
        "filename": "2022-11-23_protokoll_5_sitzung.pdf",
    },
)


def _existing_meeting_id(seed: dict) -> int | None:
    meeting_date = datetime.fromisoformat(seed["date"] + ("T" + seed["time"] if seed.get("time") else ""))
    db = SessionLocal()
    try:
        item = (
            db.query(CouncilMeeting)
            .filter(CouncilMeeting.meeting_date == meeting_date)
            .filter(CouncilMeeting.title == seed["title"])
            .first()
        )
        return int(item.id) if item else None
    finally:
        db.close()


def seed_official_ratsarchive() -> dict:
    """Import the bundled, publicly released Ahnsen protocol PDFs exactly once."""
    result = {"meetings_created": 0, "documents_created": 0, "missing_files": [], "errors": []}
    for seed in OFFICIAL_PROTOCOLS:
        pdf_path = SEED_DIR / seed["filename"]
        if not pdf_path.exists():
            result["missing_files"].append(seed["filename"])
            continue
        try:
            meeting_id = _existing_meeting_id(seed)
            if meeting_id is None:
                meeting_id = create_archive_meeting(
                    date_text=seed["date"],
                    time_text=seed.get("time", ""),
                    title=seed["title"],
                    organization=seed["organization"],
                    location=seed["location"],
                    summary=seed["summary"],
                    source_url=seed["source_page"],
                    published=True,
                )
                result["meetings_created"] += 1
            _document_id, created = add_archive_document(
                meeting_id,
                kind="Niederschrift / Protokoll",
                title=seed["title"],
                filename=seed["filename"],
                data=pdf_path.read_bytes(),
                source_url=seed["source_pdf"],
                published=True,
            )
            if created:
                result["documents_created"] += 1
        except Exception as error:
            result["errors"].append(f"{seed['date']}: {str(error)[:220]}")
    return result
