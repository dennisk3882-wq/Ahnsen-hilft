from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
import os
import requests
import smtplib
from datetime import datetime
from email.message import EmailMessage

app = FastAPI()

VERIFY_TOKEN = os.getenv("VERIFY_TOKEN")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.getenv("PHONE_NUMBER_ID")

EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
EMAIL_TO = os.getenv("EMAIL_TO")

user_states = {}

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


@app.get("/")
async def home():
    return {"status": "Ahnsen hilft läuft", "version": "bestaetigung-1"}


@app.get("/webhook")
async def verify_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        return PlainTextResponse(content=challenge)

    return PlainTextResponse(content="Verification failed", status_code=403)


def send_whatsapp_message(to, text):
    url = f"https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }
    data = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text}
    }

    r = requests.post(url, headers=headers, json=data, timeout=20)
    print("WhatsApp Antwort:", r.status_code, r.text)


def download_whatsapp_image(media_id):
    headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}"}

    meta_url = f"https://graph.facebook.com/v25.0/{media_id}"
    meta = requests.get(meta_url, headers=headers, timeout=20)
    print("Media Meta:", meta.status_code, meta.text)

    if meta.status_code != 200:
        return None

    file_url = meta.json().get("url")
    if not file_url:
        return None

    file_response = requests.get(file_url, headers=headers, timeout=30)
    print("Bild Download:", file_response.status_code)

    if file_response.status_code != 200:
        print("Bild Download Fehler:", file_response.text)
        return None

    return file_response.content


def send_email(ticket, data, sender):
    if not EMAIL_USER or not EMAIL_PASSWORD or not EMAIL_TO:
        raise Exception("E-Mail Umgebungsvariablen fehlen")

    msg = EmailMessage()
    msg["Subject"] = f"Neue Mängelmeldung {ticket}"
    msg["From"] = EMAIL_USER
    msg["To"] = EMAIL_TO

    body = f"""Neue Mängelmeldung über Ahnsen hilft

Vorgangsnummer:
{ticket}

Art des Mangels:
{data.get("art")}

Ort:
{data.get("ort")}

Beschreibung:
{data.get("beschreibung")}

Foto:
{"Ja" if data.get("foto_bytes") else "Nein"}

WhatsApp-Absender:
{sender}

Zeit:
{datetime.now().strftime("%d.%m.%Y %H:%M:%S")}
"""

    msg.set_content(body)

    if data.get("foto_bytes"):
        msg.add_attachment(
            data["foto_bytes"],
            maintype="image",
            subtype="jpeg",
            filename=f"{ticket}.jpg"
        )

    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(EMAIL_USER, EMAIL_PASSWORD)
        smtp.send_message(msg)

    print("E-Mail gesendet an:", EMAIL_TO)


def get_message_data(body):
    value = body["entry"][0]["changes"][0]["value"]

    if "messages" not in value:
        return None, None, None

    msg = value["messages"][0]
    sender = msg["from"]
    msg_type = msg["type"]

    if msg_type == "text":
        return sender, "text", msg["text"]["body"].strip()

    if msg_type == "image":
        return sender, "image", msg["image"]["id"]

    return sender, msg_type, None


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


@app.post("/webhook")
async def webhook(request: Request):
    body = await request.json()
    print("===== Neue WhatsApp Nachricht =====")
    print(body)

    try:
        sender, msg_type, content = get_message_data(body)

        if not sender:
            return {"status": "ok"}

        state = user_states.get(sender, {"step": "menu", "data": {}})
        print("Aktueller Schritt:", state["step"])

        text = content.lower() if msg_type == "text" and content else ""

        if msg_type == "text":
            if text in ["menü", "menu", "start", "hallo", "hi"]:
                user_states[sender] = {"step": "menu", "data": {}}
                send_whatsapp_message(sender, MENU)
                return {"status": "ok"}

        if state["step"] == "menu":
            if content == "1":
                user_states[sender] = {"step": "mangel_art", "data": {}}
                send_whatsapp_message(sender, MANGEL_MENU)
            elif content == "2":
                send_whatsapp_message(sender, "📅 Veranstaltungen werden später angezeigt.")
            elif content == "3":
                send_whatsapp_message(sender, "🏡 Vereine: Fußball, Tennis, Tischtennis, Spielmannszug, Dart.")
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

            return {"status": "ok"}

        if state["step"] == "mangel_art":
            if content == "0":
                user_states[sender] = {"step": "menu", "data": {}}
                send_whatsapp_message(sender, MENU)
                return {"status": "ok"}

            if content not in MANGEL_ARTEN:
                send_whatsapp_message(sender, "Bitte wähle eine gültige Zahl.\n\n" + MANGEL_MENU)
                return {"status": "ok"}

            state["data"]["art"] = MANGEL_ARTEN[content]
            state["step"] = "mangel_ort"
            user_states[sender] = state

            send_whatsapp_message(sender, "📍 Wo befindet sich der Mangel?\n\nBitte Straße, Hausnummer oder kurze Ortsbeschreibung senden.")
            return {"status": "ok"}

        if state["step"] == "mangel_ort":
            state["data"]["ort"] = content
            state["step"] = "mangel_beschreibung"
            user_states[sender] = state

            send_whatsapp_message(sender, "📝 Bitte beschreibe den Mangel kurz.")
            return {"status": "ok"}

        if state["step"] == "mangel_beschreibung":
            state["data"]["beschreibung"] = content
            state["step"] = "mangel_foto"
            user_states[sender] = state

            send_whatsapp_message(sender, "📷 Bitte sende jetzt ein Foto oder schreibe „Nein“.")
            return {"status": "ok"}

        if state["step"] == "mangel_foto":
            if msg_type == "image":
                foto_bytes = download_whatsapp_image(content)
                state["data"]["foto_bytes"] = foto_bytes
            else:
                state["data"]["foto_bytes"] = None

            state["step"] = "mangel_bestaetigung"
            user_states[sender] = state

            send_whatsapp_message(sender, build_confirmation_text(state["data"]))
            return {"status": "ok"}

        if state["step"] == "mangel_bestaetigung":
            if text in ["ja", "j", "ok", "absenden"]:
                ticket = "AH-" + datetime.now().strftime("%Y%m%d-%H%M%S")

                try:
                    send_email(ticket, state["data"], sender)
                    user_states[sender] = {"step": "menu", "data": {}}

                    send_whatsapp_message(
                        sender,
                        f"✅ Vielen Dank!\n\nDeine Meldung wurde aufgenommen und per E-Mail weitergeleitet.\n\nVorgangsnummer:\n{ticket}"
                    )

                except Exception as email_error:
                    print("E-Mail Fehler:", repr(email_error))
                    send_whatsapp_message(
                        sender,
                        "⚠️ Die E-Mail konnte aktuell nicht versendet werden. Bitte später erneut versuchen."
                    )

                return {"status": "ok"}

            if text in ["nein", "zurück", "zuruck", "abbrechen"]:
                user_states[sender] = {"step": "menu", "data": {}}
                send_whatsapp_message(sender, "❌ Meldung wurde abgebrochen.\n\n" + MENU)
                return {"status": "ok"}

            send_whatsapp_message(sender, "Bitte antworte mit „Ja“ zum Absenden oder „Zurück“ zum Abbrechen.")
            return {"status": "ok"}

    except Exception as e:
        print("Allgemeiner Fehler:", repr(e))

    return {"status": "ok"}
