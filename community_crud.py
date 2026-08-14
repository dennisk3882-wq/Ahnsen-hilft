from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy import func, inspect, or_
from sqlalchemy.exc import IntegrityError

from community_models import (
    AuditLog,
    CitizenMessage,
    CitizenPreference,
    CivicItem,
    GeneratedReport,
    Idea,
    IdeaComment,
    IdeaSupport,
    MunicipalityConfig,
    NeighborPost,
    NotificationQueue,
)
from database import Base, SessionLocal, engine
from pwa_models import PWAUser


SUPPORTED_LANGUAGES = {
    "de": "Deutsch",
    "en": "English",
    "pl": "Polski",
    "uk": "Українська",
    "tr": "Türkçe",
}
PUSH_MODES = {"sofort", "taeglich", "woechentlich"}


def init_community_db() -> None:
    Base.metadata.create_all(bind=engine)
    existing = {column["name"] for column in inspect(engine).get_columns("citizen_preferences")}
    for field in ("a11y_large", "a11y_contrast", "a11y_simple", "a11y_reduce"):
        if field not in existing:
            with engine.begin() as connection:
                connection.exec_driver_sql(f"ALTER TABLE citizen_preferences ADD COLUMN {field} BOOLEAN NOT NULL DEFAULT FALSE")
    db = SessionLocal()
    try:
        if not db.query(MunicipalityConfig).first():
            db.add(MunicipalityConfig())
            db.commit()
    finally:
        db.close()


def get_preference(user_id: int, create: bool = True) -> CitizenPreference | None:
    db = SessionLocal()
    try:
        item = db.query(CitizenPreference).filter(CitizenPreference.user_id == user_id).first()
        if not item and create:
            item = CitizenPreference(user_id=user_id)
            db.add(item)
            db.commit()
            db.refresh(item)
        return item
    finally:
        db.close()


