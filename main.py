from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
import os
import requests

app = FastAPI()

VERIFY_TOKEN = os.getenv("VERIFY_TOKEN")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
PHONE_NUMBER_ID = os.getenv("PHONE_NUMBER_ID")

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


@app.get("/")
async def home():
    return {
        "status": "Ahnsen hilft läuft",
        "version": "2026-07-03-2000"
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
        "text": {
            "body": text
        }
    }

    response = requests.post(url, headers=headers, json=data)

    print("Antwort gesendet:")
    print(response.status_code)
    print(response.text)


@app.post("/webhook")
async def webhook(request: Request):
    body = await request.json()

    print("===== Neue WhatsApp Nachricht =====")
    print(body)

    try:
        value = body["entry"][0]["changes"][0]["value"]

        if "messages" not in value:
            return {"status": "ok"}

        message = value["messages"][0]["text"]["body"]
        sender = value["messages"][0]["from"]

        print("Nachricht erhalten:", message)

        if message == "1":
            answer = "🛠 Du hast Mangel melden gewählt."

        elif message == "2":
            answer = "📅 Du hast Veranstaltungen gewählt."

        elif message == "3":
            answer = "🏡 Du hast Vereine gewählt."

        elif message == "4":
            answer = "🚒 Du hast Feuerwehr gewählt."

        elif message == "5":
            answer = "☎️ Du hast Ansprechpartner gewählt."

        elif message == "6":
            answer = "📰 Du hast Aktuelles gewählt."

        elif message == "7":
            answer = "🗑 Du hast Mülltermine gewählt."

        elif message == "0":
            answer = "👋 Bis bald!"

        else:
            answer = MENU

        send_whatsapp_message(sender, answer)

    except Exception as e:
        print("Fehler:", e)

    return {"status": "ok"}
