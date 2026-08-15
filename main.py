from fastapi import FastAPI, Request, Depends, HTTPException, Form, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse, RedirectResponse, Response

import base64
import mimetypes
import hashlib
import hmac
import os
import secrets
import re
import time
from io import BytesIO
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from urllib.parse import urlparse

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
    delete_muelltermin,
    get_alle_muelltermine,
    get_naechste_muelltermine,
    importiere_muelltermine,
    init_muelltermine_db,
    save_muelltermin,
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
from governance import authenticate_admin, has_permission, init_governance_db, record_admin_login, save_content_revision, verify_admin_second_factor
from operations import get_asset, run_migrations, save_asset
from PIL import Image, ImageOps, UnidentifiedImageError


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
    run_migrations()
    init_governance_db()


def _session_signatur(zeitstempel, username, role, session_version):
    inhalt = f"{username}:{role}:{zeitstempel}:{session_version}".encode("utf-8")
    geheimnis = DASHBOARD_SESSION_SECRET.encode("utf-8")
    return hmac.new(geheimnis, inhalt, hashlib.sha256).hexdigest()


def _neue_session(username, role, session_version=1):
    zeitstempel = str(int(time.time()))
    encoded_user = base64.urlsafe_b64encode(username.encode()).decode().rstrip("=")
    return f"{zeitstempel}.{encoded_user}.{role}.{session_version}.{_session_signatur(zeitstempel, username, role, session_version)}"


def _session_context(request):
    if not DASHBOARD_USER or not DASHBOARD_PASSWORD:
        return False

    token = request.cookies.get(SESSION_COOKIE, "")

    try:
        zeitstempel, encoded_user, role, version_text, signatur = token.split(".", 4)
        erstellt_am = int(zeitstempel)
        session_version = int(version_text)
        username = base64.urlsafe_b64decode(encoded_user + "=" * (-len(encoded_user) % 4)).decode()
    except (TypeError, ValueError):
        return None

    jetzt = int(time.time())
    if erstellt_am > jetzt + 60 or jetzt - erstellt_am > SESSION_MAX_AGE:
        return None

    erwartet = _session_signatur(zeitstempel, username, role, session_version)
    if not secrets.compare_digest(signatur, erwartet):
        return None
    from governance import get_admin
    admin = get_admin(username)
    if not admin or admin.role != role or int(admin.session_version or 1) != session_version:
        return None
    return {"username": username, "role": role, "display_name": admin.display_name}


def _session_ist_gueltig(request):
    return bool(_session_context(request))


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

    context = _session_context(request)
    path = request.url.path
    required = "read"
    for prefix, permission in (
        ("/intern/benutzer", "admin"), ("/intern/sicherung", "backup"),
        ("/intern/system", "system"), ("/intern/freigabe", "compliance"),
        ("/intern/audit", "audit"), ("/intern/berichte", "reports"),
        ("/intern/politik", "politics"), ("/intern/ideen", "moderation"),
        ("/intern/cockpit", "read"),
        ("/intern/maengel", "cases"), ("/status", "cases"), ("/notiz", "cases"),
        ("/intern/meldung", "cases"),
        ("/intern/veranstaltungen", "events"), ("/veranstaltungen/", "events"),
        ("/intern/dgh", "dgh"), ("/dgh/", "dgh"),
        ("/intern/muelltermine", "waste"), ("/muelltermine/", "waste"),
        ("/intern/nachbarschaft", "moderation"), ("/intern/warnungen", "warnings"),
        ("/intern/push", "push"), ("/intern/nachrichten", "messages"),
        ("/intern/gemeindeseite", "content"), ("/gemeindeseite", "content"),
        ("/intern/inhalte", "content"), ("/intern/plattform", "content"),
    ):
        if path.startswith(prefix):
            required = permission; break
    if not has_permission(context["role"], required):
        raise HTTPException(status_code=403, detail="Deine Verwaltungsrolle darf diesen Bereich nur eingeschränkt verwenden.")
    if context["role"] == "read_only" and request.method not in {"GET", "HEAD"}:
        raise HTTPException(status_code=403, detail="Dieses Konto besitzt nur Leserechte.")
    request.state.admin = context
    return context


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


