from html.parser import HTMLParser
from urllib.parse import urljoin

import requests


ALT_HOMEPAGE_URL = "https://www.ahnsen-schaumburg.de/"


class _HomepageTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.teile = []
        self.links = []
        self._aktueller_link = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)

        if tag == "a":
            self._aktueller_link = {
                "href": attrs.get("href", ""),
                "text": "",
            }

        if tag in {"p", "br", "li", "h1", "h2", "h3", "div"}:
            self.teile.append("\n")

    def handle_endtag(self, tag):
        if tag == "a" and self._aktueller_link:
            text = " ".join(self._aktueller_link["text"].split())
            href = self._aktueller_link["href"]
            if text and href:
                self.links.append({"text": text, "href": href})
            self._aktueller_link = None

        if tag in {"p", "li", "h1", "h2", "h3", "div"}:
            self.teile.append("\n")

    def handle_data(self, data):
        text = data.strip()
        if not text:
            return

        self.teile.append(text)
        self.teile.append(" ")

        if self._aktueller_link is not None:
            self._aktueller_link["text"] += " " + text


def _saubere_zeilen(text):
    zeilen = []

    for zeile in text.splitlines():
        zeile = " ".join(zeile.split())
        if not zeile:
            continue
        if zeile.lower() in {"navigation einblenden", "navigation ausblenden"}:
            continue
        if zeile not in zeilen:
            zeilen.append(zeile)

    return zeilen


def _abschnitt(zeilen, start_text, ende_starts=None, max_zeilen=8):
    ende_starts = ende_starts or []
    start_index = None

    for index, zeile in enumerate(zeilen):
        if start_text.casefold() in zeile.casefold():
            start_index = index + 1
            break

    if start_index is None:
        return ""

    ergebnis = []

    for zeile in zeilen[start_index:]:
        if any(zeile.casefold().startswith(ende.casefold()) for ende in ende_starts):
            break
        if len(ergebnis) >= max_zeilen:
            break
        ergebnis.append(zeile)

    return "\n".join(ergebnis).strip()


def _link_liste(links):
    erlaubte = [
        "Bürgerinformation",
        "Gemeinde Ahnsen",
        "Gemeinderat",
        "Einladungen",
        "Protokolle",
        "Vereine und Verbände",
        "Feuerwehr",
        "TSV Ahnsen",
        "Sozialverband",
        "Seniorenclub",
        "Reitverein",
        "Geschichte",
        "Presseschau",
        "Deutsche Glasfaser",
        "Bahnprojekt",
        "Kalender Dorfgemeinschaftshaus",
        "Impressum",
        "Datenschutz",
        "Barrierefreiheit",
    ]
    zeilen = []
    gesehen = set()

    for link in links:
        text = link["text"].strip()
        href = urljoin(ALT_HOMEPAGE_URL, link["href"])

        if not any(wert.casefold() in text.casefold() for wert in erlaubte):
            continue

        schluessel = text.casefold()
        if schluessel in gesehen:
            continue
        gesehen.add(schluessel)
        zeilen.append(f"{text}|{href}")

    return "\n".join(zeilen)


def lade_alte_homepage_inhalte(url=ALT_HOMEPAGE_URL):
    antwort = requests.get(url, timeout=20)
    antwort.raise_for_status()
    antwort.encoding = antwort.encoding or "utf-8"

    parser = _HomepageTextParser()
    parser.feed(antwort.text)

    zeilen = _saubere_zeilen("".join(parser.teile))
    komplett = "\n".join(zeilen)

    begruessung = _abschnitt(
        zeilen,
        "Begrüßung des Bürgermeisters",
        ende_starts=["In Ahnsen wurde", "Frühere Ortsnamen", "Wir bei facebook"],
        max_zeilen=12,
    )
    geschichte = _abschnitt(
        zeilen,
        "Frühere Ortsnamen",
        ende_starts=["Vergrößern", "Wir bei facebook"],
        max_zeilen=5,
    )

    led_hinweis = ""
    for zeile in zeilen:
        if "Straßenbeleuchtung" in zeile or "LED Technik" in zeile:
            led_hinweis = zeile
            break

    daten = {
        "willkommen_text": begruessung or (
            "Herzlich willkommen auf der digitalen Bürgerplattform der "
            "Gemeinde Ahnsen."
        ),
        "ueber_ahnsen_text": "\n".join(
            wert for wert in [
                "Ahnsen liegt im Herzen des Schaumburger Landes, eingebettet "
                "zwischen Harrl und Bückeberge.",
                geschichte,
            ] if wert
        ),
        "buergerinfo_text": "\n".join(
            wert for wert in [
                "Die folgenden Inhalte wurden aus der bisherigen Homepage "
                "übernommen und können hier redaktionell weiter gepflegt werden.",
                led_hinweis,
            ] if wert
        ),
        "feuerwehr_text": (
            "Die Feuerwehr Ahnsen ist Teil des Vereins- und Verbandslebens der "
            "Gemeinde. Weitere Detailinformationen können im Dashboard ergänzt "
            "werden."
        ),
        "vereine": (
            "Feuerwehr|Einsatz, Gemeinschaft und Sicherheit vor Ort.\n"
            "TSV Ahnsen|Sportangebote und Vereinsleben für alle Generationen.\n"
            "Sozialverband|Beratung, Unterstützung und Gemeinschaft.\n"
            "Seniorenclub|Treffen, Austausch und Aktivitäten.\n"
            "Reitverein|Pferdesport und Vereinsleben."
        ),
        "wichtige_links": _link_liste(parser.links),
        "aktuelles": "\n".join(
            wert for wert in [
                (
                    "Inhalte der bisherigen Homepage übernommen|Die wichtigsten "
                    "Informationen der alten Gemeindeseite wurden automatisch "
                    "ausgelesen und in die neue Plattform übertragen."
                ),
                f"LED-Straßenbeleuchtung|{led_hinweis}" if led_hinweis else "",
            ] if wert
        ),
        "externe_website_url": url,
        "alt_homepage_import_quelle": url,
    }

    daten["alt_homepage_import_rohtext"] = komplett[:12000]
    return daten
