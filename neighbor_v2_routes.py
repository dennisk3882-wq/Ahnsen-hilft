from __future__ import annotations

from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

import community_routes as community
from community_crud import audit_event, count_unread_messages, create_message, get_messages
from neighbor_v2_service import (
    CATEGORIES,
    REPORT_REASONS,
    admin_overview,
    apply_report_action,
    block_user,
    blocked_by_me,
    category_subscribers,
    clear_restriction,
    close_conversation,
    conversation_data,
    count_unread_chats,
    create_post,
    edit_post,
    get_feed,
    get_or_create_conversation,
    get_own_posts,
    get_post,
    init_neighbor_v2_db,
    list_conversations,
    mark_post_done,
    delete_post,
    renew_post,
    report_message,
    report_post,
    restriction_for,
    send_chat_message,
    set_post_status,
    subscribed_categories,
    toggle_category_subscription,
    toggle_saved,
    unblock_user,
    users_blocked,
)
from neighbor_v2_ui import (
    admin_neighbor_page_v2,
    chat_page,
    messages_center_page,
    neighbor_home_page,
    post_edit_page,
    reply_page,
    report_post_page,
)


router = APIRouter()


def _user(request: Request):
    return community._user(request)


def _required(request: Request, next_url: str):
    return community._required(request, next_url)


def _admin(request: Request):
    return community._admin(request)


def _clean(value, length: int) -> str:
    return community._clean(value, length)


def _notify(background_tasks: BackgroundTasks, user_id: int | None, title: str, body: str, url: str, tag: str) -> None:
    sender = community._send_user_notification
    if sender and user_id:
        background_tasks.add_task(sender, user_id, title, body, url, tag, None)


def _check_neighbor_access(user_id: int) -> dict:
    return restriction_for(user_id)


def _redirect_message(text: str, path: str = "/nachbarschaft") -> RedirectResponse:
    sep = "&" if "?" in path else "?"
    return RedirectResponse(url=f"{path}{sep}hinweis={quote(text)}", status_code=303)


@router.get("/nachbarschaft")
async def neighbor_home(request: Request, hinweis: str = "", kind: str = "", category: str = "", q: str = "", neu: str = ""):
    user = _user(request)
    user_id = user.id if user else None
    kind = _clean(kind, 20)
    category = _clean(category, 80)
    search = _clean(q, 120)
    restriction = _check_neighbor_access(user_id) if user_id else {"blocked": False}
    return neighbor_home_page(
        get_feed(user_id=user_id, kind=kind, category=category, search=search),
        get_own_posts(user_id) if user_id else [],
        user_id=user_id,
        logged_in=bool(user),
        restriction=restriction,
        kind=kind,
        category=category,
        search=search,
        new_kind=_clean(neu, 20),
        subscriptions=subscribed_categories(user_id) if user_id else set(),
        message=_clean(hinweis, 500),
    )


@router.post("/nachbarschaft")
async def neighbor_create(request: Request):
    user = _required(request, "/nachbarschaft")
    restriction = _check_neighbor_access(user.id)
    if restriction["blocked"]:
        return _redirect_message("Dein Zugang zur Nachbarschaftshilfe ist derzeit eingeschränkt.")
    form = await request.form()
    kind = _clean(form.get("kind"), 20)
    category = _clean(form.get("category"), 80)
    title = _clean(form.get("title"), 180)
    description = _clean(form.get("description"), 3000)
    location_label = _clean(form.get("location_label"), 80)
    urgent = str(form.get("urgent") or "") == "1"
    try:
        expiry_days = int(str(form.get("expiry_days") or "30"))
    except ValueError:
        expiry_days = 30
    if len(title) < 4 or len(description) < 10:
        return _redirect_message("Bitte Titel und Beschreibung vollständig ausfüllen.")
    post = create_post(user.id, kind, category, title, description, location_label=location_label, urgent=urgent, expiry_days=expiry_days)
    audit_event(user.email, "Nachbarschaftsbeitrag eingereicht", "neighbor_post", str(post.id), title)
    return _redirect_message("Beitrag wurde eingereicht und wird vor Veröffentlichung kurz geprüft.")


