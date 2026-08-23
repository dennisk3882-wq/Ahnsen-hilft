from __future__ import annotations

import json
import hashlib
import hmac
import logging
import os
from datetime import datetime, timedelta

from sqlalchemy import and_, func, inspect, or_
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
LOGGER = logging.getLogger(__name__)


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
        now = datetime.utcnow()
        values = {
            "actor": str(actor or "system")[:160], "action": str(action or "")[:120],
            "object_type": str(object_type or "")[:80], "object_id": str(object_id or "")[:120],
            "detail": str(detail or "")[:4000],
        }
        previous = db.query(AuditLog).filter(AuditLog.entry_hash != "").order_by(AuditLog.id.desc()).first()
        previous_hash = str(previous.entry_hash or "") if previous else ""
        canonical = "|".join((previous_hash, now.isoformat(timespec="microseconds"), values["actor"], values["action"], values["object_type"], values["object_id"], values["detail"]))
        secret = str(os.getenv("AUDIT_SIGNING_SECRET") or os.getenv("DASHBOARD_SESSION_SECRET") or "audit-development-key").encode("utf-8")
        entry_hash = hmac.new(secret, canonical.encode("utf-8"), hashlib.sha256).hexdigest()
        db.add(AuditLog(**values, previous_hash=previous_hash, entry_hash=entry_hash, erstellt_am=now))
        db.commit()
    except Exception as error:
        db.rollback()
        LOGGER.exception("Audit entry could not be persisted")
        try:
            from system_diagnostics import record_system_event
            record_system_event(
                "audit_log",
                "error",
                f"Audit-Protokollierung fehlgeschlagen: {type(error).__name__}: {error}",
                {"actor": str(actor or "system")[:160], "action": str(action or "")[:120]},
            )
        except Exception:
            LOGGER.exception("Audit failure could not be written to system diagnostics")
    finally:
        db.close()


def get_audit_logs(search: str = "", limit: int = 300, *, actor: str = "", action: str = "", object_type: str = "", date_from: datetime | None = None, date_to: datetime | None = None) -> list[AuditLog]:
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
        if actor:
            query = query.filter(AuditLog.actor.ilike(f"%{actor}%"))
        if action:
            query = query.filter(AuditLog.action.ilike(f"%{action}%"))
        if object_type:
            query = query.filter(AuditLog.object_type == object_type)
        if date_from:
            query = query.filter(AuditLog.erstellt_am >= date_from)
        if date_to:
            query = query.filter(AuditLog.erstellt_am < date_to)
        return query.order_by(AuditLog.erstellt_am.desc()).limit(limit).all()
    finally:
        db.close()


def audit_filter_options() -> dict[str, list[str]]:
    db = SessionLocal()
    try:
        return {
            "actors": [str(value[0]) for value in db.query(AuditLog.actor).distinct().order_by(AuditLog.actor).all() if value[0]],
            "object_types": [str(value[0]) for value in db.query(AuditLog.object_type).distinct().order_by(AuditLog.object_type).all() if value[0]],
        }
    finally:
        db.close()


