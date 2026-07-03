from database import Base, engine, SessionLocal
from models import Meldung


def init_db():
    Base.metadata.create_all(bind=engine)


def save_meldung(ticket, data, sender):
    db = SessionLocal()

    try:
        meldung = Meldung(
            ticket=ticket,
            status="Offen",
            art=data.get("art"),
            ort=data.get("ort"),
            beschreibung=data.get("beschreibung"),
            foto_vorhanden="Ja" if data.get("foto_bytes") else "Nein",
            whatsapp_absender=sender,
        )

        db.add(meldung)
        db.commit()
        db.refresh(meldung)

        print("Meldung gespeichert:", ticket)

        return meldung

    finally:
        db.close()
