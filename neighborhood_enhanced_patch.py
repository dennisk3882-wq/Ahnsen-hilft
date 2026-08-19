from __future__ import annotations

import json
from datetime import datetime, timedelta
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

import community_routes as community
import neighborhood_routes as legacy
from community_crud import audit_event, count_unread_messages, create_message, get_messages
from community_models import NeighborPost
from database import Base, SessionLocal, engine
from intern_ui import intern_nav, intern_nav_css
from neighborhood_enhancement_models import (
    NeighborPostPublicDetail,
    NeighborReportSnapshot,
    NeighborRestrictionSchedule,
    NeighborUserBlock,
)
from neighborhood_models import (
    NeighborCategorySubscription,
    NeighborChatMessage,
    NeighborConversation,
    NeighborFavorite,
    NeighborPostMeta,
    NeighborReport,
    NeighborRestriction,
)
from neighborhood_ui import CATEGORIES, first_name, relative_time
from pwa_models import PWAUser
from pwa_ui import page
from push_service import send_user_notification


router = APIRouter()
Base.metadata.create_all(bind=engine)

LOCATIONS = ("Ahnsen", "Nähe Ortsmitte", "Nähe DGH", "Nähe Schule", "Sonstiger Bereich in Ahnsen")
REPORT_REASONS = (
    "Beleidigung / unangemessener Inhalt",
    "Betrug / verdächtiges Verhalten",
    "Belästigung",
    "Datenschutz / persönliche Daten",
    "Spam",
    "Sonstiges",
)

CSS = r'''
<style>
.nhv2{display:grid;gap:16px;min-width:0}.nhv2-head{padding:8px 0 2px}.nhv2-head .back{display:inline-flex;margin-bottom:20px;color:var(--forest);font-weight:850;text-decoration:none}.nhv2-eyebrow{display:block;color:#91a979;font-size:12px;font-weight:950;letter-spacing:.13em;text-transform:uppercase}.nhv2-head h1{margin:8px 0 9px;color:#10281e;font-size:clamp(34px,7vw,54px);line-height:1.02}.nhv2-head p{margin:0;color:var(--muted);font-size:16px;line-height:1.55}.nhv2-hero,.nhv2-card,.nhv2-create{padding:19px;border:1px solid #dbe5d8;border-radius:24px;background:#fff;box-shadow:0 12px 30px rgba(33,73,50,.06)}.nhv2-hero{background:linear-gradient(145deg,#fff,#edf6e9)}.nhv2-hero h2,.nhv2-card h2,.nhv2-card h3{margin:5px 0 8px;color:var(--forest)}.nhv2-copy{margin:0;color:var(--muted);line-height:1.55;overflow-wrap:anywhere}.nhv2-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}.nhv2-actions form{margin:0}.nhv2-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:8px 12px;border:1px solid #c7d6c5;border-radius:13px;background:#fff;color:var(--forest);font:inherit;font-size:12px;font-weight:900;text-decoration:none;cursor:pointer}.nhv2-btn.primary{border-color:var(--forest);background:var(--forest);color:#fff}.nhv2-btn.danger{border-color:#dfb8a9;color:#8b4b35}.nhv2-toolbar{display:flex;gap:7px;overflow-x:auto;padding:2px 0 7px;scrollbar-width:none}.nhv2-toolbar::-webkit-scrollbar{display:none}.nhv2-chip,.nhv2-tag{flex:0 0 auto;white-space:nowrap;padding:7px 10px;border-radius:999px;background:#eef5eb;color:var(--forest);font-size:10px;font-weight:850;text-decoration:none}.nhv2-chip{border:1px solid var(--line);background:#fff}.nhv2-chip.active{background:var(--forest);color:#fff}.nhv2-tag.seek{background:#fff0d5;color:#86580d}.nhv2-tag.offer{background:#e5f4e8;color:#25643e}.nhv2-tag.urgent{background:#fde8d4;color:#984d12}.nhv2-meta{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 11px}.nhv2-grid{display:grid;gap:11px}.nhv2-form{display:grid;gap:11px}.nhv2-two{display:grid;grid-template-columns:1fr 1fr;gap:9px}.nhv2-field{display:grid;gap:5px}.nhv2-field span{color:#315141;font-size:12px;font-weight:900}.nhv2-field input,.nhv2-field select,.nhv2-field textarea,.nhv2-search input{width:100%;box-sizing:border-box;border:1px solid #cad7ca;border-radius:14px;background:#fff;color:#183529;font:inherit;font-size:14px}.nhv2-field input,.nhv2-field select{min-height:48px;padding:0 13px}.nhv2-field textarea{min-height:110px;padding:11px 13px;resize:vertical}.nhv2-search{display:grid;grid-template-columns:1fr auto;gap:8px}.nhv2-search input{min-height:46px;padding:0 13px}.nhv2-note{padding:12px 13px;border-radius:15px;background:#eef5eb;color:#53645a;font-size:11px;line-height:1.5}.nhv2-warning{padding:13px;border:1px solid #e1baa9;border-radius:16px;background:#fff1e9;color:#744531}.nhv2-empty{padding:27px 16px;border:1px dashed #cad7c7;border-radius:19px;background:#fbfcf9;text-align:center;color:var(--muted)}.nhv2-create summary{cursor:pointer;list-style:none;color:var(--forest);font-size:20px;font-weight:950}.nhv2-create summary::-webkit-details-marker{display:none}.nhv2-create summary:after{content:'+';float:right}.nhv2-create[open] summary:after{content:'–'}.nhv2-create .nhv2-form{margin-top:15px}.nhv2-check{display:flex;gap:8px;align-items:flex-start;padding:11px;border-radius:14px;background:#f5f8f2;color:#46594d;font-size:12px}.nhv2-feed{display:grid;gap:11px}.nhv2-card.urgent{border-color:#dfbd87;background:linear-gradient(145deg,#fff,#fff9ef)}.nhv2-card-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.nhv2-date{color:#839087;font-size:10px}.nhv2-own{display:grid;gap:8px}.nhv2-own-row{padding:13px;border:1px solid #dde5da;border-radius:16px;background:#fff}.nhv2-chat{display:grid;gap:9px}.nhv2-bubble{max-width:84%;padding:11px 13px;border-radius:16px;background:#f1f4ef;color:#405149}.nhv2-bubble.mine{justify-self:end;background:#dfeedd;color:#234a36}.nhv2-bubble small{display:block;margin-top:5px;color:#7a867e;font-size:9px}.nhv2-report details{margin-top:6px}.nhv2-report summary{cursor:pointer;color:#876956;font-size:10px}.nhv2-report form{display:grid;gap:6px;margin-top:6px;padding:8px;border-radius:11px;background:#fff}.nhv2-report select,.nhv2-report textarea{width:100%;box-sizing:border-box;border:1px solid #d6ddd3;border-radius:9px;padding:7px;font:inherit;font-size:10px}.nhv2-compose{position:sticky;bottom:112px;display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px;border:1px solid #d5dfd3;border-radius:17px;background:rgba(255,255,252,.96);backdrop-filter:blur(12px)}.nhv2-compose input{min-width:0;padding:11px;border:0;background:transparent;font:inherit}.nhv2-thread{display:grid;grid-template-columns:1fr auto;gap:9px;padding:14px;border:1px solid #dce5d9;border-radius:17px;background:#fff;color:inherit;text-decoration:none}.nhv2-thread.unread{border-color:#91b68f;background:#f6fbf4}.nhv2-thread strong{color:var(--forest)}.nhv2-thread p{margin:4px 0 0;color:var(--muted);font-size:11px}.nhv2-unread{display:grid;place-items:center;min-width:26px;height:26px;border-radius:999px;background:var(--forest);color:#fff;font-size:10px;font-weight:900}.nhv2-mail{padding:14px;border:1px solid #dde5da;border-radius:17px;background:#fff}.nhv2-mail.unread{border-color:#91b68f;background:#f7fbf5}.nhv2-mail p{white-space:pre-line}.nhv2-admin-card{padding:15px;border:1px solid #e0c2b4;border-radius:18px;background:#fffaf6}.nhv2-snapshot{margin-top:8px;padding:10px;border-radius:11px;background:#f4f5f1;white-space:pre-wrap;font-size:11px}.nhv2-context{display:grid;gap:4px;margin-top:7px}.nhv2-context div{padding:6px 8px;border-radius:9px;background:#f5f6f2;font-size:10px}.nhv2-admin-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.nhv2-admin-actions select,.nhv2-admin-actions input{padding:8px;border:1px solid #ccd6cb;border-radius:9px;background:#fff}.nhv2-bottom{height:130px}
@media(max-width:620px){.nhv2-two{grid-template-columns:1fr}.nhv2-card,.nhv2-hero,.nhv2-create{padding:16px}.nhv2-compose{bottom:118px}}
</style>
'''


