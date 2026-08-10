from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from community_crud import create_neighbor_post as legacy_create_neighbor_post
from community_models import NeighborPost
from database import Base, SessionLocal, engine
from neighbor_v2_models import (
    NeighborBlock,
    NeighborCategorySubscription,
    NeighborChatMessage,
    NeighborConversation,
    NeighborPostMeta,
    NeighborReport,
    NeighborRestriction,
    NeighborSavedPost,
)
from pwa_models import PWAUser


CATEGORIES = ("Alltag", "Einkauf", "Fahrdienst", "Werkzeug", "Garten", "Tierhilfe", "Gefunden & Verloren", "Sonstiges")
LOCATIONS = ("Ahnsen", "Nähe Ortsmitte", "Nähe DGH", "Nähe Schule", "Sonstiger Bereich in Ahnsen")
REPORT_REASONS = ("Beleidigung oder Belästigung", "Betrug oder verdächtiges Verhalten", "Unangemessener Inhalt", "Spam", "Datenschutz / persönliche Daten", "Sonstiges")


def init_neighbor_v2_db() -> None:
    Base.metadata.create_all(bind=engine)


def _now() -> datetime:
    return datetime.utcnow()


def public_name(user: PWAUser | None) -> str:
    name = str(getattr(user, "name", "") or "").strip()
    return name.split()[0] if name else "Nachbar/in"


def restriction_for(user_id: int) -> dict[str, Any]:
    db = SessionLocal()
    try:
        row = db.query(NeighborRestriction).filter(NeighborRestriction.user_id == user_id).first()
        if not row:
            return {"blocked": False, "permanent": False, "until": None, "reason": "", "warning_count": 0}
        blocked = bool(row.permanent or (row.suspended_until and row.suspended_until > _now()))
        return {
            "blocked": blocked,
            "permanent": bool(row.permanent),
            "until": row.suspended_until,
            "reason": row.reason or "",
            "warning_count": int(row.warning_count or 0),
        }
    finally:
        db.close()


def _ensure_meta(db, post_id: int) -> NeighborPostMeta:
    meta = db.query(NeighborPostMeta).filter(NeighborPostMeta.post_id == post_id).first()
    if not meta:
        meta = NeighborPostMeta(post_id=post_id, location_label="Ahnsen", expires_at=_now() + timedelta(days=30))
        db.add(meta)
        db.flush()
    return meta


def create_post(user_id: int, kind: str, category: str, title: str, description: str, *, location_label: str = "Ahnsen", urgent: bool = False, expiry_days: int = 30) -> NeighborPost:
    post = legacy_create_neighbor_post(user_id, kind, category if category in CATEGORIES else "Alltag", title, description)
    db = SessionLocal()
    try:
        days = 14 if int(expiry_days or 30) == 14 else 30
        db.add(NeighborPostMeta(
            post_id=post.id,
            location_label=location_label if location_label in LOCATIONS else "Ahnsen",
            urgent=bool(urgent),
            expires_at=_now() + timedelta(days=days),
        ))
        db.commit()
        return post
    finally:
        db.close()


def _post_dict(post: NeighborPost, user: PWAUser | None, meta: NeighborPostMeta | None, *, saved: bool = False) -> dict[str, Any]:
    return {
        "id": post.id,
        "user_id": post.user_id,
        "kind": post.kind,
        "category": post.category,
        "title": post.title,
        "description": post.description,
        "status": post.status,
        "active": bool(post.aktiv),
        "created": post.erstellt_am,
        "updated": post.aktualisiert_am,
        "author": public_name(user),
        "location": (meta.location_label if meta else "Ahnsen") or "Ahnsen",
        "urgent": bool(meta.urgent if meta else False),
        "expires_at": meta.expires_at if meta else None,
        "done_at": meta.done_at if meta else None,
        "hidden": bool(meta.hidden if meta else False),
        "saved": saved,
    }


