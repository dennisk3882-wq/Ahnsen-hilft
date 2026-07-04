from datetime import datetime

from state import get_state, save_state, reset_state
from whatsapp import send_whatsapp_message
from media import download_whatsapp_image
from email_service import send_email
from crud import save_meldung
from veranstaltungen_crud import get_aktive_veranstaltungen

try:
    from whatsapp import send_whatsapp_image
except ImportError:
    send_whatsapp_image = None


MENU = """👋 Willkommen bei Ahnsen hilft

Bitte antworte mit einer Zahl:

1️⃣ Mangel melden
2️⃣ Veranstaltungen
3️⃣ Vereine
4️⃣ Feuerwehr
5️⃣ Ansprechpartner
6️⃣ Aktuelles
7️⃣ Mülltermine
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

{v.beschreibung or ""}"""


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

        elif content == "0":
            send_whatsapp_message(sender, "👋 Bis bald!")

        else:
            send_whatsapp_message(sender, MENU)

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
            ticket = "AH-" + datetime.now().strftime("%Y%m%d-%H%M%S")

            try:
                print("Speichere Meldung...")
                save_meldung(ticket, data, sender)
                print("Meldung erfolgreich gespeichert.")

                print("Sende E-Mail...")
                send_email(ticket, data, sender)
                print("E-Mail erfolgreich gesendet.")

                reset_state(sender)

                send_whatsapp_message(
                    sender,
                    f"✅ Vielen Dank!\n\nDeine Meldung wurde aufgenommen und per E-Mail weitergeleitet.\n\nVorgangsnummer:\n{ticket}"
                )

            except Exception as error:
                print("Fehler beim Speichern oder E-Mail-Versand:", repr(error))
                send_whatsapp_message(
                    sender,
                    "⚠️ Die Meldung konnte aktuell nicht vollständig verarbeitet werden. Bitte später erneut versuchen."
                )

            return

        if text in ["nein", "zurück", "zuruck", "abbrechen"]:
            reset_state(sender)
            send_whatsapp_message(sender, "❌ Meldung wurde abgebrochen.\n\n" + MENU)
            return

        send_whatsapp_message(sender, "Bitte antworte mit „Ja“ zum Absenden oder „Zurück“ zum Abbrechen.")
        return