@router.get("/nachbarschaft/{post_id}/antworten")
async def neighbor_reply(request: Request, post_id: int, hinweis: str = ""):
    user = _required(request, f"/nachbarschaft/{post_id}/antworten")
    post = get_post(post_id)
    if not post or post["status"] != "Freigegeben":
        raise HTTPException(status_code=404, detail="Beitrag nicht gefunden")
    if post["user_id"] == user.id:
        return RedirectResponse(url=f"/nachbarschaft/{post_id}/bearbeiten", status_code=303)
    return reply_page(post, restricted=_check_neighbor_access(user.id)["blocked"] or users_blocked(user.id, post["user_id"]), message=_clean(hinweis, 500))


@router.post("/nachbarschaft/{post_id}/antworten")
async def neighbor_reply_submit(request: Request, post_id: int, background_tasks: BackgroundTasks):
    user = _required(request, f"/nachbarschaft/{post_id}/antworten")
    if _check_neighbor_access(user.id)["blocked"]:
        return _redirect_message("Dein Zugang zur Nachbarschaftshilfe ist derzeit eingeschränkt.")
    form = await request.form()
    body = _clean(form.get("body"), 3000)
    if not body:
        return _redirect_message("Bitte eine Nachricht schreiben.", f"/nachbarschaft/{post_id}/antworten")
    conv = get_or_create_conversation(post_id, user.id)
    if not conv:
        return _redirect_message("Privater Kontakt ist für diesen Beitrag gerade nicht möglich.", f"/nachbarschaft/{post_id}/antworten")
    item, recipient = send_chat_message(conv.id, user.id, body)
    if not item or not recipient:
        return _redirect_message("Nachricht konnte nicht gesendet werden.", f"/nachbarschaft/{post_id}/antworten")
    _notify(background_tasks, recipient, "Neue private Nachricht", f"{user.name.split()[0] if user.name else 'Jemand'} hat auf einen Nachbarschaftsbeitrag geantwortet.", f"/nachbarschaft/chat/{conv.id}", f"neighbor-chat-{conv.id}-{item.id}")
    audit_event(user.email, "Privaten Nachbarschafts-Chat gestartet", "neighbor_conversation", str(conv.id), f"Beitrag #{post_id}")
    return RedirectResponse(url=f"/nachbarschaft/chat/{conv.id}", status_code=303)


@router.get("/nachbarschaft/chat/{conversation_id}")
async def neighbor_chat(request: Request, conversation_id: int, hinweis: str = ""):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    data = conversation_data(conversation_id, user.id, mark_read=True)
    if not data:
        raise HTTPException(status_code=404, detail="Chat nicht gefunden")
    other_id = int(data.get("other_user_id") or 0)
    return chat_page(data, user.id, blocked_by_me=blocked_by_me(user.id, other_id) if other_id else False, blocked_either=users_blocked(user.id, other_id) if other_id else False, message=_clean(hinweis, 500))


@router.post("/nachbarschaft/chat/{conversation_id}/nachricht")
async def neighbor_chat_send(request: Request, conversation_id: int, background_tasks: BackgroundTasks):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    form = await request.form()
    body = _clean(form.get("body"), 3000)
    item, recipient = send_chat_message(conversation_id, user.id, body)
    if not item or not recipient:
        return _redirect_message("Nachricht konnte nicht gesendet werden.", f"/nachbarschaft/chat/{conversation_id}")
    _notify(background_tasks, recipient, "Neue private Nachricht", f"{user.name.split()[0] if user.name else 'Jemand'} hat dir in der Nachbarschaftshilfe geschrieben.", f"/nachbarschaft/chat/{conversation_id}", f"neighbor-chat-{conversation_id}-{item.id}")
    return RedirectResponse(url=f"/nachbarschaft/chat/{conversation_id}", status_code=303)