def get_feed(*, user_id: int | None = None, kind: str = "", category: str = "", search: str = "", limit: int = 100) -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        query = (
            db.query(NeighborPost, PWAUser, NeighborPostMeta)
            .outerjoin(PWAUser, PWAUser.id == NeighborPost.user_id)
            .outerjoin(NeighborPostMeta, NeighborPostMeta.post_id == NeighborPost.id)
            .filter(NeighborPost.aktiv.is_(True))
            .filter(NeighborPost.status == "Freigegeben")
            .filter(or_(NeighborPostMeta.id.is_(None), NeighborPostMeta.hidden.is_(False)))
            .filter(or_(NeighborPostMeta.id.is_(None), NeighborPostMeta.expires_at.is_(None), NeighborPostMeta.expires_at >= _now()))
        )
        if kind in {"Suche", "Biete"}:
            query = query.filter(NeighborPost.kind == kind)
        if category in CATEGORIES:
            query = query.filter(NeighborPost.category == category)
        if search:
            like = f"%{str(search).strip()[:120]}%"
            query = query.filter(or_(NeighborPost.title.ilike(like), NeighborPost.description.ilike(like), NeighborPost.category.ilike(like)))
        saved = set()
        if user_id:
            saved = {row.post_id for row in db.query(NeighborSavedPost).filter(NeighborSavedPost.user_id == user_id).all()}
        rows = query.order_by(NeighborPostMeta.urgent.desc(), NeighborPost.erstellt_am.desc()).limit(limit).all()
        return [_post_dict(post, user, meta, saved=post.id in saved) for post, user, meta in rows]
    finally:
        db.close()


def get_own_posts(user_id: int, limit: int = 60) -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = (
            db.query(NeighborPost, PWAUser, NeighborPostMeta)
            .outerjoin(PWAUser, PWAUser.id == NeighborPost.user_id)
            .outerjoin(NeighborPostMeta, NeighborPostMeta.post_id == NeighborPost.id)
            .filter(NeighborPost.user_id == user_id)
            .order_by(NeighborPost.erstellt_am.desc())
            .limit(limit)
            .all()
        )
        return [_post_dict(post, user, meta) for post, user, meta in rows]
    finally:
        db.close()


def get_post(post_id: int, *, include_hidden: bool = False) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        row = (
            db.query(NeighborPost, PWAUser, NeighborPostMeta)
            .outerjoin(PWAUser, PWAUser.id == NeighborPost.user_id)
            .outerjoin(NeighborPostMeta, NeighborPostMeta.post_id == NeighborPost.id)
            .filter(NeighborPost.id == post_id)
            .first()
        )
        if not row:
            return None
        post, user, meta = row
        if not include_hidden and (not post.aktiv or (meta and meta.hidden)):
            return None
        return _post_dict(post, user, meta)
    finally:
        db.close()


def edit_post(post_id: int, user_id: int, *, kind: str, category: str, title: str, description: str, location_label: str, urgent: bool, expiry_days: int) -> bool:
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.user_id == user_id).first()
        if not post or not post.aktiv:
            return False
        post.kind = "Biete" if kind == "Biete" else "Suche"
        post.category = category if category in CATEGORIES else "Alltag"
        post.title = str(title or "")[:180]
        post.description = str(description or "")[:3000]
        post.status = "Prüfung"
        post.aktualisiert_am = _now()
        meta = _ensure_meta(db, post_id)
        meta.location_label = location_label if location_label in LOCATIONS else "Ahnsen"
        meta.urgent = bool(urgent)
        meta.expires_at = _now() + timedelta(days=14 if int(expiry_days or 30) == 14 else 30)
        meta.hidden = False
        meta.aktualisiert_am = _now()
        db.commit()
        return True
    finally:
        db.close()


def mark_post_done(post_id: int, user_id: int) -> bool:
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.user_id == user_id).first()
        if not post:
            return False
        post.status = "Erledigt"
        post.aktualisiert_am = _now()
        meta = _ensure_meta(db, post_id)
        meta.done_at = _now()
        meta.aktualisiert_am = _now()
        db.commit()
        return True
    finally:
        db.close()


def delete_post(post_id: int, user_id: int) -> bool:
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.user_id == user_id).first()
        if not post:
            return False
        post.aktiv = False
        post.aktualisiert_am = _now()
        db.commit()
        return True
    finally:
        db.close()


def renew_post(post_id: int, user_id: int, days: int = 30) -> bool:
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.user_id == user_id).first()
        if not post or not post.aktiv:
            return False
        meta = _ensure_meta(db, post_id)
        meta.expires_at = _now() + timedelta(days=30 if days != 14 else 14)
        meta.aktualisiert_am = _now()
        db.commit()
        return True
    finally:
        db.close()


