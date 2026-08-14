from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from database import Base


class Meldung(Base):
    __tablename__ = "meldungen"

    id = Column(Integer, primary_key=True, index=True)
    ticket = Column(String, unique=True, index=True)
    status = Column(String, default="Offen")
    art = Column(String)
    ort = Column(String)
    beschreibung = Column(Text)
    foto_vorhanden = Column(String, default="Nein")
    foto_base64 = Column(Text, nullable=True)
    whatsapp_absender = Column(String)
    pwa_user_id = Column(Integer, index=True, nullable=True)
    interne_notiz = Column(Text, default="")
    duplicate_candidate_ticket = Column(String, nullable=True, index=True)
    duplicate_score = Column(Integer, default=0)
    duplicate_state = Column(String, default="")
    duplicate_of_ticket = Column(String, nullable=True, index=True)
    duplicate_checked_at = Column(DateTime, nullable=True)
    assigned_to = Column(String(120), default="")
    responsibility = Column(String(120), default="")
    priority = Column(String(20), default="Normal")
    due_at = Column(DateTime, nullable=True)
    public_note = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow)
    erstellt_am = Column(DateTime, default=datetime.utcnow)
