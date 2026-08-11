from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint

from database import Base


class EventReminder(Base):
    __tablename__ = "event_reminders"
    __table_args__ = (UniqueConstraint("user_id", "event_id", name="uq_event_reminder_user_event"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    event_id = Column(Integer, nullable=False, index=True)
    reminder_type = Column(String, default="vorabend")
    sent_for_date = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
