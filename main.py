from fastapi import FastAPI, Request, Depends, HTTPException, Form, UploadFile, File
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse

import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote

from config import VERIFY_TOKEN
from menu import handle_message

from crud import (
    init_db,
    statistik,
    suche_meldungen,
    update_status,
    update_notiz,
)
from dashboard import dashboard_page, meldung_detail_page

from veranstaltungen_crud import (
    get_aktive_veranstaltungen,
    init_veranstaltungen_db,
    save_veranstaltung,
    update_veranstaltung,
    set_veranstaltung_aktiv,
    delete_veranstaltung,
)
from veranstaltungen_dashboard import veranstaltungen_dashboard

from dgh_crud import (
    get_alle_dgh_termine,
    get_dgh_anfragen,
    init_dgh_db,
    save_dgh_termin,
    update_dgh_termin,
    set_dgh_termin_aktiv,
    set_dgh_status,
    delete_dgh_termin,
)
from dgh_dashboard import dgh_dashboard
from muelltermine_crud import (
    importiere_muelltermine,
    init_muelltermine_db,
)
from muelltermine_dashboard import muelltermine_dashboard
from muelltermine_parser import lese_muelltermine_aus_pdf
from startseite import login_page, start_page
from whatsapp import send_whatsapp_message
from abonnements_crud import (
    get_abonnement_uebersicht,
    set_abonnement_status,
)
from chat_crud import (
    get_chat_uebersicht,
    init_chat_db,
    speichere_chatnachricht,
)
from chatbot_dashboard import chatbot_detail_page


app = FastAPI()

DASHBOARD_USER = os.getenv("DASHBOARD_USER")
DASHBOARD_PASSWORD = os.getenv("DASHBOARD_PASSWORD")
DASHBOARD_SESSION_SECRET = (
    os.getenv("DASHBOARD_SESSION_SECRET") or DASHBOARD_PASSWORD
)
SESSION_COOKIE = "ahnsen_dashboard_session"
SESSION_MAX_AGE = 12 * 60 * 60
STARTSEITEN_BILD = (
    Path(__file__).resolve().parent
    / "static"
    / "ahnsen-startseite.png"
)


@app.on_event("startup")
def startup():
    init_db()
    init_veranstaltungen_db()
    init_dgh_db()
    init_muelltermine_db()
    init_chat_db()


def _session_signatur(zeitstempel):
    inhalt = f"{DASHBOARD_USER}:{zeitstempel}".encode("utf-8")
    geheimnis = DASHBOARD_SESSION_SECRET.encode("utf-8")
    return hmac.new(geheimnis, inhalt, hashlib.sha256).hexdigest()


def _neue_session():
    zeitstempel = str(int(time.time()))
    return f"{zeitstempel}.{_session_signatur(zeitstempel)}"


def _session_ist_gueltig(request):
    if not DASHBOARD_USER or not DASHBOARD_PASSWORD:
        return False

    token = request.cookies.get(SESSION_COOKIE, "")

    try:
        zeitstempel, signatur = token.split(".", 1)
        erstellt_am = int(zeitstempel)
    except (TypeError, ValueError):
        return False

    jetzt = int(time.time())
    if erstellt_am > jetzt + 60 or jetzt - erstellt_am > SESSION_MAX_AGE:
        return False

    erwartet = _session_signatur(zeitstempel)
    return secrets.compare_digest(signatur, erwartet)


def check_dashboard_login(request: Request):
    if not DASHBOARD_USER or not DASHBOARD_PASSWORD:
        raise HTTPException(
            status_code=503,
            detail="Dashboard-Zugang ist noch nicht eingerichtet",
        )

    if not _session_ist_gueltig(request):
        raise HTTPException(
            status_code=303,
            headers={"Location": "/"},
        )

    return True


def _enthaelt_suchtext(werte, suchtext):
    suchtext = suchtext.casefold()
    return any(
        suchtext in str(wert or "").casefold()
        for wert in werte
    )