@router.post("/nachbarschaft/chat/{conversation_id}/melden")
async def neighbor_chat_report(request: Request, conversation_id: int):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    form = await request.form()
    try:
        message_id = int(str(form.get("message_id") or "0"))
    except ValueError:
        message_id = 0
    reason = _clean(form.get("reason"), 100)
    detail = _clean(form.get("detail"), 1500)
    report = report_message(conversation_id, message_id, user.id, reason, detail)
    if report:
        audit_event(user.email, "Private Nachricht gemeldet", "neighbor_report", str(report.id), f"Chat #{conversation_id}")
        return _redirect_message("Die Nachricht wurde vertraulich an die Verwaltung gemeldet. Der andere Nutzer wird darüber nicht informiert.", f"/nachbarschaft/chat/{conversation_id}")
    return _redirect_message("Die Nachricht konnte nicht gemeldet werden.", f"/nachbarschaft/chat/{conversation_id}")


@router.post("/nachbarschaft/chat/{conversation_id}/blockieren")
async def neighbor_chat_block(request: Request, conversation_id: int):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    data = conversation_data(conversation_id, user.id)
    if not data:
        raise HTTPException(status_code=404, detail="Chat nicht gefunden")
    other_id = int(data.get("other_user_id") or 0)
    if other_id:
        block_user(user.id, other_id)
        audit_event(user.email, "Nachbarschaftsnutzer blockiert", "pwa_user", str(other_id), f"Chat #{conversation_id}")
    return _redirect_message("Der Nutzer wurde blockiert. Neue private Nachrichten sind nicht mehr möglich.", f"/nachbarschaft/chat/{conversation_id}")


@router.post("/nachbarschaft/chat/{conversation_id}/entsperren")
async def neighbor_chat_unblock(request: Request, conversation_id: int):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    data = conversation_data(conversation_id, user.id)
    if not data:
        raise HTTPException(status_code=404, detail="Chat nicht gefunden")
    other_id = int(data.get("other_user_id") or 0)
    if other_id:
        unblock_user(user.id, other_id)
    return _redirect_message("Blockierung wurde aufgehoben.", f"/nachbarschaft/chat/{conversation_id}")


@router.post("/nachbarschaft/chat/{conversation_id}/schliessen")
async def neighbor_chat_close(request: Request, conversation_id: int):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    close_conversation(conversation_id, user.id)
    return RedirectResponse(url="/nachrichten", status_code=303)


@router.post("/nachbarschaft/{post_id}/merken")
async def neighbor_save(request: Request, post_id: int):
    user = _required(request, "/nachbarschaft")
    active = toggle_saved(post_id, user.id)
    return _redirect_message("Beitrag wurde gemerkt." if active else "Beitrag wurde aus der Merkliste entfernt.")


@router.post("/nachbarschaft/kategorie-abo")
async def neighbor_category_subscribe(request: Request):
    user = _required(request, "/nachbarschaft")
    form = await request.form()
    category = _clean(form.get("category"), 80)
    active = toggle_category_subscription(user.id, category)
    return _redirect_message(f"Push für {category} wurde {'aktiviert' if active else 'deaktiviert'}.", f"/nachbarschaft?category={quote(category)}")


