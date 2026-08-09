from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint

from database import Base


class CouncilMeeting(Base):
    __tablename__ = "council_archive_meetings"

    id = Column(Integer, primary_key=True)
    meeting_date = Column(DateTime, index=True, nullable=False)
    title = Column(String(300), nullable=False)
    organization = Column(String(200), default="Gemeinderat Ahnsen", nullable=False)
    location = Column(String(240), default="", nullable=False)
    summary = Column(Text, default="", nullable=False)
    source_url = Column(String(1000), default="", nullable=False)
    source_label = Column(String(180), default="Ratsinformationssystem Samtgemeinde Eilsen", nullable=False)
    published = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CouncilDocument(Base):
    __tablename__ = "council_archive_documents"
    __table_args__ = (UniqueConstraint("meeting_id", "sha256", name="uq_council_document_hash"),)

    id = Column(Integer, primary_key=True)
    meeting_id = Column(Integer, ForeignKey("council_archive_meetings.id"), index=True, nullable=False)
    kind = Column(String(100), default="Niederschrift / Protokoll", nullable=False)
    title = Column(String(300), nullable=False)
    filename = Column(String(260), nullable=False)
    mime_type = Column(String(100), default="application/pdf", nullable=False)
    file_data = Column(LargeBinary, nullable=False)
    size_bytes = Column(Integer, default=0, nullable=False)
    sha256 = Column(String(64), nullable=False)
    extracted_text = Column(Text, default="", nullable=False)
    source_url = Column(String(1000), default="", nullable=False)
    published = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