def _sanitize_image(data: bytes, *, max_bytes: int, output_format: str | None = None) -> tuple[str, bytes]:
    """Decode and re-encode uploads so filenames and supplied MIME types are never trusted."""
    if not data or len(data) > max_bytes:
        raise HTTPException(status_code=400, detail=f"Das Bild darf höchstens {max_bytes // (1024 * 1024)} MB groß sein")
    try:
        with Image.open(BytesIO(data)) as source:
            source.load()
            if source.width * source.height > 32_000_000:
                raise HTTPException(status_code=400, detail="Das Bild hat zu viele Bildpunkte")
            if getattr(source, "is_animated", False):
                raise HTTPException(status_code=400, detail="Animierte Bilder werden nicht unterstützt")
            image = ImageOps.exif_transpose(source)
            image.thumbnail((5000, 5000), Image.Resampling.LANCZOS)
            fmt = (output_format or source.format or "JPEG").upper()
            if fmt not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(status_code=400, detail="Bitte nur JPG, PNG oder WEBP hochladen")
            if fmt == "JPEG":
                image = image.convert("RGB")
            elif image.mode not in {"RGB", "RGBA"}:
                image = image.convert("RGBA" if "transparency" in image.info else "RGB")
            target = BytesIO()
            options = {"optimize": True}
            if fmt in {"JPEG", "WEBP"}:
                options["quality"] = 88
            image.save(target, format=fmt, **options)
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise HTTPException(status_code=400, detail="Die Datei ist kein gültiges Bild") from error
    mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}[fmt]
    return mime, target.getvalue()


async def _read_event_recap_images(files):
    result = []
    for upload in files or []:
        if not upload or not getattr(upload, "filename", ""):
            continue
        data = await upload.read()
        if not data:
            continue
        if len(data) > MAX_EVENT_RECAP_IMAGE_BYTES:
            raise HTTPException(status_code=400, detail="Ein Rückblick-Foto ist größer als 6 MB")
        content_type, clean_data = _sanitize_image(data, max_bytes=MAX_EVENT_RECAP_IMAGE_BYTES)
        result.append((content_type, clean_data))
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
    otp: str = Form(""),
):
    if not DASHBOARD_USER or not DASHBOARD_PASSWORD:
        response = portal_home_page(
            _public_home_daten(),
            "Der Dashboard-Zugang ist auf dem Server noch nicht eingerichtet."
        )
        response.status_code = 503
        return response

    admin = authenticate_admin(username, password)
    if not admin or not verify_admin_second_factor(admin, otp):
        response = portal_home_page(
            _public_home_daten(),
            "Benutzername oder Passwort ist nicht korrekt.",
        )
        response.status_code = 401
        return response

    record_admin_login(admin.username)

    response = RedirectResponse(url="/", status_code=303)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=_neue_session(admin.username, admin.role, int(admin.session_version or 1)),
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


@app.get("/media/{key}")
async def database_asset(key: str):
    item = get_asset(key)
    if not item:
        raise HTTPException(status_code=404, detail="Datei nicht gefunden")
    content_type = str(item.get("content_type") or "").lower()
    if content_type not in EVENT_RECAP_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Gespeicherter Medientyp ist nicht freigegeben")
    return Response(
        content=item["content"],
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400", "ETag": item["checksum"], "X-Content-Type-Options": "nosniff"},
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
    admin=Depends(check_dashboard_login),
):
    bild_bytes = None

    if bild and bild.filename:
        _mime, bild_bytes = _sanitize_image(await bild.read(), max_bytes=MAX_EVENT_RECAP_IMAGE_BYTES, output_format="JPEG")
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
    if event:
        save_content_revision("veranstaltungen", str(event.id), "Freigegeben" if event.aktiv == "Ja" else "Entwurf", event.titel, {"datum":event.datum,"uhrzeit":event.uhrzeit,"ort":event.ort,"kategorie":event.kategorie,"beschreibung":event.beschreibung}, admin["display_name"])
        from community_crud import audit_event
        audit_event(admin["username"], "Veranstaltung angelegt", "veranstaltung", str(event.id), event.titel)
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
    admin=Depends(check_dashboard_login),
):
    bild_bytes = None

    if bild and bild.filename:
        _mime, bild_bytes = _sanitize_image(await bild.read(), max_bytes=MAX_EVENT_RECAP_IMAGE_BYTES, output_format="JPEG")
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
    if event:
        save_content_revision("veranstaltungen", str(event.id), "Freigegeben" if event.aktiv == "Ja" else "Entwurf", event.titel, {"datum":event.datum,"uhrzeit":event.uhrzeit,"ort":event.ort,"kategorie":event.kategorie,"beschreibung":event.beschreibung}, admin["display_name"])
        from community_crud import audit_event
        audit_event(admin["username"], "Veranstaltung bearbeitet", "veranstaltung", str(event.id), event.titel)
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


