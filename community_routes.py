from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

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
    get_report,
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
    admin_global_search_page,
    admin_messages_page,
    admin_neighbor_page,
    admin_politics_page,
    audit_page,
    cockpit_page,
    platform_settings_page,
    report_print_page,
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
from dgh_crud import get_alle_dgh_termine
from gemeinde_crud import set_gemeinde_einstellung
from platform_runtime import get_platform_snapshot
from ratsinfo_service import get_ratsinfo_snapshot
from ratsarchive_service import (
    MAX_PDF_BYTES,
    add_archive_document,
    add_archive_document_from_url,
    create_archive_meeting,
    delete_archive_document,
    delete_archive_meeting,
    get_admin_archive,
    get_archive_document,
    update_archive_meeting,
)
from translation_service import provider_status, translate_texts
from veranstaltungen_crud import get_aktive_veranstaltungen


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
    gps_pattern = re.compile(r"GPS-Position:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)")
    points = []
    for item in suche_meldungen()[:300]:
        description = str(getattr(item, "beschreibung", "") or "")
        match = gps_pattern.search(description)
        if not match:
            continue
        try:
            lat = round(float(match.group(1)), 3)
            lon = round(float(match.group(2)), 3)
        except ValueError:
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue

        location = re.sub(r"\b\d+[a-zA-Z]?\b", "", str(getattr(item, "ort", "") or "")).strip(" ,-")
        created = getattr(item, "erstellt_am", None)
        category = str(getattr(item, "art", "Meldung") or "Meldung")[:100]
        points.append({
            "id": int(getattr(item, "id", 0) or 0),
            "lat": lat,
            "lon": lon,
            "art": category,
            "category": category,
            "ort": location[:100] or get_platform_snapshot()["municipality_name"],
            "status": str(getattr(item, "status", "Offen") or "Offen")[:40],
            "date": created.isoformat() if created else "",
            "date_label": created.strftime("%d.%m.%Y") if created else "",
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
            f"Jemand möchte Kontakt zu deinem Beitrag aufnehmen. Öffne dein {get_platform_snapshot()['municipality_name']}-Postfach.",
            "/nachrichten",
            f"neighbor-contact-{post_id}-{user.id}",
            None,
        )
    audit_event(user.email, "Kontaktanfrage gesendet", "neighbor_post", str(post_id))
    return RedirectResponse(url="/nachbarschaft?hinweis=" + quote("Kontaktanfrage wurde als persönliche Nachricht zugestellt."), status_code=303)


@router.get("/politik-rat")
async def public_politics(q: str = "", jahr: str = ""):
    query = _clean(q, 120)
    year = _clean(jahr, 4)
    return politics_page(
        get_civic_items(),
        get_ratsinfo_snapshot(query=query, year=year),
    )


@router.get("/politik-rat/dokument/{document_id}")
async def public_politics_document(document_id: int):
    document = get_archive_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Dokument nicht gefunden")
    filename = quote(str(document.get("filename") or "ratsdokument.pdf"))
    return Response(
        content=document["data"],
        media_type=document.get("mime_type") or "application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/api/politik-rat")
async def public_politics_data(q: str = "", jahr: str = ""):
    return JSONResponse(
        get_ratsinfo_snapshot(
            query=_clean(q, 120),
            year=_clean(jahr, 4),
        )
    )


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
    response.set_cookie("platform_language", language, max_age=365 * 24 * 3600, samesite="lax", secure=request.url.scheme == "https")
    response.delete_cookie("ahnsen_language")
    return response


@router.post("/api/uebersetzen")
async def public_translate(request: Request):
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    texts = payload.get("texts") or payload.get("text") or []
    if isinstance(texts, str):
        texts = [texts]
    if not isinstance(texts, list):
        raise HTTPException(status_code=400, detail="texts muss eine Liste sein")
    target = _clean(payload.get("target"), 10)
    source = _clean(payload.get("source"), 10) or "auto"
    try:
        return translate_texts(texts, target=target, source=source)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/api/uebersetzen/status")
async def public_translation_status():
    return provider_status()


@router.get("/api/plattform")
async def public_platform_config():
    return get_platform_snapshot()


@router.get("/intern/cockpit")
async def admin_cockpit(request: Request):
    _admin(request)
    return cockpit_page(dashboard_stats())


@router.get("/intern/suche")
async def admin_global_search(request: Request, q: str = ""):
    _admin(request)
    query = _clean(q, 120)
    results: list[dict] = []
    if len(query) >= 2:
        needle = query.casefold()
        for item in suche_meldungen(query)[:30]:
            results.append({"kind": "Mangel", "title": f"{item.ticket} · {item.art}", "detail": f"{item.ort} · {item.status}", "url": f"/intern/meldung/{quote(item.ticket)}"})
        for user in get_all_users()[:300]:
            if needle in f"{user.name} {user.email} {user.telefon}".casefold():
                results.append({"kind": "Bürgerkonto", "title": user.name, "detail": user.email, "url": "/intern/nachrichten"})
        for row in get_ideas(include_inactive=True):
            idea = row["idea"]
            if needle in f"{idea.title} {idea.description} {idea.category}".casefold():
                results.append({"kind": "Idee", "title": idea.title, "detail": f"{idea.category} · {idea.status}", "url": "/intern/ideen"})
        for post, _user_item in get_neighbor_posts(admin=True):
            if needle in f"{post.title} {post.description} {post.category}".casefold():
                results.append({"kind": "Nachbarschaft", "title": post.title, "detail": f"{post.category} · {post.status}", "url": "/intern/nachbarschaft"})
        for event in get_aktive_veranstaltungen():
            if needle in f"{event.titel} {event.beschreibung} {event.ort} {event.datum}".casefold():
                results.append({"kind": "Veranstaltung", "title": event.titel, "detail": f"{event.datum} · {event.ort}", "url": "/intern/veranstaltungen"})
        for term in get_alle_dgh_termine():
            if needle in f"{term.anlass} {term.name} {term.datum} {term.status}".casefold():
                results.append({"kind": "DGH", "title": term.anlass or "DGH-Termin", "detail": f"{term.datum} · {term.status}", "url": "/intern/dgh"})
    return admin_global_search_page(query, results[:100])


@router.get("/intern/nachrichten")
async def admin_messages(request: Request, hinweis: str = "", q: str = "", status: str = ""):
    _admin(request)
    users = get_all_users()
    recent = []
    for user in users[:150]:
        recent.extend(get_messages(user.id, limit=8))
    recent.sort(key=lambda item: getattr(item, "erstellt_am", datetime.min), reverse=True)
    query = _clean(q, 120)
    if query:
        needle = query.casefold()
        user_labels = {int(item.id): f"{item.name} {item.email}" for item in users}
        recent = [item for item in recent if needle in f"{item.subject} {item.body} {user_labels.get(int(item.user_id), '')}".casefold()]
    if status == "gelesen":
        recent = [item for item in recent if item.gelesen_am]
    elif status == "ungelesen":
        recent = [item for item in recent if not item.gelesen_am]
    return admin_messages_page(users, recent[:80], message=hinweis, search=query, status=status)


@router.post("/intern/nachrichten")
async def admin_send_message(request: Request, background_tasks: BackgroundTasks):
    admin = _admin(request)
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
            f"Neue Nachricht in {get_platform_snapshot()['platform_name']}",
            "Du hast eine neue persönliche Nachricht der Verwaltung.",
            "/nachrichten",
            f"mailbox-{int(datetime.utcnow().timestamp())}-{user_id}",
            None,
        )
    audit_event(admin["username"], "Bürgernachricht gesendet", "pwa_user", str(user_id), subject)
    return RedirectResponse(url="/intern/nachrichten?hinweis=" + quote("Nachricht wurde zugestellt."), status_code=303)


