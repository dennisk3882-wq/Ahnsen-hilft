from fastapi import FastAPI, Request

app = FastAPI()

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
def home():
    return {"status": "Ahnsen hilft läuft"}

@app.get("/webhook")
def verify_webhook(hub_mode: str = None,
                   hub_verify_token: str = None,
                   hub_challenge: str = None):

    VERIFY_TOKEN = "ahnsen2026"

    if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
        return int(hub_challenge)

    return {"error": "Verification failed"}

@app.post("/webhook")
async def webhook(request: Request):
    body = await request.json()

    print(body)

    return {"status": "ok"}
