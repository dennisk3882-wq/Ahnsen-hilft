from datetime import datetime

from database import Base, SessionLocal, engine
from chat_models import ChatKontakt, ChatNachricht


def init_chat_db():
    Base.metadata.create_all(bind=engine)


def _bereinige_nummer(whatsapp_nummer):
    return str(whatsapp_nummer or "").strip()


def speichere_chat_kontakt(
    whatsapp_nummer,
    name=None,
    zuletzt_aktiv=None,
):
    nummer = _bereinige_nummer(whatsapp_nummer)

    if not nummer:
        return None

    db = SessionLocal()

    try:
        kontakt = (
            db.query(ChatKontakt)
            .filter(ChatKontakt.whatsapp_nummer == nummer)
            .first()
        )

        jetzt = zuletzt_aktiv or datetime.utcnow()

        if not kontakt:
            kontakt = ChatKontakt(
                whatsapp_nummer=nummer,
                name=(name or "").strip() or None,
                zuletzt_aktiv=jetzt,
            )
            db.add(kontakt)
        else:
            if name and name.strip():
                kontakt.name = name.strip()
            kontakt.zuletzt_aktiv = jetzt
            kontakt.aktualisiert_am = datetime.utcnow()

        db.commit()
        db.refresh(kontakt)
        return kontakt

    finally:
        db.close()


def speichere_chatnachricht(
    whatsapp_nummer,
    richtung,
    inhalt,
    nachricht_typ="text",
    name=None,
    erstellt_am=None,
):
    nummer = _bereinige_nummer(whatsapp_nummer)

    if not nummer:
        return None

    zeitpunkt = erstellt_am or datetime.utcnow()
    db = SessionLocal()

    try:
        kontakt = (
            db.query(ChatKontakt)
            .filter(ChatKontakt.whatsapp_nummer == nummer)
            .first()
        )

        if not kontakt:
            kontakt = ChatKontakt(
                whatsapp_nummer=nummer,
                name=(name or "").strip() or None,
                zuletzt_aktiv=zeitpunkt,
            )
            db.add(kontakt)
        else:
            if name and name.strip():
                kontakt.name = name.strip()
            kontakt.zuletzt_aktiv = zeitpunkt
            kontakt.aktualisiert_am = datetime.utcnow()

        nachricht = ChatNachricht(
            whatsapp_nummer=nummer,
            richtung=richtung,
            nachricht_typ=nachricht_typ,
            inhalt=str(inhalt or "").strip(),
            erstellt_am=zeitpunkt,
        )
        db.add(nachricht)
        db.commit()
        db.refresh(nachricht)
        return nachricht

    finally:
        db.close()


def get_chat_uebersicht():
    db = SessionLocal()

    try:
        kontakte = (
            db.query(ChatKontakt)
            .order_by(ChatKontakt.zuletzt_aktiv.desc(), ChatKontakt.id.desc())
            .all()
        )

        return [
            {
                "name": kontakt.name or "",
                "whatsapp_nummer": kontakt.whatsapp_nummer,
                "zuletzt_aktiv": kontakt.zuletzt_aktiv,
            }
            for kontakt in kontakte
        ]

    finally:
        db.close()


def get_chat_kontakt(whatsapp_nummer):
    nummer = _bereinige_nummer(whatsapp_nummer)
    db = SessionLocal()

    try:
        kontakt = (
            db.query(ChatKontakt)
            .filter(ChatKontakt.whatsapp_nummer == nummer)
            .first()
        )

        if not kontakt:
            return None

        return {
            "name": kontakt.name or "",
            "whatsapp_nummer": kontakt.whatsapp_nummer,
            "zuletzt_aktiv": kontakt.zuletzt_aktiv,
        }

    finally:
        db.close()


def get_chat_verlauf(whatsapp_nummer):
    nummer = _bereinige_nummer(whatsapp_nummer)
    db = SessionLocal()

    try:
        nachrichten = (
            db.query(ChatNachricht)
            .filter(ChatNachricht.whatsapp_nummer == nummer)
            .order_by(ChatNachricht.erstellt_am.asc(), ChatNachricht.id.asc())
            .all()
        )

        return [
            {
                "richtung": nachricht.richtung,
                "nachricht_typ": nachricht.nachricht_typ,
                "inhalt": nachricht.inhalt or "",
                "erstellt_am": nachricht.erstellt_am,
            }
            for nachricht in nachrichten
        ]

    finally:
        db.close()


def get_kontakt_namen_map(whatsapp_nummern):
    nummern = [
        _bereinige_nummer(nummer)
        for nummer in whatsapp_nummern
        if _bereinige_nummer(nummer)
    ]

    if not nummern:
        return {}

    db = SessionLocal()

    try:
        kontakte = (
            db.query(ChatKontakt)
            .filter(ChatKontakt.whatsapp_nummer.in_(nummern))
            .all()
        )

        return {
            kontakt.whatsapp_nummer: kontakt.name or ""
            for kontakt in kontakte
        }

    finally:
        db.close()
