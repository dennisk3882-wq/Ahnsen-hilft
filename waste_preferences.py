from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from database import Base, SessionLocal
from pwa_models import PWAUser


DEFAULT_WASTE_REMINDER_TIME = "18:00"
ALLOWED_WASTE_REMINDER_TIMES = {
    "18:00": "Am Vorabend um 18:00 Uhr",
    "20:00": "Am Vorabend um 20:00 Uhr",
    "06:30": "Am Abholtag um 06:30 Uhr",
}


class WasteReminderPreference(Base):
    __tablename__ = "pwa_waste_reminder_preferences"

    user_id = Column(Integer, primary_key=True)
    reminder_time = Column(String(5), nullable=False, default=DEFAULT_WASTE_REMINDER_TIME)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


def normalize_waste_reminder_time(value: str | None) -> str:
    value = str(value or "").strip()
    return value if value in ALLOWED_WASTE_REMINDER_TIMES else DEFAULT_WASTE_REMINDER_TIME


def get_waste_reminder_time(user_id: int | None) -> str:
    if not user_id:
        return DEFAULT_WASTE_REMINDER_TIME
    db = SessionLocal()
    try:
        item = (
            db.query(WasteReminderPreference)
            .filter(WasteReminderPreference.user_id == int(user_id))
            .first()
        )
        return normalize_waste_reminder_time(item.reminder_time if item else None)
    finally:
        db.close()


def get_waste_reminder_times(user_ids: list[int]) -> dict[int, str]:
    ids = sorted({int(user_id) for user_id in user_ids if user_id})
    if not ids:
        return {}
    db = SessionLocal()
    try:
        rows = (
            db.query(WasteReminderPreference)
            .filter(WasteReminderPreference.user_id.in_(ids))
            .all()
        )
        result = {int(row.user_id): normalize_waste_reminder_time(row.reminder_time) for row in rows}
        for user_id in ids:
            result.setdefault(user_id, DEFAULT_WASTE_REMINDER_TIME)
        return result
    finally:
        db.close()


def set_waste_push_setting(user_id: int, enabled: bool, reminder_time: str | None) -> dict:
    reminder_time = normalize_waste_reminder_time(reminder_time)
    db = SessionLocal()
    try:
        user = (
            db.query(PWAUser)
            .filter(PWAUser.id == int(user_id))
            .filter(PWAUser.aktiv.is_(True))
            .first()
        )
        if not user:
            raise ValueError("Bürgerkonto nicht gefunden")

        user.push_muell = bool(enabled)
        user.aktualisiert_am = datetime.utcnow()

        preference = (
            db.query(WasteReminderPreference)
            .filter(WasteReminderPreference.user_id == int(user_id))
            .first()
        )
        if not preference:
            preference = WasteReminderPreference(
                user_id=int(user_id),
                reminder_time=reminder_time,
                aktualisiert_am=datetime.utcnow(),
            )
            db.add(preference)
        else:
            preference.reminder_time = reminder_time
            preference.aktualisiert_am = datetime.utcnow()

        db.commit()
        return {
            "enabled": bool(user.push_muell),
            "reminder_time": reminder_time,
            "label": ALLOWED_WASTE_REMINDER_TIMES[reminder_time],
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
