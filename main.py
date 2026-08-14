from fastapi import FastAPI, Request, Depends, HTTPException, Form, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse, RedirectResponse, Response

import mimetypes
import hashlib
import hmac
import os
import secrets
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote

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
    get_freie_tage,
    init_dgh_db,
    save_dgh_termin,
    update_dgh_termin,
    set_dgh_termin_aktiv,
    set_dgh_status,
    delete_dgh_termin,
)
from dgh_dashboard import dgh_dashboard
from muelltermine_crud import (
    get_alle_muelltermine,
    get_naechste_muelltermine,
    importiere_muelltermine,
    init_muelltermine_db,
)
from muelltermine_dashboard import muelltermine_dashboard
from muelltermine_parser import lese_muelltermine_aus_pdf
from startseite import (
    login_page,
    portal_home_page,
    public_search_page,
    public_content_page,
    public_home_page,
    start_page,
)
from gemeinde_crud import (
    get_gemeinde_einstellungen,
    init_gemeinde_db,
    set_gemeinde_einstellung,
    update_gemeinde_einstellungen,
)
from gemeinde_dashboard import gemeinde_dashboard
from homepage_import import lade_alte_homepage_inhalte
from veranstaltungen_crud import get_veranstaltung
from push_service import send_category_notification


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
UPLOAD_DIR = Path(__file__).resolve().parent / "static" / "uploads"
ERLAUBTE_UPLOAD_FELDER = {
    "hero_bild_url",
    "logo_bild_url",
}
ERLAUBTE_UPLOAD_ENDUNGEN = {".png", ".jpg", ".jpeg", ".webp"}


@app.on_event("startup")
def startup():
    init_db()
    init_veranstaltungen_db()
    init_dgh_db()
    init_muelltermine_db()
    init_gemeinde_db()


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


def _sicherer_dateiname(name):
    basis = Path(name or "bild").stem.lower()
    basis = re.sub(r"[^a-z0-9_-]+", "-", basis).strip("-") or "bild"
    return basis[:50]


def _upload_datei_pfad(dateiname):
    ziel = (UPLOAD_DIR / dateiname).resolve()
    basis = UPLOAD_DIR.resolve()

    if not str(ziel).startswith(str(basis)):
        raise HTTPException(status_code=400, detail="Ungültiger Dateiname")

    return ziel


def _enthaelt_suchtext(werte, suchtext):
    suchtext = suchtext.casefold()
    return any(
        suchtext in str(wert or "").casefold()
        for wert in werte
    )


MAX_EVENT_RECAP_IMAGE_BYTES = 6 * 1024 * 1024
MAX_EVENT_RECAP_IMAGES_PER_UPLOAD = 12
EVENT_RECAP_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


async def _read_event_recap_images(files):
    result = []
    for upload in files or []:
        if not upload or not getattr(upload, "filename", ""):
            continue
        content_type = str(getattr(upload, "content_type", "") or "").lower()
        if content_type not in EVENT_RECAP_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail="Rückblick-Fotos müssen JPG, PNG oder WEBP sein")
        data = await upload.read()
        if not data:
            continue
        if len(data) > MAX_EVENT_RECAP_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail="Ein Rückblick-Foto ist größer als 6 MB")
        result.append((content_type, data))
        if len(result) > MAX_EVENT_RECAP_IMAGES_PER_UPLOAD:
            raise HTTPException(status_code=400, detail="Maximal 12 Rückblick-Fotos pro Upload")
    return result


def _veranstaltung_ist_kommend(event):
    try:
        return datetime.strptime(event.datum, "%d.%m.%Y").date() >= datetime.today().date()
    except (TypeError, ValueError):
        return True