@router.get("/intern/ideen")
async def admin_ideas(request: Request):
    _admin(request)
    return admin_ideas_page(get_ideas(include_inactive=True))


@router.post("/intern/ideen/{idea_id}/status")
async def admin_idea_status(request: Request, idea_id: int, background_tasks: BackgroundTasks):
    admin = _admin(request)
    form = await request.form()
    status = _clean(form.get("status"), 40)
    item = update_idea_status(idea_id, status)
    if item:
        create_message(item.user_id, f"Status deiner Idee: {item.title}", f"Der Status wurde auf „{status}“ geändert.", category="idee", url=f"/ideen/{idea_id}")
        if _send_user_notification:
            background_tasks.add_task(_send_user_notification, item.user_id, "Deine Idee wurde aktualisiert", f"{item.title}: {status}", f"/ideen/{idea_id}", f"idea-{idea_id}-{status}", None)
        audit_event(admin["username"], "Ideenstatus geändert", "idea", str(idea_id), status)
    return RedirectResponse(url="/intern/ideen", status_code=303)


@router.get("/intern/nachbarschaft")
async def admin_neighbor(request: Request):
    _admin(request)
    return admin_neighbor_page(get_neighbor_posts(admin=True))


@router.post("/intern/nachbarschaft/{post_id}/status")
async def admin_neighbor_status(request: Request, post_id: int, background_tasks: BackgroundTasks):
    admin = _admin(request)
    form = await request.form()
    status = _clean(form.get("status"), 40)
    item = update_neighbor_status(post_id, status)
    if item:
        create_message(item.user_id, f"Nachbarschaftsbeitrag: {item.title}", f"Der Status wurde auf „{status}“ geändert.", category="nachbarschaft", url="/nachbarschaft")
        if _send_user_notification:
            background_tasks.add_task(_send_user_notification, item.user_id, "Nachbarschaftsbeitrag aktualisiert", f"{item.title}: {status}", "/nachbarschaft", f"neighbor-{post_id}-{status}", None)
        audit_event(admin["username"], "Nachbarschaftsstatus geändert", "neighbor_post", str(post_id), status)
    return RedirectResponse(url="/intern/nachbarschaft", status_code=303)