def toggle_saved(post_id: int, user_id: int) -> bool:
    db = SessionLocal()
    try:
        row = db.query(NeighborSavedPost).filter(NeighborSavedPost.post_id == post_id, NeighborSavedPost.user_id == user_id).first()
        if row:
            db.delete(row)
            db.commit()
            return False
        db.add(NeighborSavedPost(post_id=post_id, user_id=user_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        return True
    finally:
        db.close()


def subscribed_categories(user_id: int) -> set[str]:
    db = SessionLocal()
    try:
        return {row.category for row in db.query(NeighborCategorySubscription).filter(NeighborCategorySubscription.user_id == user_id).all()}
    finally:
        db.close()


def toggle_category_subscription(user_id: int, category: str) -> bool:
    if category not in CATEGORIES:
        return False
    db = SessionLocal()
    try:
        row = db.query(NeighborCategorySubscription).filter(NeighborCategorySubscription.user_id == user_id, NeighborCategorySubscription.category == category).first()
        if row:
            db.delete(row)
            db.commit()
            return False
        db.add(NeighborCategorySubscription(user_id=user_id, category=category))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        return True
    finally:
        db.close()


def category_subscribers(category: str, exclude_user_id: int | None = None) -> list[int]:
    db = SessionLocal()
    try:
        query = db.query(NeighborCategorySubscription.user_id).filter(NeighborCategorySubscription.category == category)
        if exclude_user_id:
            query = query.filter(NeighborCategorySubscription.user_id != exclude_user_id)
        return [int(row[0]) for row in query.all()]
    finally:
        db.close()


def users_blocked(a: int, b: int) -> bool:
    db = SessionLocal()
    try:
        return bool(db.query(NeighborBlock).filter(or_(
            (NeighborBlock.blocker_user_id == a) & (NeighborBlock.blocked_user_id == b),
            (NeighborBlock.blocker_user_id == b) & (NeighborBlock.blocked_user_id == a),
        )).first())
    finally:
        db.close()


def block_user(blocker_user_id: int, blocked_user_id: int) -> bool:
    if blocker_user_id == blocked_user_id:
        return False
    db = SessionLocal()
    try:
        if db.query(NeighborBlock).filter(NeighborBlock.blocker_user_id == blocker_user_id, NeighborBlock.blocked_user_id == blocked_user_id).first():
            return True
        db.add(NeighborBlock(blocker_user_id=blocker_user_id, blocked_user_id=blocked_user_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        return True
    finally:
        db.close()


def unblock_user(blocker_user_id: int, blocked_user_id: int) -> bool:
    db = SessionLocal()
    try:
        row = db.query(NeighborBlock).filter(NeighborBlock.blocker_user_id == blocker_user_id, NeighborBlock.blocked_user_id == blocked_user_id).first()
        if not row:
            return False
        db.delete(row)
        db.commit()
        return True
    finally:
        db.close()


def blocked_by_me(blocker_user_id: int, blocked_user_id: int) -> bool:
    db = SessionLocal()
    try:
        return bool(db.query(NeighborBlock).filter(NeighborBlock.blocker_user_id == blocker_user_id, NeighborBlock.blocked_user_id == blocked_user_id).first())
    finally:
        db.close()


def get_or_create_conversation(post_id: int, responder_user_id: int) -> NeighborConversation | None:
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id, NeighborPost.aktiv.is_(True), NeighborPost.status == "Freigegeben").first()
        if not post or post.user_id == responder_user_id or users_blocked(post.user_id, responder_user_id):
            return None
        row = db.query(NeighborConversation).filter(NeighborConversation.post_id == post_id, NeighborConversation.responder_user_id == responder_user_id).first()
        if row:
            if row.status == "Geschlossen":
                row.status = "Aktiv"
                row.aktualisiert_am = _now()
                db.commit()
                db.refresh(row)
            return row
        row = NeighborConversation(post_id=post_id, owner_user_id=post.user_id, responder_user_id=responder_user_id)
        db.add(row)
        try:
            db.commit()
            db.refresh(row)
            return row
        except IntegrityError:
            db.rollback()
            return db.query(NeighborConversation).filter(NeighborConversation.post_id == post_id, NeighborConversation.responder_user_id == responder_user_id).first()
    finally:
        db.close()


def conversation_data(conversation_id: int, user_id: int, *, mark_read: bool = False) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        conv = db.query(NeighborConversation).filter(NeighborConversation.id == conversation_id).first()
        if not conv or user_id not in {conv.owner_user_id, conv.responder_user_id}:
            return None
        if mark_read:
            db.query(NeighborChatMessage).filter(
                NeighborChatMessage.conversation_id == conversation_id,
                NeighborChatMessage.sender_user_id != user_id,
                NeighborChatMessage.gelesen_am.is_(None),
            ).update({NeighborChatMessage.gelesen_am: _now()}, synchronize_session=False)
            db.commit()
        post = db.query(NeighborPost).filter(NeighborPost.id == conv.post_id).first()
        owner = db.query(PWAUser).filter(PWAUser.id == conv.owner_user_id).first()
        responder = db.query(PWAUser).filter(PWAUser.id == conv.responder_user_id).first()
        other = responder if user_id == conv.owner_user_id else owner
        messages = db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id == conversation_id).order_by(NeighborChatMessage.erstellt_am.asc()).limit(500).all()
        return {
            "id": conv.id,
            "post_id": conv.post_id,
            "post_title": post.title if post else "Nachbarschaftshilfe",
            "post_active": bool(post and post.aktiv),
            "owner_user_id": conv.owner_user_id,
            "responder_user_id": conv.responder_user_id,
            "status": conv.status,
            "other_user_id": other.id if other else 0,
            "other_name": public_name(other),
            "messages": [{"id": m.id, "sender_user_id": m.sender_user_id, "body": m.body, "created": m.erstellt_am, "read": bool(m.gelesen_am)} for m in messages],
        }
    finally:
        db.close()


def list_conversations(user_id: int, limit: int = 100) -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = db.query(NeighborConversation).filter(or_(NeighborConversation.owner_user_id == user_id, NeighborConversation.responder_user_id == user_id)).order_by(NeighborConversation.aktualisiert_am.desc()).limit(limit).all()
        result = []
        for conv in rows:
            post = db.query(NeighborPost).filter(NeighborPost.id == conv.post_id).first()
            other_id = conv.responder_user_id if user_id == conv.owner_user_id else conv.owner_user_id
            other = db.query(PWAUser).filter(PWAUser.id == other_id).first()
            last = db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id == conv.id).order_by(NeighborChatMessage.erstellt_am.desc()).first()
            unread = db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id == conv.id, NeighborChatMessage.sender_user_id != user_id, NeighborChatMessage.gelesen_am.is_(None)).count()
            result.append({"id": conv.id, "post_title": post.title if post else "Nachbarschaftshilfe", "other_name": public_name(other), "status": conv.status, "last_body": last.body if last else "", "last_at": last.erstellt_am if last else conv.erstellt_am, "unread": unread})
        return result
    finally:
        db.close()