def _startseiten_daten(suche=""):
    meldungs_statistik = statistik()
    alle_meldungen = suche_meldungen()
    veranstaltungen = get_aktive_veranstaltungen()
    dgh_anfragen = get_dgh_anfragen()
    dgh_termine = get_alle_dgh_termine()
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
        # Legacy dashboard templates still accept these keys. WhatsApp itself
        # has been retired; keep empty values until the old dashboard markup is
        # removed in the UI consolidation.
        "abonnements": [],
        "chatbot_verlauf": [],
        "suchergebnisse": suchergebnisse,
    }


def _public_home_daten():
    heute = datetime.today().date()
    jahre = {heute.year, heute.year + 1}
    alle_muelltermine = []

    for jahr in sorted(jahre):
        alle_muelltermine.extend(get_alle_muelltermine(jahr=jahr))

    return {
        "einstellungen": get_gemeinde_einstellungen(),
        "veranstaltungen": get_aktive_veranstaltungen(),
        "dgh_termine": get_alle_dgh_termine(),
        "freie_dgh_tage": get_freie_tage(anzahl_tage=60),
        "muelltermine": get_naechste_muelltermine(limit=12),
        "alle_muelltermine": alle_muelltermine,
    }


@app.get("/")
async def home(request: Request, suche: str = ""):
    if _session_ist_gueltig(request):
        return start_page(_startseiten_daten(suche), suche=suche)

    return portal_home_page(_public_home_daten())


@app.get("/mangel-melden")
async def public_mangel():
    return public_content_page(_public_home_daten(), "mangel")


@app.get("/veranstaltungen")
async def public_veranstaltungen(
    q: str = "",
    monat: str = "",
    kategorie: str = "",
):
    daten = _public_home_daten()
    daten["filter"] = {"q": q, "monat": monat, "kategorie": kategorie}
    return public_content_page(daten, "veranstaltungen")


@app.get("/veranstaltungen/{veranstaltung_id}")
async def public_veranstaltung_detail(veranstaltung_id: int):
    from startseite import public_event_detail_page

    return public_event_detail_page(
        _public_home_daten(),
        get_veranstaltung(veranstaltung_id),
    )


@app.get("/dgh-mieten")
async def public_dgh():
    return public_content_page(_public_home_daten(), "dgh")


@app.get("/muelltermine-info")
async def public_muelltermine():
    return public_content_page(_public_home_daten(), "muell")


@app.get("/ansprechpartner")
async def public_ansprechpartner():
    return public_content_page(_public_home_daten(), "ansprechpartner")


@app.get("/buergerinformationen")
async def public_buergerinformationen():
    return public_content_page(_public_home_daten(), "buergerinfo")


@app.get("/vereine")
async def public_vereine():
    return public_content_page(_public_home_daten(), "vereine")


@app.get("/feuerwehr")
async def public_feuerwehr():
    return public_content_page(_public_home_daten(), "feuerwehr")


@app.get("/ueber-ahnsen")
async def public_ueber_ahnsen():
    return public_content_page(_public_home_daten(), "ueber")


@app.get("/aktuelles")
async def public_aktuelles():
    return public_content_page(_public_home_daten(), "aktuelles")


@app.get("/impressum")
async def public_impressum():
    return public_content_page(_public_home_daten(), "impressum")


@app.get("/datenschutz")
async def public_datenschutz():
    return public_content_page(_public_home_daten(), "datenschutz")


@app.get("/suche")
async def public_suche(q: str = ""):
    return public_search_page(_public_home_daten(), q)


@app.get("/muelltermine.ics")
async def public_muelltermine_ics():
    termine = _public_home_daten().get("alle_muelltermine", [])
    zeilen = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Ahnsen hilft//Muelltermine//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Ahnsen Müllabfuhr Termine",
    ]

    for termin in termine:
        datum = termin.datum.strftime("%Y%m%d")
        titel = (termin.abfuhrarten or "Müllabfuhr").replace("\n", " ")
        uid = f"muell-{datum}-{termin.id}@ahnsen-hilft"
        zeilen.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{uid}",
                f"DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}",
                f"DTSTART;VALUE=DATE:{datum}",
                f"SUMMARY:{titel}",
                "DESCRIPTION:Müllabfuhr Termin der Gemeinde Ahnsen",
                "END:VEVENT",
            ]
        )

    zeilen.append("END:VCALENDAR")

    return Response(
        "\r\n".join(zeilen) + "\r\n",
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="ahnsen-muelltermine.ics"'
        },
    )