@router.get("/nachbarschaft/{post_id}/bearbeiten")
async def neighbor_edit(request: Request, post_id: int, hinweis: str = ""):
    user = _required(request, f"/nachbarschaft/{post_id}/bearbeiten")
    post = get_post(post_id, include_hidden=True)
    if not post or post["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="Beitrag nicht gefunden")
    return post_edit_page(post, _clean(hinweis, 500))


@router.post("/nachbarschaft/{post_id}/bearbeiten")
async def neighbor_edit_submit(request: Request, post_id: int):
    user = _required(request, f"/nachbarschaft/{post_id}/bearbeiten")
    if _check_neighbor_access(user.id)["blocked"]:
        return _redirect_message("Dein Zugang zur Nachbarschaftshilfe ist derzeit eingeschränkt.")
    form = await request.form()
    title = _clean(form.get("title"), 180)
    description = _clean(form.get("description"), 3000)
    if len(title) < 4 or len(description) < 10:
        return _redirect_message("Bitte Titel und Beschreibung vollständig ausfüllen.", f"/nachbarschaft/{post_id}/bearbeiten")
    try:
        days = int(str(form.get("expiry_days") or "30"))
    except ValueError:
        days = 30
    ok = edit_post(post_id, user.id, kind=_clean(form.get("kind"), 20), category=_clean(form.get("category"), 80), title=title, description=description, location_label=_clean(form.get("location_label"), 80), urgent=str(form.get("urgent") or "") == "1", expiry_days=days)
    if ok:
        audit_event(user.email, "Nachbarschaftsbeitrag bearbeitet", "neighbor_post", str(post_id), "Erneute Prüfung")
    return _redirect_message("Änderungen wurden gespeichert und werden erneut geprüft." if ok else "Beitrag konnte nicht geändert werden.")


@router.post("/nachbarschaft/{post_id}/erledigt")
async def neighbor_done(request: Request, post_id: int):
    user = _required(request, "/nachbarschaft")
    if mark_post_done(post_id, user.id):
        audit_event(user.email, "Nachbarschaftsbeitrag erledigt", "neighbor_post", str(post_id))
    return _redirect_message("Beitrag wurde als erledigt markiert.")


@router.post("/nachbarschaft/{post_id}/loeschen")
async def neighbor_delete(request: Request, post_id: int):
    user = _required(request, "/nachbarschaft")
    if delete_post(post_id, user.id):
        audit_event(user.email, "Nachbarschaftsbeitrag gelöscht", "neighbor_post", str(post_id))
    return _redirect_message("Beitrag wurde entfernt.")


@router.post("/nachbarschaft/{post_id}/verlaengern")
async def neighbor_renew(request: Request, post_id: int):
    user = _required(request, "/nachbarschaft")
    renew_post(post_id, user.id, 30)
    return _redirect_message("Beitrag bleibt weitere 30 Tage aktiv.")


@router.get("/nachbarschaft/{post_id}/melden")
async def neighbor_post_report_page(request: Request, post_id: int, hinweis: str = ""):
    user = _required(request, f"/nachbarschaft/{post_id}/melden")
    post = get_post(post_id)
    if not post or post["user_id"] == user.id:
        raise HTTPException(status_code=404, detail="Beitrag nicht gefunden")
    return report_post_page(post, _clean(hinweis, 500))


@router.post("/nachbarschaft/{post_id}/melden")
async def neighbor_post_report_submit(request: Request, post_id: int):
    user = _required(request, f"/nachbarschaft/{post_id}/melden")
    form = await request.form()
    report = report_post(post_id, user.id, _clean(form.get("reason"), 100), _clean(form.get("detail"), 1500))
    if report:
        audit_event(user.email, "Nachbarschaftsbeitrag gemeldet", "neighbor_report", str(report.id), f"Beitrag #{post_id}")
        return _redirect_message("Der Beitrag wurde vertraulich gemeldet. Die Verwaltung prüft ihn.")
    return _redirect_message("Meldung konnte nicht gespeichert werden.")


@router.get("/nachrichten")
async def neighbor_message_center(request: Request):
    user = _user(request)
    if not user:
        return RedirectResponse(url="/anmelden?next=/nachrichten", status_code=303)
    total = count_unread_messages(user.id) + count_unread_chats(user.id)
    return messages_center_page(list_conversations(user.id), get_messages(user.id), total)


@router.get("/api/me/unread-count")
async def neighbor_unread_count(request: Request):
    user = _user(request)
    if not user:
        return {"count": 0, "loggedIn": False}
    return {"count": count_unread_messages(user.id) + count_unread_chats(user.id), "loggedIn": True}


@router.get("/intern/nachbarschaft")
async def neighbor_admin(request: Request, hinweis: str = ""):
    _admin(request)
    return admin_neighbor_page_v2(admin_overview(), _clean(hinweis, 500))


@router.post("/intern/nachbarschaft/{post_id}/status")
async def neighbor_admin_status(request: Request, post_id: int, background_tasks: BackgroundTasks):
    _admin(request)
    form = await request.form()
    status = _clean(form.get("status"), 40)
    item = set_post_status(post_id, status)
    if item:
        create_message(item["user_id"], f"Nachbarschaftsbeitrag: {item['title']}", f"Der Status wurde auf „{status}“ geändert.", category="nachbarschaft", url="/nachbarschaft")
        _notify(background_tasks, item["user_id"], "Nachbarschaftsbeitrag aktualisiert", f"{item['title']}: {status}", "/nachbarschaft", f"neighbor-post-{post_id}-{status}")
        if status == "Freigegeben":
            for subscriber in category_subscribers(item["category"], exclude_user_id=item["user_id"]):
                _notify(background_tasks, subscriber, f"Neue Hilfe: {item['category']}", item["title"], "/nachbarschaft", f"neighbor-category-{post_id}-{subscriber}")
        audit_event("Verwaltung", "Nachbarschaftsstatus geändert", "neighbor_post", str(post_id), status)
    return _redirect_message("Status wurde gespeichert.", "/intern/nachbarschaft")


@router.post("/intern/nachbarschaft/meldungen/{report_id}/aktion")
async def neighbor_admin_report_action(request: Request, report_id: int, background_tasks: BackgroundTasks):
    _admin(request)
    form = await request.form()
    action = _clean(form.get("action"), 80) or "close"
    resolution = _clean(form.get("resolution"), 1000)
    result = apply_report_action(report_id, action, resolution)
    if result:
        target = result.get("target_user_id")
        labels = {
            "close": "Meldung geschlossen",
            "warn": "Verwarnung ausgesprochen",
            "lock_chat": "Chat gesperrt",
            "hide_post": "Beitrag ausgeblendet",
            "suspend_7": "7 Tage gesperrt",
            "suspend_30": "30 Tage gesperrt",
            "permanent": "Dauerhaft gesperrt",
        }
        if target and action in {"warn", "suspend_7", "suspend_30", "permanent"}:
            text = labels.get(action, "Moderationsmaßnahme")
            create_message(target, "Hinweis zur Nachbarschaftshilfe", f"Die Verwaltung hat folgende Maßnahme gesetzt: {text}." + (f"\nHinweis: {resolution}" if resolution else ""), category="nachbarschaft", url="/nachbarschaft")
            _notify(background_tasks, target, "Hinweis zur Nachbarschaftshilfe", text, "/nachbarschaft", f"neighbor-moderation-{report_id}-{action}")
        audit_event("Verwaltung", labels.get(action, "Meldung bearbeitet"), "neighbor_report", str(report_id), resolution)
    return _redirect_message("Meldung wurde bearbeitet.", "/intern/nachbarschaft")


@router.post("/intern/nachbarschaft/sperren/{user_id}/aufheben")
async def neighbor_admin_clear_restriction(request: Request, user_id: int):
    _admin(request)
    clear_restriction(user_id)
    audit_event("Verwaltung", "Nachbarschaftssperre aufgehoben", "pwa_user", str(user_id))
    return _redirect_message("Einschränkung wurde aufgehoben.", "/intern/nachbarschaft")


def install_neighbor_v2() -> None:
    init_neighbor_v2_db()