@router.get("/intern/politik")
async def admin_politics(request: Request, hinweis: str = ""):
    _admin(request)
    return admin_politics_page(get_civic_items(include_inactive=True), get_admin_archive(), message=hinweis)


async def _store_archive_uploads(form, meeting_id: int) -> tuple[int, list[str]]:
    added = 0
    errors = []
    kind = _clean(form.get("document_kind"), 100) or "Niederschrift / Protokoll"
    document_title = _clean(form.get("document_title"), 300)
    document_source_url = _clean(form.get("document_source_url"), 1000)
    for upload in form.getlist("documents"):
        filename = str(getattr(upload, "filename", "") or "").strip()
        if not filename:
            continue
        try:
            data = await upload.read(MAX_PDF_BYTES + 1)
            _id, created = add_archive_document(
                meeting_id,
                kind=kind,
                title=document_title or filename,
                filename=filename,
                data=data,
                source_url=document_source_url,
            )
            added += 1 if created else 0
        except Exception as error:
            errors.append(f"{filename}: {str(error)[:160]}")
    direct_url = _clean(form.get("document_url"), 1000)
    if direct_url:
        try:
            _id, created = add_archive_document_from_url(
                meeting_id,
                kind=kind,
                title=document_title,
                url=direct_url,
            )
            added += 1 if created else 0
        except Exception as error:
            errors.append(f"URL-Import: {str(error)[:180]}")
    return added, errors


@router.post("/intern/politik/archiv")
async def admin_create_archive_meeting(request: Request):
    admin = _admin(request)
    form = await request.form()
    try:
        meeting_id = create_archive_meeting(
            date_text=_clean(form.get("meeting_date"), 10),
            time_text=_clean(form.get("meeting_time"), 5),
            title=_clean(form.get("title"), 300),
            organization=_clean(form.get("organization"), 200),
            location=_clean(form.get("location"), 240),
            summary=_clean(form.get("summary"), 12000),
            source_url=_clean(form.get("source_url"), 1000),
            published=form.get("published") == "on",
        )
    except Exception as error:
        return RedirectResponse(url="/intern/politik?hinweis=" + quote(f"Sitzung konnte nicht gespeichert werden: {str(error)[:180]}"), status_code=303)
    added, errors = await _store_archive_uploads(form, meeting_id)
    audit_event(admin["username"], "Ratssitzung archiviert", "council_meeting", str(meeting_id), f"{added} Dokumente")
    message = f"Sitzung gespeichert · {added} neue PDF-Datei(en)."
    if errors:
        message += " Hinweise: " + " | ".join(errors[:3])
    return RedirectResponse(url="/intern/politik?hinweis=" + quote(message), status_code=303)