def _clean(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _now() -> datetime:
    return datetime.utcnow()


def _user(request: Request):
    return community._user(request)


def _required(request: Request, next_url: str = "/nachbarschaft"):
    return community._required(request, next_url)


def _admin(request: Request):
    return community._admin(request)


def _detail(db, post_id: int, create: bool = False) -> NeighborPostPublicDetail | None:
    row = db.query(NeighborPostPublicDetail).filter(NeighborPostPublicDetail.post_id == post_id).first()
    if not row and create:
        row = NeighborPostPublicDetail(post_id=post_id, location_label="Ahnsen")
        db.add(row)
        db.flush()
    return row


def _meta(db, post_id: int, create: bool = False) -> NeighborPostMeta | None:
    row = db.query(NeighborPostMeta).filter(NeighborPostMeta.post_id == post_id).first()
    if not row and create:
        row = NeighborPostMeta(post_id=post_id, urgent=False, expires_at=_now() + timedelta(days=30))
        db.add(row)
        db.flush()
    return row


def _schedule(db, user_id: int) -> NeighborRestrictionSchedule | None:
    return db.query(NeighborRestrictionSchedule).filter(NeighborRestrictionSchedule.user_id == user_id).first()


def _restriction_state(db, user_id: int) -> dict:
    base = db.query(NeighborRestriction).filter(NeighborRestriction.user_id == user_id).first()
    schedule = _schedule(db, user_id)
    permanent = bool((base and base.blocked) or (schedule and schedule.permanent))
    until = schedule.suspended_until if schedule else None
    blocked = permanent or bool(until and until > _now())
    return {"blocked": blocked, "permanent": permanent, "until": until, "reason": (schedule.reason if schedule and schedule.reason else (base.reason if base else "")), "warnings": int(base.warning_count or 0) if base else 0}


def _guard(db, user_id: int):
    state = _restriction_state(db, user_id)
    if state["blocked"]:
        detail = "dauerhaft" if state["permanent"] else (f'bis {state["until"].strftime("%d.%m.%Y %H:%M")}' if state["until"] else "vorübergehend")
        raise HTTPException(status_code=403, detail=f"Dein Zugang zur Nachbarschaftshilfe ist {detail} eingeschränkt.")


# Existing neighborhood routes call this global helper. Patch it so temporary
# moderation restrictions also apply to legacy-compatible chat endpoints.
legacy._guard = _guard


def _blocked(db, a: int, b: int) -> bool:
    return bool(db.query(NeighborUserBlock).filter(or_(
        (NeighborUserBlock.blocker_user_id == a) & (NeighborUserBlock.blocked_user_id == b),
        (NeighborUserBlock.blocker_user_id == b) & (NeighborUserBlock.blocked_user_id == a),
    )).first())


def _blocked_by_me(db, me: int, other: int) -> bool:
    return bool(db.query(NeighborUserBlock).filter(NeighborUserBlock.blocker_user_id == me, NeighborUserBlock.blocked_user_id == other).first())


def _conversation(db, conversation_id: int, user_id: int):
    row = db.query(NeighborConversation).filter(NeighborConversation.id == conversation_id).first()
    return row if row and user_id in {row.participant_a, row.participant_b} else None


def _other(conv: NeighborConversation, user_id: int) -> int:
    return conv.participant_b if conv.participant_a == user_id else conv.participant_a


def _unread_chats(db, user_id: int) -> int:
    conv_ids = [r[0] for r in db.query(NeighborConversation.id).filter(or_(NeighborConversation.participant_a == user_id, NeighborConversation.participant_b == user_id)).all()]
    if not conv_ids:
        return 0
    return db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id.in_(conv_ids), NeighborChatMessage.sender_user_id != user_id, NeighborChatMessage.aktiv.is_(True), NeighborChatMessage.gelesen_am.is_(None)).count()


def _fmt(value: datetime | None) -> str:
    return value.strftime("%d.%m.%Y · %H:%M") if value else ""


def _post_card(post, author, meta, detail, user_id: int | None, favorites: set[int]) -> str:
    owner = user_id == post.user_id
    location = detail.location_label if detail else "Ahnsen"
    urgent = bool(meta and meta.urgent)
    tags = [f'<span class="nhv2-tag {"offer" if post.kind == "Biete" else "seek"}">{escape(post.kind)}</span>', f'<span class="nhv2-tag">{escape(post.category)}</span>', f'<span class="nhv2-tag">📍 {escape(location)}</span>', f'<span class="nhv2-tag">von {escape(first_name(author))}</span>']
    if urgent:
        tags.append('<span class="nhv2-tag urgent">Dringend</span>')
    if owner:
        actions = f'''<a class="nhv2-btn" href="/nachbarschaft/{post.id}/bearbeiten">Bearbeiten</a><form method="post" action="/nachbarschaft/{post.id}/erledigt"><button class="nhv2-btn" type="submit">✓ Erledigt</button></form><form method="post" action="/nachbarschaft/{post.id}/verlaengern"><button class="nhv2-btn" type="submit">30 Tage verlängern</button></form><form method="post" action="/nachbarschaft/{post.id}/loeschen"><button class="nhv2-btn danger" type="submit">Löschen</button></form>'''
    elif user_id:
        answer = "Ich kann helfen" if post.kind == "Suche" else "Privat anfragen"
        actions = f'''<form method="post" action="/nachbarschaft/{post.id}/antworten"><button class="nhv2-btn primary" type="submit">💬 {answer}</button></form><form method="post" action="/nachbarschaft/{post.id}/merken"><button class="nhv2-btn" type="submit">{"★ Gemerkt" if post.id in favorites else "☆ Merken"}</button></form><a class="nhv2-btn" href="/nachbarschaft/{post.id}/melden">Melden</a>'''
    else:
        actions = '<a class="nhv2-btn primary" href="/anmelden?next=/nachbarschaft">Anmelden zum Antworten</a>'
    return f'''<article class="nhv2-card{" urgent" if urgent else ""}"><div class="nhv2-card-top"><div><span class="nhv2-eyebrow">{escape(post.category)}</span><h3>{escape(post.title)}</h3></div><span class="nhv2-date">{escape(relative_time(post.erstellt_am))}</span></div><div class="nhv2-meta">{"".join(tags)}</div><p class="nhv2-copy">{escape(post.description)}</p><div class="nhv2-actions">{actions}</div></article>'''


