from __future__ import annotations

import secrets
import time
from collections import defaultdict, deque
from pathlib import Path
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response

import main as legacy
from crud import get_meldung, init_db, save_meldung
from dgh_crud import get_alle_dgh_termine, get_freie_tage, init_dgh_db
from email_service import send_email
from gemeinde_crud import get_gemeinde_einstellungen, init_gemeinde_db
from muelltermine_crud import get_naechste_muelltermine, init_muelltermine_db
from veranstaltungen_crud import get_aktive_veranstaltungen, init_veranstaltungen_db
from pwa_ui import (
    admin_login_page,
    dgh_page,
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


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
RATE_WINDOW_SECONDS = 10 * 60
RATE_MAX_REPORTS = 5
REPORT_RATE_LIMIT: dict[str, deque[float]] = defaultdict(deque)


app = FastAPI(
    title="Ahnsen hilft PWA",
    description="Installierbare digitale Bürgerplattform für Ahnsen",
    version="2.0.0-pwa",
    docs_url=None,
    redoc_url=None,
)


@app.on_event("startup")
def startup() -> None:
    init_db()
    init_veranstaltungen_db()
    init_dgh_db()
    init_muelltermine_db()
    init_gemeinde_db()


def _public_data() -> dict:
    return {
        "einstellungen": get_gemeinde_einstellungen(),
        "veranstaltungen": get_aktive_veranstaltungen(),
        "dgh_termine": get_alle_dgh_termine(),
        "freie_dgh_tage": get_freie_tage(anzahl_tage=90),
        "muelltermine": get_naechste_muelltermine(limit=24),
    }


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _rate_limit_report(request: Request) -> None:
    now = time.monotonic()
    queue = REPORT_RATE_LIMIT[_client_key(request)]
    while queue and now - queue[0] > RATE_WINDOW_SECONDS:
        queue.popleft()
    if len(queue) >= RATE_MAX_REPORTS:
        raise HTTPException(
            status_code=429,
            detail="Zu viele Meldungen in kurzer Zeit. Bitte versuche es später erneut.",
        )
    queue.append(now)


def _new_ticket() -> str:
    date_part = time.strftime("%Y%m%d")
    random_part = uuid4().hex[:6].upper()
    return f"AHN-{date_part}-{random_part}"


def _send_email_safely(ticket: str, data: dict, source: str) -> None:
    try:
        send_email(ticket, data, source)
    except Exception as error:
        print("PWA-Meldung gespeichert, E-Mail konnte nicht gesendet werden:", repr(error))


def _trim(value, max_length: int) -> str:
    return str(value or "").strip()[:max_length]


@app.get("/")
async def pwa_home():
    return home_page(_public_data())


@app.get("/mangel-melden")
async def pwa_report():
    return report_page()


@app.post("/api/maengel")
async def submit_report(request: Request, background_tasks: BackgroundTasks):
    _rate_limit_report(request)
    form = await request.form()

    if _trim(form.get("website"), 200):
        return RedirectResponse(url="/", status_code=303)

    art = _trim(form.get("art"), 120)
    ort = _trim(form.get("ort"), 180)
    beschreibung = _trim(form.get("beschreibung"), 1500)
    name = _trim(form.get("name"), 120)
    email = _trim(form.get("email"), 180)
    latitude = _trim(form.get("latitude"), 30)
    longitude = _trim(form.get("longitude"), 30)
    privacy = _trim(form.get("datenschutz"), 10)

    values = {
        "art": art,
        "ort": ort,
        "beschreibung": beschreibung,
        "name": name,
        "email": email,
    }

    if not art or not ort or len(beschreibung) < 10 or privacy != "ja":
        return report_page(
            "Bitte fülle alle Pflichtfelder vollständig aus und bestätige die Datenschutzhinweise.",
            values,
        )

    if email and ("@" not in email or "." not in email.rsplit("@", 1)[-1]):
        return report_page("Bitte gib eine gültige E-Mail-Adresse ein.", values)

    photo_bytes = None
    photo = form.get("foto")
    if getattr(photo, "filename", ""):
        content_type = getattr(photo, "content_type", "") or ""
        if content_type not in ALLOWED_IMAGE_TYPES:
            return report_page("Bitte lade nur ein JPG-, PNG- oder WEBP-Bild hoch.", values)
        photo_bytes = await photo.read()
        if len(photo_bytes) > MAX_IMAGE_BYTES:
            return report_page("Das Foto darf höchstens 8 MB groß sein.", values)

    location_note = ""
    if latitude and longitude:
        location_note = f"\n\nGPS-Position: {latitude}, {longitude}"

    data = {
        "art": art,
        "ort": ort,
        "beschreibung": beschreibung + location_note,
        "foto_bytes": photo_bytes,
    }
    contact = "PWA"
    if name:
        contact += f" | Name: {name}"
    if email:
        contact += f" | E-Mail: {email}"

    ticket = _new_ticket()
    save_meldung(ticket, data, contact)
    background_tasks.add_task(_send_email_safely, ticket, data, contact)

    return RedirectResponse(url=f"/meldung-erfolgreich/{ticket}", status_code=303)


@app.get("/meldung-erfolgreich/{ticket}")
async def report_success(ticket: str):
    report = get_meldung(ticket)
    if not report:
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
    return events_page(get_aktive_veranstaltungen())


@app.get("/dgh-mieten")
async def pwa_dgh():
    return dgh_page(
        get_freie_tage(anzahl_tage=90),
        get_alle_dgh_termine(),
    )


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


@app.get("/ueber-ahnsen")
async def pwa_about():
    return info_page("ueber-ahnsen", get_gemeinde_einstellungen())


@app.get("/mehr")
async def pwa_more():
    return more_page(get_gemeinde_einstellungen())


@app.get("/impressum")
async def pwa_legal_notice():
    return legal_page("impressum", get_gemeinde_einstellungen())


@app.get("/datenschutz")
async def pwa_privacy():
    return legal_page("datenschutz", get_gemeinde_einstellungen())


@app.get("/verwaltung")
async def administration(request: Request):
    if legacy._session_ist_gueltig(request):
        return RedirectResponse(url="/intern/maengel", status_code=303)
    return RedirectResponse(url="/verwaltung/login", status_code=303)


@app.get("/verwaltung/login")
async def administration_login(request: Request):
    if legacy._session_ist_gueltig(request):
        return RedirectResponse(url="/intern/maengel", status_code=303)
    return admin_login_page()


@app.get("/login")
async def legacy_login_redirect():
    return RedirectResponse(url="/verwaltung/login", status_code=303)


@app.post("/login")
async def administration_login_submit(request: Request):
    form = await request.form()
    username = _trim(form.get("username"), 200)
    password = str(form.get("password") or "")

    if not legacy.DASHBOARD_USER or not legacy.DASHBOARD_PASSWORD:
        response = admin_login_page("Der Verwaltungszugang ist auf dem Server noch nicht eingerichtet.")
        response.status_code = 503
        return response

    user_ok = secrets.compare_digest(username, legacy.DASHBOARD_USER)
    password_ok = secrets.compare_digest(password, legacy.DASHBOARD_PASSWORD)
    if not (user_ok and password_ok):
        response = admin_login_page("Benutzername oder Passwort ist nicht korrekt.")
        response.status_code = 401
        return response

    response = RedirectResponse(url="/intern/maengel", status_code=303)
    response.set_cookie(
        key=legacy.SESSION_COOKIE,
        value=legacy._neue_session(),
        max_age=legacy.SESSION_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    return response


@app.post("/logout")
async def administration_logout():
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie(
        key=legacy.SESSION_COOKIE,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    return response


@app.get("/intern")
async def intern_redirect(request: Request):
    if legacy._session_ist_gueltig(request):
        return RedirectResponse(url="/intern/maengel", status_code=303)
    return RedirectResponse(url="/verwaltung/login", status_code=303)


@app.get("/pwa.css")
async def pwa_css():
    return FileResponse(
        STATIC_DIR / "pwa.css",
        media_type="text/css; charset=utf-8",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@app.get("/pwa.js")
async def pwa_javascript():
    return FileResponse(
        STATIC_DIR / "pwa.js",
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@app.get("/pwa/icon-{size}.png")
async def pwa_icon(size: int):
    if size not in {192, 512}:
        raise HTTPException(status_code=404, detail="Icon nicht gefunden")
    return FileResponse(
        STATIC_DIR / f"icon-{size}.png",
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=604800"},
    )


@app.get("/manifest.webmanifest")
async def manifest():
    payload = {
        "id": "/",
        "name": "Ahnsen hilft",
        "short_name": "Ahnsen",
        "description": "Digitale Bürgerplattform der Gemeinde Ahnsen",
        "lang": "de-DE",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "orientation": "portrait-primary",
        "background_color": "#fbf8f0",
        "theme_color": "#174936",
        "categories": ["government", "utilities", "social"],
        "icons": [
            {"src": "/pwa/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": "/pwa/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
        "shortcuts": [
            {"name": "Mangel melden", "url": "/mangel-melden", "icons": [{"src": "/pwa/icon-192.png", "sizes": "192x192"}]},
            {"name": "Mülltermine", "url": "/muelltermine-info", "icons": [{"src": "/pwa/icon-192.png", "sizes": "192x192"}]},
        ],
    }
    return JSONResponse(payload, media_type="application/manifest+json")


@app.get("/service-worker.js")
async def service_worker():
    script = """
const CACHE = 'ahnsen-hilft-pwa-v1';
const CORE = ['/', '/mangel-melden', '/mehr', '/pwa.css?v=1', '/pwa.js?v=1', '/pwa/icon-192.png', '/assets/ahnsen-startseite.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('/')))
  );
});
""".strip()
    return Response(
        script,
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"},
    )


@app.get("/health")
async def health():
    return {
        "status": "Ahnsen hilft PWA läuft",
        "version": "pwa-1",
        "whatsapp": "deaktiviert",
    }


def _reuse_legacy_route(path: str) -> bool:
    exact_paths = {
        "/dashboard",
        "/dgh",
        "/muelltermine",
        "/gemeindeseite",
        "/status",
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
    )
    return path in exact_paths or path.startswith(prefixes)


for route in legacy.app.router.routes:
    path = getattr(route, "path", "")
    if _reuse_legacy_route(path):
        app.router.routes.append(route)