def verify_audit_chain(limit: int = 5000) -> dict[str, int | bool]:
    db = SessionLocal()
    try:
        rows = db.query(AuditLog).order_by(AuditLog.id.asc()).limit(max(1, limit)).all()
    finally:
        db.close()
    secret = str(os.getenv("AUDIT_SIGNING_SECRET") or os.getenv("DASHBOARD_SESSION_SECRET") or "audit-development-key").encode("utf-8")
    sealed = [item for item in rows if item.entry_hash]
    invalid = 0
    previous_hash = ""
    for item in sealed:
        canonical = "|".join((str(item.previous_hash or ""), item.erstellt_am.isoformat(timespec="microseconds"), item.actor, item.action, item.object_type, item.object_id, item.detail))
        expected = hmac.new(secret, canonical.encode("utf-8"), hashlib.sha256).hexdigest()
        linked = hmac.compare_digest(str(item.previous_hash or ""), previous_hash)
        signed = hmac.compare_digest(expected, str(item.entry_hash or ""))
        if not linked or not signed:
            invalid += 1
        previous_hash = str(item.entry_hash or "")
    try:
        retention_days = max(90, min(int(os.getenv("AUDIT_RETENTION_DAYS", "730")), 3650))
    except ValueError:
        retention_days = 730
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    older_than_policy = sum(1 for item in rows if item.erstellt_am and item.erstellt_am < cutoff)
    return {
        "valid": invalid == 0,
        "checked": len(sealed),
        "invalid": invalid,
        "legacy_unsealed": len(rows) - len(sealed),
        "retention_days": retention_days,
        "older_than_policy": older_than_policy,
    }


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
    from dgh_models import DGHTermin
    from models import Meldung
    from muelltermine_models import Muelltermin
    from veranstaltungen_crud import get_aktive_veranstaltungen
    from veranstaltungen_models import Veranstaltung
    from pwa_models import PushSubscription
    from system_diagnostics import SystemEvent
    from warning_service import OfficialWarning, WarningPoll
    from governance_models import CaseHistory
    from platform_runtime import get_platform_snapshot

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        sla_days = int(get_platform_snapshot().get("report_sla_days", 14) or 14)
        month_start = datetime(now.year, now.month, 1)
        open_statuses = {"Offen", "In Bearbeitung", "Warten auf Rückmeldung"}
        open_reports = db.query(Meldung).filter(Meldung.status.in_(open_statuses))
        latest_waste_year = db.query(func.max(Muelltermin.jahr)).scalar()
        report_summary = report_stats()
        finished = db.query(Meldung).filter(Meldung.status == "Erledigt", Meldung.updated_at.isnot(None), Meldung.erstellt_am.isnot(None)).all()
        durations = [max(0.0, (item.updated_at - item.erstellt_am).total_seconds() / 86400) for item in finished if item.updated_at and item.erstellt_am]
        first_response_durations = []
        for item in db.query(Meldung).filter(Meldung.erstellt_am.isnot(None)).all():
            first = db.query(CaseHistory).filter(CaseHistory.ticket == item.ticket).order_by(CaseHistory.created_at.asc()).first()
            if first and first.created_at >= item.erstellt_am:
                first_response_durations.append((first.created_at - item.erstellt_am).total_seconds() / 3600)
        dgh_total = db.query(DGHTermin).count()
        dgh_confirmed = db.query(DGHTermin).filter(DGHTermin.status == "Bestätigt", DGHTermin.aktiv == "Ja").count()
        day_ago = now - timedelta(hours=24)
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
            "reports": report_summary,
            "reports_overdue": open_reports.filter(or_(and_(Meldung.due_at.isnot(None), Meldung.due_at < now), and_(Meldung.due_at.is_(None), Meldung.erstellt_am < now - timedelta(days=sla_days)))).count(),
            "reports_urgent": open_reports.filter(Meldung.priority == "Dringend").count(),
            "reports_unassigned": open_reports.filter(or_(Meldung.assigned_to == "", Meldung.assigned_to.is_(None))).count(),
            "reports_completion_rate": round((report_summary.get("erledigt", 0) / max(report_summary.get("gesamt", 0), 1)) * 100, 1),
            "reports_average_days": round(sum(durations) / len(durations), 1) if durations else 0.0,
            "reports_first_response_hours": round(sum(first_response_durations) / len(first_response_durations), 1) if first_response_durations else 0.0,
            "reports_sla_days": sla_days,
            "dgh_total": dgh_total,
            "dgh_pending": db.query(DGHTermin).filter(DGHTermin.status == "Anfrage", DGHTermin.aktiv == "Ja").count(),
            "dgh_confirmed": dgh_confirmed,
            "dgh_confirmation_rate": round((dgh_confirmed / max(dgh_total, 1)) * 100, 1),
            "waste_latest_year": int(latest_waste_year or 0),
            "events": len(get_aktive_veranstaltungen()),
            "events_without_image": db.query(Veranstaltung).filter(Veranstaltung.aktiv == "Ja", or_(Veranstaltung.bild_base64.is_(None), Veranstaltung.bild_base64 == "")).count(),
            "active_warnings": db.query(OfficialWarning).filter(OfficialWarning.active.is_(True), OfficialWarning.is_cancel.is_(False)).count(),
            "warning_source_errors": db.query(WarningPoll).filter(WarningPoll.status != "ok", WarningPoll.created_at >= day_ago).count(),
            "system_errors": db.query(SystemEvent).filter(SystemEvent.status == "error", SystemEvent.created_at >= day_ago).count(),
            "push_devices": db.query(PushSubscription).count(),
        }
    finally:
        db.close()


def _period_bounds(period_key: str | None) -> tuple[str, datetime, datetime]:
    now = datetime.utcnow()
    if not period_key:
        period_key = now.strftime("%Y-%m")
    try:
        start = datetime.strptime(period_key, "%Y-%m")
    except ValueError as error:
        raise ValueError("Der Berichtsmonat muss im Format JJJJ-MM angegeben werden.") from error
    end = datetime(start.year + (1 if start.month == 12 else 0), 1 if start.month == 12 else start.month + 1, 1)
    return period_key, start, end