def _home_html(rows, user, favorites, subscriptions, *, kind="", category="", search="", own=False, notice="") -> HTMLResponse:
    uid = getattr(user, "id", None)
    cards = "".join(_post_card(*row, uid, favorites) for row in rows) or '<div class="nhv2-empty"><strong>Keine passenden offenen Beiträge.</strong><br>Ändere den Filter oder schau später noch einmal vorbei.</div>'
    def target(**changes):
        values = {"art": kind, "kategorie": category, "q": search, "eigene": "1" if own else ""}
        values.update(changes)
        parts = [f"{k}={quote(str(v))}" for k, v in values.items() if v]
        return "/nachbarschaft" + ("?" + "&".join(parts) if parts else "")
    kinds = [f'<a class="nhv2-chip{" active" if not kind and not own else ""}" href="{target(art="",eigene="")}">Alle</a>', f'<a class="nhv2-chip{" active" if kind == "Suche" else ""}" href="{target(art="Suche",eigene="")}">Hilfe gesucht</a>', f'<a class="nhv2-chip{" active" if kind == "Biete" else ""}" href="{target(art="Biete",eigene="")}">Hilfe angeboten</a>']
    categories = [f'<a class="nhv2-chip{" active" if category == c else ""}" href="{target(kategorie=c if category != c else "")}">{escape(c)}</a>' for c in CATEGORIES]
    restriction = {"blocked": False}
    if uid:
        db = SessionLocal()
        try:
            restriction = _restriction_state(db, uid)
        finally:
            db.close()
    create = ""
    if user and not restriction["blocked"]:
        cat_options = "".join(f'<option>{escape(c)}</option>' for c in CATEGORIES)
        loc_options = "".join(f'<option>{escape(x)}</option>' for x in LOCATIONS)
        checks = "".join(f'<label class="nhv2-check"><input type="checkbox" name="categories" value="{escape(c)}" {"checked" if c in subscriptions else ""}><span>{escape(c)}</span></label>' for c in CATEGORIES)
        create = f'''<details class="nhv2-create" id="beitrag"><summary>Eigenen Beitrag erstellen</summary><form class="nhv2-form" method="post" action="/nachbarschaft"><div class="nhv2-two"><label class="nhv2-field"><span>Ich …</span><select name="kind"><option>Suche</option><option>Biete</option></select></label><label class="nhv2-field"><span>Kategorie</span><select name="category">{cat_options}</select></label></div><label class="nhv2-field"><span>Titel *</span><input name="title" maxlength="180" required placeholder="z. B. Fahrdienst zum Arzt gesucht"></label><label class="nhv2-field"><span>Beschreibung *</span><textarea name="description" minlength="10" maxlength="3000" required placeholder="Beschreibe kurz, wobei du Hilfe brauchst oder was du anbieten kannst. Keine Telefonnummer oder genaue Adresse nötig."></textarea></label><div class="nhv2-two"><label class="nhv2-field"><span>Öffentlicher Bereich</span><select name="location_label">{loc_options}</select></label><label class="nhv2-field"><span>Automatisch ausblenden</span><select name="expiry_days"><option value="14">nach 14 Tagen</option><option value="30" selected>nach 30 Tagen</option></select></label></div><label class="nhv2-check"><input type="checkbox" name="urgent" value="ja"><span><strong>Dringend</strong><br>Nur markieren, wenn zeitnahe Hilfe wirklich wichtig ist.</span></label><div class="nhv2-note">Öffentlich erscheinen nur dein Vorname, der grobe Bereich und der Beitrag. E-Mail, Telefonnummer und genaue Adresse bleiben verborgen. Alles Weitere besprecht ihr privat.</div><button class="nhv2-btn primary" type="submit">Zur Prüfung einreichen</button></form></details><details class="nhv2-create"><summary>Push für neue Hilfe</summary><p class="nhv2-copy">Wähle Kategorien, über die du nach Freigabe eines neuen Beitrags informiert werden möchtest.</p><form class="nhv2-form" method="post" action="/nachbarschaft/abos">{checks}<button class="nhv2-btn" type="submit">Abos speichern</button></form></details>'''
    elif user:
        detail = "dauerhaft" if restriction["permanent"] else (f'bis {restriction["until"].strftime("%d.%m.%Y %H:%M")}' if restriction["until"] else "vorübergehend")
        create = f'<div class="nhv2-warning"><strong>Nachbarschaftshilfe eingeschränkt</strong><br>Neue Beiträge und Nachrichten sind {escape(detail)} gesperrt. {escape(restriction["reason"] or "")}</div>'
    else:
        create = '<div class="nhv2-create"><strong>Mitmachen</strong><p class="nhv2-copy">Für Beiträge und private Chats brauchst du ein Bürgerkonto.</p><a class="nhv2-btn primary" href="/anmelden?next=/nachbarschaft">Anmelden</a></div>'
    notice_html = f'<div class="nhv2-note">✓ {escape(notice)}</div>' if notice else ""
    own_link = f'<a class="nhv2-btn{" primary" if own else ""}" href="/nachbarschaft?eigene=1">📌 Meine Beiträge</a>' if user else ""
    body = f'''{CSS}<section class="nhv2"><div class="nhv2-head"><a class="back" href="/">← Zurück</a><span class="nhv2-eyebrow">Gemeinschaft</span><h1>Nachbarschaftshilfe</h1><p>Hilfe im Dorf finden oder selbst anbieten – öffentlich nur das Nötigste, alles Weitere privat.</p></div><section class="nhv2-hero"><span class="nhv2-eyebrow">Gemeinsam geht vieles leichter</span><h2>Was brauchst du – oder wobei kannst du helfen?</h2><p class="nhv2-copy">Aktuelle Gesuche und Angebote stehen direkt hier. Es gibt bewusst keine öffentliche Kommentarspalte: Wenn es passt, wechselt ihr in einen geschützten 1:1-Chat.</p><div class="nhv2-actions">{own_link}</div><div class="nhv2-note" style="margin-top:12px">🔒 Telefonnummer, E-Mail und genaue Adresse werden nicht öffentlich angezeigt.</div></section>{notice_html}<section class="nhv2-grid"><div><span class="nhv2-eyebrow">Aktuell in Ahnsen</span><h2 style="margin:5px 0;color:var(--forest)">{"Meine Beiträge" if own else "Offene Beiträge"}</h2></div><div class="nhv2-toolbar">{"".join(kinds)}</div><div class="nhv2-toolbar">{"".join(categories)}</div><form class="nhv2-search" method="get"><input name="q" value="{escape(search)}" placeholder="Beiträge durchsuchen …"><button class="nhv2-btn primary" type="submit">Suchen</button></form><div class="nhv2-feed">{cards}</div></section>{create}<div class="nhv2-bottom"></div></section>'''
    return page("Nachbarschaftshilfe", body, active="more", body_class="community-view")


@router.get("/nachbarschaft")
async def enhanced_home(request: Request, hinweis: str = "", art: str = "", kategorie: str = "", q: str = "", eigene: int = 0):
    user = _user(request)
    uid = getattr(user, "id", None)
    kind = _clean(art, 20)
    category = _clean(kategorie, 80)
    search = _clean(q, 120)
    db = SessionLocal()
    try:
        query = db.query(NeighborPost, PWAUser, NeighborPostMeta, NeighborPostPublicDetail).outerjoin(PWAUser, PWAUser.id == NeighborPost.user_id).outerjoin(NeighborPostMeta, NeighborPostMeta.post_id == NeighborPost.id).outerjoin(NeighborPostPublicDetail, NeighborPostPublicDetail.post_id == NeighborPost.id).filter(NeighborPost.aktiv.is_(True))
        if eigene and uid:
            query = query.filter(NeighborPost.user_id == uid)
        else:
            query = query.filter(NeighborPost.status == "Freigegeben")
            query = query.filter(or_(NeighborPostMeta.id.is_(None), NeighborPostMeta.expires_at.is_(None), NeighborPostMeta.expires_at >= _now()))
            query = query.filter(or_(NeighborPostPublicDetail.id.is_(None), NeighborPostPublicDetail.hidden.is_(False)))
        if kind in {"Suche", "Biete"}:
            query = query.filter(NeighborPost.kind == kind)
        if category in CATEGORIES:
            query = query.filter(NeighborPost.category == category)
        if search:
            like = f"%{search}%"
            query = query.filter(or_(NeighborPost.title.ilike(like), NeighborPost.description.ilike(like), NeighborPost.category.ilike(like)))
        rows = query.order_by(NeighborPostMeta.urgent.desc(), NeighborPost.erstellt_am.desc()).limit(120).all()
        if uid:
            blocked_ids = {r.blocked_user_id for r in db.query(NeighborUserBlock).filter(NeighborUserBlock.blocker_user_id == uid).all()}
            blocked_ids |= {r.blocker_user_id for r in db.query(NeighborUserBlock).filter(NeighborUserBlock.blocked_user_id == uid).all()}
            rows = [row for row in rows if row[0].user_id not in blocked_ids or row[0].user_id == uid]
        favorites = {x.post_id for x in db.query(NeighborFavorite).filter(NeighborFavorite.user_id == uid).all()} if uid else set()
        subscriptions = {x.category for x in db.query(NeighborCategorySubscription).filter(NeighborCategorySubscription.user_id == uid).all()} if uid else set()
    finally:
        db.close()
    return _home_html(rows, user, favorites, subscriptions, kind=kind, category=category, search=search, own=bool(eigene), notice=_clean(hinweis, 400))


