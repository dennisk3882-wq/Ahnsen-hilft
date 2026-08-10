from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint

from database import Base


class NeighborPostMeta(Base):
    __tablename__ = "neighbor_post_meta"
    __table_args__ = (UniqueConstraint("post_id", name="uq_neighbor_post_meta_post"),)

    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, index=True, nullable=False)
    location_label = Column(String(80), default="Ahnsen", nullable=False)
    urgent = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    done_at = Column(DateTime, nullable=True)
    hidden = Column(Boolean, default=False, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborConversation(Base):
    __tablename__ = "neighbor_conversations"
    __table_args__ = (
        UniqueConstraint("post_id", "responder_user_id", name="uq_neighbor_conversation_post_responder"),
    )

    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, index=True, nullable=False)
    owner_user_id = Column(Integer, index=True, nullable=False)
    responder_user_id = Column(Integer, index=True, nullable=False)
    status = Column(String(30), default="Aktiv", nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborChatMessage(Base):
    __tablename__ = "neighbor_chat_messages"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, index=True, nullable=False)
    sender_user_id = Column(Integer, index=True, nullable=False)
    body = Column(Text, nullable=False)
    gelesen_am = Column(DateTime, nullable=True)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborSavedPost(Base):
    __tablename__ = "neighbor_saved_posts"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_neighbor_saved_post"),)

    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborBlock(Base):
    __tablename__ = "neighbor_blocks"
    __table_args__ = (UniqueConstraint("blocker_user_id", "blocked_user_id", name="uq_neighbor_block"),)

    id = Column(Integer, primary_key=True)
    blocker_user_id = Column(Integer, index=True, nullable=False)
    blocked_user_id = Column(Integer, index=True, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborReport(Base):
    __tablename__ = "neighbor_reports"

    id = Column(Integer, primary_key=True)
    reporter_user_id = Column(Integer, index=True, nullable=False)
    reported_user_id = Column(Integer, index=True, nullable=True)
    post_id = Column(Integer, index=True, nullable=True)
    conversation_id = Column(Integer, index=True, nullable=True)
    message_id = Column(Integer, index=True, nullable=True)
    report_type = Column(String(30), default="Nachricht", nullable=False)
    reason = Column(String(100), default="Sonstiges", nullable=False)
    detail = Column(Text, default="", nullable=False)
    message_snapshot = Column(Text, default="", nullable=False)
    context_snapshot = Column(Text, default="", nullable=False)
    status = Column(String(30), default="Offen", nullable=False)
    resolution = Column(Text, default="", nullable=False)
    admin_action = Column(String(80), default="", nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    erledigt_am = Column(DateTime, nullable=True)


class NeighborRestriction(Base):
    __tablename__ = "neighbor_restrictions"
    __table_args__ = (UniqueConstraint("user_id", name="uq_neighbor_restriction_user"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)
    warning_count = Column(Integer, default=0, nullable=False)
    suspended_until = Column(DateTime, nullable=True)
    permanent = Column(Boolean, default=False, nullable=False)
    reason = Column(Text, default="", nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborCategorySubscription(Base):
    __tablename__ = "neighbor_category_subscriptions"
    __table_args__ = (UniqueConstraint("user_id", "category", name="uq_neighbor_category_subscription"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)
    category = Column(String(80), index=True, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
