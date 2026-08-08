from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from community_crud import (
    SUPPORTED_LANGUAGES,
    add_idea_comment,
    audit_event,
    count_unread_messages,
    create_civic_item,
    create_idea,
    create_message,
    create_neighbor_post,
    dashboard_stats,
    generate_monthly_report,
    get_all_users,
    get_audit_logs,
    get_civic_items,
    get_idea,
    get_ideas,
    get_messages,
    get_municipality_config,
    get_neighbor_post,
    get_neighbor_posts,
    get_preference,
    get_reports,
    mark_message_read,
    save_preference,
    toggle_idea_support,
    update_idea_status,
    update_municipality_config,
    update_neighbor_status,
    user_supports_idea,
)
from community_dashboard import (
    admin_ideas_page,
    admin_messages_page,
    admin_neighbor_page,
    admin_politics_page,
    audit_page,
    cockpit_page,
    platform_settings_page,
    reports_page,
)
from community_search import intelligent_search
from community_ui import (
    idea_detail_page,
    ideas_page,
    messages_page,
    neighbor_page,
    politics_page,
    public_map_page,
    search_page,
)
from crud import suche_meldungen


router = APIRouter()
_current_user = None
_require_user = None
_trim = None
_admin_guard = None
_send_user_notification = None


def configure_community_routes(*, current_user, require_user, trim, admin_guard, send_user_notification) -> None:
    global _current_user, _require_user, _trim, _admin_guard, _send_user_notification
    _current_user = current_user
    _require_user = require_user
    _trim = trim
    _admin_guard = admin_guard
    _send_user_notification = send_user_notification


def _user(request: Request):
    return _current_user(request) if _current_user else None


def _required(request: Request, next_url: str):
    if not _require_user:
        raise HTTPException(status_code=503, detail="Kontobereich nicht verfügbar")
    return _require_user(request, next_url)


def _clean(value, length: int) -> str:
    if _trim:
        return _trim(value, length)
    return str(value or "").strip()[:length]


def _admin(request: Request):
    if not _admin_guard:
        raise HTTPException(status_code=503, detail="Verwaltungszugang nicht verfügbar")
    return _admin_guard(request)


def _public_report_points() -> list[dict]:
    pattern = re.compile(r"GPS-Position:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)")
    points = []
    for item in suche_meldungen()[:300]:
        match = pattern.search(str(getattr(item, "beschreibung", "") or ""))
        if not match:
            continue
        try:
            lat = round(float(match.group(1)), 3)
            lon = round(float(match.group(2)), 3)
        except ValueError:
            continue
        if not (51.5 <= lat <= 53.0 and 8.0 <= lon <= 10.5):
            continue
        location = re.sub(r"\b\d+[a-zA-Z]?\b", "", str(getattr(item, "ort", "") or "")).strip(" ,-")
        points.append({
            "lat": lat,
            "lon": lon,
            "art": str(getattr(item, "art", "Meldung") or "Meldung")[:100],
            "ort": location[:100] or "Ahnsen",
            "status": str(getattr(item, "status", "Offen") or "Offen")[:40],
        })
    return points


@router.get("/suche")
async def public_search(q: str = ""):
    query = _clean(q, 120)
    return search_page(query, intelligent_search(query))


@router.get("/karte")
async def public_map():
    return public_map_page(_public_report_points())


@router.get("/nachrichten")
async def citizen_messages(request: Request):
    user = _user(request)
    if not user:
        return RedirectResponse(url="/anmelden?next=/nachrichten", status_code=303)
    return messages_page(get_messages(user.id), count_unread_messages(user.id))


@router.post("/nachrichten/{message_id}/gelesen")
async def citizen_message_read(request: Request, message_id: int):
    user = _required(request, "/nachrichten")
    mark_message_read(user.id, message_id)
    return RedirectResponse(url="/nachrichten", status_code=303)


@router.get("/api/me/unread-count")
async def unread_count(request: Request):
    user = _user(request)
    return {"count": count_unread_messages(user.id) if user else 0, "loggedIn": bool(user)}