@router.post("/nachbarschaft")
async def enhanced_submit(request: Request):
    user = _required(request)
    form = await request.form()
    title = _clean(form.get("title"), 180)
    description = _clean(form.get("description"), 3000)
    category = _clean(form.get("category"), 80)
    kind = "Biete" if form.get("kind") == "Biete" else "Suche"
    location = _clean(form.get("location_label"), 80)
    try:
        days = int(str(form.get("expiry_days") or "30"))
    except ValueError:
        days = 30
    days = 14 if days == 14 else 30
    if len(title) < 4 or len(description) < 10:
        return RedirectResponse("/nachbarschaft?hinweis=" + quote("Bitte Titel und Beschreibung vollständig ausfüllen."), status_code=303)
    if category not in CATEGORIES:
        category = "Sonstiges"
    if location not in LOCATIONS:
        location = "Ahnsen"
    db = SessionLocal()
    try:
        _guard(db, user.id)
        post = NeighborPost(user_id=user.id, kind=kind, category=category, title=title, description=description, status="Prüfung", aktiv=True)
        db.add(post); db.flush()
        db.add(NeighborPostMeta(post_id=post.id, urgent=form.get("urgent") == "ja", expires_at=_now() + timedelta(days=days)))
        db.add(NeighborPostPublicDetail(post_id=post.id, location_label=location))
        db.commit(); post_id = post.id
    finally:
        db.close()
    audit_event(user.email, "Nachbarschaftsbeitrag eingereicht", "neighbor_post", str(post_id), title)
    return RedirectResponse("/nachbarschaft?hinweis=" + quote("Beitrag eingereicht und wird vor Veröffentlichung kurz geprüft."), status_code=303)


@router.post("/nachbarschaft/{post_id}/antworten")
async def enhanced_answer(request: Request, post_id: int, background_tasks: BackgroundTasks):
    user = _required(request)
    db = SessionLocal()
    try:
        _guard(db, user.id)
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.aktiv.is_(True), NeighborPost.status == "Freigegeben").first()
        if not post or post.user_id == user.id or _blocked(db, user.id, post.user_id):
            return RedirectResponse("/nachbarschaft", status_code=303)
        a, b = sorted((user.id, post.user_id))
        conv = db.query(NeighborConversation).filter_by(post_id=post_id, participant_a=a, participant_b=b).first()
        if not conv:
            conv = NeighborConversation(post_id=post_id, participant_a=a, participant_b=b, status="offen")
            db.add(conv); db.flush()
            intro = f'Hallo, ich kann bei „{post.title}“ helfen.' if post.kind == "Suche" else f'Hallo, ich interessiere mich für dein Angebot „{post.title}“.'
            msg = NeighborChatMessage(conversation_id=conv.id, sender_user_id=user.id, body=intro)
            db.add(msg)
        elif conv.status != "offen":
            conv.status = "offen"
        conv.aktualisiert_am = _now()
        db.commit(); conv_id = conv.id; owner_id = post.user_id
    finally:
        db.close()
    background_tasks.add_task(send_user_notification, owner_id, "Neue private Antwort", f"{first_name(user)} hat auf deine Nachbarschaftsanzeige geantwortet.", f"/nachbarschaft/chat/{conv_id}", f"neighbor-start-{conv_id}-{int(_now().timestamp())}", None)
    audit_event(user.email, "Privaten Nachbarschafts-Chat gestartet", "neighbor_conversation", str(conv_id), f"Beitrag #{post_id}")
    return RedirectResponse(f"/nachbarschaft/chat/{conv_id}", status_code=303)


def _chat_html(conv, post, other_user, messages, user, *, blocked_by_me: bool, blocked_either: bool, restriction: dict, notice: str = ""):
    reasons = "".join(f'<option>{escape(x)}</option>' for x in REPORT_REASONS)
    bubbles = []
    for msg in messages:
        mine = msg.sender_user_id == user.id
        report = "" if mine else f'''<div class="nhv2-report"><details><summary>Nachricht melden</summary><form method="post" action="/nachbarschaft/chat/{conv.id}/melden/{msg.id}"><select name="reason">{reasons}</select><textarea name="detail" maxlength="1000" placeholder="Optionaler Hinweis"></textarea><button class="nhv2-btn" type="submit">Vertraulich melden</button></form></details></div>'''
        bubbles.append(f'''<div class="nhv2-bubble{" mine" if mine else ""}">{escape(msg.body)}<small>{escape(relative_time(msg.erstellt_am))}</small>{report}</div>''')
    disabled = blocked_either or restriction["blocked"] or conv.status != "offen"
    if disabled:
        composer = '<div class="nhv2-warning">In diesem Chat können derzeit keine neuen Nachrichten gesendet werden.</div>'
    else:
        composer = f'''<form class="nhv2-compose" method="post" action="/nachbarschaft/chat/{conv.id}"><input name="body" maxlength="2000" required placeholder="Private Nachricht …"><button class="nhv2-btn primary" type="submit">Senden</button></form>'''
    notice_html = f'<div class="nhv2-note">✓ {escape(notice)}</div>' if notice else ""
    block_label = "Blockierung aufheben" if blocked_by_me else "Nutzer blockieren"
    block_path = "entsperren" if blocked_by_me else "blockieren"
    body = f'''{CSS}<section class="nhv2"><div class="nhv2-head"><a class="back" href="/nachrichten">← Nachrichten</a><span class="nhv2-eyebrow">Privater Chat</span><h1>{escape(first_name(other_user))}</h1><p>Zu „{escape(post.title if post else "Nachbarschaftshilfe")}“</p></div><div class="nhv2-note">🔒 Nur die Beteiligten sehen diesen Verlauf. Bei einer Meldung erhält die Verwaltung die gemeldete Nachricht plus einen kleinen Kontext – nicht automatisch den gesamten Chat.</div>{notice_html}<div class="nhv2-chat">{"".join(bubbles) or '<div class="nhv2-empty">Noch keine Nachrichten.</div>'}</div>{composer}<div class="nhv2-actions"><form method="post" action="/nachbarschaft/chat/{conv.id}/{block_path}"><button class="nhv2-btn" type="submit">{block_label}</button></form><form method="post" action="/nachbarschaft/chat/{conv.id}/schliessen"><button class="nhv2-btn" type="submit">Chat beenden</button></form></div><div class="nhv2-bottom"></div></section>'''
    return page("Privater Chat", body, active="profile", body_class="community-view")


