from datetime import date, datetime

from database import Base, SessionLocal, engine
from muelltermine_models import MuellAbo, Muelltermin


def init_muelltermine_db():
    Base.metadata.create_all(bind=engine)


def importiere_muelltermine(jahr, adresse, dateiname, termine):
    db = SessionLocal()

    try:
        db.query(Muelltermin).filter(Muelltermin.jahr == jahr).delete(
            synchronize_session=False
        )

        importiert_am = datetime.utcnow()

        for termin in termine:
            db.add(
                Muelltermin(
                    datum=termin["datum"],
                    jahr=jahr,
                    wochentag=termin["wochentag"],
                    abfuhrarten=", ".join(termin["abfuhrarten"]),
                    feiertagsabweichung=(
                        "Ja" if termin["feiertagsabweichung"] else "Nein"
                    ),
                    quelle=dateiname,
                    adresse=adresse,
                    importiert_am=importiert_am,
                )
            )

        db.commit()
        return len(termine)

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


def get_alle_muelltermine(jahr=None):
    db = SessionLocal()

    try:
        abfrage = db.query(Muelltermin)

        if jahr:
            abfrage = abfrage.filter(Muelltermin.jahr == jahr)

        return abfrage.order_by(Muelltermin.datum.asc()).all()

    finally:
        db.close()


def get_naechste_muelltermine(limit=8, ab_datum=None):
    db = SessionLocal()

    try:
        start = ab_datum or date.today()
        return (
            db.query(Muelltermin)
            .filter(Muelltermin.datum >= start)
            .order_by(Muelltermin.datum.asc())
            .limit(limit)
            .all()
        )

    finally:
        db.close()


def get_muelltermin_am(datum):
    db = SessionLocal()

    try:
        return (
            db.query(Muelltermin)
            .filter(Muelltermin.datum == datum)
            .first()
        )

    finally:
        db.close()


def save_muelltermin(datum_text: str, abfuhrarten: str, feiertagsabweichung: bool = False, termin_id: int | None = None):
    try:
        datum = datetime.strptime(str(datum_text or ""), "%Y-%m-%d").date()
    except ValueError as error:
        raise ValueError("Bitte ein gültiges Datum auswählen.") from error
    waste = str(abfuhrarten or "").strip()[:500]
    if len(waste) < 3:
        raise ValueError("Bitte mindestens eine Abfuhrart eintragen.")
    weekdays = ("Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag")
    db = SessionLocal()
    try:
        item = db.query(Muelltermin).filter(Muelltermin.id == termin_id).first() if termin_id else None
        if termin_id and not item:
            raise ValueError("Abfuhrtermin wurde nicht gefunden.")
        if not item:
            item = Muelltermin()
            db.add(item)
        item.datum = datum
        item.jahr = datum.year
        item.wochentag = weekdays[datum.weekday()]
        item.abfuhrarten = waste
        item.feiertagsabweichung = "Ja" if feiertagsabweichung else "Nein"
        item.quelle = "Manuelle Pflege"
        item.adresse = "Ahnsen"
        item.importiert_am = datetime.utcnow()
        db.commit(); db.refresh(item); return item
    finally:
        db.close()


def delete_muelltermin(termin_id: int) -> bool:
    db = SessionLocal()
    try:
        item = db.query(Muelltermin).filter(Muelltermin.id == termin_id).first()
        if not item:
            return False
        db.delete(item); db.commit(); return True
    finally:
        db.close()


def aktiviere_muell_abo(whatsapp_absender):
    db = SessionLocal()

    try:
        abo = (
            db.query(MuellAbo)
            .filter(MuellAbo.whatsapp_absender == whatsapp_absender)
            .first()
        )

        if not abo:
            abo = MuellAbo(
                whatsapp_absender=whatsapp_absender,
                aktiv="Ja",
            )
            db.add(abo)
        else:
            abo.aktiv = "Ja"
            abo.aktualisiert_am = datetime.utcnow()

        db.commit()
        db.refresh(abo)
        return abo

    finally:
        db.close()


def deaktiviere_muell_abo(whatsapp_absender):
    db = SessionLocal()

    try:
        abo = (
            db.query(MuellAbo)
            .filter(MuellAbo.whatsapp_absender == whatsapp_absender)
            .first()
        )
        war_aktiv = bool(abo and abo.aktiv == "Ja")

        if abo:
            abo.aktiv = "Nein"
            abo.aktualisiert_am = datetime.utcnow()
            db.commit()

        return war_aktiv

    finally:
        db.close()


def get_aktive_muell_abos():
    db = SessionLocal()

    try:
        return (
            db.query(MuellAbo)
            .filter(MuellAbo.aktiv == "Ja")
            .order_by(MuellAbo.id.asc())
            .all()
        )

    finally:
        db.close()


def markiere_muell_erinnerung_versendet(abo_id, termin_datum):
    db = SessionLocal()

    try:
        abo = (
            db.query(MuellAbo)
            .filter(MuellAbo.id == abo_id)
            .first()
        )

        if abo:
            abo.letzte_erinnerung_fuer = termin_datum
            abo.aktualisiert_am = datetime.utcnow()
            db.commit()

        return abo

    finally:
        db.close()


def get_muell_import_info():
    db = SessionLocal()

    try:
        letzter = (
            db.query(Muelltermin)
            .order_by(Muelltermin.importiert_am.desc())
            .first()
        )

        if not letzter:
            return None

        anzahl = (
            db.query(Muelltermin)
            .filter(Muelltermin.jahr == letzter.jahr)
            .count()
        )

        return {
            "jahr": letzter.jahr,
            "dateiname": letzter.quelle,
            "adresse": letzter.adresse,
            "importiert_am": letzter.importiert_am,
            "anzahl": anzahl,
        }

    finally:
        db.close()
