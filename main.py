from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import PlainTextResponse, RedirectResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials

import os
import secrets

from config import VERIFY_TOKEN
from menu import handle_message
from crud import init_db, update_status
from dashboard import dashboard_page

app = FastAPI()

security = HTTPBasic()

DASHBOARD_USER = os.getenv("DASHBOARD_USER", "admin")
DASHBOARD_PASSWORD = os.getenv("DASHBOARD_PASSWORD", "admin")


@app.on_event("startup")
def startup():
    init_db()


def check_dashboard_login(
    credentials: HTTPBasicCredentials = Depends(security),
):
    correct_user = secrets.compare_digest(
        credentials.username,
        DASHBOARD_USER,
    )

    correct_password = secrets.compare_digest(
        credentials.password,
        DASHBOARD_PASSWORD,
    )

    if not (correct_user and correct_password):
        raise HTTPException(
            status_code=401,
            detail="Nicht autorisiert",
            headers={"WWW-Authenticate": "Basic"},
        )

    return True


@app.get("/")
async def home():
    return {
        "status": "Ahnsen hilft läuft",
        "version": "dashboard-status-1",
    }


@app.get("/dashboard")
async def dashboard(
    suche: str = "",
    _=Depends(check_dashboard_login),
):
    return dashboard_page(suche)


@app.get("/status")
async def status_aendern(
    ticket: str,
    neuer_status: str,
    _=Depends(check_dashboard_login),
):
    update_status(ticket, neuer_status)

    return RedirectResponse(
        url="/dashboard",
        status_code=303,
    )


@app.get("/webhook")
async def verify_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        return PlainTextResponse(challenge)

    return PlainTextResponse(
        "Forbidden",
        status_code=403,
    )


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
                    continue

                handle_message(
                    sender,
                    msg_type,
                    content,
                )

    return {"status": "ok"}