@router.get("/nachbarschaft/chat/{conversation_id}")
async def enhanced_chat(request: Request, conversation_id: int, hinweis: str = ""):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    db = SessionLocal()
    try:
        conv = _conversation(db, conversation_id, user.id)
        if not conv:
            raise HTTPException(status_code=404, detail="Chat nicht gefunden")
        other_id = _other(conv, user.id)
        post = db.query(NeighborPost).filter(NeighborPost.id == conv.post_id).first()
        other_user = db.query(PWAUser).filter(PWAUser.id == other_id).first()
        messages = db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id == conv.id, NeighborChatMessage.aktiv.is_(True)).order_by(NeighborChatMessage.erstellt_am.asc()).all()
        for msg in messages:
            if msg.sender_user_id != user.id and not msg.gelesen_am:
                msg.gelesen_am = _now()
        db.commit()
        by_me = _blocked_by_me(db, user.id, other_id)
        either = _blocked(db, user.id, other_id)
        restriction = _restriction_state(db, user.id)
    finally:
        db.close()
    return _chat_html(conv, post, other_user, messages, user, blocked_by_me=by_me, blocked_either=either, restriction=restriction, notice=_clean(hinweis, 400))


@router.post("/nachbarschaft/chat/{conversation_id}")
async def enhanced_chat_send(request: Request, conversation_id: int, background_tasks: BackgroundTasks):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    form = await request.form(); text = _clean(form.get("body"), 2000)
    db = SessionLocal()
    try:
        _guard(db, user.id)
        conv = _conversation(db, conversation_id, user.id)
        if not conv or conv.status != "offen":
            raise HTTPException(status_code=403, detail="Chat ist geschlossen")
        other_id = _other(conv, user.id)
        if _blocked(db, user.id, other_id):
            raise HTTPException(status_code=403, detail="Zwischen diesen Nutzern ist der private Kontakt blockiert")
        if not text:
            return RedirectResponse(f"/nachbarschaft/chat/{conversation_id}", status_code=303)
        msg = NeighborChatMessage(conversation_id=conversation_id, sender_user_id=user.id, body=text)
        db.add(msg); conv.aktualisiert_am = _now(); db.commit(); db.refresh(msg)
    finally:
        db.close()
    background_tasks.add_task(send_user_notification, other_id, "Neue private Nachricht", f"{first_name(user)} hat dir geschrieben.", f"/nachbarschaft/chat/{conversation_id}", f"neighbor-msg-{conversation_id}-{msg.id}", None)
    return RedirectResponse(f"/nachbarschaft/chat/{conversation_id}", status_code=303)


@router.post("/nachbarschaft/chat/{conversation_id}/blockieren")
async def enhanced_block(request: Request, conversation_id: int):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    db = SessionLocal()
    try:
        conv = _conversation(db, conversation_id, user.id)
        if not conv:
            raise HTTPException(status_code=404, detail="Chat nicht gefunden")
        other_id = _other(conv, user.id)
        if not _blocked_by_me(db, user.id, other_id):
            db.add(NeighborUserBlock(blocker_user_id=user.id, blocked_user_id=other_id))
            try: db.commit()
            except IntegrityError: db.rollback()
    finally: db.close()
    audit_event(user.email, "Nachbarschaftsnutzer blockiert", "pwa_user", str(other_id), f"Chat #{conversation_id}")
    return RedirectResponse(f"/nachbarschaft/chat/{conversation_id}?hinweis=" + quote("Der Nutzer wurde blockiert."), status_code=303)


@router.post("/nachbarschaft/chat/{conversation_id}/entsperren")
async def enhanced_unblock(request: Request, conversation_id: int):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    db = SessionLocal()
    try:
        conv = _conversation(db, conversation_id, user.id)
        if not conv: raise HTTPException(status_code=404, detail="Chat nicht gefunden")
        other_id = _other(conv, user.id)
        row = db.query(NeighborUserBlock).filter(NeighborUserBlock.blocker_user_id == user.id, NeighborUserBlock.blocked_user_id == other_id).first()
        if row: db.delete(row); db.commit()
    finally: db.close()
    return RedirectResponse(f"/nachbarschaft/chat/{conversation_id}?hinweis=" + quote("Blockierung wurde aufgehoben."), status_code=303)


@router.post("/nachbarschaft/chat/{conversation_id}/schliessen")
async def enhanced_close_chat(request: Request, conversation_id: int):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    db = SessionLocal()
    try:
        conv = _conversation(db, conversation_id, user.id)
        if conv: conv.status = "geschlossen"; conv.aktualisiert_am = _now(); db.commit()
    finally: db.close()
    return RedirectResponse("/nachrichten", status_code=303)


def _save_report_snapshot(db, report: NeighborReport, *, reported_user_id=None, post_id=None, conversation_id=None, message_id=None, message_snapshot="", context=None):
    db.add(NeighborReportSnapshot(report_id=report.id, reported_user_id=reported_user_id, post_id=post_id, conversation_id=conversation_id, message_id=message_id, message_snapshot=message_snapshot[:5000], context_snapshot=json.dumps(context or [], ensure_ascii=False)))


@router.post("/nachbarschaft/{post_id}/melden")
async def enhanced_report_post(request: Request, post_id: int):
    user = _required(request)
    form = await request.form(); reason = _clean(form.get("reason"), 80); detail = _clean(form.get("detail"), 1000)
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id).first()
        if not post or post.user_id == user.id: raise HTTPException(status_code=404, detail="Beitrag nicht gefunden")
        report = NeighborReport(reporter_user_id=user.id, target_type="post", target_id=post_id, reason=reason, detail=detail)
        db.add(report); db.flush(); _save_report_snapshot(db, report, reported_user_id=post.user_id, post_id=post.id, message_snapshot=f"{post.title}\n\n{post.description}")
        db.commit(); report_id = report.id
    finally: db.close()
    audit_event(user.email, "Nachbarschaftsbeitrag gemeldet", "neighbor_report", str(report_id), f"Beitrag #{post_id}")
    return RedirectResponse("/nachbarschaft?hinweis=" + quote("Danke. Die Meldung wurde vertraulich an die Verwaltung übermittelt."), status_code=303)


@router.post("/nachbarschaft/chat/{conversation_id}/melden/{message_id}")
async def enhanced_report_message(request: Request, conversation_id: int, message_id: int):
    user = _required(request, f"/nachbarschaft/chat/{conversation_id}")
    form = await request.form(); reason = _clean(form.get("reason"), 80); detail = _clean(form.get("detail"), 1000)
    db = SessionLocal()
    try:
        conv = _conversation(db, conversation_id, user.id)
        msg = db.query(NeighborChatMessage).filter(NeighborChatMessage.id == message_id, NeighborChatMessage.conversation_id == conversation_id).first() if conv else None
        if not msg or msg.sender_user_id == user.id: raise HTTPException(status_code=404, detail="Nachricht nicht gefunden")
        all_msgs = db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id == conversation_id, NeighborChatMessage.aktiv.is_(True)).order_by(NeighborChatMessage.erstellt_am.asc()).all()
        idx = next((i for i, x in enumerate(all_msgs) if x.id == message_id), 0)
        context = [{"sender_user_id": x.sender_user_id, "body": x.body, "created": x.erstellt_am.isoformat() if x.erstellt_am else ""} for x in all_msgs[max(0, idx-2):min(len(all_msgs), idx+3)]]
        report = NeighborReport(reporter_user_id=user.id, target_type="message", target_id=message_id, reason=reason, detail=detail)
        db.add(report); db.flush(); _save_report_snapshot(db, report, reported_user_id=msg.sender_user_id, post_id=conv.post_id, conversation_id=conv.id, message_id=msg.id, message_snapshot=msg.body, context=context)
        db.commit(); report_id = report.id
    finally: db.close()
    audit_event(user.email, "Private Nachbarschaftsnachricht gemeldet", "neighbor_report", str(report_id), f"Chat #{conversation_id}")
    return RedirectResponse(f"/nachbarschaft/chat/{conversation_id}?hinweis=" + quote("Die Nachricht wurde vertraulich gemeldet. Der andere Nutzer wird darüber nicht informiert."), status_code=303)


