from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time
from collections import defaultdict, deque
from datetime import date
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response

import main as legacy
from crud import (
    get_meldung,
    get_meldungen_fuer_benutzer,
    init_db,
    save_meldung,
    update_status,
)
from dgh_crud import (
    get_alle_dgh_termine,
    get_dgh_termin,
    get_dgh_termine_fuer_benutzer,
    get_freie_tage,
    init_dgh_db,
    ist_dgh_belegt,
    save_dgh_termin,
    set_dgh_status,
)
from email_service import send_dgh_email, send_email, send_test_email
from gemeinde_crud import get_gemeinde_einstellungen, init_gemeinde_db
from muelltermine_crud import get_naechste_muelltermine, init_muelltermine_db
from pwa_account_ui import (
    account_page,
    dgh_overview_page,
    dgh_request_page,
    dgh_success_page,
    profile_page,
)
from pwa_crud import (
    create_user,
    delete_push_subscription,
    get_user_by_email,
    get_user_by_id,
    has_push_subscription,
    init_pwa_db,
    normalize_email,
    update_user_password,
    update_user_profile,
    upsert_push_subscription,
    verify_password,
    PUSH_BROADCAST_CATEGORIES,
)
from push_service import public_key, push_configured, send_category_notification, send_user_notification
from pwa_ui import (
    admin_login_page,
    events_page,
    home_page,
    info_page,
    legal_page,
    more_page,
    report_page,
    report_success_page,
    status_page,
    waste_page,
)
from veranstaltungen_crud import (
    get_aktive_veranstaltungen,
    get_vergangene_veranstaltungen,
    init_veranstaltungen_db,
)
from push_dashboard import push_dashboard_page
from system_dashboard import system_dashboard_page
from automation_status import get_automation_status, trigger_ratsarchive_sync
from warning_dashboard import warning_dashboard_page
from warning_ui import warning_page
from community_crud import audit_event, init_community_db, save_preference
from ratsarchive_service import init_ratsarchive_db
from ratsarchive_seed import seed_official_ratsarchive
from community_routes import configure_community_routes, router as community_router
from platform_runtime import get_platform_snapshot
from translation_service import init_translation_db
from warning_service import (
    get_active_warnings,
    get_recent_warnings,
    get_warning_stats,
    init_warning_db,
    poll_warning_sources,
    start_warning_monitor,
)
from system_diagnostics import (
    get_push_test_targets,
    init_system_diagnostics_db,
    record_system_event,
    run_system_checks,
)
from governance import authenticate_admin, init_governance_db, verify_admin_second_factor
from background_scheduler import start_background_scheduler
from operations import run_migrations
from operations import consume_rate_limit


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
RATE_WINDOW_SECONDS = 10 * 60
RATE_MAX_REPORTS = 5
RATE_MAX_AUTH = 12
REPORT_RATE_LIMIT: dict[str, deque[float]] = defaultdict(deque)
AUTH_RATE_LIMIT: dict[str, deque[float]] = defaultdict(deque)
PWA_SESSION_COOKIE = "ahnsen_user_session"
PWA_SESSION_MAX_AGE = 30 * 24 * 60 * 60
PWA_SESSION_SECRET = os.getenv("PWA_SESSION_SECRET") or legacy.DASHBOARD_SESSION_SECRET or ""


app = FastAPI(
    title="Ahnsen hilft PWA",
    description="Installierbare digitale Bürgerplattform für Ahnsen",
    version="3.0.0-pwa",
    docs_url=None,
    redoc_url=None,
)