@app.post("/login")
async def login(
    username: str = Form(...),
    password: str = Form(...),
):
    if not DASHBOARD_USER or not DASHBOARD_PASSWORD:
        response = portal_home_page(
            _public_home_daten(),
            "Der Dashboard-Zugang ist auf dem Server noch nicht eingerichtet."
        )
        response.status_code = 503
        return response

    benutzer_ok = secrets.compare_digest(username, DASHBOARD_USER)
    passwort_ok = secrets.compare_digest(password, DASHBOARD_PASSWORD)

    if not (benutzer_ok and passwort_ok):
        response = portal_home_page(
            _public_home_daten(),
            "Benutzername oder Passwort ist nicht korrekt.",
        )
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


@app.get("/uploads/{dateiname}")
async def upload_asset(dateiname: str):
    pfad = _upload_datei_pfad(dateiname)

    if not pfad.exists() or not pfad.is_file():
        raise HTTPException(status_code=404, detail="Datei nicht gefunden")

    media_type = mimetypes.guess_type(pfad.name)[0] or "application/octet-stream"
    return FileResponse(
        pfad,
        media_type=media_type,
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
    ziel = "/intern/maengel"
    parameter = []
    if suche:
        parameter.append(f"suche={quote(suche)}")
    if status_filter:
        parameter.append(f"status_filter={quote(status_filter)}")
    if zeitraum:
        parameter.append(f"zeitraum={quote(zeitraum)}")
    if parameter:
        ziel += "?" + "&".join(parameter)
    return RedirectResponse(url=ziel, status_code=303)


@app.get("/intern/maengel")
async def intern_maengel(
    suche: str = "",
    status_filter: str = "",
    zeitraum: str = "",
    _=Depends(check_dashboard_login),
):
    return dashboard_page(suche, status_filter, zeitraum)


@app.get("/intern")
async def intern_start(_=Depends(check_dashboard_login)):
    return RedirectResponse(url="/", status_code=303)


@app.get("/intern/dashboard")
async def intern_dashboard(
    suche: str = "",
    status_filter: str = "",
    zeitraum: str = "",
    _=Depends(check_dashboard_login),
):
    ziel = "/intern/maengel"
    parameter = []
    if suche:
        parameter.append(f"suche={quote(suche)}")
    if status_filter:
        parameter.append(f"status_filter={quote(status_filter)}")
    if zeitraum:
        parameter.append(f"zeitraum={quote(zeitraum)}")
    if parameter:
        ziel += "?" + "&".join(parameter)
    return RedirectResponse(url=ziel, status_code=303)


@app.get("/intern/dgh")
async def intern_dgh(
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


@app.get("/intern/muelltermine")
async def intern_muelltermine(
    hinweis: str = "",
    fehler: str = "",
    _=Depends(check_dashboard_login),
):
    return muelltermine_dashboard(hinweis=hinweis, fehler=fehler)


@app.get("/intern/gemeindeseite")
async def intern_gemeindeseite(
    hinweis: str = "",
    _=Depends(check_dashboard_login),
):
    return gemeinde_dashboard(
        get_gemeinde_einstellungen(),
        hinweis=hinweis,
    )


@app.get("/intern/veranstaltungen")
async def veranstaltungen_intern(
    bearbeiten_id: int | None = None,
    _=Depends(check_dashboard_login),
):
    return veranstaltungen_dashboard(bearbeiten_id)


@app.post("/veranstaltungen/neue")
async def neue_veranstaltung(
    background_tasks: BackgroundTasks,
    titel: str = Form(...),
    datum: str = Form(""),
    uhrzeit: str = Form(""),
    ort: str = Form(""),
    kategorie: str = Form(""),
    ansprechpartner: str = Form(""),
    beschreibung: str = Form(""),
    rueckblick_text: str = Form(""),
    bild: UploadFile | None = File(None),
    rueckblick_bilder: list[UploadFile] | None = File(None),
    _=Depends(check_dashboard_login),
):
    bild_bytes = None

    if bild:
        bild_bytes = await bild.read()
    recap_images = await _read_event_recap_images(rueckblick_bilder)

    event = save_veranstaltung(
        titel=titel,
        datum=datum,
        uhrzeit=uhrzeit,
        ort=ort,
        kategorie=kategorie,
        beschreibung=beschreibung,
        ansprechpartner=ansprechpartner,
        bild_bytes=bild_bytes,
        rueckblick_text=rueckblick_text,
        rueckblick_bilder=recap_images,
    )
    if event and event.aktiv == "Ja" and _veranstaltung_ist_kommend(event):
        background_tasks.add_task(
            send_category_notification,
            "push_veranstaltungen",
            f"Neue Veranstaltung: {event.titel}",
            f"{event.datum or 'Termin folgt'} · {event.uhrzeit or 'Uhrzeit folgt'} · {event.ort or 'Ahnsen'}",
            "/veranstaltungen",
            f"veranstaltung-{event.id}",
        )

    return RedirectResponse(url="/intern/veranstaltungen", status_code=303)


@app.post("/veranstaltungen/bearbeiten/{veranstaltung_id}")
async def veranstaltung_bearbeiten(
    veranstaltung_id: int,
    background_tasks: BackgroundTasks,
    titel: str = Form(...),
    datum: str = Form(""),
    uhrzeit: str = Form(""),
    ort: str = Form(""),
    kategorie: str = Form(""),
    ansprechpartner: str = Form(""),
    beschreibung: str = Form(""),
    rueckblick_text: str = Form(""),
    rueckblick_bilder_loeschen: str = Form(""),
    bild: UploadFile | None = File(None),
    rueckblick_bilder: list[UploadFile] | None = File(None),
    _=Depends(check_dashboard_login),
):
    bild_bytes = None

    if bild and bild.filename:
        bild_bytes = await bild.read()
    recap_images = await _read_event_recap_images(rueckblick_bilder)

    event = update_veranstaltung(
        veranstaltung_id=veranstaltung_id,
        titel=titel,
        datum=datum,
        uhrzeit=uhrzeit,
        ort=ort,
        kategorie=kategorie,
        beschreibung=beschreibung,
        ansprechpartner=ansprechpartner,
        bild_bytes=bild_bytes,
        rueckblick_text=rueckblick_text,
        rueckblick_bilder=recap_images,
        rueckblick_bilder_loeschen=rueckblick_bilder_loeschen == "ja",
    )
    if event and event.aktiv == "Ja" and _veranstaltung_ist_kommend(event):
        background_tasks.add_task(
            send_category_notification,
            "push_veranstaltungen",
            f"Veranstaltung aktualisiert: {event.titel}",
            f"{event.datum or 'Termin folgt'} · {event.uhrzeit or 'Uhrzeit folgt'} · {event.ort or 'Ahnsen'}",
            "/veranstaltungen",
            f"veranstaltung-update-{event.id}",
        )

    return RedirectResponse(url="/intern/veranstaltungen", status_code=303)


@app.get("/veranstaltungen/aktiv/{veranstaltung_id}/{aktiv}")
async def veranstaltung_aktiv(
    veranstaltung_id: int,
    aktiv: str,
    _=Depends(check_dashboard_login),
):
    set_veranstaltung_aktiv(veranstaltung_id, aktiv)

    return RedirectResponse(url="/intern/veranstaltungen", status_code=303)


@app.get("/veranstaltungen/loeschen/{veranstaltung_id}")
async def veranstaltung_loeschen(
    veranstaltung_id: int,
    _=Depends(check_dashboard_login),
):
    delete_veranstaltung(veranstaltung_id)

    return RedirectResponse(url="/intern/veranstaltungen", status_code=303)


@app.get("/dgh")
async def dgh(
    bearbeiten_id: int | None = None,
    hinweis: str = "",
    fehler: str = "",
    tag: str = "",
    _=Depends(check_dashboard_login),
):
    ziel = "/intern/dgh"
    parameter = []
    if bearbeiten_id:
        parameter.append(f"bearbeiten_id={bearbeiten_id}")
    if hinweis:
        parameter.append(f"hinweis={quote(hinweis)}")
    if fehler:
        parameter.append(f"fehler={quote(fehler)}")
    if tag:
        parameter.append(f"tag={quote(tag)}")
    if parameter:
        ziel += "?" + "&".join(parameter)
    return RedirectResponse(url=ziel, status_code=303)


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
            url=f"/intern/dgh?fehler={quote(str(error))}",
            status_code=303,
        )

    return RedirectResponse(
        url="/intern/dgh?hinweis=Termin%20wurde%20gespeichert.",
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
                f"/intern/dgh?bearbeiten_id={termin_id}"
                f"&fehler={quote(str(error))}"
            ),
            status_code=303,
        )

    return RedirectResponse(
        url="/intern/dgh?hinweis=Termin%20wurde%20aktualisiert.",
        status_code=303,
    )


