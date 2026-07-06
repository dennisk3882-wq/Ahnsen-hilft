from datetime import date, datetime

from database import Base, SessionLocal, engine
from muelltermine_models import Muelltermin


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
