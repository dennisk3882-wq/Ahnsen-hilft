from datetime import datetime, timedelta
from uuid import uuid4

from state import get_state, save_state, reset_state
from whatsapp import send_whatsapp_message
from media import download_whatsapp_image
from email_service import send_email
from crud import save_meldung, update_notiz
from veranstaltungen_crud import get_aktive_veranstaltungen
from dgh_crud import (
    get_aktive_dgh_termine,
    get_freie_tage,
    save_dgh_termin,
    parse_datum,
    ist_dgh_belegt,
)

try:
    from whatsapp import send_whatsapp_image
except ImportError:
    send_whatsapp_image = None


MENU = """👋 Willkommen bei Ahnsen hilft

Bitte antworte mit einer Zahl:

1️⃣ Mängelmelder
2️⃣ Veranstaltungen
3️⃣ Vereine
4️⃣ Feuerwehr
5️⃣ Ansprechpartner
6️⃣ Aktuelles
7️⃣ Mülltermine
8️⃣ DGH buchen
0️⃣ Ende
"""

MANGEL_MENU = """⚠️ Welchen Mangel möchtest du melden?

1️⃣ Straßenlaterne defekt
2️⃣ Schlagloch
3️⃣ Straßenschild beschädigt
4️⃣ Müllablagerung
5️⃣ Sonstiger Schaden
0️⃣ Zurück
"""

MANGEL_ARTEN = {
    "1": "Straßenlaterne defekt",
    "2": "Schlagloch",
    "3": "Straßenschild beschädigt",
    "4": "Müllablagerung",
    "5": "Sonstiger Schaden",
}


def build_confirmation_text(data):
    foto_text = "Ja" if data.get("foto_bytes") else "Nein"

    return f"""Bitte prüfe deine Meldung:

Art:
{data.get("art")}

Ort:
{data.get("ort")}

Beschreibung:
{data.get("beschreibung")}

Foto:
{foto_text}

Mit „Ja“ absenden oder mit „Zurück“ abbrechen."""


def build_veranstaltung_text(v):
    return f"""🎉 *{v.titel}*

📅 {v.datum or "-"}
🕒 {v.uhrzeit or "-"}
📍 {v.ort or "-"}
👤 {v.ansprechpartner or "-"}

📝 {v.beschreibung or ""}"""


def build_dgh_kalender_text():
    termine = get_aktive_dgh_termine()
    belegte_daten = set()
    angefragte_daten = set()

    for t in termine:
        datum = parse_datum(t.datum)
        if datum and t.status == "Bestätigt":
            belegte_daten.add(datum)
        elif datum and t.status == "Anfrage":
            angefragte_daten.add(datum)

    heute = datetime.today().date()
    ende = heute + timedelta(days=120)

    text = "🏠 *DGH-Kalender – nächste 4 Monate*\n\n"

    aktueller_monat = None
    tag = heute

    while tag <= ende:
        monat = tag.strftime("%B %Y")

        if monat != aktueller_monat:
            aktueller_monat = monat
            text += f"\n📅 *{monat}*\n"

        if tag in belegte_daten:
            symbol = "🟢"
            status = "bestätigt / vergeben"
        elif tag in angefragte_daten:
            symbol = "🟡"
            status = "angefragt"
        else:
            symbol = "⚪"
            status = "frei"

        text += f"{symbol} {tag.strftime('%d.%m.')} {status}\n"

        tag += timedelta(days=1)

    return text