@app.get("/dgh/aktiv/{termin_id}/{aktiv}")
async def dgh_aktiv(
    termin_id: int,
    aktiv: str,
    _=Depends(check_dashboard_login),
):
    set_dgh_termin_aktiv(termin_id, aktiv)

    return RedirectResponse(url="/intern/dgh", status_code=303)


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
        set_dgh_status(termin_id, status)
    except ValueError as error:
        return RedirectResponse(
            url=f"/intern/dgh?fehler={quote(str(error))}",
            status_code=303,
        )

    return RedirectResponse(
        url=f"/intern/dgh?hinweis={quote(f'Status wurde auf {status} gesetzt.')}",
        status_code=303,
    )


@app.get("/dgh/loeschen/{termin_id}")
async def dgh_loeschen(
    termin_id: int,
    _=Depends(check_dashboard_login),
):
    delete_dgh_termin(termin_id)

    return RedirectResponse(url="/intern/dgh", status_code=303)


@app.get("/muelltermine")
async def muelltermine(
    hinweis: str = "",
    fehler: str = "",
    _=Depends(check_dashboard_login),
):
    ziel = "/intern/muelltermine"
    parameter = []
    if hinweis:
        parameter.append(f"hinweis={quote(hinweis)}")
    if fehler:
        parameter.append(f"fehler={quote(fehler)}")
    if parameter:
        ziel += "?" + "&".join(parameter)
    return RedirectResponse(url=ziel, status_code=303)


