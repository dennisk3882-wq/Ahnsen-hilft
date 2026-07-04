import base64
from datetime import datetime, timedelta
from sqlalchemy import or_

from database import Base, engine, SessionLocal
from models import Meldung


def init_db():
    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        try:
            conn.exec_driver_sql("ALTER TABLE meldungen ADD COLUMN foto_base64 TEXT")
            print("Spalte foto_base64 hinzugefügt.")
        except Exception as e:
            print("foto_base64:", repr(e))

        try:
            conn.exec_driver_sql("ALTER TABLE meldungen ADD COLUMN interne_notiz TEXT DEFAULT ''")
            print("Spalte interne_notiz hinzugefügt.")
        except Exception as e:
            print("interne_notiz:", repr(e))


def save_meldung(ticket, data, sender):
    db = SessionLocal()

    try:
        foto_bytes = data.get("foto_bytes")
        foto_base64 = None

        if foto_bytes:
            foto_base64 = base64.b64encode(foto_bytes).decode("utf-8")

        meldung = Meldung(
            ticket=ticket,
            status="Offen",
            art=data.get("art"),
            ort=data.get("ort"),
            beschreibung=data.get("beschreibung"),
            foto_vorhanden="Ja" if foto_bytes else "Nein",
            foto_base64=foto_base64,
            whatsapp_absender=sender,
            interne_notiz="",
        )

        db.add(meldung)
        db.commit()
        db.refresh(meldung)

        print("Meldung gespeichert:", ticket)
        return meldung

    finally:
        db.close()


def _zeitraum_filter(query, zeitraum):
    jetzt = datetime.utcnow()

    if zeitraum == "heute":
        start = datetime(jetzt.year, jetzt.month, jetzt.day)
        return query.filter(Meldung.erstellt_am >= start)

    if zeitraum == "woche":
        start = jetzt - timedelta(days=7)
        return query.filter(Meldung.erstellt_am >= start)

    if zeitraum == "monat":
        start = jetzt - timedelta(days=30)
        return query.filter(Meldung.erstellt_am >= start)

    return query


def suche_meldungen(suche="", status_filter="", zeitraum=""):
    db = SessionLocal()

    try:
        query = db.query(Meldung)

        if suche:
            query = query.filter(
                or_(
                    Meldung.ticket.ilike(f"%{suche}%"),
                    Meldung.art.ilike(f"%{suche}%"),
                    Meldung.ort.ilike(f"%{suche}%"),
                    Meldung.beschreibung.ilike(f"%{suche}%"),
                    Meldung.status.ilike(f"%{suche}%"),
                    Meldung.whatsapp_absender.ilike(f"%{suche}%"),
                    Meldung.interne_notiz.ilike(f"%{suche}%"),
                )
            )

        if status_filter:
            query = query.filter(Meldung.status == status_filter)

        query = _zeitraum_filter(query, zeitraum)

        return query.order_by(Meldung.erstellt_am.desc()).all()

    finally:
        db.close()


def get_meldung(ticket):
    db = SessionLocal()

    try:
        return db.query(Meldung).filter(Meldung.ticket == ticket).first()

    finally:
        db.close()


def update_status(ticket, neuer_status):
    db = SessionLocal()

    try:
        meldung = db.query(Meldung).filter(Meldung.ticket == ticket).first()

        if meldung:
            meldung.status = neuer_status
            db.commit()
            print("Status geändert:", ticket, neuer_status)

        return meldung

    finally:
        db.close()


def update_notiz(ticket, notiz):
    db = SessionLocal()

    try:
        meldung = db.query(Meldung).filter(Meldung.ticket == ticket).first()

        if meldung:
            meldung.interne_notiz = notiz
            db.commit()
            print("Notiz gespeichert:", ticket)

        return meldung

    finally:
        db.close()


def statistik():
    db = SessionLocal()

    try:
        return {
            "offen": db.query(Meldung).filter(Meldung.status == "Offen").count(),
            "bearbeitung": db.query(Meldung).filter(Meldung.status == "In Bearbeitung").count(),
            "erledigt": db.query(Meldung).filter(Meldung.status == "Erledigt").count(),
            "gesamt": db.query(Meldung).count(),
        }

    finally:
        db.close()