@router.get("/nachrichten")
async def enhanced_messages(request: Request):
    user = _user(request)
    if not user: return RedirectResponse("/anmelden?next=/nachrichten", status_code=303)
    db = SessionLocal()
    try:
        convs = db.query(NeighborConversation).filter(or_(NeighborConversation.participant_a == user.id, NeighborConversation.participant_b == user.id)).order_by(NeighborConversation.aktualisiert_am.desc()).all()
        chat_rows = []
        for conv in convs:
            other_id = _other(conv, user.id); other_user = db.query(PWAUser).filter(PWAUser.id == other_id).first(); post = db.query(NeighborPost).filter(NeighborPost.id == conv.post_id).first()
            last = db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id == conv.id, NeighborChatMessage.aktiv.is_(True)).order_by(NeighborChatMessage.erstellt_am.desc()).first()
            unread = db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id == conv.id, NeighborChatMessage.sender_user_id != user.id, NeighborChatMessage.aktiv.is_(True), NeighborChatMessage.gelesen_am.is_(None)).count()
            chat_rows.append(f'''<a class="nhv2-thread{" unread" if unread else ""}" href="/nachbarschaft/chat/{conv.id}"><div><strong>{escape(first_name(other_user))} · {escape(post.title if post else "Nachbarschaftshilfe")}</strong><p>{escape((last.body if last else "Noch keine Nachricht")[:150])}</p></div>{f'<span class="nhv2-unread">{unread}</span>' if unread else ''}</a>''')
        chat_unread = _unread_chats(db, user.id)
    finally: db.close()
    mails = get_messages(user.id)
    mail_rows = []
    for item in mails:
        unread = not getattr(item, "gelesen_am", None)
        mail_rows.append(f'''<article class="nhv2-mail{" unread" if unread else ""}"><span class="nhv2-eyebrow">{escape(getattr(item,"sender_label","") or "Ahnsen hilft")}</span><h3>{escape(getattr(item,"subject","") or "Nachricht")}</h3><p class="nhv2-copy">{escape(getattr(item,"body","") or "")}</p><div class="nhv2-actions">{f'<form method="post" action="/nachrichten/{item.id}/gelesen"><button class="nhv2-btn" type="submit">Als gelesen markieren</button></form>' if unread else ''}{f'<a class="nhv2-btn" href="{escape(getattr(item,"url","") or "/")}">Öffnen</a>' if getattr(item,"url","") else ''}</div></article>''')
    total = chat_unread + count_unread_messages(user.id)
    body = f'''{CSS}<section class="nhv2"><div class="nhv2-head"><a class="back" href="/profil">← Mein Ahnsen</a><span class="nhv2-eyebrow">Postfach</span><h1>Nachrichten</h1><p>{total} ungelesen. Private Nachbarschafts-Chats und Mitteilungen der Verwaltung an einem Ort.</p></div><section class="nhv2-grid"><span class="nhv2-eyebrow">Privat</span><h2 style="margin:0;color:var(--forest)">Nachbarschafts-Chats</h2>{"".join(chat_rows) or '<div class="nhv2-empty">Noch keine privaten Chats.</div>'}</section><section class="nhv2-grid"><span class="nhv2-eyebrow">Mitteilungen</span><h2 style="margin:0;color:var(--forest)">Ahnsen hilft & Verwaltung</h2>{"".join(mail_rows) or '<div class="nhv2-empty">Keine Mitteilungen.</div>'}</section><div class="nhv2-bottom"></div></section>'''
    return page("Nachrichten", body, active="profile", body_class="community-view")


@router.get("/api/me/unread-count")
async def enhanced_unread_count(request: Request):
    user = _user(request)
    if not user: return JSONResponse({"count": 0, "loggedIn": False})
    db = SessionLocal()
    try: chat_count = _unread_chats(db, user.id)
    finally: db.close()
    return JSONResponse({"count": count_unread_messages(user.id) + chat_count, "loggedIn": True})


@router.post("/nachbarschaft/{post_id}/erledigt")
async def enhanced_done(request: Request, post_id: int):
    user = _required(request)
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.user_id == user.id).first()
        if post:
            post.status = "Erledigt"; post.aktualisiert_am = _now(); detail = _detail(db, post.id, True); detail.done_at = _now(); detail.aktualisiert_am = _now(); db.commit()
    finally: db.close()
    audit_event(user.email, "Nachbarschaftsbeitrag erledigt", "neighbor_post", str(post_id))
    return RedirectResponse("/nachbarschaft?eigene=1", status_code=303)


@router.post("/nachbarschaft/{post_id}/verlaengern")
async def enhanced_renew(request: Request, post_id: int):
    user = _required(request)
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.user_id == user.id, NeighborPost.aktiv.is_(True)).first()
        if post: meta = _meta(db, post.id, True); meta.expires_at = _now() + timedelta(days=30); db.commit()
    finally: db.close()
    return RedirectResponse("/nachbarschaft?eigene=1&hinweis=" + quote("Beitrag bleibt weitere 30 Tage aktiv."), status_code=303)


@router.get("/nachbarschaft/{post_id}/bearbeiten")
async def enhanced_edit_form(request: Request, post_id: int):
    user = _required(request)
    db = SessionLocal()
    try:
        row = db.query(NeighborPost, NeighborPostMeta, NeighborPostPublicDetail).outerjoin(NeighborPostMeta, NeighborPostMeta.post_id == NeighborPost.id).outerjoin(NeighborPostPublicDetail, NeighborPostPublicDetail.post_id == NeighborPost.id).filter(NeighborPost.id == post_id, NeighborPost.user_id == user.id).first()
    finally: db.close()
    if not row: raise HTTPException(status_code=404, detail="Beitrag nicht gefunden")
    post, meta, detail = row; location = detail.location_label if detail else "Ahnsen"; locs = "".join(f'<option{" selected" if x == location else ""}>{escape(x)}</option>' for x in LOCATIONS); cats = "".join(f'<option{" selected" if x == post.category else ""}>{escape(x)}</option>' for x in CATEGORIES)
    body = f'''{CSS}<section class="nhv2"><div class="nhv2-head"><a class="back" href="/nachbarschaft?eigene=1">← Meine Beiträge</a><span class="nhv2-eyebrow">Bearbeiten</span><h1>{escape(post.title)}</h1><p>Inhaltliche Änderungen werden erneut kurz geprüft.</p></div><section class="nhv2-card"><form class="nhv2-form" method="post"><div class="nhv2-two"><label class="nhv2-field"><span>Ich …</span><select name="kind"><option{" selected" if post.kind == "Suche" else ""}>Suche</option><option{" selected" if post.kind == "Biete" else ""}>Biete</option></select></label><label class="nhv2-field"><span>Kategorie</span><select name="category">{cats}</select></label></div><label class="nhv2-field"><span>Titel</span><input name="title" value="{escape(post.title)}" required maxlength="180"></label><label class="nhv2-field"><span>Beschreibung</span><textarea name="description" required maxlength="3000">{escape(post.description)}</textarea></label><div class="nhv2-two"><label class="nhv2-field"><span>Öffentlicher Bereich</span><select name="location_label">{locs}</select></label><label class="nhv2-field"><span>Laufzeit ab jetzt</span><select name="expiry_days"><option value="14">14 Tage</option><option value="30" selected>30 Tage</option></select></label></div><label class="nhv2-check"><input type="checkbox" name="urgent" value="ja"{" checked" if meta and meta.urgent else ""}><span>Als dringend markieren</span></label><button class="nhv2-btn primary" type="submit">Änderungen zur Prüfung senden</button></form></section><div class="nhv2-bottom"></div></section>'''
    return page("Beitrag bearbeiten", body, active="more", body_class="community-view")


