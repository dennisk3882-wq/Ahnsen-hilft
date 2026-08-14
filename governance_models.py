from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint

from database import Base


class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True)
    username = Column(String(80), unique=True, index=True, nullable=False)
    display_name = Column(String(120), nullable=False)
    password_hash = Column(Text, nullable=False)
    role = Column(String(40), default="read_only", nullable=False)
    totp_secret = Column(String(64), default="", nullable=False)
    totp_enabled = Column(Boolean, default=False, nullable=False)
    totp_pending_secret = Column(String(64), default="", nullable=False)
    recovery_codes_hash = Column(Text, default="", nullable=False)
    session_version = Column(Integer, default=1, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CaseHistory(Base):
    __tablename__ = "case_history"

    id = Column(Integer, primary_key=True)
    ticket = Column(String(80), index=True, nullable=False)
    actor = Column(String(120), default="Verwaltung", nullable=False)
    action = Column(String(80), nullable=False)
    old_value = Column(Text, default="", nullable=False)
    new_value = Column(Text, default="", nullable=False)
    public_note = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ContentRevision(Base):
    __tablename__ = "content_revisions"
    __table_args__ = (
        UniqueConstraint("area", "object_id", "version", name="uq_content_revision"),
    )

    id = Column(Integer, primary_key=True)
    area = Column(String(80), index=True, nullable=False)
    object_id = Column(String(120), index=True, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    state = Column(String(30), default="Entwurf", nullable=False)
    title = Column(String(200), default="", nullable=False)
    payload_json = Column(Text, default="{}", nullable=False)
    actor = Column(String(120), default="Verwaltung", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
