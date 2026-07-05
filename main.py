from fastapi import FastAPI, Request, Depends, HTTPException, Form, UploadFile, File
from fastapi.responses import PlainTextResponse, RedirectResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials

import os
import secrets
from urllib.parse import quote

from config import VERIFY_TOKEN
from menu import handle_message

from crud import init_db, update_status, update_notiz
from dashboard import dashboard_page, meldung_detail_page

from veranstaltungen_crud import (
    init_veranstaltungen_db,
    save_veranstaltung,
    update_veranstaltung,
    set_veranstaltung_aktiv,
    delete_veranstaltung,
)
from veranstaltungen_dashboard import veranstaltungen_dashboard

from dgh_crud import (
    init_dgh_db,
    save_dgh_termin,
    update_dgh_termin,
    set_dgh_termin_aktiv,
    set_dgh_status,
    delete_dgh_termin,
)
from dgh_dashboard import dgh_dashboard
from whatsapp import send_whatsapp_message


app = FastAPI()
security = HTTPBasic()

DASHBOARD_USER = os.getenv("DASHBOARD_USER")
DASHBOARD_PASSWORD = os.getenv("DASHBOARD_PASSWORD")


@app.on_event("startup")
def startup():
    init_db()
    init_veranstaltungen_db()
    init_dgh_db()


def check_dashboard_login(credentials: HTTPBasicCredentials = Depends(security)):
    if not DASHBOARD_USER or not DASHBOARD_PASSWORD:
        raise HTTPException(
            status_code=503,
            detail="Dashboard-Zugang ist noch nicht eingerichtet",
        )

    correct_user = secrets.compare_digest(credentials.username, DASHBOARD_USER)
    correct_password = secrets.compare_digest(credentials.password, DASHBOARD_PASSWORD)

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
        "version": "dgh-1",
    }


@app.get("/dashboard")
async def dashboard(
    suche: str = "",
    status_filter: str = "",
    zeitraum: str = "",
    _=Depends(check_dashboard_login),
):
    return dashboard_page(suche, status_filter, zeitraum)


@app.get("/veranstaltungen")
async def veranstaltungen(
    bearbeiten_id: int | None = None,
    _=Depends(check_dashboard_login),
):
    return veranstaltungen_dashboard(bearbeiten_id)


@app.post("/veranstaltungen/neue")
async def neue_veranstaltung(
    titel: str = Form(...),
    datum: str = Form(""),
    uhrzeit: str = Form(""),
    ort: str = Form(""),
    ansprechpartner: str = Form(""),
    beschreibung: str = Form(""),
    bild: UploadFile | None = File(None),
    _=Depends(check_dashboard_login),
):
    bild_bytes = None

    if bild:
        bild_bytes = await bild.read()

    save_veranstaltung(
        titel=titel,
        datum=datum,
        uhrzeit=uhrzeit,
        ort=ort,
        beschreibung=beschreibung,
        ansprechpartner=ansprechpartner,
        bild_bytes=bild_bytes,
    )

    return RedirectResponse(url="/veranstaltungen", status_code=303)


@app.post("/veranstaltungen/bearbeiten/{veranstaltung_id}")
async def veranstaltung_bearbeiten(
    veranstaltung_id: int,
    titel: str = Form(...),
    datum: str = Form(""),
    uhrzeit: str = Form(""),
    ort: str = Form(""),
    ansprechpartner: str = Form(""),
    beschreibung: str = Form(""),
    bild: UploadFile | None = File(None),
    _=Depends(check_dashboard_login),
):
    bild_bytes = None

    if bild and bild.filename:
        bild_bytes = await bild.read()

    update_veranstaltung(
        veranstaltung_id=veranstaltung_id,
        titel=titel,
        datum=datum,
        uhrzeit=uhrzeit,
        ort=ort,
        beschreibung=beschreibung,
        ansprechpartner=ansprechpartner,
        bild_bytes=bild_bytes,
    )

    return RedirectResponse(url="/veranstaltungen", status_code=303)


@app.get("/veranstaltungen/aktiv/{veranstaltung_id}/{aktiv}")
async def veranstaltung_aktiv(
    veranstaltung_id: int,
    aktiv: str,
    _=Depends(check_dashboard_login),
):
    set_veranstaltung_aktiv(veranstaltung_id, aktiv)

    return RedirectResponse(url="/veranstaltungen", status_code=303)


@app.get("/veranstaltungen/loeschen/{veranstaltung_id}")
async def veranstaltung_loeschen(
    veranstaltung_id: int,
    _=Depends(check_dashboard_login),
):
    delete_veranstaltung(veranstaltung_id)

    return RedirectResponse(url="/veranstaltungen", status_code=303)


@app.get("/dgh")
async def dgh(
    bearbeiten_id: int | None = None,
    hinweis: str = "",
    fehler: str = "",
    tag: str = "",
    _=Depends(check_dashboard_login),
):
    return dgh_dashboard(
        bearbeiten_id,
        hinweis=hinweis,
        fehler=fehler,
        tag=tag,
    )