def _startseiten_daten(suche=""):
    meldungs_statistik = statistik()
    alle_meldungen = suche_meldungen()
    veranstaltungen = get_aktive_veranstaltungen()
    dgh_anfragen = get_dgh_anfragen()
    dgh_termine = get_alle_dgh_termine()
    abonnements = get_abonnement_uebersicht()
    chatbot_verlauf = get_chat_uebersicht()

    erinnerungsgrenze = datetime.utcnow() - timedelta(days=7)
    ueberfaellige_meldungen = [
        meldung
        for meldung in alle_meldungen
        if (
            meldung.status != "Erledigt"
            and meldung.erstellt_am
            and meldung.erstellt_am < erinnerungsgrenze
        )
    ]

    suchergebnisse = {
        "meldungen": [],
        "veranstaltungen": [],
        "dgh": [],
    }

    if suche.strip():
        suchergebnisse["meldungen"] = suche_meldungen(suche)[:8]
        suchergebnisse["veranstaltungen"] = [
            veranstaltung
            for veranstaltung in veranstaltungen
            if _enthaelt_suchtext(
                [
                    veranstaltung.titel,
                    veranstaltung.datum,
                    veranstaltung.ort,
                    veranstaltung.beschreibung,
                    veranstaltung.ansprechpartner,
                ],
                suche,
            )
        ][:8]
        suchergebnisse["dgh"] = [
            termin
            for termin in dgh_termine
            if _enthaelt_suchtext(
                [
                    termin.datum,
                    termin.uhrzeit,
                    termin.anlass,
                    termin.name,
                    termin.telefon,
                    termin.status,
                    termin.kommentar,
                ],
                suche,
            )
        ][:8]

    return {
        "meldungs_statistik": meldungs_statistik,
        "offene_dgh_anfragen": len(dgh_anfragen),
        "kommende_veranstaltungen": len(veranstaltungen),
        "ueberfaellige_meldungen": ueberfaellige_meldungen,
        "letzte_meldungen": alle_meldungen[:5],
        "naechste_dgh_anfragen": dgh_anfragen[:5],
        "naechste_veranstaltungen": veranstaltungen[:5],
        "abonnements": abonnements,
        "chatbot_verlauf": chatbot_verlauf,
        "suchergebnisse": suchergebnisse,
    }


@app.get("/")
async def home(request: Request, suche: str = ""):
    if _session_ist_gueltig(request):
        return start_page(_startseiten_daten(suche), suche=suche)

    return login_page()


@app.post("/login")
async def login(
    username: str = Form(...),
    password: str = Form(...),
):
    if not DASHBOARD_USER or not DASHBOARD_PASSWORD:
        response = login_page(
            "Der Dashboard-Zugang ist auf dem Server noch nicht eingerichtet."
        )
        response.status_code = 503
        return response

    benutzer_ok = secrets.compare_digest(username, DASHBOARD_USER)
    passwort_ok = secrets.compare_digest(password, DASHBOARD_PASSWORD)

    if not (benutzer_ok and passwort_ok):
        response = login_page("Benutzername oder Passwort ist nicht korrekt.")
        response.status_code = 401
        return response

    response = RedirectResponse(url="/", status_code=303)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=_neue_session(),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    return response