@app.post("/veranstaltungen/aktiv/{veranstaltung_id}/{aktiv}")
async def veranstaltung_aktiv(
    veranstaltung_id: int,
    aktiv: str,
    admin=Depends(check_dashboard_login),
):
    set_veranstaltung_aktiv(veranstaltung_id, aktiv)
    from community_crud import audit_event
    audit_event(admin["username"], "Veranstaltung geschaltet", "veranstaltung", str(veranstaltung_id), aktiv)

    return RedirectResponse(url="/intern/veranstaltungen", status_code=303)


@app.post("/veranstaltungen/loeschen/{veranstaltung_id}")
async def veranstaltung_loeschen(
    veranstaltung_id: int,
    admin=Depends(check_dashboard_login),
):
    delete_veranstaltung(veranstaltung_id)
    from community_crud import audit_event
    audit_event(admin["username"], "Veranstaltung gelöscht", "veranstaltung", str(veranstaltung_id))

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
    admin=Depends(check_dashboard_login),
):
    try:
        item = save_dgh_termin(datum, uhrzeit, anlass, name, telefon, kommentar)
    except ValueError as error:
        return RedirectResponse(
            url=f"/intern/dgh?fehler={quote(str(error))}",
            status_code=303,
        )

    from community_crud import audit_event
    audit_event(admin["username"], "DGH-Termin angelegt", "dgh", str(getattr(item, "id", "")), datum)
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
    admin=Depends(check_dashboard_login),
):
    try:
        item = update_dgh_termin(
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

    from community_crud import audit_event
    audit_event(admin["username"], "DGH-Termin bearbeitet", "dgh", str(termin_id), datum)
    return RedirectResponse(
        url="/intern/dgh?hinweis=Termin%20wurde%20aktualisiert.",
        status_code=303,
    )


@app.post("/dgh/aktiv/{termin_id}/{aktiv}")
async def dgh_aktiv(
    termin_id: int,
    aktiv: str,
    admin=Depends(check_dashboard_login),
):
    set_dgh_termin_aktiv(termin_id, aktiv)
    from community_crud import audit_event
    audit_event(admin["username"], "DGH-Termin geschaltet", "dgh", str(termin_id), aktiv)

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


@app.post("/dgh/loeschen/{termin_id}")
async def dgh_loeschen(
    termin_id: int,
    admin=Depends(check_dashboard_login),
):
    delete_dgh_termin(termin_id)
    from community_crud import audit_event
    audit_event(admin["username"], "DGH-Termin gelöscht", "dgh", str(termin_id))

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
    admin=Depends(check_dashboard_login),
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
    if not pdf_bytes.startswith(b"%PDF-"):
        return RedirectResponse(
            url="/intern/muelltermine?fehler=" + quote("Die ausgewählte Datei ist keine gültige PDF-Datei."),
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
    from community_crud import audit_event
    audit_event(admin["username"], "Mülltermine importiert", "muelltermine", str(ergebnis["jahr"]), f"{anzahl} Termine · {dateiname}")
    return RedirectResponse(
        url=f"/intern/muelltermine?hinweis={quote(hinweis)}",
        status_code=303,
    )


@app.post("/muelltermine/termin")
async def muelltermin_speichern(
    datum: str = Form(...),
    abfuhrarten: str = Form(...),
    feiertagsabweichung: str = Form(""),
    termin_id: str = Form(""),
    admin=Depends(check_dashboard_login),
):
    try:
        item = save_muelltermin(datum, abfuhrarten, feiertagsabweichung == "ja", int(termin_id) if termin_id else None)
    except (ValueError, TypeError) as error:
        return RedirectResponse(url="/intern/muelltermine?fehler=" + quote(str(error)), status_code=303)
    from community_crud import audit_event
    audit_event(admin["username"], "Mülltermin gepflegt", "muelltermin", str(item.id), item.datum.isoformat())
    return RedirectResponse(url="/intern/muelltermine?hinweis=" + quote("Abfuhrtermin wurde gespeichert."), status_code=303)


@app.post("/muelltermine/termin/{termin_id}/loeschen")
async def muelltermin_loeschen(termin_id: int, admin=Depends(check_dashboard_login)):
    if delete_muelltermin(termin_id):
        from community_crud import audit_event
        audit_event(admin["username"], "Mülltermin gelöscht", "muelltermin", str(termin_id))
    return RedirectResponse(url="/intern/muelltermine?hinweis=" + quote("Abfuhrtermin wurde entfernt."), status_code=303)


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
    admin=Depends(check_dashboard_login),
):
    form = await request.form()
    values = dict(form)
    update_gemeinde_einstellungen(values)
    save_content_revision("gemeindeseite", "standard", "Freigegeben", "Gemeindeseite", values, admin["display_name"])
    from community_crud import audit_event
    audit_event(admin["username"], "Gemeindeseite gespeichert", "content", "standard")

    return RedirectResponse(
        url="/intern/gemeindeseite?hinweis=Gemeindeseite%20wurde%20gespeichert.",
        status_code=303,
    )


@app.post("/gemeindeseite/upload")
async def gemeindeseite_upload(
    feld: str = Form(...),
    datei: UploadFile = File(...),
    admin=Depends(check_dashboard_login),
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

    try:
        content_type, inhalt = _sanitize_image(inhalt, max_bytes=5 * 1024 * 1024)
    except HTTPException as error:
        return RedirectResponse(
            url="/intern/gemeindeseite?hinweis=" + quote(str(error.detail)),
            status_code=303,
        )
    safe_extension = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[content_type]
    save_asset(feld, _sicherer_dateiname(originalname) + safe_extension, content_type, inhalt)
    set_gemeinde_einstellung(feld, f"/media/{feld}")
    from community_crud import audit_event
    audit_event(admin["username"], "Gemeindebild hochgeladen", "asset", feld, originalname)

    return RedirectResponse(
        url="/intern/gemeindeseite?hinweis="
        + quote("Bild wurde hochgeladen und übernommen."),
        status_code=303,
    )


@app.post("/gemeindeseite/import-alt")
async def gemeindeseite_alt_import(
    url: str = Form("https://www.ahnsen-schaumburg.de/"),
    admin=Depends(check_dashboard_login),
):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {"ahnsen-schaumburg.de", "www.ahnsen-schaumburg.de"}:
        return RedirectResponse(
            url="/intern/gemeindeseite?hinweis=" + quote("Aus Sicherheitsgründen kann nur die bisherige offizielle Ahnsen-Seite importiert werden."),
            status_code=303,
        )
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

    from community_crud import audit_event
    audit_event(admin["username"], "Alte Gemeindeseite importiert", "content", "legacy-homepage", url)
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


@app.post("/status")
async def status_aendern(
    ticket: str = Form(...),
    neuer_status: str = Form(...),
    _=Depends(check_dashboard_login),
):
    update_status(ticket, neuer_status)

    return RedirectResponse(url="/intern/maengel", status_code=303)


@app.post("/notiz")
async def notiz_speichern(
    ticket: str = Form(...),
    notiz: str = Form(""),
    admin=Depends(check_dashboard_login),
):
    update_notiz(ticket, notiz)
    from community_crud import audit_event
    audit_event(admin["username"], "Interne Notiz gespeichert", "meldung", ticket)

    return RedirectResponse(url=f"/intern/meldung/{quote(ticket)}", status_code=303)
