from __future__ import annotations

from datetime import datetime, timedelta
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import or_

import community_routes as community
from community_crud import create_message
from community_models import NeighborPost
from database import Base, SessionLocal, engine
from neighborhood_models import (
    NeighborCategorySubscription,
    NeighborChatMessage,
    NeighborConversation,
    NeighborFavorite,
    NeighborPostMeta,
    NeighborReport,
    NeighborRestriction,
)
from neighborhood_ui import (
    CATEGORIES,
    admin_page,
    chat_list_page,
    chat_page,
    edit_page,
    first_name,
    neighborhood_page,
    relative_time,
    report_page,
)
from pwa_crud import get_user_by_id
from pwa_models import PWAUser
from push_service import send_user_notification

router = APIRouter()
Base.metadata.create_all(bind=engine)


def _user(request):
    return community._user(request)


def _required(request, next_url="/nachbarschaft"):
    return community._required(request, next_url)


def _admin(request):
    return community._admin(request)


def _clean(value, limit):
    return str(value or "").strip()[:limit]


def _now():
    return datetime.utcnow()


def _restriction(db, user_id):
    return db.query(NeighborRestriction).filter(NeighborRestriction.user_id == user_id).first()


def _guard(db, user_id):
    item = _restriction(db, user_id)
    if item and item.blocked:
        raise HTTPException(status_code=403, detail="Dein Zugang zur Nachbarschaftshilfe wurde durch die Moderation gesperrt.")


def _conversation(db, conversation_id, user_id):
    item = db.query(NeighborConversation).filter(NeighborConversation.id == conversation_id).first()
    if not item or user_id not in {item.participant_a, item.participant_b}:
        return None
    return item


def _other_user_id(conversation, user_id):
    return conversation.participant_b if conversation.participant_a == user_id else conversation.participant_a


@router.get("/nachbarschaft")
async def public_neighbor(request: Request, hinweis: str = "", kategorie: str = "", eigene: int = 0):
    user = _user(request)
    user_id = getattr(user, "id", None)
    category = _clean(kategorie, 80)
    db = SessionLocal()
    try:
        query = db.query(NeighborPost, PWAUser).outerjoin(PWAUser, PWAUser.id == NeighborPost.user_id).filter(NeighborPost.aktiv.is_(True))
        if eigene and user_id:
            query = query.filter(NeighborPost.user_id == user_id)
        else:
            query = query.filter(NeighborPost.status == "Freigegeben")
        if category:
            query = query.filter(NeighborPost.category == category)
        rows = query.order_by(NeighborPost.erstellt_am.desc()).limit(120).all()
        favorites = {item.post_id for item in db.query(NeighborFavorite).filter(NeighborFavorite.user_id == user_id).all()} if user_id else set()
        subscriptions = {item.category for item in db.query(NeighborCategorySubscription).filter(NeighborCategorySubscription.user_id == user_id).all()} if user_id else set()
        post_ids = [post.id for post, _ in rows]
        urgent_ids = {item.post_id for item in db.query(NeighborPostMeta).filter(NeighborPostMeta.post_id.in_(post_ids or [-1]), NeighborPostMeta.urgent.is_(True)).all()}
    finally:
        db.close()
    return neighborhood_page(rows=rows, logged_user=user, favorites=favorites, subscriptions=subscriptions, urgent_ids=urgent_ids, category=category, own=bool(eigene), message=_clean(hinweis, 300))


@router.post("/nachbarschaft")
async def submit_neighbor(request: Request):
    user = _required(request)
    form = await request.form()
    title = _clean(form.get("title"), 180)
    description = _clean(form.get("description"), 3000)
    category = _clean(form.get("category"), 80)
    if len(title) < 4 or len(description) < 10:
        return RedirectResponse("/nachbarschaft?hinweis=" + quote("Bitte Titel und Beschreibung vollständig ausfüllen."), status_code=303)
    if category not in CATEGORIES:
        category = "Sonstiges"
    db = SessionLocal()
    try:
        _guard(db, user.id)
        post = NeighborPost(user_id=user.id, kind="Biete" if form.get("kind") == "Biete" else "Suche", category=category, title=title, description=description, status="Prüfung", aktiv=True)
        db.add(post)
        db.flush()
        db.add(NeighborPostMeta(post_id=post.id, urgent=form.get("urgent") == "ja", expires_at=_now() + timedelta(days=30)))
        db.commit()
    finally:
        db.close()
    return RedirectResponse("/nachbarschaft?hinweis=" + quote("Beitrag eingereicht und wird vor Veröffentlichung geprüft."), status_code=303)