@app.post("/dgh/neuer-termin")
async def dgh_neuer_termin(
    datum: str = Form(...),
    uhrzeit: str = Form(""),
    anlass: str = Form(""),
    name: str = Form(""),
    telefon: str = Form(""),
    kommentar: str = Form(""),
    _=Depends(check_dashboard_login),
):
    try:
        save_dgh_termin(datum, uhrzeit, anlass, name, telefon, kommentar)
    except ValueError as error:
        return RedirectResponse(
            url=f"/dgh?fehler={quote(str(error))}",
            status_code=303,
        )

    return RedirectResponse(
        url="/dgh?hinweis=Termin%20wurde%20gespeichert.",
        status_code=303,
    )


@app.post("/dgh/bearbeiten/{termin_id}")
async def dgh_bearbeiten(
    termin_id: int,
    datum: str = Form(...),
    uhrzeit: str = Form(""),
    anlass: str = Form(""),
    name: str = Form(""),
    telefon: str = Form(""),
    kommentar: str = Form(""),
    _=Depends(check_dashboard_login),
):
    try:
        update_dgh_termin(
            termin_id,
            datum,
            uhrzeit,
            anlass,
            name,
            telefon,
            kommentar,
        )
    except ValueError as error:
        return RedirectResponse(
            url=(
                f"/dgh?bearbeiten_id={termin_id}"
                f"&fehler={quote(str(error))}"
            ),
            status_code=303,
        )

    return RedirectResponse(
        url="/dgh?hinweis=Termin%20wurde%20aktualisiert.",
        status_code=303,
    )


@app.get("/dgh/aktiv/{termin_id}/{aktiv}")
async def dgh_aktiv(
    termin_id: int,
    aktiv: str,
    _=Depends(check_dashboard_login),
):
    set_dgh_termin_aktiv(termin_id, aktiv)

    return RedirectResponse(url="/dgh", status_code=303)


@app.post("/dgh/status/{termin_id}")
async def dgh_status_aendern(
    termin_id: int,
    status: str = Form(...),
    _=Depends(check_dashboard_login),
):
    erlaubte_status = {"Anfrage", "Bestätigt", "Abgelehnt"}

    if status not in erlaubte_status:
        raise HTTPException(status_code=400, detail="Ungültiger DGH-Status")

    try:
        termin, alter_status = set_dgh_status(termin_id, status)
    except ValueError as error:
        return RedirectResponse(
            url=f"/dgh?fehler={quote(str(error))}",
            status_code=303,
        )

    if (
        termin
        and alter_status != status
        and termin.whatsapp_absender
        and status in {"Bestätigt", "Abgelehnt"}
    ):
        if status == "Bestätigt":
            nachricht = f"""✅ Deine DGH-Anfrage wurde bestätigt.

📅 Datum: {termin.datum or "-"}
🕒 Uhrzeit: {termin.uhrzeit or "-"}
🎉 Anlass: {termin.anlass or "-"}

Der Termin ist damit fest für dich eingetragen."""
        else:
            nachricht = f"""❌ Deine DGH-Anfrage konnte leider nicht bestätigt werden.

📅 Datum: {termin.datum or "-"}
🕒 Uhrzeit: {termin.uhrzeit or "-"}
🎉 Anlass: {termin.anlass or "-"}

Du kannst gern eine Anfrage für einen anderen Termin senden."""

        try:
            send_whatsapp_message(termin.whatsapp_absender, nachricht)
        except Exception as error:
            print("DGH-Statusnachricht konnte nicht gesendet werden:", repr(error))

    return RedirectResponse(
        url=f"/dgh?hinweis={quote(f'Status wurde auf {status} gesetzt.')}",
        status_code=303,
    )


@app.get("/dgh/loeschen/{termin_id}")
async def dgh_loeschen(
    termin_id: int,
    _=Depends(check_dashboard_login),
):
    delete_dgh_termin(termin_id)

    return RedirectResponse(url="/dgh", status_code=303)


@app.get("/meldung/{ticket}")
async def meldung_detail(
    ticket: str,
    _=Depends(check_dashboard_login),
):
    return meldung_detail_page(ticket)


@app.get("/status")
async def status_aendern(
    ticket: str,
    neuer_status: str,
    _=Depends(check_dashboard_login),
):
    update_status(ticket, neuer_status)

    return RedirectResponse(url="/dashboard", status_code=303)


@app.post("/notiz")
async def notiz_speichern(
    ticket: str = Form(...),
    notiz: str = Form(""),
    _=Depends(check_dashboard_login),
):
    update_notiz(ticket, notiz)

    return RedirectResponse(url=f"/meldung/{ticket}", status_code=303)


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
                print(f"WhatsApp-Nachricht empfangen: Typ={msg_type}")

                if msg_type == "text":
                    content = message["text"]["body"]

                elif msg_type == "image":
                    content = message["image"]["id"]

                else:
                    continue

                handle_message(sender, msg_type, content)

    return {"status": "ok"}