@router.post("/nachbarschaft/{post_id}/bearbeiten")
async def enhanced_edit(request: Request, post_id: int):
    user = _required(request); form = await request.form(); title = _clean(form.get("title"),180); description = _clean(form.get("description"),3000)
    if len(title)<4 or len(description)<10: return RedirectResponse(f"/nachbarschaft/{post_id}/bearbeiten",status_code=303)
    category = _clean(form.get("category"),80); category = category if category in CATEGORIES else "Sonstiges"; location = _clean(form.get("location_label"),80); location = location if location in LOCATIONS else "Ahnsen"
    try: days = 14 if int(str(form.get("expiry_days") or "30")) == 14 else 30
    except ValueError: days=30
    db=SessionLocal()
    try:
        _guard(db,user.id); post=db.query(NeighborPost).filter(NeighborPost.id==post_id,NeighborPost.user_id==user.id).first()
        if not post: raise HTTPException(status_code=404,detail="Beitrag nicht gefunden")
        post.title=title; post.description=description; post.kind="Biete" if form.get("kind")=="Biete" else "Suche"; post.category=category; post.status="Prüfung"; post.aktualisiert_am=_now(); meta=_meta(db,post.id,True); meta.urgent=form.get("urgent")=="ja"; meta.expires_at=_now()+timedelta(days=days); detail=_detail(db,post.id,True); detail.location_label=location; detail.hidden=False; detail.aktualisiert_am=_now(); db.commit()
    finally: db.close()
    audit_event(user.email,"Nachbarschaftsbeitrag bearbeitet","neighbor_post",str(post_id),"Erneute Prüfung")
    return RedirectResponse("/nachbarschaft?eigene=1&hinweis="+quote("Änderungen gespeichert und erneut zur Prüfung eingereicht."),status_code=303)


def _admin_html(reports, posts, restrictions, notice=""):
    report_cards=[]
    for report, snap, reporter, offender in reports:
        try: context=json.loads(snap.context_snapshot if snap else "[]")
        except Exception: context=[]
        context_html="".join(f'<div><strong>Nutzer #{escape(str(x.get("sender_user_id") or ""))}</strong>: {escape(str(x.get("body") or ""))}</div>' for x in context)
        snapshot=snap.message_snapshot if snap else "Kein Snapshot vorhanden (ältere Meldung)."
        options='''<option value="dismiss">Als erledigt schließen</option><option value="hide">Inhalt ausblenden</option><option value="warn">Nutzer verwarnen</option><option value="lock_chat">Chat sperren</option><option value="suspend_7">7 Tage sperren</option><option value="suspend_30">30 Tage sperren</option><option value="permanent">Dauerhaft sperren</option>'''
        report_cards.append(f'''<article class="nhv2-admin-card"><span class="nhv2-eyebrow">Meldung #{report.id} · {escape(report.target_type)}</span><h3>{escape(report.reason)}</h3><p><strong>Gemeldet von:</strong> {escape(first_name(reporter))} · <strong>betroffener Nutzer:</strong> {escape(first_name(offender))}</p>{f'<p>{escape(report.detail)}</p>' if report.detail else ''}<div class="nhv2-snapshot">{escape(snapshot)}</div>{f'<div class="nhv2-context">{context_html}</div>' if context_html else ''}<form class="nhv2-admin-actions" method="post" action="/intern/nachbarschaft/meldung/{report.id}/aktion"><select name="action">{options}</select><input name="resolution" maxlength="1000" placeholder="Interner Hinweis / Begründung"><button class="nhv2-btn primary" type="submit">Aktion ausführen</button></form></article>''')
    post_cards=[]
    for post, author in posts:
        post_cards.append(f'''<article class="nhv2-card"><span class="nhv2-eyebrow">#{post.id} · {escape(post.status)}</span><h3>{escape(post.title)}</h3><p class="nhv2-copy">{escape(post.description)}</p><div class="nhv2-meta"><span class="nhv2-tag">{escape(first_name(author))}</span><span class="nhv2-tag">{escape(post.kind)}</span><span class="nhv2-tag">{escape(post.category)}</span></div><form class="nhv2-admin-actions" method="post" action="/intern/nachbarschaft/{post.id}/status"><select name="status"><option>Prüfung</option><option{" selected" if post.status=="Freigegeben" else ""}>Freigegeben</option><option{" selected" if post.status=="Erledigt" else ""}>Erledigt</option><option{" selected" if post.status=="Abgelehnt" else ""}>Abgelehnt</option></select><button class="nhv2-btn primary" type="submit">Status speichern</button></form></article>''')
    restriction_cards=[]
    for base,schedule,user in restrictions:
        until="dauerhaft" if (base.blocked or (schedule and schedule.permanent)) else (_fmt(schedule.suspended_until) if schedule and schedule.suspended_until else "nur verwarnt")
        restriction_cards.append(f'''<article class="nhv2-card"><strong>{escape(first_name(user))} · Nutzer #{base.user_id}</strong><p class="nhv2-copy">{escape(until)} · Verwarnungen: {int(base.warning_count or 0)}<br>{escape((schedule.reason if schedule and schedule.reason else base.reason) or "")}</p><form method="post" action="/intern/nachbarschaft/sperre/{base.user_id}/aufheben"><button class="nhv2-btn" type="submit">Einschränkung aufheben</button></form></article>''')
    notice_html=f'<div class="nhv2-note">✓ {escape(notice)}</div>' if notice else ""
    body=f'''<style>{intern_nav_css()}</style>{CSS}<div class="container">{intern_nav("nachbarschaft")}<main class="nhv2"><div class="nhv2-head"><span class="nhv2-eyebrow">Moderation</span><h1>Nachbarschaftshilfe</h1><p>Meldungen prüfen, Beiträge freigeben und Schutzmaßnahmen verwalten.</p></div>{notice_html}<div class="nhv2-note"><strong>Datenschutz:</strong> Die Verwaltung kann nicht beliebig private Chats durchsuchen. Bei einer gemeldeten Nachricht wird nur die konkrete Nachricht plus ein kleiner Kontext-Snapshot für die Prüfung gespeichert.</div><section class="nhv2-grid"><h2>Offene Meldungen · {len(reports)}</h2>{"".join(report_cards) or '<div class="nhv2-empty">Keine offenen Meldungen.</div>'}</section><section class="nhv2-grid"><h2>Beiträge & Freigaben</h2>{"".join(post_cards) or '<div class="nhv2-empty">Keine Beiträge.</div>'}</section><section class="nhv2-grid"><h2>Verwarnungen & Sperren</h2>{"".join(restriction_cards) or '<div class="nhv2-empty">Keine aktiven Einschränkungen.</div>'}</section></main></div>'''
    return HTMLResponse(f'<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nachbarschaftshilfe · Verwaltung</title></head><body>{body}</body></html>')