@router.post("/intern/politik/archiv/{meeting_id}")
async def admin_update_archive_meeting(request: Request, meeting_id: int):
    admin = _admin(request)
    form = await request.form()
    try:
        updated = update_archive_meeting(
            meeting_id,
            date_text=_clean(form.get("meeting_date"), 10),
            time_text=_clean(form.get("meeting_time"), 5),
            title=_clean(form.get("title"), 300),
            organization=_clean(form.get("organization"), 200),
            location=_clean(form.get("location"), 240),
            summary=_clean(form.get("summary"), 12000),
            source_url=_clean(form.get("source_url"), 1000),
            published=form.get("published") == "on",
        )
    except Exception as error:
        return RedirectResponse(url="/intern/politik?hinweis=" + quote(f"Änderung fehlgeschlagen: {str(error)[:180]}"), status_code=303)
    if updated:
        audit_event(admin["username"], "Ratssitzung bearbeitet", "council_meeting", str(meeting_id))
    return RedirectResponse(url="/intern/politik?hinweis=" + quote("Sitzung aktualisiert." if updated else "Sitzung nicht gefunden."), status_code=303)


@router.post("/intern/politik/archiv/{meeting_id}/dokument")
async def admin_add_archive_document(request: Request, meeting_id: int):
    admin = _admin(request)
    form = await request.form()
    added, errors = await _store_archive_uploads(form, meeting_id)
    if added:
        audit_event(admin["username"], "Ratsdokument hinzugefügt", "council_meeting", str(meeting_id), f"{added} Dokumente")
    message = f"{added} neue PDF-Datei(en) gespeichert."
    if errors:
        message += " Hinweise: " + " | ".join(errors[:3])
    return RedirectResponse(url="/intern/politik?hinweis=" + quote(message), status_code=303)


@router.post("/intern/politik/dokument/{document_id}/loeschen")
async def admin_delete_archive_document(request: Request, document_id: int):
    admin = _admin(request)
    if delete_archive_document(document_id):
        audit_event(admin["username"], "Ratsdokument gelöscht", "council_document", str(document_id))
    return RedirectResponse(url="/intern/politik?hinweis=" + quote("Dokument entfernt."), status_code=303)


@router.post("/intern/politik/archiv/{meeting_id}/loeschen")
async def admin_delete_archive_meeting(request: Request, meeting_id: int):
    admin = _admin(request)
    if delete_archive_meeting(meeting_id):
        audit_event(admin["username"], "Ratssitzung gelöscht", "council_meeting", str(meeting_id))
    return RedirectResponse(url="/intern/politik?hinweis=" + quote("Archiv-Sitzung entfernt."), status_code=303)


@router.post("/intern/politik")
async def admin_create_politics(request: Request):
    admin = _admin(request)
    form = await request.form()
    title = _clean(form.get("title"), 200)
    if not title:
        return RedirectResponse(url="/intern/politik", status_code=303)
    item = create_civic_item(
        _clean(form.get("kind"), 40), title, _clean(form.get("body"), 6000),
        _clean(form.get("date_text"), 80), _clean(form.get("location"), 160),
        _clean(form.get("source_url"), 500),
    )
    audit_event(admin["username"], "Politik-Eintrag veröffentlicht", "civic_item", str(item.id), title)
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
    admin = _admin(request)
    form = await request.form()
    period_key = _clean(form.get("period_key"), 40) or None
    report = generate_monthly_report(period_key)
    audit_event(admin["username"], "Digitalbericht erzeugt", "report", str(report.id), report.title)
    return RedirectResponse(url="/intern/berichte", status_code=303)


