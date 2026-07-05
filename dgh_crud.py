from datetime import datetime, timedelta
from sqlalchemy import inspect

from database import Base, engine, SessionLocal
from dgh_models import DGHTermin


def init_dgh_db():
    Base.metadata.create_all(bind=engine)
    vorhandene_spalten = {spalte["name"] for spalte in inspect(engine).get_columns("dgh_termine")}
    migrationen = {"status": "VARCHAR DEFAULT 'Bestätigt'", "aktiv": "VARCHAR DEFAULT 'Ja'", "kommentar": "TEXT", "whatsapp_absender": "VARCHAR", "erstellt_am": "TIMESTAMP", "aktualisiert_am": "TIMESTAMP"}
    for spaltenname, spaltentyp in migrationen.items():
        if spaltenname in vorhandene_spalten:
            continue
        with engine.begin() as conn:
            conn.exec_driver_sql(f"ALTER TABLE dgh_termine ADD COLUMN {spaltenname} {spaltentyp}")
        print(f"Spalte dgh_termine.{spaltenname} hinzugefügt.")
    with engine.begin() as conn:
        conn.exec_driver_sql("UPDATE dgh_termine SET status = 'Bestätigt' WHERE status = 'Belegt' OR status IS NULL")


def parse_datum(datum_text):
    try:
        return datetime.strptime(datum_text, "%d.%m.%Y").date()
    except Exception:
        return None


def _hat_bestaetigten_konflikt(db, datum_text, ausgenommen_id=None):
    datum = parse_datum(datum_text)
    if not datum:
        return False
    query = db.query(DGHTermin).filter(DGHTermin.status == "Bestätigt").filter(DGHTermin.aktiv == "Ja")
    if ausgenommen_id is not None:
        query = query.filter(DGHTermin.id != ausgenommen_id)
    return any(parse_datum(termin.datum) == datum for termin in query.all())


def save_dgh_termin(datum, uhrzeit, anlass, name, telefon, kommentar, status="Bestätigt", whatsapp_absender=None):
    db = SessionLocal()
    try:
        if status == "Bestätigt" and _hat_bestaetigten_konflikt(db, datum):
            raise ValueError("Für diesen Tag ist bereits ein Termin bestätigt.")
        termin = DGHTermin(datum=datum, uhrzeit=uhrzeit, anlass=anlass, name=name, telefon=telefon, kommentar=kommentar, status=status, aktiv="Ja", whatsapp_absender=whatsapp_absender, erstellt_am=datetime.utcnow(), aktualisiert_am=datetime.utcnow())
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
        termine.sort(key=lambda t: parse_datum(t.datum) or datetime.max.date())
        return termine
    finally:
        db.close()


def get_aktive_dgh_termine():
    db = SessionLocal()
    try:
        heute = datetime.today().date()
        termine = db.query(DGHTermin).filter(DGHTermin.aktiv == "Ja").all()
        kommende = [t for t in termine if parse_datum(t.datum) is None or parse_datum(t.datum) >= heute]
        kommende.sort(key=lambda t: parse_datum(t.datum) or datetime.max.date())
        return kommende
    finally:
        db.close()


def get_dgh_anfragen():
    db = SessionLocal()
    try:
        termine = db.query(DGHTermin).filter(DGHTermin.status == "Anfrage").filter(DGHTermin.aktiv == "Ja").all()
        termine.sort(key=lambda t: parse_datum(t.datum) or datetime.max.date())
        return termine
    finally:
        db.close()


def get_dgh_termin(termin_id):
    db = SessionLocal()
    try:
        return db.query(DGHTermin).filter(DGHTermin.id == termin_id).first()
    finally:
        db.close()


def update_dgh_termin(termin_id, datum, uhrzeit, anlass, name, telefon, kommentar):
    db = SessionLocal()
    try:
        termin = db.query(DGHTermin).filter(DGHTermin.id == termin_id).first()
        if termin:
            if termin.status == "Bestätigt" and _hat_bestaetigten_konflikt(db, datum, ausgenommen_id=termin_id):
                raise ValueError("Für diesen Tag ist bereits ein Termin bestätigt.")
            termin.datum = datum
            termin.uhrzeit = uhrzeit
            termin.anlass = anlass
            termin.name = name
            termin.telefon = telefon
            termin.kommentar = kommentar
            termin.aktualisiert_am = datetime.utcnow()
            db.commit()
            db.refresh(termin)
        return termin
    finally:
        db.close()


def set_dgh_termin_aktiv(termin_id, aktiv):
    db = SessionLocal()
    try:
        termin = db.query(DGHTermin).filter(DGHTermin.id == termin_id).first()
        if termin:
            termin.aktiv = aktiv
            termin.aktualisiert_am = datetime.utcnow()
            db.commit()
            db.refresh(termin)
        return termin
    finally:
        db.close()


def set_dgh_status(termin_id, status):
    db = SessionLocal()
    try:
        termin = db.query(DGHTermin).filter(DGHTermin.id == termin_id).first()
        alter_status = termin.status if termin else None
        if termin:
            if status == "Bestätigt" and _hat_bestaetigten_konflikt(db, termin.datum, ausgenommen_id=termin_id):
                raise ValueError("Für diesen Tag ist bereits ein Termin bestätigt.")
            termin.status = status
            termin.aktualisiert_am = datetime.utcnow()
            db.commit()
            db.refresh(termin)
        return termin, alter_status
    finally:
        db.close()


def delete_dgh_termin(termin_id):
    db = SessionLocal()
    try:
        termin = db.query(DGHTermin).filter(DGHTermin.id == termin_id).first()
        if termin:
            db.delete(termin)
            db.commit()
        return termin
    finally:
        db.close()


def ist_dgh_belegt(datum_text):
    if not parse_datum(datum_text):
        return False
    db = SessionLocal()
    try:
        return _hat_bestaetigten_konflikt(db, datum_text)
    finally:
        db.close()


def get_freie_tage(anzahl_tage=30):
    belegte_daten = {parse_datum(termin.datum) for termin in get_aktive_dgh_termine() if parse_datum(termin.datum) and termin.status == "Bestätigt"}
    heute = datetime.today().date()
    return [heute + timedelta(days=i) for i in range(anzahl_tage) if heute + timedelta(days=i) not in belegte_daten]
