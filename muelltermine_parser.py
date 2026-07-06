import re
from datetime import datetime
from io import BytesIO

from pypdf import PdfReader


WOCHENTAGE = (
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag",
    "Sonntag",
)

TERMIN_MUSTER = re.compile(
    r"^\s*(?P<datum>\d{2}\.\d{2}\.\d{4})(?P<stern>\*)?\s+"
    rf"(?P<wochentag>{'|'.join(WOCHENTAGE)})\s+"
    r"(?P<abfuhrarten>.+?)\s*$"
)

BEKANNTE_ABFUHRARTEN = {
    "bioabfall": "Bioabfall",
    "biotonne": "Bioabfall",
    "leichtverpackungen": "Leichtverpackungen",
    "gelbe tonne": "Leichtverpackungen",
    "restabfall": "Restabfall",
    "restmüll": "Restabfall",
    "altpapier": "Altpapier",
    "papiertonne": "Altpapier",
    "sommerbiotonne": "Sommerbiotonne",
}


def _normalisiere_abfuhrarten(text):
    ergebnis = []

    for teil in text.split(","):
        wert = re.sub(r"\s+", " ", teil).strip()
        normalisiert = BEKANNTE_ABFUHRARTEN.get(wert.casefold())

        if normalisiert and normalisiert not in ergebnis:
            ergebnis.append(normalisiert)

    return ergebnis


def _finde_adresse(text):
    for zeile in text.splitlines():
        bereinigt = re.sub(r"\s+", " ", zeile).strip()
        if "ahnsen" in bereinigt.casefold() and re.search(r"\d{5}", bereinigt):
            return bereinigt

    return "Ahnsen"


def lese_muelltermine_aus_pdf(pdf_bytes):
    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise ValueError("Die hochgeladene Datei ist keine gültige PDF.")

    try:
        reader = PdfReader(BytesIO(pdf_bytes))
    except Exception as error:
        raise ValueError("Die PDF konnte nicht geöffnet werden.") from error

    if reader.is_encrypted:
        raise ValueError("Passwortgeschützte PDFs können nicht ausgelesen werden.")

    seiten_text = []

    try:
        for seite in reader.pages:
            seiten_text.append(seite.extract_text() or "")
    except Exception as error:
        raise ValueError("Der Text der PDF konnte nicht ausgelesen werden.") from error

    gesamter_text = "\n".join(seiten_text)

    if "ahnsen" not in gesamter_text.casefold():
        raise ValueError(
            "In der PDF wurde kein Abfuhrkalender für Ahnsen erkannt."
        )

    adresse = _finde_adresse(gesamter_text)
    termine = {}

    for zeile in gesamter_text.splitlines():
        treffer = TERMIN_MUSTER.match(zeile)
        if not treffer:
            continue

        try:
            datum = datetime.strptime(
                treffer.group("datum"),
                "%d.%m.%Y",
            ).date()
        except ValueError:
            continue

        abfuhrarten = _normalisiere_abfuhrarten(
            treffer.group("abfuhrarten")
        )
        if not abfuhrarten:
            continue

        eintrag = termine.setdefault(
            datum,
            {
                "datum": datum,
                "wochentag": treffer.group("wochentag"),
                "abfuhrarten": [],
                "feiertagsabweichung": bool(treffer.group("stern")),
            },
        )

        for abfuhrart in abfuhrarten:
            if abfuhrart not in eintrag["abfuhrarten"]:
                eintrag["abfuhrarten"].append(abfuhrart)

        if treffer.group("stern"):
            eintrag["feiertagsabweichung"] = True

    sortierte_termine = sorted(
        termine.values(),
        key=lambda termin: termin["datum"],
    )

    if len(sortierte_termine) < 12:
        raise ValueError(
            "Es wurden zu wenige Abfuhrtermine erkannt. "
            "Bitte prüfe, ob es der AWS-Jahreskalender für Ahnsen ist."
        )

    jahre = {termin["datum"].year for termin in sortierte_termine}
    if len(jahre) != 1:
        raise ValueError(
            "Die PDF muss die Termine eines einzelnen Kalenderjahres enthalten."
        )

    return {
        "jahr": jahre.pop(),
        "adresse": adresse,
        "termine": sortierte_termine,
    }
