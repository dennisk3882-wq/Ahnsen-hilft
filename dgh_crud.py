from datetime import datetime, timedelta

from database import Base, engine, SessionLocal
from dgh_models import DGHTermin


def init_dgh_db():
    Base.metadata.create_all(bind=engine)


def parse_datum(datum_text):
    try:
        return datetime.strptime(datum_text, "%d.%m.%Y").date()
    except Exception:
        return None


def save_dgh_termin(datum, uhrzeit, anlass, name, telefon, kommentar):
    db = SessionLocal()

    try:
        termin = DGHTermin(
            datum=datum,
            uhrzeit=uhrzeit,
            anlass=anlass,
            name=name,
            telefon=telefon,
            kommentar=kommentar,
            status="Belegt",
            aktiv="Ja",
        )

        db.add(termin)
        db.commit()
        db.refresh(termin)

        return termin

    finally:
        db.close()


def get_alle_dgh_termine():
    db = SessionLocal()

    try:
        termine = db.query(DGHTermin).all()

        termine.sort(
            key=lambda t: parse_datum(t.datum) or datetime.max.date()
        )

        return termine

    finally:
        db.close()


def get_aktive_dgh_termine():
    db = SessionLocal()

    try:
        heute = datetime.today().date()

        termine = (
            db.query(DGHTermin)
            .filter(DGHTermin.aktiv == "Ja")
            .all()
        )

        kommende = []

        for t in termine:
            datum = parse_datum(t.datum)

            if datum is None or datum >= heute:
                kommende.append(t)

        kommende.sort(
            key=lambda t: parse_datum(t.datum) or datetime.max.date()
        )

        return kommende

    finally:
        db.close()


def get_dgh_termin(termin_id):
    db = SessionLocal()

    try:
        return (
            db.query(DGHTermin)
            .filter(DGHTermin.id == termin_id)
            .first()
        )

    finally:
        db.close()


def update_dgh_termin(termin_id, datum, uhrzeit, anlass, name, telefon, kommentar):
    db = SessionLocal()

    try:
        termin = (
            db.query(DGHTermin)
            .filter(DGHTermin.id == termin_id)
            .first()
        )

        if termin:
            termin.datum = datum
            termin.uhrzeit = uhrzeit
            termin.anlass = anlass
            termin.name = name
            termin.telefon = telefon
            termin.kommentar = kommentar

            db.commit()
            db.refresh(termin)

        return termin

    finally:
        db.close()


def set_dgh_termin_aktiv(termin_id, aktiv):
    db = SessionLocal()

    try:
        termin = (
            db.query(DGHTermin)
            .filter(DGHTermin.id == termin_id)
            .first()
        )

        if termin:
            termin.aktiv = aktiv
            db.commit()
            db.refresh(termin)

        return termin

    finally:
        db.close()


def delete_dgh_termin(termin_id):
    db = SessionLocal()

    try:
        termin = (
            db.query(DGHTermin)
            .filter(DGHTermin.id == termin_id)
            .first()
        )

        if termin:
            db.delete(termin)
            db.commit()

        return termin

    finally:
        db.close()


def get_freie_tage(anzahl_tage=30):
    belegte = get_aktive_dgh_termine()

    belegte_daten = set()

    for termin in belegte:
        datum = parse_datum(termin.datum)
        if datum:
            belegte_daten.add(datum)

    heute = datetime.today().date()
    freie_tage = []

    for i in range(anzahl_tage):
        tag = heute + timedelta(days=i)

        if tag not in belegte_daten:
            freie_tage.append(tag)

    return freie_tage