@router.get("/intern/nachbarschaft")
async def enhanced_admin(request: Request, hinweis: str = ""):
    _admin(request); db=SessionLocal()
    try:
        reports=[]
        for report in db.query(NeighborReport).filter(NeighborReport.status=="offen").order_by(NeighborReport.erstellt_am.desc()).all():
            snap=db.query(NeighborReportSnapshot).filter(NeighborReportSnapshot.report_id==report.id).first(); reporter=db.query(PWAUser).filter(PWAUser.id==report.reporter_user_id).first(); offender=db.query(PWAUser).filter(PWAUser.id==(snap.reported_user_id if snap else 0)).first(); reports.append((report,snap,reporter,offender))
        posts=db.query(NeighborPost,PWAUser).outerjoin(PWAUser,PWAUser.id==NeighborPost.user_id).order_by(NeighborPost.erstellt_am.desc()).limit(150).all()
        restrictions=[]
        for base in db.query(NeighborRestriction).filter(or_(NeighborRestriction.blocked.is_(True),NeighborRestriction.warning_count>0)).all():
            schedule=_schedule(db,base.user_id); user=db.query(PWAUser).filter(PWAUser.id==base.user_id).first(); restrictions.append((base,schedule,user))
        for schedule in db.query(NeighborRestrictionSchedule).filter(or_(NeighborRestrictionSchedule.permanent.is_(True),NeighborRestrictionSchedule.suspended_until>=_now())).all():
            if any(x[0].user_id==schedule.user_id for x in restrictions): continue
            base=NeighborRestriction(user_id=schedule.user_id,blocked=False,warning_count=0,reason=""); user=db.query(PWAUser).filter(PWAUser.id==schedule.user_id).first(); restrictions.append((base,schedule,user))
    finally: db.close()
    return _admin_html(reports,posts,restrictions,_clean(hinweis,400))


@router.post("/intern/nachbarschaft/{post_id}/status")
async def enhanced_admin_status(request: Request, post_id: int, background_tasks: BackgroundTasks):
    admin = _admin(request); form=await request.form(); status=_clean(form.get("status"),40)
    if status not in {"Prüfung","Freigegeben","Erledigt","Abgelehnt"}: return RedirectResponse("/intern/nachbarschaft",status_code=303)
    db=SessionLocal()
    try:
        post=db.query(NeighborPost).filter(NeighborPost.id==post_id).first()
        if not post: return RedirectResponse("/intern/nachbarschaft",status_code=303)
        newly=post.status!="Freigegeben" and status=="Freigegeben"; post.status=status; post.aktualisiert_am=_now(); meta=_meta(db,post.id,True); detail=_detail(db,post.id,True)
        if status=="Freigegeben":
            detail.hidden=False
            if not meta.expires_at or meta.expires_at<_now(): meta.expires_at=_now()+timedelta(days=30)
        elif status=="Erledigt": detail.done_at=_now()
        elif status=="Abgelehnt": detail.hidden=True
        subscribers=[x.user_id for x in db.query(NeighborCategorySubscription).filter(NeighborCategorySubscription.category==post.category).all() if x.user_id!=post.user_id] if newly else []
        owner_id=post.user_id; title=post.title; category=post.category; db.commit()
    finally: db.close()
    create_message(owner_id,f"Nachbarschaftsbeitrag: {title}",f"Der Status wurde auf „{status}“ geändert.",category="nachbarschaft",url="/nachbarschaft")
    background_tasks.add_task(send_user_notification,owner_id,"Nachbarschaftsbeitrag aktualisiert",f"{title}: {status}","/nachbarschaft",f"neighbor-post-{post_id}-{status}",None)
    for subscriber in subscribers: background_tasks.add_task(send_user_notification,subscriber,f"Neue Hilfe: {category}",title,"/nachbarschaft",f"neighbor-category-{post_id}-{subscriber}",None)
    audit_event(admin["username"],"Nachbarschaftsstatus geändert","neighbor_post",str(post_id),status)
    return RedirectResponse("/intern/nachbarschaft?hinweis="+quote("Status wurde gespeichert."),status_code=303)


@router.post("/intern/nachbarschaft/meldung/{report_id}/aktion")
async def enhanced_admin_action(request: Request, report_id: int, background_tasks: BackgroundTasks):
    admin = _admin(request); form=await request.form(); action=_clean(form.get("action"),40) or "dismiss"; resolution=_clean(form.get("resolution"),1000); db=SessionLocal()
    try:
        report=db.query(NeighborReport).filter(NeighborReport.id==report_id).first()
        if not report: return RedirectResponse("/intern/nachbarschaft",status_code=303)
        snap=db.query(NeighborReportSnapshot).filter(NeighborReportSnapshot.report_id==report.id).first(); target_user=snap.reported_user_id if snap else None
        if not target_user:
            offender,_=legacy._target(db,report); target_user=offender
        if action=="hide":
            if report.target_type=="message":
                obj=db.query(NeighborChatMessage).filter(NeighborChatMessage.id==report.target_id).first()
                if obj: obj.aktiv=False
            else:
                obj=db.query(NeighborPost).filter(NeighborPost.id==report.target_id).first()
                if obj: obj.status="Abgelehnt"; obj.aktualisiert_am=_now(); detail=_detail(db,obj.id,True); detail.hidden=True
        elif action=="lock_chat" and snap and snap.conversation_id:
            conv=db.query(NeighborConversation).filter(NeighborConversation.id==snap.conversation_id).first()
            if conv: conv.status="geschlossen"; conv.aktualisiert_am=_now()
        elif action in {"warn","suspend_7","suspend_30","permanent"} and target_user:
            base=db.query(NeighborRestriction).filter(NeighborRestriction.user_id==target_user).first()
            if not base: base=NeighborRestriction(user_id=target_user,blocked=False,warning_count=0,reason=""); db.add(base)
            schedule=_schedule(db,target_user)
            if not schedule: schedule=NeighborRestrictionSchedule(user_id=target_user); db.add(schedule)
            if action=="warn": base.warning_count=int(base.warning_count or 0)+1
            elif action=="permanent": base.blocked=True; schedule.permanent=True; schedule.suspended_until=None
            else: base.blocked=False; schedule.permanent=False; schedule.suspended_until=_now()+timedelta(days=7 if action=="suspend_7" else 30)
            base.reason=resolution or report.reason; schedule.reason=resolution or report.reason; schedule.aktualisiert_am=_now()
        report.status="erledigt"; report.erledigt_am=_now()
        if snap: snap.admin_action=action; snap.resolution=resolution
        db.commit()
    finally: db.close()
    labels={"dismiss":"Meldung geschlossen","hide":"Inhalt ausgeblendet","warn":"Verwarnung ausgesprochen","lock_chat":"Chat gesperrt","suspend_7":"7 Tage gesperrt","suspend_30":"30 Tage gesperrt","permanent":"Dauerhaft gesperrt"}
    if target_user and action in {"warn","suspend_7","suspend_30","permanent"}:
        label=labels.get(action,"Moderationsmaßnahme"); create_message(target_user,"Hinweis zur Nachbarschaftshilfe",f"Die Verwaltung hat folgende Maßnahme gesetzt: {label}."+(f"\nHinweis: {resolution}" if resolution else ""),category="nachbarschaft",url="/nachbarschaft"); background_tasks.add_task(send_user_notification,target_user,"Hinweis zur Nachbarschaftshilfe",label,"/nachbarschaft",f"neighbor-moderation-{report_id}-{action}",None)
    audit_event(admin["username"],labels.get(action,"Meldung bearbeitet"),"neighbor_report",str(report_id),resolution)
    return RedirectResponse("/intern/nachbarschaft?hinweis="+quote("Meldung wurde bearbeitet."),status_code=303)


@router.post("/intern/nachbarschaft/sperre/{user_id}/aufheben")
async def enhanced_clear_restriction(request: Request, user_id: int):
    admin = _admin(request); db=SessionLocal()
    try:
        base=db.query(NeighborRestriction).filter(NeighborRestriction.user_id==user_id).first(); schedule=_schedule(db,user_id)
        if base: base.blocked=False; base.reason=""
        if schedule: schedule.permanent=False; schedule.suspended_until=None; schedule.reason=""; schedule.aktualisiert_am=_now()
        db.commit()
    finally: db.close()
    audit_event(admin["username"],"Nachbarschaftssperre aufgehoben","pwa_user",str(user_id))
    return RedirectResponse("/intern/nachbarschaft?hinweis="+quote("Einschränkung wurde aufgehoben."),status_code=303)