@router.post("/nachbarschaft/abos")
async def save_subscriptions(request: Request):
    user = _required(request)
    form = await request.form()
    selected = {value for value in form.getlist("categories") if value in CATEGORIES}
    db = SessionLocal()
    try:
        db.query(NeighborCategorySubscription).filter(NeighborCategorySubscription.user_id == user.id).delete()
        for category in selected:
            db.add(NeighborCategorySubscription(user_id=user.id, category=category))
        db.commit()
    finally:
        db.close()
    return RedirectResponse("/nachbarschaft?hinweis=" + quote("Benachrichtigungen wurden gespeichert."), status_code=303)


@router.post("/nachbarschaft/{post_id}/merken")
async def toggle_favorite(request: Request, post_id: int):
    user = _required(request)
    db = SessionLocal()
    try:
        existing = db.query(NeighborFavorite).filter(NeighborFavorite.post_id == post_id, NeighborFavorite.user_id == user.id).first()
        if existing:
            db.delete(existing)
        else:
            db.add(NeighborFavorite(post_id=post_id, user_id=user.id))
        db.commit()
    finally:
        db.close()
    return RedirectResponse("/nachbarschaft", status_code=303)


@router.post("/nachbarschaft/{post_id}/antworten")
async def answer_post(request: Request, post_id: int, background_tasks: BackgroundTasks):
    user = _required(request)
    db = SessionLocal()
    try:
        _guard(db, user.id)
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.aktiv.is_(True), NeighborPost.status == "Freigegeben").first()
        if not post or post.user_id == user.id:
            return RedirectResponse("/nachbarschaft", status_code=303)
        a, b = sorted((user.id, post.user_id))
        conversation = db.query(NeighborConversation).filter_by(post_id=post_id, participant_a=a, participant_b=b).first()
        if not conversation:
            conversation = NeighborConversation(post_id=post_id, participant_a=a, participant_b=b)
            db.add(conversation)
            db.flush()
            db.add(NeighborChatMessage(conversation_id=conversation.id, sender_user_id=user.id, body=f"Hallo, ich möchte auf deine Anzeige „{post.title}“ antworten."))
            db.commit()
        conversation_id = conversation.id
        owner_id = post.user_id
    finally:
        db.close()
    background_tasks.add_task(send_user_notification, owner_id, "Neue private Antwort", "Jemand hat auf deine Nachbarschaftsanzeige geantwortet.", f"/nachbarschaft/chat/{conversation_id}", f"neighbor-start-{conversation_id}", None)
    return RedirectResponse(f"/nachbarschaft/chat/{conversation_id}", status_code=303)


@router.get("/nachbarschaft/chats")
async def chat_list(request: Request):
    user = _required(request, "/nachbarschaft/chats")
    db = SessionLocal()
    try:
        conversations = db.query(NeighborConversation).filter(or_(NeighborConversation.participant_a == user.id, NeighborConversation.participant_b == user.id)).order_by(NeighborConversation.aktualisiert_am.desc()).all()
        cards = []
        for item in conversations:
            post = db.query(NeighborPost).filter(NeighborPost.id == item.post_id).first()
            other = get_user_by_id(_other_user_id(item, user.id))
            cards.append(f'<a class="nh-card" style="text-decoration:none;color:inherit" href="/nachbarschaft/chat/{item.id}"><span class="eyebrow">{escape(first_name(other))}</span><h2>{escape(post.title if post else "Nachbarschaftshilfe")}</h2><p class="nh-copy">Privaten Chat öffnen →</p></a>')
    finally:
        db.close()
    return chat_list_page(cards)


