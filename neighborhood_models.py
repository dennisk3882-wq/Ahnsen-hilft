from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint

from database import Base


class NeighborPostMeta(Base):
    __tablename__ = "neighbor_post_meta"
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, unique=True, index=True, nullable=False)
    urgent = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=True)


class NeighborConversation(Base):
    __tablename__ = "neighbor_conversations"
    __table_args__ = (UniqueConstraint("post_id", "participant_a", "participant_b", name="uq_neighbor_conv"),)
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, index=True, nullable=False)
    participant_a = Column(Integer, index=True, nullable=False)
    participant_b = Column(Integer, index=True, nullable=False)
    status = Column(String(30), default="offen", nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborChatMessage(Base):
    __tablename__ = "neighbor_chat_messages"
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, index=True, nullable=False)
    sender_user_id = Column(Integer, index=True, nullable=False)
    body = Column(Text, nullable=False)
    aktiv = Column(Boolean, default=True, nullable=False)
    gelesen_am = Column(DateTime, nullable=True)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborFavorite(Base):
    __tablename__ = "neighbor_favorites"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_neighbor_fav"),)
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)


class NeighborCategorySubscription(Base):
    __tablename__ = "neighbor_category_subscriptions"
    __table_args__ = (UniqueConstraint("user_id", "category", name="uq_neighbor_sub"),)
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)
    category = Column(String(80), nullable=False)


class NeighborReport(Base):
    __tablename__ = "neighbor_reports"
    id = Column(Integer, primary_key=True)
    reporter_user_id = Column(Integer, index=True, nullable=False)
    target_type = Column(String(30), nullable=False)
    target_id = Column(Integer, index=True, nullable=False)
    reason = Column(String(80), nullable=False)
    detail = Column(Text, default="", nullable=False)
    status = Column(String(30), default="offen", nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    erledigt_am = Column(DateTime, nullable=True)


class NeighborRestriction(Base):
    __tablename__ = "neighbor_restrictions"
    user_id = Column(Integer, primary_key=True)
    blocked = Column(Boolean, default=False, nullable=False)
    warning_count = Column(Integer, default=0, nullable=False)
    reason = Column(String(300), default="", nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)