@app.middleware("http")
async def browser_security(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = str(request.headers.get("origin") or "")
        fetch_site = str(request.headers.get("sec-fetch-site") or "").casefold()
        expected_host = str(request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",", 1)[0].strip().casefold()
        if fetch_site == "cross-site" or (origin and expected_host and origin.split("://", 1)[-1].split("/", 1)[0].casefold() != expected_host):
            return JSONResponse({"detail": "Anfrage aus fremder Herkunft wurde blockiert."}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    return response


@app.on_event("startup")
def startup() -> None:
    init_db()
    init_veranstaltungen_db()
    init_dgh_db()
    init_muelltermine_db()
    init_gemeinde_db()
    init_pwa_db()
    init_system_diagnostics_db()
    init_warning_db()
    init_community_db()
    init_ratsarchive_db()
    seed_official_ratsarchive()
    init_translation_db()
    run_migrations()
    init_governance_db()
    cfg = get_platform_snapshot()
    app.title = f"{cfg['platform_name']} PWA"
    app.description = cfg["description"]
    start_warning_monitor()
    start_background_scheduler()


def _public_data() -> dict:
    return {
        "einstellungen": get_gemeinde_einstellungen(),
        "veranstaltungen": get_aktive_veranstaltungen(),
        "dgh_termine": get_alle_dgh_termine(),
        "freie_dgh_tage": get_freie_tage(anzahl_tage=90),
        "muelltermine": get_naechste_muelltermine(limit=24),
        "warnungen": get_active_warnings(limit=5),
        "warning_stats": get_warning_stats(),
    }


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _rate_limit(store, request: Request, maximum: int) -> None:
    bucket = "report" if store is REPORT_RATE_LIMIT else "auth"
    if not consume_rate_limit(bucket, _client_key(request), maximum, RATE_WINDOW_SECONDS):
        raise HTTPException(
            status_code=429,
            detail="Zu viele Versuche in kurzer Zeit. Bitte versuche es später erneut.",
        )


def _new_ticket() -> str:
    prefix = get_platform_snapshot().get("ticket_prefix") or "TKT"
    return f"{prefix}-{time.strftime('%Y%m%d')}-{uuid4().hex[:10].upper()}"


def _trim(value, max_length: int) -> str:
    return str(value or "").strip()[:max_length]


def _valid_email(value: str) -> bool:
    value = normalize_email(value)
    return bool(value and "@" in value and "." in value.rsplit("@", 1)[-1])


def _safe_next(value: str, fallback: str = "/profil") -> str:
    value = str(value or "").strip()
    if value.startswith("/") and not value.startswith("//"):
        return value[:500]
    return fallback


def _user_signature(user_id: int, timestamp: str, session_version: int) -> str:
    if not PWA_SESSION_SECRET:
        return ""
    payload = f"{user_id}:{timestamp}:{session_version}".encode("utf-8")
    return hmac.new(PWA_SESSION_SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def _new_user_session(user_id: int, session_version: int = 1) -> str:
    timestamp = str(int(time.time()))
    return f"{user_id}.{timestamp}.{session_version}.{_user_signature(user_id, timestamp, session_version)}"


def _current_user(request: Request):
    token = request.cookies.get(PWA_SESSION_COOKIE, "")
    try:
        user_id_text, timestamp, version_text, signature = token.split(".", 3)
        user_id = int(user_id_text)
        created_at = int(timestamp)
        session_version = int(version_text)
    except (TypeError, ValueError):
        return None
    now = int(time.time())
    if not PWA_SESSION_SECRET or created_at > now + 60 or now - created_at > PWA_SESSION_MAX_AGE:
        return None
    if not secrets.compare_digest(signature, _user_signature(user_id, timestamp, session_version)):
        return None
    user = get_user_by_id(user_id)
    if not user or int(user.session_version or 1) != session_version:
        return None
    return user


def _set_user_cookie(response: Response, request: Request, user_id: int) -> None:
    response.set_cookie(
        key=PWA_SESSION_COOKIE,
        value=_new_user_session(user_id, int(get_user_by_id(user_id).session_version or 1)),
        max_age=PWA_SESSION_MAX_AGE,
        httponly=True,
        secure=request.url.scheme == "https" or os.getenv("COOKIE_SECURE", "true").casefold() != "false",
        samesite="lax",
    )


def _require_user(request: Request, next_url: str = "/profil"):
    user = _current_user(request)
    if not user:
        raise HTTPException(
            status_code=303,
            headers={"Location": f"/anmelden?next={quote(_safe_next(next_url))}"},
        )
    return user


def _object_token(kind: str, object_id: int) -> str:
    payload = f"{kind}:{object_id}".encode("utf-8")
    secret = (PWA_SESSION_SECRET or legacy.DASHBOARD_SESSION_SECRET or "disabled").encode("utf-8")
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()[:32]


def _send_email_safely(ticket: str, data: dict, source: str) -> None:
    try:
        send_email(ticket, data, source)
    except Exception as error:
        print("PWA-Meldung gespeichert, E-Mail konnte nicht gesendet werden:", repr(error))


def _send_dgh_email_safely(reference: str, data: dict) -> None:
    try:
        send_dgh_email(reference, data)
    except Exception as error:
        print("DGH-Anfrage gespeichert, E-Mail konnte nicht gesendet werden:", repr(error))


configure_community_routes(
    current_user=_current_user,
    require_user=_require_user,
    trim=_trim,
    admin_guard=legacy.check_dashboard_login,
    send_user_notification=send_user_notification,
)
app.include_router(community_router)


@app.get("/")
async def pwa_home():
    return home_page(_public_data())


@app.get("/warnungen")
async def public_warnings():
    return warning_page(get_active_warnings(limit=30), get_warning_stats())


@app.get("/registrieren")
async def register_page(request: Request, next: str = "/profil"):
    if _current_user(request):
        return RedirectResponse(url=_safe_next(next), status_code=303)
    return account_page("register", next_url=_safe_next(next))


@app.post("/registrieren")
async def register_submit(request: Request):
    _rate_limit(AUTH_RATE_LIMIT, request, RATE_MAX_AUTH)
    form = await request.form()
    values = {
        "name": _trim(form.get("name"), 120),
        "email": normalize_email(form.get("email")),
        "telefon": _trim(form.get("telefon"), 60),
    }
    password = str(form.get("password") or "")
    confirmation = str(form.get("password_confirm") or "")
    next_url = _safe_next(form.get("next"))

    if not PWA_SESSION_SECRET:
        response = account_page("register", "Der Kontobereich ist auf dem Server noch nicht eingerichtet.", values, next_url)
        response.status_code = 503
        return response
    if not values["name"] or not _valid_email(values["email"]):
        return account_page("register", "Bitte gib Name und eine gültige E-Mail-Adresse an.", values, next_url)
    if len(password) < 10:
        return account_page("register", "Das Passwort muss mindestens 10 Zeichen lang sein.", values, next_url)
    if password != confirmation:
        return account_page("register", "Die beiden Passwörter stimmen nicht überein.", values, next_url)
    if _trim(form.get("datenschutz"), 10) != "ja":
        return account_page("register", "Bitte bestätige die Datenschutzhinweise.", values, next_url)

    try:
        user = create_user(values["email"], password, values["name"], values["telefon"])
    except ValueError as error:
        return account_page("register", str(error), values, next_url)

    response = RedirectResponse(url=next_url, status_code=303)
    _set_user_cookie(response, request, user.id)
    return response


@app.get("/anmelden")
async def user_login_page(request: Request, next: str = "/profil"):
    if _current_user(request):
        return RedirectResponse(url=_safe_next(next), status_code=303)
    return account_page("login", next_url=_safe_next(next))


@app.post("/anmelden")
async def user_login_submit(request: Request):
    _rate_limit(AUTH_RATE_LIMIT, request, RATE_MAX_AUTH)
    form = await request.form()
    email = normalize_email(form.get("email"))
    password = str(form.get("password") or "")
    next_url = _safe_next(form.get("next"))
    user = get_user_by_email(email)
    if not user or not verify_password(password, user.password_hash):
        return account_page("login", "E-Mail-Adresse oder Passwort ist nicht korrekt.", {"email": email}, next_url)
    response = RedirectResponse(url=next_url, status_code=303)
    _set_user_cookie(response, request, user.id)
    return response


@app.post("/abmelden")
async def user_logout():
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie(PWA_SESSION_COOKIE, httponly=True, secure=True, samesite="lax")
    return response


@app.get("/profil")
async def user_profile(request: Request, hinweis: str = "", fehler: str = ""):
    user = _current_user(request)
    if not user:
        return RedirectResponse(url="/anmelden?next=/profil", status_code=303)
    return profile_page(
        user,
        get_meldungen_fuer_benutzer(user.id),
        get_dgh_termine_fuer_benutzer(user.id),
        has_push_subscription(user.id),
        push_configured(),
        message=hinweis,
        error=fehler,
    )


@app.post("/profil")
async def update_profile(request: Request):
    user = _require_user(request)
    form = await request.form()
    name = _trim(form.get("name"), 120)
    if not name:
        return RedirectResponse(url="/profil?fehler=Bitte%20gib%20deinen%20Namen%20an.", status_code=303)
    push_fields = (
        "push_meldungen", "push_dgh", "push_muell", "push_veranstaltungen",
        "push_aktuelles", "push_buergerinfo", "push_vereine",
        "push_feuerwehr", "push_verkehr", "push_warnungen",
        "push_unwetter", "push_bevoelkerungsschutz", "push_hochwasser",
    )
    push_preferences = {
        field: _trim(form.get(field), 10) == "ja" for field in push_fields
    }
    try:
        warn_min_level = max(1, min(int(str(form.get("warn_min_level") or "2")), 4))
    except ValueError:
        warn_min_level = 2
    update_user_profile(
        user.id,
        name,
        _trim(form.get("telefon"), 60),
        push_preferences["push_muell"],
        push_preferences,
        warn_min_level,
    )
    try:
        digest_hour = int(str(form.get("digest_hour") or "18"))
    except ValueError:
        digest_hour = 18
    save_preference(
        user.id,
        language=_trim(form.get("language"), 10) or None,
        push_mode=_trim(form.get("push_mode"), 20) or None,
        digest_hour=digest_hour,
        quiet_start=_trim(form.get("quiet_start"), 5) or None,
        quiet_end=_trim(form.get("quiet_end"), 5) or None,
        accessibility={field: _trim(form.get(field), 10) == "ja" for field in ("a11y_large", "a11y_contrast", "a11y_simple", "a11y_reduce")},
    )
    return RedirectResponse(url="/profil?hinweis=Profil%20wurde%20gespeichert.", status_code=303)


@app.post("/profil/passwort")
async def update_password(request: Request):
    user = _require_user(request)
    form = await request.form()
    current_password = str(form.get("current_password") or "")
    new_password = str(form.get("new_password") or "")
    confirmation = str(form.get("new_password_confirm") or "")
    if not verify_password(current_password, user.password_hash):
        return RedirectResponse(url="/profil?fehler=Das%20aktuelle%20Passwort%20ist%20nicht%20korrekt.", status_code=303)
    if len(new_password) < 10:
        return RedirectResponse(url="/profil?fehler=Das%20neue%20Passwort%20muss%20mindestens%2010%20Zeichen%20haben.", status_code=303)
    if new_password != confirmation:
        return RedirectResponse(url="/profil?fehler=Die%20neuen%20Passwörter%20stimmen%20nicht%20überein.", status_code=303)
    update_user_password(user.id, new_password)
    response = RedirectResponse(url="/profil?hinweis=Passwort%20wurde%20geändert.%20Andere%20Sitzungen%20wurden%20abgemeldet.", status_code=303)
    _set_user_cookie(response, request, user.id)
    return response


@app.get("/mangel-melden")
async def pwa_report(request: Request):
    user = _current_user(request)
    values = {"name": user.name, "email": user.email} if user else None
    return report_page(values=values)


@app.post("/api/maengel")
async def submit_report(request: Request, background_tasks: BackgroundTasks):
    _rate_limit(REPORT_RATE_LIMIT, request, RATE_MAX_REPORTS)
    form = await request.form()
    if _trim(form.get("website"), 200):
        return RedirectResponse(url="/", status_code=303)

    user = _current_user(request)
    art = _trim(form.get("art"), 120)
    ort = _trim(form.get("ort"), 180)
    beschreibung = _trim(form.get("beschreibung"), 1500)
    name = _trim(form.get("name"), 120)
    email = normalize_email(form.get("email"))
    latitude = _trim(form.get("latitude"), 30)
    longitude = _trim(form.get("longitude"), 30)
    values = {"art": art, "ort": ort, "beschreibung": beschreibung, "name": name, "email": email}

    if not art or not ort or len(beschreibung) < 10 or _trim(form.get("datenschutz"), 10) != "ja":
        return report_page("Bitte fülle alle Pflichtfelder vollständig aus und bestätige die Datenschutzhinweise.", values)
    if email and not _valid_email(email):
        return report_page("Bitte gib eine gültige E-Mail-Adresse ein.", values)

    photo_bytes = None
    photo = form.get("foto")
    if getattr(photo, "filename", ""):
        if (getattr(photo, "content_type", "") or "") not in ALLOWED_IMAGE_TYPES:
            return report_page("Bitte lade nur ein JPG-, PNG- oder WEBP-Bild hoch.", values)
        photo_bytes = await photo.read()
        if len(photo_bytes) > MAX_IMAGE_BYTES:
            return report_page("Das Foto darf höchstens 8 MB groß sein.", values)

    location_note = f"\n\nGPS-Position: {latitude}, {longitude}" if latitude and longitude else ""
    data = {"art": art, "ort": ort, "beschreibung": beschreibung + location_note, "foto_bytes": photo_bytes}
    contact = "PWA"
    if name:
        contact += f" | Name: {name}"
    if email:
        contact += f" | E-Mail: {email}"

    ticket = _new_ticket()
    save_meldung(ticket, data, contact, pwa_user_id=user.id if user else None)
    background_tasks.add_task(_send_email_safely, ticket, data, contact)
    return RedirectResponse(url=f"/meldung-erfolgreich/{ticket}", status_code=303)


@app.get("/meldung-erfolgreich/{ticket}")
async def report_success(ticket: str):
    if not get_meldung(ticket):
        return RedirectResponse(url="/mangel-melden", status_code=303)
    return report_success_page(ticket)


@app.get("/meldestatus")
async def report_status(ticket: str = ""):
    clean_ticket = _trim(ticket, 80).upper()
    if not clean_ticket:
        return status_page()
    report = get_meldung(clean_ticket)
    return status_page(clean_ticket, report=report, not_found=report is None)


@app.get("/veranstaltungen")
async def pwa_events():
    return events_page(get_aktive_veranstaltungen(), get_vergangene_veranstaltungen())


@app.get("/dgh-mieten")
async def pwa_dgh(request: Request):
    return dgh_overview_page(
        get_freie_tage(anzahl_tage=90),
        get_alle_dgh_termine(),
        logged_in=_current_user(request) is not None,
    )


@app.get("/dgh-anfrage")
async def dgh_request(request: Request):
    return dgh_request_page(_current_user(request))


@app.post("/api/dgh-anfragen")
async def submit_dgh_request(request: Request, background_tasks: BackgroundTasks):
    _rate_limit(REPORT_RATE_LIMIT, request, RATE_MAX_REPORTS)
    form = await request.form()
    if _trim(form.get("website"), 200):
        return RedirectResponse(url="/", status_code=303)

    user = _current_user(request)
    values = {
        "datum": _trim(form.get("datum"), 20),
        "uhrzeit": _trim(form.get("uhrzeit"), 40),
        "anlass": _trim(form.get("anlass"), 160),
        "name": _trim(form.get("name"), 120),
        "telefon": _trim(form.get("telefon"), 60),
        "email": normalize_email(form.get("email")),
        "kommentar": _trim(form.get("kommentar"), 1500),
    }
    if any(not values[key] for key in ("datum", "uhrzeit", "anlass", "name", "telefon", "email")):
        return dgh_request_page(user, "Bitte fülle alle Pflichtfelder aus.", values)
    if not _valid_email(values["email"]):
        return dgh_request_page(user, "Bitte gib eine gültige E-Mail-Adresse ein.", values)
    if _trim(form.get("datenschutz"), 10) != "ja":
        return dgh_request_page(user, "Bitte bestätige die Datenschutzhinweise.", values)
    try:
        selected_date = date.fromisoformat(values["datum"])
    except ValueError:
        return dgh_request_page(user, "Bitte wähle ein gültiges Datum.", values)
    if selected_date < date.today():
        return dgh_request_page(user, "Der gewünschte Termin darf nicht in der Vergangenheit liegen.", values)

    datum_de = selected_date.strftime("%d.%m.%Y")
    if ist_dgh_belegt(datum_de):
        return dgh_request_page(user, "Für diesen Tag ist das DGH bereits bestätigt belegt.", values)

    item = save_dgh_termin(
        datum_de,
        values["uhrzeit"],
        values["anlass"],
        values["name"],
        values["telefon"],
        values["kommentar"],
        status="Anfrage",
        email=values["email"],
        pwa_user_id=user.id if user else None,
    )
    reference = f"DGH-{item.id:06d}"
    background_tasks.add_task(_send_dgh_email_safely, reference, {**values, "datum": datum_de})
    token = _object_token("dgh", item.id)
    return RedirectResponse(url=f"/dgh-anfrage-erfolgreich/{item.id}?token={token}", status_code=303)


@app.get("/dgh-anfrage-erfolgreich/{termin_id}")
async def dgh_request_success(request: Request, termin_id: int, token: str = ""):
    item = get_dgh_termin(termin_id)
    if not item:
        return RedirectResponse(url="/dgh-mieten", status_code=303)
    user = _current_user(request)
    owns = bool(user and item.pwa_user_id == user.id)
    if not owns and not secrets.compare_digest(token, _object_token("dgh", termin_id)):
        raise HTTPException(status_code=404, detail="Anfrage nicht gefunden")
    return dgh_success_page(item, logged_in=owns)


@app.get("/muelltermine-info")
async def pwa_waste():
    return waste_page(get_naechste_muelltermine(limit=24))


@app.get("/vereine")
async def pwa_clubs():
    return info_page("vereine", get_gemeinde_einstellungen())


@app.get("/aktuelles")
async def pwa_news():
    return info_page("aktuelles", get_gemeinde_einstellungen())


@app.get("/ansprechpartner")
async def pwa_contacts():
    return info_page("ansprechpartner", get_gemeinde_einstellungen())


@app.get("/feuerwehr")
async def pwa_fire_department():
    return info_page("feuerwehr", get_gemeinde_einstellungen())


@app.get("/buergerinformationen")
async def pwa_citizen_info():
    return info_page("buergerinformationen", get_gemeinde_einstellungen())


@app.get("/ueber-gemeinde")
async def pwa_about():
    return info_page("ueber-gemeinde", get_gemeinde_einstellungen())


@app.get("/ueber-ahnsen")
async def pwa_about_legacy():
    return RedirectResponse(url="/ueber-gemeinde", status_code=301)


@app.get("/mehr")
async def pwa_more():
    return more_page(get_gemeinde_einstellungen())


@app.get("/impressum")
async def pwa_legal_notice():
    return legal_page("impressum", get_gemeinde_einstellungen())


@app.get("/datenschutz")
async def pwa_privacy():
    return legal_page("datenschutz", get_gemeinde_einstellungen())


@app.get("/api/push/public-key")
async def push_public_key():
    if not push_configured():
        raise HTTPException(status_code=503, detail="Push ist auf dem Server noch nicht konfiguriert")
    return {"publicKey": public_key()}


@app.post("/api/push/subscribe")
async def push_subscribe(request: Request):
    user = _current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Bitte zuerst anmelden")
    if not push_configured():
        raise HTTPException(status_code=503, detail="Push ist auf dem Server noch nicht konfiguriert")
    payload = await request.json()
    endpoint = _trim(payload.get("endpoint"), 4000)
    keys = payload.get("keys") or {}
    p256dh = _trim(keys.get("p256dh"), 1000)
    auth = _trim(keys.get("auth"), 500)
    if not endpoint.startswith("https://") or not p256dh or not auth:
        raise HTTPException(status_code=400, detail="Ungültiges Push-Abonnement")
    upsert_push_subscription(user.id, endpoint, p256dh, auth, request.headers.get("user-agent", ""))
    return {"status": "ok"}


@app.post("/api/push/unsubscribe")
async def push_unsubscribe(request: Request):
    user = _current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Bitte zuerst anmelden")
    payload = await request.json()
    endpoint = _trim(payload.get("endpoint"), 4000)
    if endpoint:
        delete_push_subscription(endpoint, user.id)
    return {"status": "ok"}


@app.get("/verwaltung")
async def administration(request: Request):
    if legacy._session_ist_gueltig(request):
        return RedirectResponse(url="/intern/cockpit", status_code=303)
    return RedirectResponse(url="/verwaltung/login", status_code=303)


@app.get("/verwaltung/login")
async def administration_login(request: Request):
    if legacy._session_ist_gueltig(request):
        return RedirectResponse(url="/intern/cockpit", status_code=303)
    return admin_login_page()


@app.get("/login")
async def legacy_login_redirect():
    return RedirectResponse(url="/verwaltung/login", status_code=303)


@app.post("/login")
async def administration_login_submit(request: Request):
    _rate_limit(AUTH_RATE_LIMIT, request, RATE_MAX_AUTH)
    form = await request.form()
    username = _trim(form.get("username"), 200)
    password = str(form.get("password") or "")
    otp = str(form.get("otp") or "")
    if not legacy.DASHBOARD_USER or not legacy.DASHBOARD_PASSWORD:
        response = admin_login_page("Der Verwaltungszugang ist auf dem Server noch nicht eingerichtet.")
        response.status_code = 503
        return response
    admin = authenticate_admin(username, password)
    if not admin or not verify_admin_second_factor(admin, otp):
        response = admin_login_page("Benutzername oder Passwort ist nicht korrekt.")
        response.status_code = 401
        return response
    response = RedirectResponse(url="/intern/cockpit", status_code=303)
    response.set_cookie(
        key=legacy.SESSION_COOKIE,
        value=legacy._neue_session(admin.username, admin.role, int(admin.session_version or 1)),
        max_age=legacy.SESSION_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    return response


@app.post("/logout")
async def administration_logout():
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie(key=legacy.SESSION_COOKIE, httponly=True, secure=True, samesite="lax")
    return response


@app.get("/intern")
async def intern_redirect(request: Request):
    if legacy._session_ist_gueltig(request):
        return RedirectResponse(url="/intern/cockpit", status_code=303)
    return RedirectResponse(url="/verwaltung/login", status_code=303)


@app.post("/status")
async def admin_report_status(request: Request, background_tasks: BackgroundTasks):
    legacy.check_dashboard_login(request)
    form = await request.form()
    ticket = _trim(form.get("ticket"), 80)
    neuer_status = _trim(form.get("neuer_status"), 40)
    allowed = {"Offen", "In Bearbeitung", "Warten auf Rückmeldung", "Erledigt", "Abgelehnt"}
    if neuer_status not in allowed:
        raise HTTPException(status_code=400, detail="Ungültiger Status")
    before = get_meldung(ticket)
    old_status = before.status if before else None
    report = update_status(ticket, neuer_status)
    if report and old_status != neuer_status and report.pwa_user_id:
        background_tasks.add_task(
            send_user_notification,
            report.pwa_user_id,
            "Status deiner Meldung geändert",
            f"{ticket} ist jetzt: {neuer_status}.",
            "/profil",
            f"meldung-{ticket}",
            "push_meldungen",
        )
    if report and old_status != neuer_status:
        audit_event("Verwaltung", "Mängelstatus geändert", "meldung", ticket, f"{old_status or '-'} → {neuer_status}")
    return RedirectResponse(url="/intern/maengel", status_code=303)


@app.post("/dgh/status/{termin_id}")
async def admin_dgh_status(request: Request, background_tasks: BackgroundTasks, termin_id: int):
    legacy.check_dashboard_login(request)
    form = await request.form()
    status = _trim(form.get("status"), 40)
    if status not in {"Anfrage", "Bestätigt", "Abgelehnt"}:
        raise HTTPException(status_code=400, detail="Ungültiger DGH-Status")
    try:
        item, old_status = set_dgh_status(termin_id, status)
    except ValueError as error:
        return RedirectResponse(url=f"/intern/dgh?fehler={quote(str(error))}", status_code=303)
    if item and old_status != status and item.pwa_user_id:
        background_tasks.add_task(
            send_user_notification,
            item.pwa_user_id,
            "DGH-Anfrage aktualisiert",
            f"Deine Anfrage für {item.datum} ist jetzt: {status}.",
            "/profil",
            f"dgh-{item.id}",
            "push_dgh",
        )
    if item and old_status != status:
        audit_event("Verwaltung", "DGH-Status geändert", "dgh", str(item.id), f"{old_status or '-'} → {status}")
    return RedirectResponse(url=f"/intern/dgh?hinweis={quote(f'Status wurde auf {status} gesetzt.')}", status_code=303)


@app.get("/intern/warnungen")
async def admin_warnings_page(request: Request, hinweis: str = "", fehler: str = ""):
    legacy.check_dashboard_login(request)
    return warning_dashboard_page(
        get_active_warnings(limit=30),
        get_recent_warnings(limit=80),
        get_warning_stats(),
        hinweis=hinweis,
        fehler=fehler,
    )


@app.post("/intern/warnungen/pruefen")
async def admin_warnings_poll(request: Request):
    legacy.check_dashboard_login(request)
    result = poll_warning_sources(send_push=True)
    failed = [name for name, state in result.get("sources", {}).items() if state.get("status") != "ok"]
    if failed:
        return RedirectResponse(
            url=f"/intern/warnungen?fehler={quote('Warnquellen teilweise nicht erreichbar: ' + ', '.join(failed))}",
            status_code=303,
        )
    info = f"Warnquellen geprüft: {result.get('new', 0)} neu, {result.get('changed', 0)} aktualisiert, {result.get('pushed_devices', 0)} Push-Zustellung(en)."
    return RedirectResponse(url=f"/intern/warnungen?hinweis={quote(info)}", status_code=303)


@app.get("/intern/push")
async def admin_push_page(request: Request, hinweis: str = "", fehler: str = ""):
    legacy.check_dashboard_login(request)
    return push_dashboard_page(PUSH_BROADCAST_CATEGORIES, hinweis=hinweis, fehler=fehler)


@app.post("/intern/push/senden")
async def admin_push_send(request: Request, background_tasks: BackgroundTasks):
    legacy.check_dashboard_login(request)
    form = await request.form()
    category = _trim(form.get("category"), 80)
    title = _trim(form.get("title"), 120)
    body = _trim(form.get("body"), 500)
    url = _safe_next(form.get("url"), "/")
    if category not in PUSH_BROADCAST_CATEGORIES:
        return RedirectResponse(url="/intern/push?fehler=Ungültige%20Push-Kategorie.", status_code=303)
    if not title or not body:
        return RedirectResponse(url="/intern/push?fehler=Titel%20und%20Nachricht%20sind%20erforderlich.", status_code=303)
    if not push_configured():
        return RedirectResponse(url="/intern/push?fehler=Push%20ist%20auf%20dem%20Server%20nicht%20konfiguriert.", status_code=303)
    background_tasks.add_task(
        send_category_notification,
        category,
        title,
        body,
        url,
        f"admin-{category}",
    )
    return RedirectResponse(
        url=f"/intern/push?hinweis={quote('Push-Versand wurde gestartet. Es erhalten ihn nur Nutzer, die diese Kategorie aktiviert haben.')}",
        status_code=303,
    )


@app.get("/intern/system")
async def admin_system_page(request: Request, voll: int = 0, hinweis: str = "", fehler: str = ""):
    legacy.check_dashboard_login(request)
    report = run_system_checks(app, request=request, deep=bool(voll))
    return system_dashboard_page(
        report,
        get_push_test_targets(),
        get_automation_status(force=bool(voll)),
        hinweis=hinweis,
        fehler=fehler,
    )


@app.post("/intern/system/automation/ratsarchive/start")
async def admin_ratsarchive_sync_start(request: Request):
    legacy.check_dashboard_login(request)
    ok, message = trigger_ratsarchive_sync()
    try:
        record_system_event("ratsarchive_manual_sync", "ok" if ok else "warn", message)
    except Exception:
        pass
    parameter = "hinweis" if ok else "fehler"
    return RedirectResponse(url=f"/intern/system?{parameter}={quote(message)}", status_code=303)


@app.post("/intern/system/test-push")
async def admin_system_test_push(request: Request):
    legacy.check_dashboard_login(request)
    form = await request.form()
    try:
        user_id = int(str(form.get("user_id") or "0"))
    except ValueError:
        user_id = 0
    user = get_user_by_id(user_id)
    if not user:
        return RedirectResponse(url="/intern/system?fehler=Ungültiges%20Push-Zielkonto.", status_code=303)
    sent = send_user_notification(
        user.id,
        f"{get_platform_snapshot()['platform_name']} – Test-Push",
        "Systemtest erfolgreich: Push-Nachrichten erreichen dieses Gerät.",
        "/profil",
        f"system-test-{int(time.time())}",
    )
    if sent:
        try:
            record_system_event(
                "test_push",
                "ok",
                f"Test-Push an {user.email} auf {sent} Gerät(e) versendet.",
                {"user_id": user.id, "devices": sent},
            )
        except Exception:
            pass
        return RedirectResponse(
            url=f"/intern/system?hinweis={quote(f'Test-Push wurde an {sent} Gerät(e) des ausgewählten Kontos versendet.')}",
            status_code=303,
        )
    try:
        record_system_event(
            "test_push",
            "error",
            f"Test-Push an {user.email} konnte an kein Gerät zugestellt werden.",
            {"user_id": user.id},
        )
    except Exception:
        pass
    return RedirectResponse(
        url="/intern/system?fehler=Test-Push%20konnte%20an%20kein%20registriertes%20Gerät%20zugestellt%20werden.",
        status_code=303,
    )


@app.post("/intern/system/test-email")
async def admin_system_test_email(request: Request):
    legacy.check_dashboard_login(request)
    try:
        send_test_email()
        try:
            record_system_event("test_email", "ok", "Test-E-Mail wurde erfolgreich an EMAIL_TO versendet.")
        except Exception:
            pass
        return RedirectResponse(
            url="/intern/system?hinweis=Test-E-Mail%20wurde%20erfolgreich%20an%20die%20konfigurierte%20Verwaltungsadresse%20versendet.",
            status_code=303,
        )
    except Exception as error:
        try:
            record_system_event(
                "test_email",
                "error",
                f"Test-E-Mail fehlgeschlagen: {type(error).__name__}: {str(error)[:500]}",
            )
        except Exception:
            pass
        return RedirectResponse(
            url=f"/intern/system?fehler={quote('Test-E-Mail fehlgeschlagen: ' + str(error)[:180])}",
            status_code=303,
        )


@app.get("/pwa.css")
async def pwa_css():
    return FileResponse(STATIC_DIR / "pwa.css", media_type="text/css; charset=utf-8", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/pwa-extra.css")
async def pwa_extra_css():
    return FileResponse(STATIC_DIR / "pwa-extra.css", media_type="text/css; charset=utf-8", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/community.css")
async def community_css():
    return FileResponse(STATIC_DIR / "community.css", media_type="text/css; charset=utf-8", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/community.js")
async def community_javascript():
    return FileResponse(STATIC_DIR / "community.js", media_type="application/javascript; charset=utf-8", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/warning.css")
async def warning_css():
    return FileResponse(STATIC_DIR / "warning.css", media_type="text/css; charset=utf-8", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/accessibility.css")
async def accessibility_css():
    return FileResponse(STATIC_DIR / "accessibility.css", media_type="text/css; charset=utf-8", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/accessibility.js")
async def accessibility_javascript():
    return FileResponse(STATIC_DIR / "accessibility.js", media_type="application/javascript; charset=utf-8", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/pwa.js")
async def pwa_javascript():
    return FileResponse(STATIC_DIR / "pwa.js", media_type="application/javascript; charset=utf-8", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/pwa/icon-{size}.png")
async def pwa_icon(size: int):
    if size not in {192, 512}:
        raise HTTPException(status_code=404, detail="Icon nicht gefunden")
    return FileResponse(STATIC_DIR / f"icon-{size}.png", media_type="image/png", headers={"Cache-Control": "public, max-age=604800"})


@app.get("/manifest.webmanifest")
async def manifest():
    cfg = get_platform_snapshot()
    return JSONResponse(
        {
            "id": "/",
            "name": cfg["platform_name"],
            "short_name": cfg["short_name"],
            "description": cfg["description"],
            "lang": cfg["default_language"],
            "start_url": "/",
            "scope": "/",
            "display": "standalone",
            "orientation": "portrait-primary",
            "background_color": "#fbf8f0",
            "theme_color": cfg["primary_color"],
            "categories": ["government", "utilities", "social"],
            "icons": [
                {"src": "/pwa/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
                {"src": "/pwa/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
            ],
            "shortcuts": [
                {"name": "Mangel melden", "url": "/mangel-melden", "icons": [{"src": "/pwa/icon-192.png", "sizes": "192x192"}]},
                {"name": "DGH anfragen", "url": "/dgh-anfrage", "icons": [{"src": "/pwa/icon-192.png", "sizes": "192x192"}]},
                {"name": "Warnungen", "url": "/warnungen", "icons": [{"src": "/pwa/icon-192.png", "sizes": "192x192"}]},
                {"name": "Mein Profil", "url": "/profil", "icons": [{"src": "/pwa/icon-192.png", "sizes": "192x192"}]},
            ],
        },
        media_type="application/manifest+json",
    )


@app.get("/service-worker.js")
async def service_worker():
    cfg = get_platform_snapshot()
    default_payload = json.dumps({"title": cfg["platform_name"], "body": "Es gibt eine neue Information.", "url": "/profil", "tag": "citizen-platform"}, ensure_ascii=False)
    core_assets = ['/', '/mangel-melden', '/dgh-mieten', '/mehr', '/suche', '/ideen', '/nachbarschaft', '/politik-rat', '/karte', '/pwa.css?v=1', '/pwa-extra.css?v=1', '/community.css?v=2', '/warning.css?v=1', '/pwa.js?v=1', '/community.js?v=2', '/pwa/icon-192.png']
    hero = str(cfg.get("hero_image_url") or "")
    if hero.startswith("/"):
        core_assets.append(hero)
    core_json = json.dumps(list(dict.fromkeys(core_assets)), ensure_ascii=False)
    script = f"""
const CACHE = 'citizen-platform-pwa-v4';
const CORE = {core_json};
self.addEventListener('install', event => {{ event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())); }});
self.addEventListener('activate', event => {{ event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); }});
self.addEventListener('fetch', event => {{
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {{
    const copy = response.clone();
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }}).catch(() => caches.match(event.request).then(cached => cached || caches.match('/'))));
}});
self.addEventListener('push', event => {{
  let data = {default_payload};
  try {{ if (event.data) data = {{ ...data, ...event.data.json() }}; }} catch (_error) {{}}
  event.waitUntil(self.registration.showNotification(data.title, {{
    body: data.body, icon: data.icon || '/pwa/icon-192.png', badge: data.badge || '/pwa/icon-192.png', tag: data.tag, data: {{ url: data.url || '/profil' }}
  }}));
}});
self.addEventListener('notificationclick', event => {{
  event.notification.close();
  const target = event.notification.data && event.notification.data.url ? event.notification.data.url : '/profil';
  event.waitUntil(clients.matchAll({{ type: 'window', includeUncontrolled: true }}).then(list => {{
    for (const client of list) {{ if ('focus' in client) {{ client.navigate(target); return client.focus(); }} }}
    return clients.openWindow ? clients.openWindow(target) : undefined;
  }}));
}});
""".strip()
    return Response(script, media_type="application/javascript; charset=utf-8", headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})


@app.get("/health")
async def health():
    cfg = get_platform_snapshot()
    return {
        "status": f"{cfg['platform_name']} PWA läuft",
        "version": "pwa-4-i18n-whitelabel",
        "municipality": cfg["municipality_name"],
        "translation": "aktiv" if cfg.get("translation_enabled") else "deaktiviert",
        "accounts": "aktiv",
        "push": "konfiguriert" if push_configured() else "VAPID-Schlüssel fehlen",
    }


@app.get("/health/deep")
async def deep_health(request: Request):
    report = run_system_checks(app, request=request, deep=False)
    errors = [{"key": item["key"], "detail": item["detail"]} for item in report["checks"] if item["status"] == "error"]
    payload = {
        "status": "ok" if not errors else "degraded",
        "summary": report["summary"],
        "errors": errors,
        "duration_ms": report["duration_ms"],
        "commit": str(os.getenv("RENDER_GIT_COMMIT") or "")[:10],
    }
    return JSONResponse(payload, status_code=200 if not errors else 503, headers={"Cache-Control": "no-store"})


def _reuse_legacy_route(path: str) -> bool:
    if path in {"/status", "/dgh/status/{termin_id}"}:
        return False
    exact_paths = {
        "/dashboard",
        "/dgh",
        "/muelltermine",
        "/gemeindeseite",
        "/notiz",
        "/meldung/{ticket}",
        "/muelltermine.ics",
        "/assets/ahnsen-startseite.png",
    }
    prefixes = (
        "/intern/",
        "/veranstaltungen/neue",
        "/veranstaltungen/bearbeiten/",
        "/veranstaltungen/aktiv/",
        "/veranstaltungen/loeschen/",
        "/dgh/",
        "/muelltermine/import",
        "/gemeindeseite/",
        "/uploads/",
        "/media/",
    )
    return path in exact_paths or path.startswith(prefixes)


for route in legacy.app.router.routes:
    path = getattr(route, "path", "")
    if _reuse_legacy_route(path):
        app.router.routes.append(route)
