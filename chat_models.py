from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from database import Base


class ChatKontakt(Base):
    __tablename__ = "chat_kontakte"

    id = Column(Integer, primary_key=True, index=True)
    whatsapp_nummer = Column(String, nullable=False, unique=True, index=True)
    name = Column(String)
    zuletzt_aktiv = Column(DateTime, default=datetime.utcnow, index=True)
    erstellt_am = Column(DateTime, default=datetime.utcnow)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow)


class ChatNachricht(Base):
    __tablename__ = "chat_nachrichten"

    id = Column(Integer, primary_key=True, index=True)
    whatsapp_nummer = Column(String, nullable=False, index=True)
    richtung = Column(String, nullable=False, index=True)
    nachricht_typ = Column(String, default="text")
    inhalt = Column(Text)
    erstellt_am = Column(DateTime, default=datetime.utcnow, index=True)