@app.post("/logout")
async def logout():
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie(
        key=SESSION_COOKIE,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    return response


@app.get("/assets/ahnsen-startseite.png")
async def startseiten_bild():
    return FileResponse(
        STARTSEITEN_BILD,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/health")
async def health():
    return {
        "status": "Ahnsen hilft läuft",
        "version": "startseite-1",
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
            nachricht = f"""✅ Deine DGH-Mietanfrage wurde bestätigt.

📅 Datum: {termin.datum or "-"}
🕒 Uhrzeit: {termin.uhrzeit or "-"}
🎉 Anlass: {termin.anlass or "-"}

Der Termin ist damit fest für dich eingetragen."""
        else:
            nachricht = f"""❌ Deine DGH-Mietanfrage konnte leider nicht bestätigt werden.

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


@app.get("/muelltermine")
async def muelltermine(
    hinweis: str = "",
    fehler: str = "",
    _=Depends(check_dashboard_login),
):
    return muelltermine_dashboard(hinweis=hinweis, fehler=fehler)


@app.post("/muelltermine/import")
async def muelltermine_import(
    pdf: UploadFile = File(...),
    _=Depends(check_dashboard_login),
):
    dateiname = (pdf.filename or "").strip()

    if not dateiname.casefold().endswith(".pdf"):
        return RedirectResponse(
            url=(
                "/muelltermine?fehler="
                + quote("Bitte wähle eine PDF-Datei aus.")
            ),
            status_code=303,
        )

    pdf_bytes = await pdf.read()

    if len(pdf_bytes) > 10 * 1024 * 1024:
        return RedirectResponse(
            url=(
                "/muelltermine?fehler="
                + quote("Die PDF darf höchstens 10 MB groß sein.")
            ),
            status_code=303,
        )

    try:
        ergebnis = lese_muelltermine_aus_pdf(pdf_bytes)
        anzahl = importiere_muelltermine(
            jahr=ergebnis["jahr"],
            adresse=ergebnis["adresse"],
            dateiname=dateiname,
            termine=ergebnis["termine"],
        )
    except ValueError as error:
        return RedirectResponse(
            url=f"/muelltermine?fehler={quote(str(error))}",
            status_code=303,
        )
    except Exception as error:
        print("Fehler beim Import der Mülltermine:", repr(error))
        return RedirectResponse(
            url=(
                "/muelltermine?fehler="
                + quote(
                    "Die Termine konnten nicht gespeichert werden. "
                    "Bitte versuche es erneut."
                )
            ),
            status_code=303,
        )

    hinweis = (
        f"{anzahl} Abfuhrtermine für {ergebnis['jahr']} "
        "wurden erfolgreich erkannt und übernommen."
    )
    return RedirectResponse(
        url=f"/muelltermine?hinweis={quote(hinweis)}",
        status_code=303,
    )


@app.post("/abonnements/{abo_typ}/{abo_id}/status")
async def abonnement_status_aendern(
    abo_typ: str,
    abo_id: int,
    aktiv: str = Form(...),
    _=Depends(check_dashboard_login),
):
    try:
        set_abonnement_status(abo_typ, abo_id, aktiv == "Ja")
    except ValueError:
        raise HTTPException(status_code=404, detail="Abonnement nicht gefunden")

    return RedirectResponse(url="/#abonnenten", status_code=303)


@app.get("/chatbot/{whatsapp_nummer}")
async def chatbot_detail(
    whatsapp_nummer: str,
    _=Depends(check_dashboard_login),
):
    return chatbot_detail_page(whatsapp_nummer)


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
            kontakte = {
                kontakt.get("wa_id"): (
                    kontakt.get("profile", {}).get("name") or ""
                )
                for kontakt in value.get("contacts", [])
            }

            if "messages" not in value:
                continue

            for message in value["messages"]:
                sender = message["from"]
                msg_type = message["type"]
                name = kontakte.get(sender, "")
                erstellt_am = None

                try:
                    if message.get("timestamp"):
                        erstellt_am = datetime.utcfromtimestamp(
                            int(message["timestamp"])
                        )
                except (TypeError, ValueError):
                    erstellt_am = None

                print(f"WhatsApp-Nachricht empfangen: Typ={msg_type}")

                if msg_type == "text":
                    content = message["text"]["body"]

                elif msg_type == "image":
                    content = message["image"]["id"]

                else:
                    continue

                try:
                    gespeicherter_inhalt = content
                    if msg_type == "image":
                        gespeicherter_inhalt = "📷 Bild empfangen"

                    speichere_chatnachricht(
                        sender,
                        "eingehend",
                        gespeicherter_inhalt,
                        nachricht_typ=msg_type,
                        name=name,
                        erstellt_am=erstellt_am,
                    )
                except Exception as error:
                    print("Chatverlauf konnte nicht gespeichert werden:", repr(error))

                handle_message(sender, msg_type, content)

    return {"status": "ok"}