def count_unread_chats(user_id: int) -> int:
    db = SessionLocal()
    try:
        conv_ids = [r[0] for r in db.query(NeighborConversation.id).filter(or_(NeighborConversation.owner_user_id == user_id, NeighborConversation.responder_user_id == user_id)).all()]
        if not conv_ids:
            return 0
        return db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id.in_(conv_ids), NeighborChatMessage.sender_user_id != user_id, NeighborChatMessage.gelesen_am.is_(None)).count()
    finally:
        db.close()


def send_chat_message(conversation_id: int, sender_user_id: int, body: str) -> tuple[NeighborChatMessage | None, int | None]:
    text = str(body or "").strip()[:3000]
    if len(text) < 1:
        return None, None
    db = SessionLocal()
    try:
        conv = db.query(NeighborConversation).filter(NeighborConversation.id == conversation_id).first()
        if not conv or sender_user_id not in {conv.owner_user_id, conv.responder_user_id} or conv.status != "Aktiv":
            return None, None
        recipient = conv.responder_user_id if sender_user_id == conv.owner_user_id else conv.owner_user_id
        if users_blocked(sender_user_id, recipient) or restriction_for(sender_user_id)["blocked"]:
            return None, None
        item = NeighborChatMessage(conversation_id=conversation_id, sender_user_id=sender_user_id, body=text)
        db.add(item)
        conv.aktualisiert_am = _now()
        db.commit()
        db.refresh(item)
        return item, recipient
    finally:
        db.close()


