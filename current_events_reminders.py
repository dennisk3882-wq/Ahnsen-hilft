from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from database import Base, SessionLocal, engine
from current_events_models import EventReminder
from push_service import push_configured, send_user_notification
from veranstaltungen_models import Veranstaltung


BERLIN = ZoneInfo("Europe/Berlin")


def init_event_reminders_db() -> None:
    Base.metadata.create_all(bind=engine)


def reminder_active(user_id: int, event_id: int) -> bool:
    init_event_reminders_db()
    db = SessionLocal()
    try:
        return bool(
            db.query(EventReminder)
            .filter(EventReminder.user_id == user_id, EventReminder.event_id == event_id)
            .first()
        )
    finally:
        db.close()


def toggle_reminder(user_id: int, event_id: int) -> bool:
    init_event_reminders_db()
    db = SessionLocal()
    try:
        row = (
            db.query(EventReminder)
            .filter(EventReminder.user_id == user_id, EventReminder.event_id == event_id)
            .first()
        )
        if row:
            db.delete(row)
            db.commit()
            return False
        db.add(EventReminder(user_id=user_id, event_id=event_id, reminder_type="vorabend"))
        db.commit()
        return True
    finally:
        db.close()


def _event_date(value: str | None):
    try:
        return datetime.strptime(str(value or "").strip(), "%d.%m.%Y").date()
    except (TypeError, ValueError):
        return None


def dispatch_event_reminders(now: datetime | None = None) -> int:
    """Send individual reminders on the evening before an event.

    The Render job runs every 30 minutes. Both 18:00 and 18:30 are accepted as
    a recovery window; sent_for_date prevents duplicate delivery.
    """
    init_event_reminders_db()
    now = now.astimezone(BERLIN) if now and now.tzinfo else (now.replace(tzinfo=BERLIN) if now else datetime.now(BERLIN))
    if now.hour != 18:
        return 0
    if not push_configured():
        return 0

    target_date = now.date() + timedelta(days=1)
    target_key = target_date.isoformat()
    db = SessionLocal()
    delivered = 0
    try:
        rows = (
            db.query(EventReminder, Veranstaltung)
            .join(Veranstaltung, Veranstaltung.id == EventReminder.event_id)
            .filter(Veranstaltung.aktiv == "Ja")
            .all()
        )
        for reminder, event in rows:
            if _event_date(event.datum) != target_date:
                continue
            if reminder.sent_for_date == target_key:
                continue
            when = str(event.uhrzeit or "").strip()
            where = str(event.ort or "").strip()
            details = []
            if when:
                details.append(f"um {when}")
            if where:
                details.append(f"in {where}")
            suffix = " " + " ".join(details) if details else ""
            sent = send_user_notification(
                reminder.user_id,
                "Morgen in Ahnsen",
                f"{event.titel}{suffix}.",
                f"/aktuelles-termine/{event.id}",
                f"event-reminder-{event.id}-{target_key}",
                None,
                _force_immediate=True,
            )
            if sent:
                reminder.sent_for_date = target_key
                delivered += 1
        db.commit()
    finally:
        db.close()
    return delivered