@router.get("/nachbarschaft/chat/{conversation_id}")
async def chat_detail(request: Request, conversation_id: int):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    db = SessionLocal()
    try:
        _guard(db, user.id)
        conversation = _conversation(db, conversation_id, user.id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Chat nicht gefunden")
        post = db.query(NeighborPost).filter(NeighborPost.id == conversation.post_id).first()
        other = get_user_by_id(_other_user_id(conversation, user.id))
        messages = db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id == conversation_id, NeighborChatMessage.aktiv.is_(True)).order_by(NeighborChatMessage.erstellt_am.asc()).all()
        bubbles = []
        for message in messages:
            mine = message.sender_user_id == user.id
            if not mine and not message.gelesen_am:
                message.gelesen_am = _now()
            report = "" if mine else f'<a class="nh-report" href="/nachbarschaft/chat/{conversation_id}/melden/{message.id}">Nachricht melden</a>'
            bubbles.append(f'<div class="nh-bubble {"mine" if mine else ""}">{escape(message.body)}<small>{escape(relative_time(message.erstellt_am))}</small>{report}</div>')
        db.commit()
    finally:
        db.close()
    return chat_page(title=post.title if post else "Privater Chat", other_name=first_name(other), conversation_id=conversation_id, bubbles=bubbles)


@router.post("/nachbarschaft/chat/{conversation_id}")
async def send_chat_message(request: Request, conversation_id: int, background_tasks: BackgroundTasks):
    user = _required(request)
    form = await request.form()
    text = _clean(form.get("body"), 2000)
    db = SessionLocal()
    try:
        _guard(db, user.id)
        conversation = _conversation(db, conversation_id, user.id)
        if not conversation or conversation.status != "offen":
            raise HTTPException(status_code=403, detail="Chat ist geschlossen")
        other_id = _other_user_id(conversation, user.id)
        if text:
            db.add(NeighborChatMessage(conversation_id=conversation_id, sender_user_id=user.id, body=text))
            conversation.aktualisiert_am = _now()
            db.commit()
    finally:
        db.close()
    if text:
        background_tasks.add_task(send_user_notification, other_id, "Neue private Nachricht", f"{first_name(user)} hat dir geschrieben.", f"/nachbarschaft/chat/{conversation_id}", f"neighbor-msg-{conversation_id}-{int(_now().timestamp())}", None)
    return RedirectResponse(f"/nachbarschaft/chat/{conversation_id}", status_code=303)


@router.get("/nachbarschaft/{post_id}/melden")
async def report_post_form(request: Request, post_id: int):
    _required(request)
    return report_page("/nachbarschaft")


@router.post("/nachbarschaft/{post_id}/melden")
async def report_post(request: Request, post_id: int):
    user = _required(request)
    form = await request.form()
    db = SessionLocal()
    try:
        db.add(NeighborReport(reporter_user_id=user.id, target_type="post", target_id=post_id, reason=_clean(form.get("reason"), 80), detail=_clean(form.get("detail"), 1000)))
        db.commit()
    finally:
        db.close()
    return RedirectResponse("/nachbarschaft?hinweis=" + quote("Danke. Die Verwaltung prüft deine Meldung."), status_code=303)


@router.get("/nachbarschaft/chat/{conversation_id}/melden/{message_id}")
async def report_message_form(request: Request, conversation_id: int, message_id: int):
    _required(request)
    return report_page(f"/nachbarschaft/chat/{conversation_id}")


@router.post("/nachbarschaft/chat/{conversation_id}/melden/{message_id}")
async def report_message(request: Request, conversation_id: int, message_id: int):
    user = _required(request)
    form = await request.form()
    db = SessionLocal()
    try:
        conversation = _conversation(db, conversation_id, user.id)
        message = db.query(NeighborChatMessage).filter(NeighborChatMessage.id == message_id, NeighborChatMessage.conversation_id == conversation_id).first() if conversation else None
        if not message:
            raise HTTPException(status_code=404, detail="Nachricht nicht gefunden")
        db.add(NeighborReport(reporter_user_id=user.id, target_type="message", target_id=message_id, reason=_clean(form.get("reason"), 80), detail=_clean(form.get("detail"), 1000)))
        db.commit()
    finally:
        db.close()
    return RedirectResponse(f"/nachbarschaft/chat/{conversation_id}", status_code=303)