def close_conversation(conversation_id: int, user_id: int) -> bool:
    db = SessionLocal()
    try:
        conv = db.query(NeighborConversation).filter(NeighborConversation.id == conversation_id).first()
        if not conv or user_id not in {conv.owner_user_id, conv.responder_user_id}:
            return False
        conv.status = "Geschlossen"
        conv.aktualisiert_am = _now()
        db.commit()
        return True
    finally:
        db.close()


def report_message(conversation_id: int, message_id: int, reporter_user_id: int, reason: str, detail: str) -> NeighborReport | None:
    db = SessionLocal()
    try:
        conv = db.query(NeighborConversation).filter(NeighborConversation.id == conversation_id).first()
        if not conv or reporter_user_id not in {conv.owner_user_id, conv.responder_user_id}:
            return None
        msg = db.query(NeighborChatMessage).filter(NeighborChatMessage.id == message_id, NeighborChatMessage.conversation_id == conversation_id).first()
        if not msg or msg.sender_user_id == reporter_user_id:
            return None
        all_msgs = db.query(NeighborChatMessage).filter(NeighborChatMessage.conversation_id == conversation_id).order_by(NeighborChatMessage.erstellt_am.asc()).all()
        idx = next((i for i, m in enumerate(all_msgs) if m.id == message_id), 0)
        context = all_msgs[max(0, idx - 2): min(len(all_msgs), idx + 3)]
        snapshot = [{"id": m.id, "sender_user_id": m.sender_user_id, "body": m.body, "created": m.erstellt_am.isoformat() if m.erstellt_am else ""} for m in context]
        report = NeighborReport(
            reporter_user_id=reporter_user_id,
            reported_user_id=msg.sender_user_id,
            post_id=conv.post_id,
            conversation_id=conversation_id,
            message_id=message_id,
            report_type="Nachricht",
            reason=reason if reason in REPORT_REASONS else "Sonstiges",
            detail=str(detail or "")[:1500],
            message_snapshot=msg.body[:3000],
            context_snapshot=json.dumps(snapshot, ensure_ascii=False),
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        return report
    finally:
        db.close()


def report_post(post_id: int, reporter_user_id: int, reason: str, detail: str) -> NeighborReport | None:
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id).first()
        if not post or post.user_id == reporter_user_id:
            return None
        report = NeighborReport(
            reporter_user_id=reporter_user_id,
            reported_user_id=post.user_id,
            post_id=post_id,
            report_type="Beitrag",
            reason=reason if reason in REPORT_REASONS else "Sonstiges",
            detail=str(detail or "")[:1500],
            message_snapshot=f"{post.title}\n\n{post.description}"[:5000],
            context_snapshot="[]",
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        return report
    finally:
        db.close()


def admin_overview() -> dict[str, Any]:
    db = SessionLocal()
    try:
        posts = db.query(NeighborPost, PWAUser, NeighborPostMeta).outerjoin(PWAUser, PWAUser.id == NeighborPost.user_id).outerjoin(NeighborPostMeta, NeighborPostMeta.post_id == NeighborPost.id).filter(NeighborPost.aktiv.is_(True)).order_by(NeighborPost.erstellt_am.desc()).limit(200).all()
        reports = db.query(NeighborReport).filter(NeighborReport.status == "Offen").order_by(NeighborReport.erstellt_am.desc()).limit(100).all()
        restrictions = db.query(NeighborRestriction, PWAUser).outerjoin(PWAUser, PWAUser.id == NeighborRestriction.user_id).filter(or_(NeighborRestriction.permanent.is_(True), NeighborRestriction.suspended_until >= _now(), NeighborRestriction.warning_count > 0)).order_by(NeighborRestriction.aktualisiert_am.desc()).limit(100).all()
        report_rows = []
        for report in reports:
            reporter = db.query(PWAUser).filter(PWAUser.id == report.reporter_user_id).first()
            reported = db.query(PWAUser).filter(PWAUser.id == report.reported_user_id).first() if report.reported_user_id else None
            report_rows.append({
                "id": report.id,
                "type": report.report_type,
                "reason": report.reason,
                "detail": report.detail,
                "snapshot": report.message_snapshot,
                "context": report.context_snapshot,
                "created": report.erstellt_am,
                "post_id": report.post_id,
                "conversation_id": report.conversation_id,
                "reporter": getattr(reporter, "name", "Unbekannt") if reporter else "Unbekannt",
                "reported": getattr(reported, "name", "Unbekannt") if reported else "Unbekannt",
                "reported_user_id": report.reported_user_id,
            })
        return {
            "posts": [_post_dict(post, user, meta) for post, user, meta in posts],
            "reports": report_rows,
            "restrictions": [{"user_id": r.user_id, "name": getattr(u, "name", "Unbekannt") if u else "Unbekannt", "warning_count": r.warning_count, "until": r.suspended_until, "permanent": r.permanent, "reason": r.reason} for r, u in restrictions],
        }
    finally:
        db.close()


def set_post_status(post_id: int, status: str) -> dict[str, Any] | None:
    if status not in {"Prüfung", "Freigegeben", "Erledigt", "Abgelehnt"}:
        return None
    db = SessionLocal()
    try:
        post = db.query(NeighborPost).filter(NeighborPost.id == post_id).first()
        if not post:
            return None
        post.status = status
        post.aktualisiert_am = _now()
        meta = _ensure_meta(db, post_id)
        if status == "Freigegeben":
            meta.hidden = False
            if not meta.expires_at or meta.expires_at < _now():
                meta.expires_at = _now() + timedelta(days=30)
        elif status == "Erledigt":
            meta.done_at = _now()
        elif status == "Abgelehnt":
            meta.hidden = True
        meta.aktualisiert_am = _now()
        db.commit()
        return {"id": post.id, "user_id": post.user_id, "title": post.title, "category": post.category, "status": post.status}
    finally:
        db.close()


def apply_report_action(report_id: int, action: str, resolution: str = "") -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        report = db.query(NeighborReport).filter(NeighborReport.id == report_id).first()
        if not report:
            return None
        target_user_id = report.reported_user_id
        if action == "warn" and target_user_id:
            restriction = db.query(NeighborRestriction).filter(NeighborRestriction.user_id == target_user_id).first() or NeighborRestriction(user_id=target_user_id)
            if not restriction.id:
                db.add(restriction)
            restriction.warning_count = int(restriction.warning_count or 0) + 1
            restriction.reason = (resolution or report.reason)[:1500]
            restriction.aktualisiert_am = _now()
        elif action == "lock_chat" and report.conversation_id:
            conv = db.query(NeighborConversation).filter(NeighborConversation.id == report.conversation_id).first()
            if conv:
                conv.status = "Gesperrt"
                conv.aktualisiert_am = _now()
        elif action == "hide_post" and report.post_id:
            post = db.query(NeighborPost).filter(NeighborPost.id == report.post_id).first()
            if post:
                post.status = "Abgelehnt"
                post.aktualisiert_am = _now()
                meta = _ensure_meta(db, post.id)
                meta.hidden = True
                meta.aktualisiert_am = _now()
        elif action in {"suspend_7", "suspend_30", "permanent"} and target_user_id:
            restriction = db.query(NeighborRestriction).filter(NeighborRestriction.user_id == target_user_id).first() or NeighborRestriction(user_id=target_user_id)
            if not restriction.id:
                db.add(restriction)
            restriction.reason = (resolution or report.reason)[:1500]
            restriction.aktualisiert_am = _now()
            if action == "permanent":
                restriction.permanent = True
                restriction.suspended_until = None
            else:
                restriction.permanent = False
                restriction.suspended_until = _now() + timedelta(days=7 if action == "suspend_7" else 30)
        report.status = "Erledigt"
        report.admin_action = str(action or "close")[:80]
        report.resolution = str(resolution or "")[:3000]
        report.erledigt_am = _now()
        db.commit()
        return {"report_id": report.id, "action": action, "target_user_id": target_user_id, "post_id": report.post_id, "conversation_id": report.conversation_id}
    finally:
        db.close()


def clear_restriction(user_id: int) -> bool:
    db = SessionLocal()
    try:
        row = db.query(NeighborRestriction).filter(NeighborRestriction.user_id == user_id).first()
        if not row:
            return False
        row.permanent = False
        row.suspended_until = None
        row.reason = ""
        row.aktualisiert_am = _now()
        db.commit()
        return True
    finally:
        db.close()