@router.get("/ideen")
async def public_ideas(request: Request, hinweis: str = ""):
    return ideas_page(get_ideas(), _user(request) is not None, message=hinweis)


@router.post("/ideen")
async def submit_idea(request: Request):
    user = _required(request, "/ideen")
    form = await request.form()
    title = _clean(form.get("title"), 180)
    description = _clean(form.get("description"), 4000)
    category = _clean(form.get("category"), 80) or "Allgemein"
    if len(title) < 4 or len(description) < 15:
        return RedirectResponse(url="/ideen?hinweis=" + quote("Bitte Titel und Beschreibung vollständig ausfüllen."), status_code=303)
    idea = create_idea(user.id, title, description, category)
    audit_event(user.email, "Idee eingereicht", "idea", str(idea.id), title)
    return RedirectResponse(url=f"/ideen/{idea.id}", status_code=303)


@router.get("/ideen/{idea_id}")
async def public_idea_detail(request: Request, idea_id: int):
    data = get_idea(idea_id)
    if not data:
        raise HTTPException(status_code=404, detail="Idee nicht gefunden")
    user = _user(request)
    supported = bool(user and user_supports_idea(idea_id, user.id))
    return idea_detail_page(data, user is not None, supported)


@router.post("/ideen/{idea_id}/unterstuetzen")
async def support_idea(request: Request, idea_id: int):
    user = _required(request, f"/ideen/{idea_id}")
    if not get_idea(idea_id):
        raise HTTPException(status_code=404, detail="Idee nicht gefunden")
    active = toggle_idea_support(idea_id, user.id)
    audit_event(user.email, "Idee unterstützt" if active else "Unterstützung entfernt", "idea", str(idea_id))
    return RedirectResponse(url=f"/ideen/{idea_id}", status_code=303)


@router.post("/ideen/{idea_id}/kommentieren")
async def comment_idea(request: Request, idea_id: int):
    user = _required(request, f"/ideen/{idea_id}")
    if not get_idea(idea_id):
        raise HTTPException(status_code=404, detail="Idee nicht gefunden")
    form = await request.form()
    body = _clean(form.get("body"), 1500)
    if len(body) >= 2:
        add_idea_comment(idea_id, user.id, body)
        audit_event(user.email, "Idee kommentiert", "idea", str(idea_id))
    return RedirectResponse(url=f"/ideen/{idea_id}", status_code=303)


@router.get("/nachbarschaft")
async def public_neighbor(request: Request, hinweis: str = ""):
    return neighbor_page(get_neighbor_posts(), _user(request) is not None, message=hinweis)


@router.post("/nachbarschaft")
async def submit_neighbor_post(request: Request):
    user = _required(request, "/nachbarschaft")
    form = await request.form()
    kind = _clean(form.get("kind"), 20)
    category = _clean(form.get("category"), 80)
    title = _clean(form.get("title"), 180)
    description = _clean(form.get("description"), 3000)
    if len(title) < 4 or len(description) < 10:
        return RedirectResponse(url="/nachbarschaft?hinweis=" + quote("Bitte Titel und Beschreibung vollständig ausfüllen."), status_code=303)
    item = create_neighbor_post(user.id, kind, category, title, description)
    audit_event(user.email, "Nachbarschaftsbeitrag eingereicht", "neighbor_post", str(item.id), title)
    return RedirectResponse(url="/nachbarschaft?hinweis=" + quote("Beitrag wurde eingereicht und wird vor Veröffentlichung geprüft."), status_code=303)


