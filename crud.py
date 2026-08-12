import base64
from datetime import datetime, timedelta

from sqlalchemy import inspect, or_

from database import Base, SessionLocal, engine
from models import Meldung


def init_db():
    Base.metadata.create_all(bind=engine)

    vorhandene_spalten = {
        spalte["name"] for spalte in inspect(engine).get_columns("meldungen")
    }

    migrationen = {
        "foto_base64": "TEXT",
        "interne_notiz": "TEXT DEFAULT ''",
        "pwa_user_id": "INTEGER",
        "duplicate_candidate_ticket": "VARCHAR",
        "duplicate_score": "INTEGER DEFAULT 0",
        "duplicate_state": "VARCHAR DEFAULT ''",
        "duplicate_of_ticket": "VARCHAR",
        "duplicate_checked_at": "DATETIME",
    }
    for spaltenname, spaltentyp in migrationen.items():
        if spaltenname in vorhandene_spalten:
            continue
        with engine.begin() as conn:
            conn.exec_driver_sql(
                f"ALTER TABLE meldungen ADD COLUMN {spaltenname} {spaltentyp}"
            )
        print(f"Spalte meldungen.{spaltenname} hinzugefügt.")

    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_meldungen_pwa_user_id "
            "ON meldungen (pwa_user_id)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_meldungen_duplicate_candidate_ticket "
            "ON meldungen (duplicate_candidate_ticket)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_meldungen_duplicate_of_ticket "
            "ON meldungen (duplicate_of_ticket)"
        )


def save_meldung(ticket, data, sender, pwa_user_id=None):
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
            pwa_user_id=pwa_user_id,
            interne_notiz="",
            duplicate_state="",
            duplicate_score=0,
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
        return query.filter(Meldung.erstellt_am >= jetzt - timedelta(days=7))
    if zeitraum == "monat":
        return query.filter(Meldung.erstellt_am >= jetzt - timedelta(days=30))
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
                    Meldung.duplicate_candidate_ticket.ilike(f"%{suche}%"),
                    Meldung.duplicate_of_ticket.ilike(f"%{suche}%"),
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


def get_meldungen_fuer_benutzer(user_id):
    db = SessionLocal()
    try:
        return (
            db.query(Meldung)
            .filter(Meldung.pwa_user_id == user_id)
            .order_by(Meldung.erstellt_am.desc())
            .all()
        )
    finally:
        db.close()


def get_duplicate_children(ticket):
    db = SessionLocal()
    try:
        return (
            db.query(Meldung)
            .filter(Meldung.duplicate_of_ticket == ticket)
            .order_by(Meldung.erstellt_am.asc())
            .all()
        )
    finally:
        db.close()


def get_duplicate_overview():
    db = SessionLocal()
    try:
        suspected = db.query(Meldung).filter(Meldung.duplicate_state == "Verdacht").count()
        merged = db.query(Meldung).filter(Meldung.duplicate_state == "Zusammengeführt").count()
        reviewed = db.query(Meldung).filter(Meldung.duplicate_state == "Eigenständig").count()
        return {"suspected": suspected, "merged": merged, "reviewed": reviewed}
    finally:
        db.close()


def mark_duplicate_suspicion(ticket, candidate_ticket, score):
    db = SessionLocal()
    try:
        meldung = db.query(Meldung).filter(Meldung.ticket == ticket).first()
        candidate = db.query(Meldung).filter(Meldung.ticket == candidate_ticket).first()
        if not meldung or not candidate or meldung.ticket == candidate.ticket:
            return None
        meldung.duplicate_candidate_ticket = candidate.ticket
        meldung.duplicate_score = max(0, min(int(score or 0), 100))
        meldung.duplicate_state = "Verdacht"
        meldung.duplicate_checked_at = datetime.utcnow()
        db.commit()
        db.refresh(meldung)
        return meldung
    finally:
        db.close()


def set_duplicate_decision(ticket, action, primary_ticket=""):
    db = SessionLocal()
    try:
        meldung = db.query(Meldung).filter(Meldung.ticket == ticket).first()
        if not meldung:
            return None

        if action == "merge":
            primary = db.query(Meldung).filter(Meldung.ticket == primary_ticket).first()
            if not primary or primary.ticket == meldung.ticket:
                return None
            meldung.duplicate_of_ticket = primary.ticket
            meldung.duplicate_candidate_ticket = primary.ticket
            meldung.duplicate_state = "Zusammengeführt"
            if meldung.duplicate_score is None:
                meldung.duplicate_score = 100
            meldung.status = primary.status
        elif action == "independent":
            meldung.duplicate_of_ticket = None
            meldung.duplicate_state = "Eigenständig"
        elif action == "reset":
            meldung.duplicate_of_ticket = None
            meldung.duplicate_candidate_ticket = None
            meldung.duplicate_score = 0
            meldung.duplicate_state = ""
        else:
            return None

        meldung.duplicate_checked_at = datetime.utcnow()
        db.commit()
        db.refresh(meldung)
        return meldung
    finally:
        db.close()


def update_status(ticket, neuer_status):
    db = SessionLocal()
    try:
        meldung = db.query(Meldung).filter(Meldung.ticket == ticket).first()
        if meldung:
            meldung.status = neuer_status
            # Bei zusammengeführten Vorgängen gilt der Status des Hauptvorgangs
            # auch für die gebündelten Doppelmeldungen.
            for child in db.query(Meldung).filter(Meldung.duplicate_of_ticket == ticket).all():
                child.status = neuer_status
            db.commit()
            db.refresh(meldung)
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
            db.refresh(meldung)
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