@router.post("/nachbarschaft/chat/{conversation_id}/blockieren")
async def close_chat(request: Request, conversation_id: int):
    user = _required(request)
    db = SessionLocal()
    try:
        conversation = _conversation(db, conversation_id, user.id)
        if conversation:
            conversation.status = "geschlossen"
            conversation.aktualisiert_am = _now()
            db.commit()
    finally:
        db.close()
    return RedirectResponse("/nachbarschaft/chats", status_code=303)


@router.post("/nachbarschaft/{post_id}/erledigt")
async def mark_done(request: Request, post_id: int):
    user = _required(request)
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.user_id == user.id).first()
        if post:
            post.status = "Erledigt"
            post.aktualisiert_am = _now()
            db.commit()
    finally:
        db.close()
    return RedirectResponse("/nachbarschaft?eigene=1", status_code=303)


@router.post("/nachbarschaft/{post_id}/loeschen")
async def delete_post(request: Request, post_id: int):
    user = _required(request)
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.user_id == user.id).first()
        if post:
            post.aktiv = False
            post.aktualisiert_am = _now()
            db.commit()
    finally:
        db.close()
    return RedirectResponse("/nachbarschaft?eigene=1", status_code=303)


@router.get("/nachbarschaft/{post_id}/bearbeiten")
async def edit_post_form(request: Request, post_id: int):
    user = _required(request)
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.user_id == user.id).first()
    finally:
        db.close()
    if not post:
        raise HTTPException(status_code=404, detail="Beitrag nicht gefunden")
    return edit_page(post)


@router.post("/nachbarschaft/{post_id}/bearbeiten")
async def edit_post(request: Request, post_id: int):
    user = _required(request)
    form = await request.form()
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.user_id == user.id).first()
        if post:
            post.title = _clean(form.get("title"), 180)
            post.description = _clean(form.get("description"), 3000)
            post.status = "Prüfung"
            post.aktualisiert_am = _now()
            db.commit()
    finally:
        db.close()
    return RedirectResponse("/nachbarschaft?eigene=1&hinweis=" + quote("Änderung erneut zur Prüfung eingereicht."), status_code=303)


def _target(db, report):
    if report.target_type == "post":
        post = db.query(NeighborPost).filter(NeighborPost.id == report.target_id).first()
        return (post.user_id if post else None), (f"{post.title} — {post.description}" if post else "Beitrag nicht mehr vorhanden")
    message = db.query(NeighborChatMessage).filter(NeighborChatMessage.id == report.target_id).first()
    return (message.sender_user_id if message else None), (message.body if message else "Nachricht nicht mehr vorhanden")


@router.get("/intern/nachbarschaft")
async def admin_neighbor(request: Request):
    _admin(request)
    db = SessionLocal()
    try:
        reports = db.query(NeighborReport).filter(NeighborReport.status == "offen").order_by(NeighborReport.erstellt_am.desc()).all()
        report_cards = []
        for report in reports:
            offender, text = _target(db, report)
            report_cards.append(f'<article class="nh-card"><span class="eyebrow">{escape(report.target_type)} gemeldet</span><h3>{escape(report.reason)}</h3><div class="nh-report-content">{escape(text)}</div><form class="nh-actions" method="post" action="/intern/nachbarschaft/meldung/{report.id}/aktion"><button class="nh-btn" name="action" value="dismiss">Unbegründet schließen</button><button class="nh-btn" name="action" value="hide">Inhalt ausblenden</button><button class="nh-btn" name="action" value="warn">Nutzer verwarnen</button><button class="nh-btn" name="action" value="block">Nutzer sperren</button></form></article>')
        posts = db.query(NeighborPost, PWAUser).outerjoin(PWAUser, PWAUser.id == NeighborPost.user_id).order_by(NeighborPost.erstellt_am.desc()).limit(150).all()
        post_cards = []
        for post, author in posts:
            post_cards.append(f'<article class="nh-card"><span class="eyebrow">{escape(post.status)}</span><h3>{escape(post.title)}</h3><p>{escape(first_name(author))} · {escape(post.category)}</p><p class="nh-copy">{escape(post.description[:500])}</p><form class="nh-actions" method="post" action="/intern/nachbarschaft/{post.id}/status"><button class="nh-btn" name="status" value="Freigegeben">Freigeben</button><button class="nh-btn" name="status" value="Erledigt">Erledigt</button><button class="nh-btn" name="status" value="Abgelehnt">Ablehnen</button></form></article>')
    finally:
        db.close()
    return admin_page(report_cards, post_cards)