@router.post("/nachbarschaft/{post_id}/kontakt")
async def neighbor_contact(request: Request, post_id: int, background_tasks: BackgroundTasks):
    user = _required(request, "/nachbarschaft")
    post = get_neighbor_post(post_id)
    if not post or post.status != "Freigegeben" or post.user_id == user.id:
        return RedirectResponse(url="/nachbarschaft", status_code=303)
    contact_parts = [f"{user.name} möchte Kontakt zu deinem Beitrag ‚{post.title}‘ aufnehmen.", f"E-Mail: {user.email}"]
    if getattr(user, "telefon", ""):
        contact_parts.append(f"Telefon: {user.telefon}")
    create_message(
        post.user_id,
        f"Kontakt zu: {post.title}",
        "\n".join(contact_parts),
        category="nachbarschaft",
        url="/nachbarschaft",
        sender_user_id=user.id,
        sender_label=user.name,
    )
    if _send_user_notification:
        background_tasks.add_task(
            _send_user_notification,
            post.user_id,
            "Neue Nachricht zur Nachbarschaftshilfe",
            "Jemand möchte Kontakt zu deinem Beitrag aufnehmen. Öffne dein Ahnsen-Postfach.",
            "/nachrichten",
            f"neighbor-contact-{post_id}-{user.id}",
            None,
        )
    audit_event(user.email, "Kontaktanfrage gesendet", "neighbor_post", str(post_id))
    return RedirectResponse(url="/nachbarschaft?hinweis=" + quote("Kontaktanfrage wurde als persönliche Nachricht zugestellt."), status_code=303)


@router.get("/politik-rat")
async def public_politics():
    return politics_page(get_civic_items())


@router.post("/api/sprache")
async def save_language(request: Request):
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    language = _clean(payload.get("language"), 10)
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Sprache nicht unterstützt")
    user = _user(request)
    if user:
        save_preference(user.id, language=language)
    response = JSONResponse({"status": "ok", "language": language})
    response.set_cookie("ahnsen_language", language, max_age=365 * 24 * 3600, samesite="lax", secure=request.url.scheme == "https")
    return response


@router.get("/api/plattform")
async def public_platform_config():
    config = get_municipality_config()
    return {
        "platform_name": config.platform_name,
        "municipality_name": config.municipality_name,
        "claim": config.claim,
        "postal_code": config.postal_code,
        "primary_color": config.primary_color,
        "accent_color": config.accent_color,
    }


@router.get("/intern/cockpit")
async def admin_cockpit(request: Request):
    _admin(request)
    return cockpit_page(dashboard_stats())


@router.get("/intern/nachrichten")
async def admin_messages(request: Request, hinweis: str = ""):
    _admin(request)
    users = get_all_users()
    recent = []
    for user in users[:150]:
        recent.extend(get_messages(user.id, limit=8))
    recent.sort(key=lambda item: getattr(item, "erstellt_am", datetime.min), reverse=True)
    return admin_messages_page(users, recent[:80], message=hinweis)


@router.post("/intern/nachrichten")
async def admin_send_message(request: Request, background_tasks: BackgroundTasks):
    _admin(request)
    form = await request.form()
    try:
        user_id = int(str(form.get("user_id") or "0"))
    except ValueError:
        user_id = 0
    subject = _clean(form.get("subject"), 180)
    body = _clean(form.get("body"), 5000)
    if not user_id or not subject or not body:
        return RedirectResponse(url="/intern/nachrichten?hinweis=" + quote("Empfänger, Betreff und Nachricht sind erforderlich."), status_code=303)
    create_message(user_id, subject, body, category="verwaltung", url="/nachrichten")
    if _send_user_notification:
        background_tasks.add_task(
            _send_user_notification,
            user_id,
            "Neue Nachricht in Ahnsen hilft",
            "Du hast eine neue persönliche Nachricht der Verwaltung.",
            "/nachrichten",
            f"mailbox-{int(datetime.utcnow().timestamp())}-{user_id}",
            None,
        )
    audit_event("Verwaltung", "Bürgernachricht gesendet", "pwa_user", str(user_id), subject)
    return RedirectResponse(url="/intern/nachrichten?hinweis=" + quote("Nachricht wurde zugestellt."), status_code=303)


@router.get("/intern/ideen")
async def admin_ideas(request: Request):
    _admin(request)
    return admin_ideas_page(get_ideas(include_inactive=True))


