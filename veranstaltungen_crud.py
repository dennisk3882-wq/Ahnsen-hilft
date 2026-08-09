import base64
import json

from database import Base, engine, SessionLocal
from veranstaltungen_models import Veranstaltung
from sqlalchemy import inspect


MAX_RUECKBLICK_BILDER = 12


def init_veranstaltungen_db():
    Base.metadata.create_all(bind=engine)

    vorhandene_spalten = {
        spalte["name"]
        for spalte in inspect(engine).get_columns("veranstaltungen")
    }

    neue_spalten = {
        "kategorie": "VARCHAR",
        "rueckblick_text": "TEXT",
        "rueckblick_bilder_json": "TEXT",
    }
    for spaltenname, sql_typ in neue_spalten.items():
        if spaltenname in vorhandene_spalten:
            continue
        with engine.begin() as conn:
            conn.exec_driver_sql(
                f"ALTER TABLE veranstaltungen ADD COLUMN {spaltenname} {sql_typ}"
            )
        print(f"Spalte veranstaltungen.{spaltenname} hinzugefügt.")


def _gallery_laden(raw):
    if not raw:
        return []
    try:
        daten = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(daten, list):
        return []
    result = []
    for eintrag in daten:
        if not isinstance(eintrag, dict):
            continue
        mime = str(eintrag.get("mime") or "image/jpeg").strip().lower()
        data = str(eintrag.get("data") or "").strip()
        if mime not in {"image/jpeg", "image/png", "image/webp"} or not data:
            continue
        result.append({"mime": mime, "data": data})
    return result[:MAX_RUECKBLICK_BILDER]


def _gallery_neue_eintraege(bilder):
    result = []
    for eintrag in bilder or []:
        try:
            mime, bild_bytes = eintrag
        except (TypeError, ValueError):
            continue
        mime = str(mime or "image/jpeg").strip().lower()
        if mime not in {"image/jpeg", "image/png", "image/webp"} or not bild_bytes:
            continue
        result.append(
            {
                "mime": mime,
                "data": base64.b64encode(bild_bytes).decode("utf-8"),
            }
        )
    return result


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
    db = SessionLocal()

    try:
        bild_base64 = None

        if bild_bytes:
            bild_base64 = base64.b64encode(bild_bytes).decode("utf-8")

        gallery = _gallery_neue_eintraege(rueckblick_bilder)[:MAX_RUECKBLICK_BILDER]
        veranstaltung = Veranstaltung(
            titel=titel,
            datum=datum,
            uhrzeit=uhrzeit,
            ort=ort,
            kategorie=kategorie,
            beschreibung=beschreibung,
            ansprechpartner=ansprechpartner,
            bild_base64=bild_base64,
            rueckblick_text=rueckblick_text or "",
            rueckblick_bilder_json=json.dumps(gallery) if gallery else None,
            aktiv="Ja",
        )

        db.add(veranstaltung)
        db.commit()
        db.refresh(veranstaltung)

        return veranstaltung

    finally:
        db.close()


def get_aktive_veranstaltungen():
    from datetime import datetime

    db = SessionLocal()

    try:
        alle = (
            db.query(Veranstaltung)
            .filter(Veranstaltung.aktiv == "Ja")
            .all()
        )

        heute = datetime.now().date()
        kommende = []

        for v in alle:
            try:
                datum = datetime.strptime(v.datum, "%d.%m.%Y").date()
                if datum >= heute:
                    kommende.append(v)
            except Exception:
                kommende.append(v)

        def sortierschluessel(veranstaltung):
            try:
                return datetime.strptime(veranstaltung.datum, "%d.%m.%Y")
            except (TypeError, ValueError):
                return datetime.max

        kommende.sort(key=sortierschluessel)

        return kommende

    finally:
        db.close()


def get_vergangene_veranstaltungen():
    from datetime import datetime

    db = SessionLocal()

    try:
        alle = (
            db.query(Veranstaltung)
            .filter(Veranstaltung.aktiv == "Ja")
            .all()
        )

        heute = datetime.now().date()
        vergangene = []

        for v in alle:
            try:
                datum = datetime.strptime(v.datum, "%d.%m.%Y").date()
            except (TypeError, ValueError):
                continue
            if datum < heute:
                vergangene.append(v)

        def sortierschluessel(veranstaltung):
            try:
                return datetime.strptime(veranstaltung.datum, "%d.%m.%Y")
            except (TypeError, ValueError):
                return datetime.min

        vergangene.sort(key=sortierschluessel, reverse=True)
        return vergangene

    finally:
        db.close()


def get_alle_veranstaltungen():
    db = SessionLocal()

    try:
        return db.query(Veranstaltung).all()

    finally:
        db.close()


def get_veranstaltung(veranstaltung_id):
    db = SessionLocal()

    try:
        return (
            db.query(Veranstaltung)
            .filter(Veranstaltung.id == veranstaltung_id)
            .first()
        )

    finally:
        db.close()


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
    db = SessionLocal()

    try:
        veranstaltung = (
            db.query(Veranstaltung)
            .filter(Veranstaltung.id == veranstaltung_id)
            .first()
        )

        if veranstaltung:
            veranstaltung.titel = titel
            veranstaltung.datum = datum
            veranstaltung.uhrzeit = uhrzeit
            veranstaltung.ort = ort
            veranstaltung.kategorie = kategorie
            veranstaltung.beschreibung = beschreibung
            veranstaltung.ansprechpartner = ansprechpartner
            veranstaltung.rueckblick_text = rueckblick_text or ""

            if bild_bytes:
                veranstaltung.bild_base64 = base64.b64encode(
                    bild_bytes
                ).decode("utf-8")

            gallery = [] if rueckblick_bilder_loeschen else _gallery_laden(
                getattr(veranstaltung, "rueckblick_bilder_json", None)
            )
            gallery.extend(_gallery_neue_eintraege(rueckblick_bilder))
            gallery = gallery[-MAX_RUECKBLICK_BILDER:]
            veranstaltung.rueckblick_bilder_json = (
                json.dumps(gallery) if gallery else None
            )

            db.commit()
            db.refresh(veranstaltung)

        return veranstaltung

    finally:
        db.close()


def set_veranstaltung_aktiv(veranstaltung_id, aktiv):
    db = SessionLocal()

    try:
        veranstaltung = (
            db.query(Veranstaltung)
            .filter(Veranstaltung.id == veranstaltung_id)
            .first()
        )

        if veranstaltung:
            veranstaltung.aktiv = aktiv
            db.commit()
            db.refresh(veranstaltung)

        return veranstaltung

    finally:
        db.close()


def delete_veranstaltung(veranstaltung_id):
    db = SessionLocal()

    try:
        veranstaltung = (
            db.query(Veranstaltung)
            .filter(Veranstaltung.id == veranstaltung_id)
            .first()
        )

        if veranstaltung:
            db.delete(veranstaltung)
            db.commit()

        return veranstaltung

    finally:
        db.close()
