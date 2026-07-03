from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
import os

app = FastAPI()

VERIFY_TOKEN = os.getenv("VERIFY_TOKEN", "ahnsen2026")

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
        "version": "2026-07-03-1900"
    }
@app.get("/webhook")
async def verify_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        return PlainTextResponse(content=challenge)

    return PlainTextResponse(content="Verification failed", status_code=403)

@app.post("/webhook")
async def webhook(request: Request):
    body = await request.json()

    print("===== Neue WhatsApp Nachricht =====")
    print(body)
    print("==================================")

    return {"status": "ok"}
