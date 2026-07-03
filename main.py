from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
import os
import requests
from datetime import datetime

app = FastAPI()

VERIFY_TOKEN = os.getenv("VERIFY_TOKEN")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.getenv("PHONE_NUMBER_ID")

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
    return {
        "status": "Ahnsen hilft läuft",
        "version": "2026-07-03-2038"
    }


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

    response = requests.post(url, headers=headers, json=data)
    print("Antwort gesendet:", response.status_code, response.text)


def get_message_data(body):
    value = body["entry"][0]["changes"][0]["value"]

    if "messages" not in value:
        return None, None, None

    msg = value["messages"][0]
    sender = msg["from"]
    msg_type = msg["type"]

    if msg_type == "text":
        return sender, "text", msg["text"]["body"].strip()

    if msg_type == "location":
        loc = msg["location"]
        maps_link = f"https://maps.google.com/?q={loc['latitude']},{loc['longitude']}"
        return sender, "location", maps_link

    if msg_type == "image":
        return sender, "image", msg["image"]["id"]

    return sender, msg_type, None


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

        if msg_type == "text":
            text = content.lower()

            if text in ["menü", "menu", "zurück", "start", "hallo", "hi"]:
                user_states[sender] = {"step": "menu", "data": {}}
                send_whatsapp_message(sender, MENU)
                return {"status": "ok"}

        if state["step"] == "menu":
            if content == "1":
                user_states[sender] = {"step": "mangel_art", "data": {}}
                send_whatsapp_message(sender, MANGEL_MENU)

            elif content == "2":
                send_whatsapp_message(sender, "📅 Veranstaltungen werden hier später angezeigt.\n\nSchreibe „zurück“ für das Hauptmenü.")

            elif content == "3":
                send_whatsapp_message(sender, "🏡 Vereine in Ahnsen:\n\n1️⃣ Fußball\n2️⃣ Tennis\n3️⃣ Tischtennis\n4️⃣ Spielmannszug\n5️⃣ Dart\n\nSchreibe „zurück“ für das Hauptmenü.")

            elif content == "4":
                send_whatsapp_message(sender, "🚒 Feuerwehr Ahnsen\n\nInfos folgen.\n\nSchreibe „zurück“ für das Hauptmenü.")

            elif content == "5":
                send_whatsapp_message(sender, "☎️ Ansprechpartner\n\nInfos folgen.\n\nSchreibe „zurück“ für das Hauptmenü.")

            elif content == "6":
                send_whatsapp_message(sender, "📰 Aktuelles\n\nNoch keine aktuellen Meldungen.\n\nSchreibe „zurück“ für das Hauptmenü.")

            elif content == "7":
                send_whatsapp_message(sender, "🗑 Mülltermine\n\nInfos folgen.\n\nSchreibe „zurück“ für das Hauptmenü.")

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

            send_whatsapp_message(
                sender,
                "📍 Wo befindet sich der Mangel?\n\nBitte sende deinen Standort oder schreibe Straße und Hausnummer."
            )
            return {"status": "ok"}

        if state["step"] == "mangel_ort":
            state["data"]["ort"] = content
            state["step"] = "mangel_beschreibung"
            user_states[sender] = state

            send_whatsapp_message(
                sender,
                "📝 Bitte beschreibe den Mangel kurz."
            )
            return {"status": "ok"}

        if state["step"] == "mangel_beschreibung":
            state["data"]["beschreibung"] = content
            state["step"] = "mangel_foto"
            user_states[sender] = state

            send_whatsapp_message(
                sender,
                "📷 Möchtest du ein Foto senden?\n\nSende jetzt ein Foto oder schreibe „Nein“."
            )
            return {"status": "ok"}

        if state["step"] == "mangel_foto":
            if msg_type == "image":
                state["data"]["foto"] = content
            else:
                state["data"]["foto"] = "Kein Foto"

            ticket = "AH-" + datetime.now().strftime("%Y%m%d-%H%M%S")
            data = state["data"]

            print("===== NEUE MÄNGELMELDUNG =====")
            print("Ticket:", ticket)
            print("Art:", data.get("art"))
            print("Ort:", data.get("ort"))
            print("Beschreibung:", data.get("beschreibung"))
            print("Foto:", data.get("foto"))
            print("==============================")

            user_states[sender] = {"step": "menu", "data": {}}

            send_whatsapp_message(
                sender,
                f"✅ Vielen Dank!\n\nDeine Meldung wurde aufgenommen.\n\nVorgangsnummer:\n{ticket}\n\nSchreibe „Menü“, um zurück zum Hauptmenü zu kommen."
            )
            return {"status": "ok"}

    except Exception as e:
        print("Fehler:", e)

    return {"status": "ok"}
