import base64

from database import Base, engine, SessionLocal
from veranstaltungen_models import Veranstaltung


def init_veranstaltungen_db():
    Base.metadata.create_all(bind=engine)


def save_veranstaltung(
    titel,
    datum,
    uhrzeit,
    ort,
    beschreibung,
    ansprechpartner,
    bild_bytes=None,
):
    db = SessionLocal()

    try:
        bild_base64 = None

        if bild_bytes:
            bild_base64 = base64.b64encode(bild_bytes).decode("utf-8")

        veranstaltung = Veranstaltung(
            titel=titel,
            datum=datum,
            uhrzeit=uhrzeit,
            ort=ort,
            beschreibung=beschreibung,
            ansprechpartner=ansprechpartner,
            bild_base64=bild_base64,
            aktiv="Ja",
        )

        db.add(veranstaltung)
        db.commit()
        db.refresh(veranstaltung)

        return veranstaltung

    finally:
        db.close()


def get_aktive_veranstaltungen():
    db = SessionLocal()

    try:
        return (
            db.query(Veranstaltung)
            .filter(Veranstaltung.aktiv == "Ja")
            .order_by(Veranstaltung.datum.asc())
            .all()
        )

    finally:
        db.close()


def get_alle_veranstaltungen():
    db = SessionLocal()

    try:
        return (
            db.query(Veranstaltung)
            .order_by(Veranstaltung.datum.asc())
            .all()
        )

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
    beschreibung,
    ansprechpartner,
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
            veranstaltung.beschreibung = beschreibung
            veranstaltung.ansprechpartner = ansprechpartner

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