def monthly_report_payload(period_key: str | None = None) -> dict:
    from dgh_models import DGHTermin
    from governance_models import CaseHistory
    from models import Meldung
    from pwa_models import PushSubscription
    from veranstaltungen_models import Veranstaltung

    period_key, start, end = _period_bounds(period_key)
    db = SessionLocal()
    try:
        reports_created = db.query(Meldung).filter(Meldung.erstellt_am >= start, Meldung.erstellt_am < end).all()
        reports_closed = db.query(Meldung).filter(Meldung.status == "Erledigt", Meldung.updated_at >= start, Meldung.updated_at < end).all()
        closed_durations = [max(0.0, (item.updated_at - item.erstellt_am).total_seconds() / 86400) for item in reports_closed if item.updated_at and item.erstellt_am]
        first_hours = []
        for item in reports_created:
            first = db.query(CaseHistory).filter(CaseHistory.ticket == item.ticket, CaseHistory.created_at >= item.erstellt_am).order_by(CaseHistory.created_at.asc()).first()
            if first:
                first_hours.append(max(0.0, (first.created_at - item.erstellt_am).total_seconds() / 3600))
        dgh_created = db.query(DGHTermin).filter(DGHTermin.erstellt_am >= start, DGHTermin.erstellt_am < end).all()
        confirmed_dates = set()
        for item in db.query(DGHTermin).filter(DGHTermin.status == "Bestätigt", DGHTermin.aktiv == "Ja").all():
            try:
                value = datetime.fromisoformat(str(item.datum)).date()
                if start.date() <= value < end.date(): confirmed_dates.add(value)
            except ValueError:
                continue
        days_in_month = (end - start).days
        return {
            "period": period_key,
            "generated_at": datetime.utcnow().isoformat(timespec="seconds"),
            "reports_created": len(reports_created),
            "reports_closed": len(reports_closed),
            "reports_open_created": sum(1 for item in reports_created if item.status in {"Offen", "In Bearbeitung", "Warten auf Rückmeldung"}),
            "reports_urgent_created": sum(1 for item in reports_created if item.priority == "Dringend"),
            "reports_completion_rate": round(len(reports_closed) / max(len(reports_created), 1) * 100, 1),
            "reports_average_days": round(sum(closed_durations) / len(closed_durations), 1) if closed_durations else 0.0,
            "reports_first_response_hours": round(sum(first_hours) / len(first_hours), 1) if first_hours else 0.0,
            "dgh_requests": len(dgh_created),
            "dgh_confirmed_requests": sum(1 for item in dgh_created if item.status == "Bestätigt"),
            "dgh_occupancy_days": len(confirmed_dates),
            "dgh_occupancy_rate": round(len(confirmed_dates) / max(days_in_month, 1) * 100, 1),
            "new_users": db.query(PWAUser).filter(PWAUser.erstellt_am >= start, PWAUser.erstellt_am < end).count(),
            "new_push_devices": db.query(PushSubscription).filter(PushSubscription.erstellt_am >= start, PushSubscription.erstellt_am < end).count(),
            "new_ideas": db.query(Idea).filter(Idea.erstellt_am >= start, Idea.erstellt_am < end).count(),
            "new_neighbor_posts": db.query(NeighborPost).filter(NeighborPost.erstellt_am >= start, NeighborPost.erstellt_am < end).count(),
            "citizen_messages": db.query(CitizenMessage).filter(CitizenMessage.erstellt_am >= start, CitizenMessage.erstellt_am < end).count(),
            "new_events": db.query(Veranstaltung).filter(Veranstaltung.erstellt_am >= start, Veranstaltung.erstellt_am < end).count(),
        }
    finally:
        db.close()


def generate_monthly_report(period_key: str | None = None) -> GeneratedReport:
    period_key, start, _end = _period_bounds(period_key)
    payload = monthly_report_payload(period_key)
    previous_end = start
    previous_start = datetime(previous_end.year - (1 if previous_end.month == 1 else 0), 12 if previous_end.month == 1 else previous_end.month - 1, 1)
    previous = monthly_report_payload(previous_start.strftime("%Y-%m"))
    comparable = ("reports_created", "reports_closed", "reports_average_days", "reports_first_response_hours", "dgh_requests", "dgh_occupancy_rate", "new_users", "new_ideas", "new_neighbor_posts")
    payload["comparison_previous_period"] = previous["period"]
    payload["comparison"] = {key: round(float(payload.get(key, 0)) - float(previous.get(key, 0)), 1) for key in comparable}
    current = dashboard_stats()
    payload["current_backlog"] = current["reports"].get("offen", 0) + current["reports"].get("bearbeitung", 0)
    payload["current_overdue"] = current["reports_overdue"]
    payload["current_unassigned"] = current["reports_unassigned"]
    payload["sla_days"] = current["reports_sla_days"]
    title = f"Digitalbericht {period_key}"
    db = SessionLocal()
    try:
        item = db.query(GeneratedReport).filter(GeneratedReport.period_key == period_key).order_by(GeneratedReport.id.desc()).first()
        if not item:
            item = GeneratedReport(period_key=period_key, title=title)
            db.add(item)
        item.title = title
        item.body = json.dumps(payload, ensure_ascii=False, indent=2)
        item.erstellt_am = datetime.utcnow()
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def ensure_previous_month_report() -> GeneratedReport:
    now = datetime.utcnow()
    start = datetime(now.year, now.month, 1)
    previous = start - timedelta(days=1)
    period_key = previous.strftime("%Y-%m")
    db = SessionLocal()
    try:
        existing = db.query(GeneratedReport).filter(GeneratedReport.period_key == period_key).order_by(GeneratedReport.id.desc()).first()
        if existing:
            db.expunge(existing)
            return existing
    finally:
        db.close()
    return generate_monthly_report(period_key)


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


def get_report(report_id: int) -> GeneratedReport | None:
    db = SessionLocal()
    try:
        return db.query(GeneratedReport).filter(GeneratedReport.id == int(report_id)).first()
    finally:
        db.close()