@app.post("/muelltermine/import")
async def muelltermine_import(
    pdf: UploadFile = File(...),
    _=Depends(check_dashboard_login),
):
    dateiname = (pdf.filename or "").strip()

    if not dateiname.casefold().endswith(".pdf"):
        return RedirectResponse(
            url=(
                "/intern/muelltermine?fehler="
                + quote("Bitte wähle eine PDF-Datei aus.")
            ),
            status_code=303,
        )

    pdf_bytes = await pdf.read()

    if len(pdf_bytes) > 10 * 1024 * 1024:
        return RedirectResponse(
            url=(
                "/intern/muelltermine?fehler="
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
            url=f"/intern/muelltermine?fehler={quote(str(error))}",
            status_code=303,
        )
    except Exception as error:
        print("Fehler beim Import der Mülltermine:", repr(error))
        return RedirectResponse(
            url=(
                "/intern/muelltermine?fehler="
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
        url=f"/intern/muelltermine?hinweis={quote(hinweis)}",
        status_code=303,
    )


@app.get("/gemeindeseite")
async def gemeindeseite(
    hinweis: str = "",
    _=Depends(check_dashboard_login),
):
    ziel = "/intern/gemeindeseite"
    if hinweis:
        ziel += f"?hinweis={quote(hinweis)}"
    return RedirectResponse(url=ziel, status_code=303)


@app.post("/gemeindeseite")
async def gemeindeseite_speichern(
    request: Request,
    _=Depends(check_dashboard_login),
):
    form = await request.form()
    update_gemeinde_einstellungen(dict(form))

    return RedirectResponse(
        url="/intern/gemeindeseite?hinweis=Gemeindeseite%20wurde%20gespeichert.",
        status_code=303,
    )


@app.post("/gemeindeseite/upload")
async def gemeindeseite_upload(
    feld: str = Form(...),
    datei: UploadFile = File(...),
    _=Depends(check_dashboard_login),
):
    if feld not in ERLAUBTE_UPLOAD_FELDER:
        raise HTTPException(status_code=400, detail="Dieses Upload-Feld ist nicht erlaubt")

    originalname = datei.filename or ""
    endung = Path(originalname).suffix.lower()

    if endung not in ERLAUBTE_UPLOAD_ENDUNGEN:
        return RedirectResponse(
            url="/intern/gemeindeseite?hinweis="
            + quote("Bitte nur PNG, JPG, JPEG oder WEBP hochladen."),
            status_code=303,
        )

    inhalt = await datei.read()

    if len(inhalt) > 5 * 1024 * 1024:
        return RedirectResponse(
            url="/intern/gemeindeseite?hinweis="
            + quote("Die Datei darf höchstens 5 MB groß sein."),
            status_code=303,
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dateiname = (
        f"{feld}-{int(time.time())}-{_sicherer_dateiname(originalname)}{endung}"
    )
    ziel = _upload_datei_pfad(dateiname)
    ziel.write_bytes(inhalt)

    set_gemeinde_einstellung(feld, f"/uploads/{dateiname}")

    return RedirectResponse(
        url="/intern/gemeindeseite?hinweis="
        + quote("Bild wurde hochgeladen und übernommen."),
        status_code=303,
    )


@app.post("/gemeindeseite/import-alt")
async def gemeindeseite_alt_import(
    url: str = Form("https://www.ahnsen-schaumburg.de/"),
    _=Depends(check_dashboard_login),
):
    try:
        daten = lade_alte_homepage_inhalte(url)
        update_gemeinde_einstellungen(
            {
                **get_gemeinde_einstellungen(),
                **daten,
            }
        )
    except Exception as error:
        print("Import alte Homepage fehlgeschlagen:", repr(error))
        return RedirectResponse(
            url="/intern/gemeindeseite?hinweis="
            + quote("Import konnte nicht abgeschlossen werden. Bitte später erneut versuchen."),
            status_code=303,
        )

    return RedirectResponse(
        url="/intern/gemeindeseite?hinweis="
        + quote("Inhalte der alten Homepage wurden übernommen."),
        status_code=303,
    )


@app.get("/intern/meldung/{ticket}")
async def intern_meldung_detail(
    ticket: str,
    _=Depends(check_dashboard_login),
):
    return meldung_detail_page(ticket)


@app.get("/meldung/{ticket}")
async def meldung_detail(
    ticket: str,
    _=Depends(check_dashboard_login),
):
    return RedirectResponse(url=f"/intern/meldung/{quote(ticket)}", status_code=303)


@app.get("/status")
async def status_aendern(
    ticket: str,
    neuer_status: str,
    _=Depends(check_dashboard_login),
):
    update_status(ticket, neuer_status)

    return RedirectResponse(url="/intern/maengel", status_code=303)


@app.post("/notiz")
async def notiz_speichern(
    ticket: str = Form(...),
    notiz: str = Form(""),
    _=Depends(check_dashboard_login),
):
    update_notiz(ticket, notiz)

    return RedirectResponse(url=f"/intern/meldung/{quote(ticket)}", status_code=303)
