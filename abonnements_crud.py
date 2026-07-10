from datetime import datetime

from database import SessionLocal
from chat_crud import get_kontakt_namen_map
from muelltermine_models import MuellAbo


ABONNEMENT_TYPEN = {
    "muelltermine": "Mülltermine",
}


def get_abonnement_uebersicht():
    db = SessionLocal()

    try:
        muell_abos = db.query(MuellAbo).order_by(MuellAbo.id.desc()).all()
        namen = get_kontakt_namen_map(
            [abo.whatsapp_absender for abo in muell_abos]
        )

        abos = []
        for abo in muell_abos:
            abos.append(
                {
                    "id": abo.id,
                    "typ": "muelltermine",
                    "abonnement": ABONNEMENT_TYPEN["muelltermine"],
                    "name": namen.get(abo.whatsapp_absender, ""),
                    "whatsapp_nummer": abo.whatsapp_absender,
                    "aktiv": abo.aktiv == "Ja",
                }
            )

        return abos

    finally:
        db.close()


def set_abonnement_status(abo_typ, abo_id, aktiv):
    if abo_typ != "muelltermine":
        raise ValueError("Unbekannter Abonnement-Typ")

    db = SessionLocal()

    try:
        abo = db.query(MuellAbo).filter(MuellAbo.id == abo_id).first()

        if not abo:
            raise ValueError("Abonnement wurde nicht gefunden")

        abo.aktiv = "Ja" if aktiv else "Nein"
        abo.aktualisiert_am = datetime.utcnow()
        db.commit()
        return abo

    finally:
        db.close()
