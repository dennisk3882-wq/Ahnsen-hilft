from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from database import Base


class DGHTermin(Base):
    __tablename__ = "dgh_termine"

    id = Column(Integer, primary_key=True, index=True)
    datum = Column(String, nullable=False)
    uhrzeit = Column(String)
    anlass = Column(String)
    name = Column(String)
    telefon = Column(String)
    email = Column(String)
    status = Column(String, default="Anfrage")
    aktiv = Column(String, default="Ja")
    kommentar = Column(Text)
    whatsapp_absender = Column(String)
    pwa_user_id = Column(Integer, index=True, nullable=True)
    erstellt_am = Column(DateTime, default=datetime.utcnow)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow)