def save_preference(
    user_id: int,
    *,
    language: str | None = None,
    push_mode: str | None = None,
    digest_hour: int | None = None,
    quiet_start: str | None = None,
    quiet_end: str | None = None,
    accessibility: dict[str, bool] | None = None,
) -> CitizenPreference:
    db = SessionLocal()
    try:
        item = db.query(CitizenPreference).filter(CitizenPreference.user_id == user_id).first()
        if not item:
            item = CitizenPreference(user_id=user_id)
            db.add(item)
        if language in SUPPORTED_LANGUAGES:
            item.language = language
        if push_mode in PUSH_MODES:
            item.push_mode = push_mode
        if digest_hour is not None:
            try:
                item.digest_hour = max(0, min(int(digest_hour), 23))
            except (TypeError, ValueError):
                pass
        if quiet_start is not None and len(str(quiet_start)) <= 5:
            item.quiet_start = str(quiet_start)
        if quiet_end is not None and len(str(quiet_end)) <= 5:
            item.quiet_end = str(quiet_end)
        for field, enabled in (accessibility or {}).items():
            if field in {"a11y_large", "a11y_contrast", "a11y_simple", "a11y_reduce"}:
                setattr(item, field, bool(enabled))
        item.aktualisiert_am = datetime.utcnow()
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def get_municipality_config() -> MunicipalityConfig:
    db = SessionLocal()
    try:
        item = db.query(MunicipalityConfig).first()
        if item:
            return item
        item = MunicipalityConfig()
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def update_municipality_config(values: dict) -> MunicipalityConfig:
    db = SessionLocal()
    try:
        item = db.query(MunicipalityConfig).first() or MunicipalityConfig()
        if not item.id:
            db.add(item)
        for field, limit in (
            ("platform_name", 120),
            ("municipality_name", 120),
            ("claim", 180),
            ("postal_code", 20),
            ("primary_color", 20),
            ("accent_color", 20),
            ("warning_terms", 500),
        ):
            if field in values:
                setattr(item, field, str(values.get(field) or "").strip()[:limit])
        item.aktualisiert_am = datetime.utcnow()
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def create_message(
    user_id: int,
    subject: str,
    body: str,
    *,
    category: str = "info",
    url: str = "/nachrichten",
    sender_user_id: int | None = None,
    sender_label: str | None = None,
) -> CitizenMessage:
    if not sender_label:
        try:
            from platform_runtime import get_platform_snapshot
            sender_label = get_platform_snapshot().get("contact_name") or "Verwaltung"
        except Exception:
            sender_label = "Verwaltung"
    db = SessionLocal()
    try:
        item = CitizenMessage(
            user_id=user_id,
            sender_user_id=sender_user_id,
            sender_label=str(sender_label or "Verwaltung")[:120],
            subject=str(subject or "Nachricht")[:180],
            body=str(body or "")[:5000],
            category=str(category or "info")[:60],
            url=str(url or "/nachrichten")[:500],
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def get_messages(user_id: int, limit: int = 100) -> list[CitizenMessage]:
    db = SessionLocal()
    try:
        return (
            db.query(CitizenMessage)
            .filter(CitizenMessage.user_id == user_id)
            .order_by(CitizenMessage.erstellt_am.desc())
            .limit(limit)
            .all()
        )
    finally:
        db.close()


def count_unread_messages(user_id: int) -> int:
    db = SessionLocal()
    try:
        return (
            db.query(CitizenMessage)
            .filter(CitizenMessage.user_id == user_id)
            .filter(CitizenMessage.gelesen_am.is_(None))
            .count()
        )
    finally:
        db.close()


def mark_message_read(user_id: int, message_id: int) -> bool:
    db = SessionLocal()
    try:
        item = (
            db.query(CitizenMessage)
            .filter(CitizenMessage.id == message_id)
            .filter(CitizenMessage.user_id == user_id)
            .first()
        )
        if not item:
            return False
        if item.gelesen_am is None:
            item.gelesen_am = datetime.utcnow()
            db.commit()
        return True
    finally:
        db.close()


def get_all_users(limit: int = 500) -> list[PWAUser]:
    db = SessionLocal()
    try:
        return (
            db.query(PWAUser)
            .filter(PWAUser.aktiv.is_(True))
            .order_by(PWAUser.name.asc())
            .limit(limit)
            .all()
        )
    finally:
        db.close()


def create_idea(user_id: int, title: str, description: str, category: str) -> Idea:
    db = SessionLocal()
    try:
        item = Idea(
            user_id=user_id,
            title=str(title or "")[:180],
            description=str(description or "")[:4000],
            category=str(category or "Allgemein")[:80],
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def get_ideas(limit: int = 100, include_inactive: bool = False) -> list[dict]:
    db = SessionLocal()
    try:
        query = db.query(Idea)
        if not include_inactive:
            query = query.filter(Idea.aktiv.is_(True))
        ideas = query.order_by(Idea.erstellt_am.desc()).limit(limit).all()
        result = []
        for idea in ideas:
            result.append({
                "idea": idea,
                "supports": db.query(IdeaSupport).filter(IdeaSupport.idea_id == idea.id).count(),
                "comments": (
                    db.query(IdeaComment)
                    .filter(IdeaComment.idea_id == idea.id)
                    .filter(IdeaComment.aktiv.is_(True))
                    .count()
                ),
            })
        return result
    finally:
        db.close()


def get_idea(idea_id: int) -> dict | None:
    db = SessionLocal()
    try:
        idea = db.query(Idea).filter(Idea.id == idea_id).filter(Idea.aktiv.is_(True)).first()
        if not idea:
            return None
        comments = (
            db.query(IdeaComment, PWAUser)
            .outerjoin(PWAUser, PWAUser.id == IdeaComment.user_id)
            .filter(IdeaComment.idea_id == idea_id)
            .filter(IdeaComment.aktiv.is_(True))
            .order_by(IdeaComment.erstellt_am.asc())
            .all()
        )
        return {
            "idea": idea,
            "supports": db.query(IdeaSupport).filter(IdeaSupport.idea_id == idea_id).count(),
            "comments": comments,
        }
    finally:
        db.close()


def user_supports_idea(idea_id: int, user_id: int) -> bool:
    db = SessionLocal()
    try:
        return bool(
            db.query(IdeaSupport)
            .filter(IdeaSupport.idea_id == idea_id)
            .filter(IdeaSupport.user_id == user_id)
            .first()
        )
    finally:
        db.close()


def toggle_idea_support(idea_id: int, user_id: int) -> bool:
    db = SessionLocal()
    try:
        existing = (
            db.query(IdeaSupport)
            .filter(IdeaSupport.idea_id == idea_id)
            .filter(IdeaSupport.user_id == user_id)
            .first()
        )
        if existing:
            db.delete(existing)
            db.commit()
            return False
        db.add(IdeaSupport(idea_id=idea_id, user_id=user_id))
        try:
            db.commit()
            return True
        except IntegrityError:
            db.rollback()
            return True
    finally:
        db.close()


def add_idea_comment(idea_id: int, user_id: int, body: str) -> IdeaComment:
    db = SessionLocal()
    try:
        item = IdeaComment(idea_id=idea_id, user_id=user_id, body=str(body or "")[:1500])
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def update_idea_status(idea_id: int, status: str) -> Idea | None:
    allowed = {"Eingereicht", "Wird geprüft", "Umsetzbar", "Geplant", "Umgesetzt", "Nicht umsetzbar"}
    if status not in allowed:
        return None
    db = SessionLocal()
    try:
        item = db.query(Idea).filter(Idea.id == idea_id).first()
        if item:
            item.status = status
            item.aktualisiert_am = datetime.utcnow()
            db.commit()
            db.refresh(item)
        return item
    finally:
        db.close()


def create_neighbor_post(user_id: int, kind: str, category: str, title: str, description: str) -> NeighborPost:
    db = SessionLocal()
    try:
        item = NeighborPost(
            user_id=user_id,
            kind="Biete" if kind == "Biete" else "Suche",
            category=str(category or "Alltag")[:80],
            title=str(title or "")[:180],
            description=str(description or "")[:3000],
            status="Prüfung",
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def get_neighbor_posts(*, admin: bool = False, limit: int = 100) -> list[tuple[NeighborPost, PWAUser | None]]:
    db = SessionLocal()
    try:
        query = db.query(NeighborPost, PWAUser).outerjoin(PWAUser, PWAUser.id == NeighborPost.user_id)
        query = query.filter(NeighborPost.aktiv.is_(True))
        if not admin:
            query = query.filter(NeighborPost.status == "Freigegeben")
        return query.order_by(NeighborPost.erstellt_am.desc()).limit(limit).all()
    finally:
        db.close()


def update_neighbor_status(post_id: int, status: str) -> NeighborPost | None:
    if status not in {"Prüfung", "Freigegeben", "Erledigt", "Abgelehnt"}:
        return None
    db = SessionLocal()
    try:
        item = db.query(NeighborPost).filter(NeighborPost.id == post_id).first()
        if item:
            item.status = status
            item.aktualisiert_am = datetime.utcnow()
            db.commit()
            db.refresh(item)
        return item
    finally:
        db.close()


def get_neighbor_post(post_id: int) -> NeighborPost | None:
    db = SessionLocal()
    try:
        return db.query(NeighborPost).filter(NeighborPost.id == post_id).first()
    finally:
        db.close()


def create_civic_item(kind: str, title: str, body: str, date_text: str, location: str, source_url: str) -> CivicItem:
    db = SessionLocal()
    try:
        item = CivicItem(
            kind=str(kind or "Sitzung")[:40],
            title=str(title or "")[:200],
            body=str(body or "")[:6000],
            date_text=str(date_text or "")[:80],
            location=str(location or "")[:160],
            source_url=str(source_url or "")[:500],
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def get_civic_items(limit: int = 100, include_inactive: bool = False) -> list[CivicItem]:
    db = SessionLocal()
    try:
        query = db.query(CivicItem)
        if not include_inactive:
            query = query.filter(CivicItem.aktiv.is_(True))
        return query.order_by(CivicItem.erstellt_am.desc()).limit(limit).all()
    finally:
        db.close()


def audit_event(actor: str, action: str, object_type: str = "", object_id: str = "", detail: str = "") -> None:
    db = SessionLocal()
    try:
        db.add(AuditLog(
            actor=str(actor or "system")[:160],
            action=str(action or "")[:120],
            object_type=str(object_type or "")[:80],
            object_id=str(object_id or "")[:120],
            detail=str(detail or "")[:4000],
        ))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def get_audit_logs(search: str = "", limit: int = 300) -> list[AuditLog]:
    db = SessionLocal()
    try:
        query = db.query(AuditLog)
        if search:
            like = f"%{search}%"
            query = query.filter(or_(
                AuditLog.actor.ilike(like), AuditLog.action.ilike(like),
                AuditLog.object_type.ilike(like), AuditLog.object_id.ilike(like),
                AuditLog.detail.ilike(like),
            ))
        return query.order_by(AuditLog.erstellt_am.desc()).limit(limit).all()
    finally:
        db.close()


def queue_notification(user_id: int, category: str, title: str, body: str, url: str, dedupe_key: str) -> bool:
    db = SessionLocal()
    try:
        existing = (
            db.query(NotificationQueue)
            .filter(NotificationQueue.user_id == user_id)
            .filter(NotificationQueue.dedupe_key == str(dedupe_key)[:220])
            .filter(NotificationQueue.zugestellt_am.is_(None))
            .first()
        )
        if existing:
            return False
        db.add(NotificationQueue(
            user_id=user_id,
            category=str(category or "")[:80],
            title=str(title or "")[:180],
            body=str(body or "")[:1200],
            url=str(url or "/")[:500],
            dedupe_key=str(dedupe_key or "")[:220],
        ))
        db.commit()
        return True
    finally:
        db.close()


def get_due_digest_users(now: datetime) -> list[tuple[PWAUser, CitizenPreference]]:
    db = SessionLocal()
    try:
        rows = (
            db.query(PWAUser, CitizenPreference)
            .join(CitizenPreference, CitizenPreference.user_id == PWAUser.id)
            .filter(PWAUser.aktiv.is_(True))
            .filter(CitizenPreference.push_mode.in_(["taeglich", "woechentlich"]))
            .filter(CitizenPreference.digest_hour == now.hour)
            .all()
        )
        result = []
        for user, pref in rows:
            if pref.push_mode == "woechentlich" and now.weekday() != 0:
                continue
            result.append((user, pref))
        return result
    finally:
        db.close()


def get_pending_notifications(user_id: int, limit: int = 40) -> list[NotificationQueue]:
    db = SessionLocal()
    try:
        return (
            db.query(NotificationQueue)
            .filter(NotificationQueue.user_id == user_id)
            .filter(NotificationQueue.zugestellt_am.is_(None))
            .order_by(NotificationQueue.erstellt_am.asc())
            .limit(limit)
            .all()
        )
    finally:
        db.close()


def mark_notifications_delivered(ids: list[int]) -> None:
    if not ids:
        return
    db = SessionLocal()
    try:
        db.query(NotificationQueue).filter(NotificationQueue.id.in_(ids)).update(
            {NotificationQueue.zugestellt_am: datetime.utcnow()}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def dashboard_stats() -> dict:
    from crud import statistik as report_stats
    from dgh_crud import get_alle_dgh_termine
    from veranstaltungen_crud import get_aktive_veranstaltungen

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        month_start = datetime(now.year, now.month, 1)
        return {
            "users": db.query(PWAUser).filter(PWAUser.aktiv.is_(True)).count(),
            "messages_unread": db.query(CitizenMessage).filter(CitizenMessage.gelesen_am.is_(None)).count(),
            "ideas": db.query(Idea).filter(Idea.aktiv.is_(True)).count(),
            "ideas_month": db.query(Idea).filter(Idea.erstellt_am >= month_start).count(),
            "supports": db.query(IdeaSupport).count(),
            "comments": db.query(IdeaComment).filter(IdeaComment.aktiv.is_(True)).count(),
            "neighbor_pending": db.query(NeighborPost).filter(NeighborPost.status == "Prüfung").count(),
            "neighbor_active": db.query(NeighborPost).filter(NeighborPost.status == "Freigegeben").count(),
            "civic": db.query(CivicItem).filter(CivicItem.aktiv.is_(True)).count(),
            "reports": report_stats(),
            "dgh_total": len(get_alle_dgh_termine()),
            "events": len(get_aktive_veranstaltungen()),
        }
    finally:
        db.close()


def generate_monthly_report(period_key: str | None = None) -> GeneratedReport:
    now = datetime.utcnow()
    if not period_key:
        period_key = now.strftime("%Y-%m")
    stats = dashboard_stats()
    payload = {
        "period": period_key,
        "generated_at": now.isoformat(timespec="seconds"),
        "users": stats["users"],
        "reports": stats["reports"],
        "dgh_total": stats["dgh_total"],
        "events": stats["events"],
        "ideas": stats["ideas"],
        "ideas_month": stats["ideas_month"],
        "supports": stats["supports"],
        "comments": stats["comments"],
        "neighbor_active": stats["neighbor_active"],
        "neighbor_pending": stats["neighbor_pending"],
        "civic_items": stats["civic"],
    }
    title = f"Digitalbericht {period_key}"
    db = SessionLocal()
    try:
        item = GeneratedReport(period_key=period_key, title=title, body=json.dumps(payload, ensure_ascii=False, indent=2))
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def get_reports(search: str = "", limit: int = 100) -> list[GeneratedReport]:
    db = SessionLocal()
    try:
        query = db.query(GeneratedReport)
        if search:
            like = f"%{search}%"
            query = query.filter(or_(
                GeneratedReport.period_key.ilike(like),
                GeneratedReport.title.ilike(like),
                GeneratedReport.body.ilike(like),
            ))
        return query.order_by(GeneratedReport.erstellt_am.desc()).limit(limit).all()
    finally:
        db.close()