@router.post("/intern/nachbarschaft/{post_id}/status")
async def admin_neighbor_status(request: Request, post_id: int, background_tasks: BackgroundTasks):
    _admin(request)
    form = await request.form()
    status = _clean(form.get("status"), 40)
    if status not in {"Prüfung", "Freigegeben", "Erledigt", "Abgelehnt"}:
        return RedirectResponse("/intern/nachbarschaft", status_code=303)
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id).first()
        if not post:
            return RedirectResponse("/intern/nachbarschaft", status_code=303)
        newly_approved = post.status != "Freigegeben" and status == "Freigegeben"
        post.status = status
        post.aktualisiert_am = _now()
        subscribers = [item.user_id for item in db.query(NeighborCategorySubscription).filter(NeighborCategorySubscription.category == post.category).all() if item.user_id != post.user_id] if newly_approved else []
        db.commit()
    finally:
        db.close()
    for user_id in subscribers:
        background_tasks.add_task(send_user_notification, user_id, f"Neue Nachbarschaftshilfe: {post.category}", post.title, "/nachbarschaft", f"neighbor-post-{post.id}-{user_id}", None)
    return RedirectResponse("/intern/nachbarschaft", status_code=303)


@router.post("/intern/nachbarschaft/meldung/{report_id}/aktion")
async def admin_report_action(request: Request, report_id: int, background_tasks: BackgroundTasks):
    _admin(request)
    form = await request.form()
    action = _clean(form.get("action"), 30)
    db = SessionLocal()
    try:
        report = db.query(NeighborReport).filter(NeighborReport.id == report_id).first()
        if not report:
            return RedirectResponse("/intern/nachbarschaft", status_code=303)
        offender, text = _target(db, report)
        if action == "hide":
            obj = db.query(NeighborChatMessage).filter(NeighborChatMessage.id == report.target_id).first() if report.target_type == "message" else db.query(NeighborPost).filter(NeighborPost.id == report.target_id).first()
            if obj:
                obj.aktiv = False
        elif action == "warn" and offender:
            restriction = _restriction(db, offender)
            if not restriction:
                restriction = NeighborRestriction(user_id=offender)
                db.add(restriction)
            restriction.warning_count = (restriction.warning_count or 0) + 1
            restriction.aktualisiert_am = _now()
            create_message(offender, "Hinweis der Moderation", "Ein Inhalt in der Nachbarschaftshilfe wurde gemeldet. Bitte beachte die Regeln für einen respektvollen Umgang.", category="nachbarschaft", url="/nachbarschaft")
            background_tasks.add_task(send_user_notification, offender, "Hinweis zur Nachbarschaftshilfe", "Die Moderation hat dir einen Hinweis gesendet.", "/nachrichten", f"neighbor-warning-{report_id}", None)
        elif action == "block" and offender:
            restriction = _restriction(db, offender)
            if not restriction:
                restriction = NeighborRestriction(user_id=offender)
                db.add(restriction)
            restriction.blocked = True
            restriction.reason = "Moderationsentscheidung"
            restriction.aktualisiert_am = _now()
        report.status = "erledigt"
        report.erledigt_am = _now()
        db.commit()
    finally:
        db.close()
    return RedirectResponse("/intern/nachbarschaft", status_code=303)