@router.get("/intern/berichte/{report_id}/druck")
async def admin_report_print(request: Request, report_id: int):
    _admin(request)
    report = get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Bericht nicht gefunden")
    return report_print_page(report)


@router.get("/intern/plattform")
async def admin_platform(request: Request):
    _admin(request)
    return platform_settings_page(get_platform_snapshot())


@router.post("/intern/plattform")
async def admin_platform_save(request: Request):
    admin = _admin(request)
    form = await request.form()
    values = {field: _clean(form.get(field), limit) for field, limit in (
        ("platform_name", 120), ("municipality_name", 120), ("claim", 180),
        ("postal_code", 20), ("primary_color", 20), ("accent_color", 20),
        ("warning_terms", 500),
    )}
    config = update_municipality_config(values)
    extras = {
        "plattform_kurzname": _clean(form.get("short_name"), 30),
        "plattform_beschreibung": _clean(form.get("description"), 300),
        "standard_sprache": _clean(form.get("default_language"), 10),
        "plattform_sprachen": _clean(form.get("languages"), 300),
        "zeitzone": _clean(form.get("timezone"), 80),
        "plattform_basis_url": _clean(form.get("public_base_url"), 500),
        "plattform_slug": _clean(form.get("platform_slug"), 80),
        "pwa_icon_192_url": _clean(form.get("pwa_icon_192_url"), 1000),
        "pwa_icon_512_url": _clean(form.get("pwa_icon_512_url"), 1000),
        "apple_touch_icon_url": _clean(form.get("apple_touch_icon_url"), 1000),
        "ticket_prefix": _clean(form.get("ticket_prefix"), 8),
        "karten_mittelpunkt_lat": _clean(form.get("map_lat"), 30),
        "karten_mittelpunkt_lon": _clean(form.get("map_lon"), 30),
        "karten_zoom": _clean(form.get("map_zoom"), 3),
        "warnung_ortsname": _clean(form.get("warning_location_name"), 160),
        "warnung_bereich": _clean(form.get("warning_area_label"), 240),
        "warnung_suchbegriffe": _clean(form.get("warning_terms"), 500),
        "bbk_mowas_rss_url": _clean(form.get("bbk_mowas_rss_url"), 1000),
        "dwd_cap_index_url": _clean(form.get("dwd_cap_index_url"), 1000),
        "uebersetzung_aktiv": "ja" if _clean(form.get("translation_enabled"), 10) == "ja" else "nein",
        "uebersetzung_api_url": _clean(form.get("translation_api_url"), 1000),
        "uebersetzung_fallback_url": _clean(form.get("translation_fallback_url"), 1000),
        "geschichte_modus": _clean(form.get("history_mode"), 20),
        "logo_bild_url": _clean(form.get("logo_url"), 1000),
        "hero_bild_url": _clean(form.get("hero_image_url"), 1000),
        "kontakt_name": _clean(form.get("contact_name"), 180),
        "kontakt_adresse": _clean(form.get("contact_address"), 500),
        "kontakt_email": _clean(form.get("contact_email"), 180),
        "kontakt_telefon": _clean(form.get("contact_phone"), 80),
        "externe_website_url": _clean(form.get("website_url"), 1000),
        "footer_datenschutz_url": _clean(form.get("privacy_url"), 1000),
        "footer_impressum_url": _clean(form.get("imprint_url"), 1000),
    }
    extras.update({
        "seiten_titel": config.platform_name,
        "logo_text": config.platform_name,
        "hauptfarbe": config.primary_color,
        "akzentfarbe": config.accent_color,
    })
    for key, value in extras.items():
        set_gemeinde_einstellung(key, value)
    audit_event(admin["username"], "Plattform-Konfiguration geändert", "municipality_config", str(config.id), config.platform_name)
    return RedirectResponse(url="/intern/plattform?hinweis=" + quote("White-Label-Konfiguration gespeichert."), status_code=303)
