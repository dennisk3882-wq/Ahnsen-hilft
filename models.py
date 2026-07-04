from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
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
    interne_notiz = Column(Text, default="")
    erstellt_am = Column(DateTime, default=datetime.utcnow)
