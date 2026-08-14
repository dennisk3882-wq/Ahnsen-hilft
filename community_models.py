from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint

from database import Base


class CitizenPreference(Base):
    __tablename__ = "citizen_preferences"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, unique=True, index=True, nullable=False)
    language = Column(String(10), default="de", nullable=False)
    push_mode = Column(String(20), default="sofort", nullable=False)
    digest_hour = Column(Integer, default=18, nullable=False)
    quiet_start = Column(String(5), default="22:00", nullable=False)
    quiet_end = Column(String(5), default="07:00", nullable=False)
    a11y_large = Column(Boolean, default=False, nullable=False)
    a11y_contrast = Column(Boolean, default=False, nullable=False)
    a11y_simple = Column(Boolean, default=False, nullable=False)
    a11y_reduce = Column(Boolean, default=False, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class CitizenMessage(Base):
    __tablename__ = "citizen_messages"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)
    sender_user_id = Column(Integer, index=True, nullable=True)
    sender_label = Column(String(120), default="Gemeinde Ahnsen", nullable=False)
    subject = Column(String(180), nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String(60), default="info", nullable=False)
    url = Column(String(500), default="/nachrichten", nullable=False)
    gelesen_am = Column(DateTime, nullable=True)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class Idea(Base):
    __tablename__ = "community_ideas"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)
    title = Column(String(180), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(80), default="Allgemein", nullable=False)
    status = Column(String(40), default="Eingereicht", nullable=False)
    aktiv = Column(Boolean, default=True, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class IdeaSupport(Base):
    __tablename__ = "community_idea_supports"
    __table_args__ = (UniqueConstraint("idea_id", "user_id", name="uq_idea_support"),)

    id = Column(Integer, primary_key=True)
    idea_id = Column(Integer, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class IdeaComment(Base):
    __tablename__ = "community_idea_comments"

    id = Column(Integer, primary_key=True)
    idea_id = Column(Integer, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)
    body = Column(Text, nullable=False)
    aktiv = Column(Boolean, default=True, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborPost(Base):
    __tablename__ = "neighbor_posts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)
    kind = Column(String(20), default="Suche", nullable=False)
    category = Column(String(80), default="Alltag", nullable=False)
    title = Column(String(180), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(40), default="Prüfung", nullable=False)
    aktiv = Column(Boolean, default=True, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class CivicItem(Base):
    __tablename__ = "civic_items"

    id = Column(Integer, primary_key=True)
    kind = Column(String(40), default="Sitzung", nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(Text, default="", nullable=False)
    date_text = Column(String(80), default="", nullable=False)
    location = Column(String(160), default="", nullable=False)
    source_url = Column(String(500), default="", nullable=False)
    aktiv = Column(Boolean, default=True, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "platform_audit_log"

    id = Column(Integer, primary_key=True)
    actor = Column(String(160), default="system", nullable=False)
    action = Column(String(120), nullable=False)
    object_type = Column(String(80), default="", nullable=False)
    object_id = Column(String(120), default="", nullable=False)
    detail = Column(Text, default="", nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class GeneratedReport(Base):
    __tablename__ = "platform_reports"

    id = Column(Integer, primary_key=True)
    period_key = Column(String(40), index=True, nullable=False)
    title = Column(String(180), nullable=False)
    body = Column(Text, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class MunicipalityConfig(Base):
    __tablename__ = "municipality_config"

    id = Column(Integer, primary_key=True)
    platform_name = Column(String(120), default="Ahnsen hilft", nullable=False)
    municipality_name = Column(String(120), default="Ahnsen", nullable=False)
    claim = Column(String(180), default="Dein Dorf. Unsere Gemeinschaft.", nullable=False)
    postal_code = Column(String(20), default="31708", nullable=False)
    primary_color = Column(String(20), default="#174936", nullable=False)
    accent_color = Column(String(20), default="#8da77a", nullable=False)
    warning_terms = Column(String(500), default="Ahnsen|Bad Eilsen|Eilsen", nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NotificationQueue(Base):
    __tablename__ = "smart_notification_queue"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)
    category = Column(String(80), default="", nullable=False)
    title = Column(String(180), nullable=False)
    body = Column(Text, nullable=False)
    url = Column(String(500), default="/", nullable=False)
    dedupe_key = Column(String(220), default="", index=True, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    zugestellt_am = Column(DateTime, nullable=True)
