from datetime import datetime

from database import Base, SessionLocal, engine
from gemeinde_models import GemeindeEinstellung


DEFAULT_GEMEINDE_EINSTELLUNGEN = {
    "seiten_titel": "Ahnsen hilft",
    "logo_text": "Ahnsen hilft",
    "hauptfarbe": "#17324d",
    "akzentfarbe": "#2f6f9f",
    "gruen": "#6d8f49",
    "hero_titel": "Willkommen in Ahnsen",
    "hero_untertitel": "Digitale Bürgerplattform der Gemeinde Ahnsen",
    "hero_text": (
        "Informationen, Veranstaltungen, DGH, Mülltermine und Anliegen an "
        "einem Ort – modern, direkt und bürgernah."
    ),
    "hero_bild_url": "/assets/ahnsen-startseite.png",
    "willkommen_text": (
        "Ahnsen liegt im Herzen des Schaumburger Landes, eingebettet zwischen "
        "Harrl und Bückebergen. Die Plattform bündelt wichtige Informationen "
        "und digitale Dienste für Bürgerinnen, Bürger und Gäste."
    ),
    "ueber_ahnsen_text": (
        "Kurze Wege, starke Vereine und eine aktive Dorfgemeinschaft: Ahnsen "
        "verbindet ländliche Lebensqualität mit moderner digitaler Verwaltung."
    ),
    "whatsapp_nummer": "",
    "whatsapp_link": "https://wa.me/",
    "whatsapp_text": (
        "Mit dem WhatsApp-Bot können Bürger Mängel melden, Veranstaltungen "
        "abrufen, Ansprechpartner finden, Mülltermine ansehen, das DGH buchen "
        "und automatische Erinnerungen erhalten."
    ),
    "kontakt_name": "Gemeinde Ahnsen",
    "kontakt_adresse": "Schulstraße 5, 31708 Ahnsen",
    "kontakt_email": "",
    "kontakt_telefon": "",
    "oeffnungszeiten": "Nach Vereinbarung",
    "wichtige_links": (
        "Bürgerinformation|#buergerinfo\n"
        "Vereine und Verbände|#vereine\n"
        "Kalender Dorfgemeinschaftshaus|#dgh\n"
        "Impressum|#footer\n"
        "Datenschutz|#footer"
    ),
    "aktuelles": (
        "Digitale Bürgerplattform gestartet|Mängel, Veranstaltungen, DGH und "
        "Mülltermine werden hier künftig zentral gebündelt.\n"
        "WhatsApp-Bot verfügbar|Viele Anliegen können direkt per WhatsApp "
        "gestartet werden."
    ),
    "vereine": (
        "Feuerwehr|Einsatz, Gemeinschaft und Sicherheit vor Ort.\n"
        "TSV Ahnsen|Sportangebote und Vereinsleben für alle Generationen.\n"
        "Sozialverband|Beratung, Unterstützung und Gemeinschaft.\n"
        "Seniorenclub|Treffen, Austausch und Aktivitäten.\n"
        "Reitverein|Pferdesport und Vereinsleben."
    ),
    "ansprechpartner": (
        "Bürgermeister|Pierre Pohl\n"
        "Gemeindeverwaltung|Samtgemeinde Eilsen\n"
        "Dorfgemeinschaftshaus|Anfragen über diese Plattform"
    ),
    "footer_impressum_url": "/impressum",
    "footer_datenschutz_url": "/datenschutz",
}


def init_gemeinde_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        vorhandene = {
            einstellung.schluessel
            for einstellung in db.query(GemeindeEinstellung).all()
        }

        for schluessel, wert in DEFAULT_GEMEINDE_EINSTELLUNGEN.items():
            if schluessel not in vorhandene:
                db.add(
                    GemeindeEinstellung(
                        schluessel=schluessel,
                        wert=wert,
                    )
                )

        db.commit()

    finally:
        db.close()


def get_gemeinde_einstellungen():
    db = SessionLocal()

    try:
        daten = dict(DEFAULT_GEMEINDE_EINSTELLUNGEN)

        for einstellung in db.query(GemeindeEinstellung).all():
            daten[einstellung.schluessel] = einstellung.wert or ""

        return daten

    finally:
        db.close()


def update_gemeinde_einstellungen(werte):
    erlaubte_schluessel = set(DEFAULT_GEMEINDE_EINSTELLUNGEN)
    db = SessionLocal()

    try:
        vorhandene = {
            einstellung.schluessel: einstellung
            for einstellung in db.query(GemeindeEinstellung).all()
        }

        for schluessel in erlaubte_schluessel:
            wert = str(werte.get(schluessel, "") or "").strip()

            if schluessel in vorhandene:
                vorhandene[schluessel].wert = wert
                vorhandene[schluessel].aktualisiert_am = datetime.utcnow()
            else:
                db.add(
                    GemeindeEinstellung(
                        schluessel=schluessel,
                        wert=wert,
                        aktualisiert_am=datetime.utcnow(),
                    )
                )

        db.commit()

    finally:
        db.close()
