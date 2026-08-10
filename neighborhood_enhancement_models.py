from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint

from database import Base


class NeighborPostPublicDetail(Base):
    __tablename__ = "neighbor_post_public_details"
    __table_args__ = (UniqueConstraint("post_id", name="uq_neighbor_post_public_detail"),)

    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, index=True, nullable=False)
    location_label = Column(String(80), default="Ahnsen", nullable=False)
    done_at = Column(DateTime, nullable=True)
    hidden = Column(Boolean, default=False, nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborUserBlock(Base):
    __tablename__ = "neighbor_user_blocks"
    __table_args__ = (UniqueConstraint("blocker_user_id", "blocked_user_id", name="uq_neighbor_user_block"),)

    id = Column(Integer, primary_key=True)
    blocker_user_id = Column(Integer, index=True, nullable=False)
    blocked_user_id = Column(Integer, index=True, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborReportSnapshot(Base):
    __tablename__ = "neighbor_report_snapshots"
    __table_args__ = (UniqueConstraint("report_id", name="uq_neighbor_report_snapshot"),)

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, index=True, nullable=False)
    reported_user_id = Column(Integer, index=True, nullable=True)
    post_id = Column(Integer, index=True, nullable=True)
    conversation_id = Column(Integer, index=True, nullable=True)
    message_id = Column(Integer, index=True, nullable=True)
    message_snapshot = Column(Text, default="", nullable=False)
    context_snapshot = Column(Text, default="[]", nullable=False)
    admin_action = Column(String(80), default="", nullable=False)
    resolution = Column(Text, default="", nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class NeighborRestrictionSchedule(Base):
    __tablename__ = "neighbor_restriction_schedules"
    __table_args__ = (UniqueConstraint("user_id", name="uq_neighbor_restriction_schedule"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)
    suspended_until = Column(DateTime, nullable=True)
    permanent = Column(Boolean, default=False, nullable=False)
    reason = Column(Text, default="", nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)
