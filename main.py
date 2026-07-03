from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse

from config import VERIFY_TOKEN
from menu import handle_message
from crud import init_db

app = FastAPI()


@app.on_event("startup")
def startup():
    init_db()
    
@app.get("/")
async def home():
    return {
        "status": "Ahnsen hilft läuft",
        "version": "modular-1"
    }


@app.get("/webhook")
async def verify_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        return PlainTextResponse(content=challenge)

    return PlainTextResponse(content="Verification failed", status_code=403)


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


@app.post("/webhook")
async def webhook(request: Request):
    body = await request.json()

    print("===== Neue WhatsApp Nachricht =====")
    print(body)

    try:
        sender, msg_type, content = get_message_data(body)

        if sender:
            handle_message(sender, msg_type, content)

    except Exception as e:
        print("Allgemeiner Fehler:", repr(e))

    return {"status": "ok"}
