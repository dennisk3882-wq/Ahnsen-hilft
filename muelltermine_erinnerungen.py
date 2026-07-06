from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from config import (
    WHATSAPP_MUELL_TEMPLATE,
    WHATSAPP_TEMPLATE_LANGUAGE,
)
from muelltermine_crud import (
    get_aktive_muell_abos,
    get_muelltermin_am,
    markiere_muell_erinnerung_versendet,
)
from muelltermine_texte import (
    formatiere_abfuhrarten,
    verbinde_aufzaehlung,
)
from whatsapp import send_whatsapp_template


BERLIN = ZoneInfo("Europe/Berlin")


def _lokale_zeit(zeitpunkt=None):
    if zeitpunkt is None:
        return datetime.now(BERLIN)
    if zeitpunkt.tzinfo is None:
        return zeitpunkt.replace(tzinfo=BERLIN)
    return zeitpunkt.astimezone(BERLIN)


def _antwort_erfolgreich(antwort):
    if isinstance(antwort, bool):
        return antwort

    if hasattr(antwort, "ok"):
        return bool(antwort.ok)

    status_code = getattr(antwort, "status_code", 0)
    return 200 <= status_code < 300


def versende_muell_erinnerungen(zeitpunkt=None, sendefunktion=None):
    jetzt = _lokale_zeit(zeitpunkt)
    termin_datum = jetzt.date() + timedelta(days=1)
    termin = get_muelltermin_am(termin_datum)

    ergebnis = {
        "termin": termin_datum,
        "abonnements": 0,
        "versendet": 0,
        "uebersprungen": 0,
        "fehlgeschlagen": 0,
    }

    if not termin:
        return ergebnis

    arten = verbinde_aufzaehlung(
        formatiere_abfuhrarten(termin.abfuhrarten)
    )
    senden = sendefunktion or send_whatsapp_template

    for abo in get_aktive_muell_abos():
        ergebnis["abonnements"] += 1

        if abo.letzte_erinnerung_fuer == termin_datum:
            ergebnis["uebersprungen"] += 1
            continue

        try:
            antwort = senden(
                abo.whatsapp_absender,
                WHATSAPP_MUELL_TEMPLATE,
                WHATSAPP_TEMPLATE_LANGUAGE,
                [
                    termin_datum.strftime("%d.%m.%Y"),
                    arten,
                ],
            )
        except Exception as error:
            print(
                "Müllabfuhr-Erinnerung konnte nicht gesendet werden:",
                repr(error),
            )
            ergebnis["fehlgeschlagen"] += 1
            continue

        if not _antwort_erfolgreich(antwort):
            ergebnis["fehlgeschlagen"] += 1
            continue

        markiere_muell_erinnerung_versendet(abo.id, termin_datum)
        ergebnis["versendet"] += 1

    return ergebnis
