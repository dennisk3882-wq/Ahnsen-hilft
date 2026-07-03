from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

from config import VERIFY_TOKEN
from menu import handle_message
from crud import init_db
from dashboard import dashboard_page

app = FastAPI()


@app.on_event("startup")
def startup():
    init_db()


@app.get("/")
async def home():
    return {
        "status": "Ahnsen hilft läuft",
        "version": "modular-2"
    }


@app.get("/dashboard")
async def dashboard():
    return dashboard_page()


@app.get("/webhook")
async def verify_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        return PlainTextResponse(challenge)

    return PlainTextResponse("Forbidden", status_code=403)


@app.post("/webhook")
async def webhook(request: Request):
    body = await request.json()

    print("===== Neue WhatsApp Nachricht =====")
    print(body)

    if body.get("object") != "whatsapp_business_account":
        return {"status": "ignored"}

    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})

            if "messages" not in value:
                continue

            for message in value["messages"]:

                sender = message["from"]
                msg_type = message["type"]

                if msg_type == "text":
                    content = message["text"]["body"]

                elif msg_type == "image":
                    content = message["image"]["id"]

                else:
                    content = ""

                handle_message(sender, msg_type, content)

    return {"status": "ok"}