@router.post("/intern/ideen/{idea_id}/status")
async def admin_idea_status(request: Request, idea_id: int, background_tasks: BackgroundTasks):
    _admin(request)
    form = await request.form()
    status = _clean(form.get("status"), 40)
    item = update_idea_status(idea_id, status)
    if item:
        create_message(item.user_id, f"Status deiner Idee: {item.title}", f"Der Status wurde auf „{status}“ geändert.", category="idee", url=f"/ideen/{idea_id}")
        if _send_user_notification:
            background_tasks.add_task(_send_user_notification, item.user_id, "Deine Idee wurde aktualisiert", f"{item.title}: {status}", f"/ideen/{idea_id}", f"idea-{idea_id}-{status}", None)
        audit_event("Verwaltung", "Ideenstatus geändert", "idea", str(idea_id), status)
    return RedirectResponse(url="/intern/ideen", status_code=303)


@router.get("/intern/nachbarschaft")
async def admin_neighbor(request: Request):
    _admin(request)
    return admin_neighbor_page(get_neighbor_posts(admin=True))


@router.post("/intern/nachbarschaft/{post_id}/status")
async def admin_neighbor_status(request: Request, post_id: int, background_tasks: BackgroundTasks):
    _admin(request)
    form = await request.form()
    status = _clean(form.get("status"), 40)
    item = update_neighbor_status(post_id, status)
    if item:
        create_message(item.user_id, f"Nachbarschaftsbeitrag: {item.title}", f"Der Status wurde auf „{status}“ geändert.", category="nachbarschaft", url="/nachbarschaft")
        if _send_user_notification:
            background_tasks.add_task(_send_user_notification, item.user_id, "Nachbarschaftsbeitrag aktualisiert", f"{item.title}: {status}", "/nachbarschaft", f"neighbor-{post_id}-{status}", None)
        audit_event("Verwaltung", "Nachbarschaftsstatus geändert", "neighbor_post", str(post_id), status)
    return RedirectResponse(url="/intern/nachbarschaft", status_code=303)


@router.get("/intern/politik")
async def admin_politics(request: Request):
    _admin(request)
    return admin_politics_page(get_civic_items(include_inactive=True))


@router.post("/intern/politik")
async def admin_create_politics(request: Request):
    _admin(request)
    form = await request.form()
    title = _clean(form.get("title"), 200)
    if not title:
        return RedirectResponse(url="/intern/politik", status_code=303)
    item = create_civic_item(
        _clean(form.get("kind"), 40), title, _clean(form.get("body"), 6000),
        _clean(form.get("date_text"), 80), _clean(form.get("location"), 160),
        _clean(form.get("source_url"), 500),
    )
    audit_event("Verwaltung", "Politik-Eintrag veröffentlicht", "civic_item", str(item.id), title)
    return RedirectResponse(url="/intern/politik", status_code=303)


@router.get("/intern/audit")
async def admin_audit(request: Request, q: str = ""):
    _admin(request)
    query = _clean(q, 120)
    return audit_page(get_audit_logs(query), query)


@router.get("/intern/berichte")
async def admin_reports(request: Request, q: str = ""):
    _admin(request)
    query = _clean(q, 120)
    return reports_page(get_reports(query), query)


@router.post("/intern/berichte/erstellen")
async def admin_generate_report(request: Request):
    _admin(request)
    form = await request.form()
    period_key = _clean(form.get("period_key"), 40) or None
    report = generate_monthly_report(period_key)
    audit_event("Verwaltung", "Digitalbericht erzeugt", "report", str(report.id), report.title)
    return RedirectResponse(url="/intern/berichte", status_code=303)


@router.get("/intern/plattform")
async def admin_platform(request: Request):
    _admin(request)
    return platform_settings_page(get_municipality_config())


@router.post("/intern/plattform")
async def admin_platform_save(request: Request):
    _admin(request)
    form = await request.form()
    values = {field: _clean(form.get(field), limit) for field, limit in (
        ("platform_name", 120), ("municipality_name", 120), ("claim", 180),
        ("postal_code", 20), ("primary_color", 20), ("accent_color", 20),
        ("warning_terms", 500),
    )}
    config = update_municipality_config(values)
    audit_event("Verwaltung", "Plattform-Konfiguration geändert", "municipality_config", str(config.id), config.platform_name)
    return RedirectResponse(url="/intern/plattform", status_code=303)
