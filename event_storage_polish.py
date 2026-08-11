from __future__ import annotations

import main as legacy
import veranstaltungen_crud as crud
from database import SessionLocal
from event_time_utils import canonical_event_time, display_event_place
from veranstaltungen_models import Veranstaltung


_original_save = crud.save_veranstaltung
_original_update = crud.update_veranstaltung


def _stored_place(value: str | None) -> str:
    return display_event_place(value)


def save_veranstaltung(
    titel,
    datum,
    uhrzeit,
    ort,
    kategorie,
    beschreibung,
    ansprechpartner,
    bild_bytes=None,
    rueckblick_text="",
    rueckblick_bilder=None,
):
    return _original_save(
        titel=titel,
        datum=datum,
        uhrzeit=canonical_event_time(uhrzeit),
        ort=_stored_place(ort),
        kategorie=kategorie,
        beschreibung=beschreibung,
        ansprechpartner=ansprechpartner,
        bild_bytes=bild_bytes,
        rueckblick_text=rueckblick_text,
        rueckblick_bilder=rueckblick_bilder,
    )


def update_veranstaltung(
    veranstaltung_id,
    titel,
    datum,
    uhrzeit,
    ort,
    kategorie,
    beschreibung,
    ansprechpartner,
    bild_bytes=None,
    rueckblick_text="",
    rueckblick_bilder=None,
    rueckblick_bilder_loeschen=False,
):
    return _original_update(
        veranstaltung_id=veranstaltung_id,
        titel=titel,
        datum=datum,
        uhrzeit=canonical_event_time(uhrzeit),
        ort=_stored_place(ort),
        kategorie=kategorie,
        beschreibung=beschreibung,
        ansprechpartner=ansprechpartner,
        bild_bytes=bild_bytes,
        rueckblick_text=rueckblick_text,
        rueckblick_bilder=rueckblick_bilder,
        rueckblick_bilder_loeschen=rueckblick_bilder_loeschen,
    )


# Patch both the CRUD module and the function references imported into main.py.
crud.save_veranstaltung = save_veranstaltung
crud.update_veranstaltung = update_veranstaltung
legacy.save_veranstaltung = save_veranstaltung
legacy.update_veranstaltung = update_veranstaltung


# One-time/idempotent cleanup of old values already stored in the database.
# Unknown free-text values are intentionally left untouched.
def normalize_existing_events() -> int:
    db = SessionLocal()
    changed = 0
    try:
        rows = db.query(Veranstaltung).all()
        for event in rows:
            current_time = str(getattr(event, "uhrzeit", "") or "").strip()
            normalized_time = canonical_event_time(current_time)
            current_place = str(getattr(event, "ort", "") or "").strip()
            normalized_place = _stored_place(current_place)
            row_changed = False
            if normalized_time != current_time:
                event.uhrzeit = normalized_time
                row_changed = True
            if normalized_place != current_place:
                event.ort = normalized_place
                row_changed = True
            if row_changed:
                changed += 1
        if changed:
            db.commit()
        return changed
    except Exception:
        db.rollback()
        return 0
    finally:
        db.close()


normalize_existing_events()