def handle_message(sender, msg_type, content):
    state = get_state(sender)
    step = state["step"]
    data = state["data"]

    text = content.lower() if msg_type == "text" and content else ""

    print("Aktueller Schritt:", step)

    if msg_type == "text" and text in ["menü", "menu", "start", "hallo", "hi"]:
        reset_state(sender)
        send_whatsapp_message(sender, MENU)
        return

    if step == "menu":
        if content == "1":
            save_state(sender, {"step": "mangel_art", "data": {}})
            send_whatsapp_message(sender, MANGEL_MENU)

        elif content == "2":
            veranstaltungen = get_aktive_veranstaltungen()

            if not veranstaltungen:
                send_whatsapp_message(
                    sender,
                    "📅 Zurzeit sind keine Veranstaltungen eingetragen."
                )
                return

            send_whatsapp_message(sender, "📅 *Aktuelle Veranstaltungen*")

            for v in veranstaltungen:
                veranstaltung_text = build_veranstaltung_text(v)

                if send_whatsapp_image and getattr(v, "bild_base64", None):
                    send_whatsapp_image(
                        sender,
                        v.bild_base64,
                        caption=veranstaltung_text
                    )
                else:
                    send_whatsapp_message(sender, veranstaltung_text)

        elif content == "3":
            send_whatsapp_message(
                sender,
                "🏡 Vereine: Fußball, Tennis, Tischtennis, Spielmannszug, Dart."
            )

        elif content == "4":
            send_whatsapp_message(sender, "🚒 Feuerwehr-Infos folgen.")

        elif content == "5":
            send_whatsapp_message(sender, "☎️ Ansprechpartner folgen.")

        elif content == "6":
            send_whatsapp_message(sender, "📰 Aktuelles folgt.")

        elif content == "7":
            send_whatsapp_message(sender, "🗑 Mülltermine folgen.")

        elif content == "8":
            save_state(sender, {"step": "dgh", "data": data})
            send_whatsapp_message(
                sender,
                """🏠 DGH buchen

1️⃣ Kalender anschauen
2️⃣ Buchungsanfrage stellen

0️⃣ Zurück"""
            )

        elif content == "0":
            send_whatsapp_message(sender, "👋 Bis bald!")

        else:
            send_whatsapp_message(sender, MENU)

        return

    if step == "dgh":
        if content == "1":
            send_whatsapp_message(sender, build_dgh_kalender_text())
            return

        if content == "2":
            save_state(sender, {"step": "dgh_anfrage_datum", "data": {}})
            send_whatsapp_message(
                sender,
                "✍️ Buchungsanfrage DGH\n\nFür welches Datum möchtest du das DGH buchen?\n\nBitte im Format TT.MM.JJJJ senden, z. B. 12.08.2026."
            )
            return

        if content == "0":
            reset_state(sender)
            send_whatsapp_message(sender, MENU)
            return

        send_whatsapp_message(sender, "Bitte wähle 1, 2 oder 0.")
        return

    if step == "dgh_anfrage_datum":
        datum = parse_datum(content)

        if not datum:
            send_whatsapp_message(sender, "Bitte sende das Datum im Format TT.MM.JJJJ, z. B. 12.08.2026.")
            return

        if ist_dgh_belegt(content):
            send_whatsapp_message(
                sender,
                "❌ Für diesen Tag ist bereits ein Termin bestätigt.\n\nBitte wähle ein anderes Datum."
            )
            return

        data["datum"] = content
        save_state(sender, {"step": "dgh_anfrage_uhrzeit", "data": data})
        send_whatsapp_message(sender, "🕒 Welche Uhrzeit?\n\nBeispiel: 18:00 Uhr")
        return

    if step == "dgh_anfrage_uhrzeit":
        data["uhrzeit"] = content
        save_state(sender, {"step": "dgh_anfrage_name", "data": data})
        send_whatsapp_message(sender, "👤 Auf welchen Namen soll die Anfrage laufen?")
        return

    if step == "dgh_anfrage_name":
        data["name"] = content
        save_state(sender, {"step": "dgh_anfrage_telefon", "data": data})
        send_whatsapp_message(sender, "☎️ Bitte sende deine Telefonnummer.")
        return

    if step == "dgh_anfrage_telefon":
        data["telefon"] = content
        save_state(sender, {"step": "dgh_anfrage_anlass", "data": data})
        send_whatsapp_message(sender, "🎉 Was ist der Anlass?\n\nBeispiel: Geburtstag, Versammlung, Feier")
        return

    if step == "dgh_anfrage_anlass":
        data["anlass"] = content
        save_state(sender, {"step": "dgh_anfrage_kommentar", "data": data})
        send_whatsapp_message(sender, "💬 Gibt es noch eine Bemerkung?\n\nWenn nicht, schreibe einfach Nein.")
        return

    if step == "dgh_anfrage_kommentar":
        kommentar = "" if text in ["nein", "ne", "n"] else content

        save_dgh_termin(
            datum=data.get("datum", ""),
            uhrzeit=data.get("uhrzeit", ""),
            anlass=data.get("anlass", ""),
            name=data.get("name", ""),
            telefon=data.get("telefon", ""),
            kommentar=f"Buchungsanfrage über WhatsApp von {sender}\n\n{kommentar}",
            status="Anfrage",
            whatsapp_absender=sender,
        )

        reset_state(sender)

        send_whatsapp_message(
            sender,
            f"""✅ Vielen Dank!

Deine DGH-Buchungsanfrage wurde übermittelt.

📅 Datum: {data.get("datum", "-")}
🕒 Uhrzeit: {data.get("uhrzeit", "-")}
🎉 Anlass: {data.get("anlass", "-")}

Die Gemeinde meldet sich zur Bestätigung."""
        )
        return

    if step == "mangel_art":
        if content == "0":
            reset_state(sender)
            send_whatsapp_message(sender, MENU)
            return

        if content not in MANGEL_ARTEN:
            send_whatsapp_message(sender, "Bitte wähle eine gültige Zahl.\n\n" + MANGEL_MENU)
            return

        data["art"] = MANGEL_ARTEN[content]
        save_state(sender, {"step": "mangel_ort", "data": data})

        send_whatsapp_message(
            sender,
            "📍 Wo befindet sich der Mangel?\n\nBitte Straße, Hausnummer oder kurze Ortsbeschreibung senden."
        )
        return

    if step == "mangel_ort":
        data["ort"] = content
        save_state(sender, {"step": "mangel_beschreibung", "data": data})
        send_whatsapp_message(sender, "📝 Bitte beschreibe den Mangel kurz.")
        return

    if step == "mangel_beschreibung":
        data["beschreibung"] = content
        save_state(sender, {"step": "mangel_foto", "data": data})
        send_whatsapp_message(sender, "📷 Bitte sende jetzt ein Foto oder schreibe „Nein“.")
        return

    if step == "mangel_foto":
        if msg_type == "image":
            foto_bytes = download_whatsapp_image(content)
            data["foto_bytes"] = foto_bytes
        else:
            data["foto_bytes"] = None

        save_state(sender, {"step": "mangel_bestaetigung", "data": data})
        send_whatsapp_message(sender, build_confirmation_text(data))
        return

    if step == "mangel_bestaetigung":
        if text in ["ja", "j", "ok", "absenden"]:
            ticket = (
                "AH-"
                + datetime.now().strftime("%Y%m%d-%H%M%S")
                + "-"
                + uuid4().hex[:4].upper()
            )

            try:
                print("Speichere Meldung...")
                save_meldung(ticket, data, sender)
                print("Meldung erfolgreich gespeichert.")

            except Exception as error:
                print("Fehler beim Speichern der Meldung:", repr(error))
                send_whatsapp_message(
                    sender,
                    "⚠️ Die Meldung konnte aktuell nicht gespeichert werden. Bitte versuche es später erneut."
                )
                return

            reset_state(sender)

            try:
                print("Sende E-Mail...")
                send_email(ticket, data, sender)
                print("E-Mail erfolgreich gesendet.")

                send_whatsapp_message(
                    sender,
                    f"✅ Vielen Dank!\n\nDeine Meldung wurde aufgenommen und per E-Mail weitergeleitet.\n\nVorgangsnummer:\n{ticket}"
                )

            except Exception as error:
                print("Fehler beim E-Mail-Versand:", repr(error))
                update_notiz(
                    ticket,
                    "Automatischer Hinweis: Die E-Mail-Benachrichtigung ist fehlgeschlagen.",
                )
                send_whatsapp_message(
                    sender,
                    f"✅ Vielen Dank!\n\nDeine Meldung wurde sicher aufgenommen. Die automatische E-Mail-Benachrichtigung konnte gerade nicht gesendet werden; die Meldung bleibt im Dashboard erhalten.\n\nVorgangsnummer:\n{ticket}"
                )

            return

        if text in ["nein", "zurück", "zuruck", "abbrechen"]:
            reset_state(sender)
            send_whatsapp_message(sender, "❌ Meldung wurde abgebrochen.\n\n" + MENU)
            return

        send_whatsapp_message(sender, "Bitte antworte mit „Ja“ zum Absenden oder „Zurück“ zum Abbrechen.")
        return
