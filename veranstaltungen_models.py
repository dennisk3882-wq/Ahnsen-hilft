from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime

from database import Base


class Veranstaltung(Base):
    __tablename__ = "veranstaltungen"

    id = Column(Integer, primary_key=True, index=True)

    titel = Column(String, nullable=False)
    datum = Column(String)
    uhrzeit = Column(String)
    ort = Column(String)
    kategorie = Column(String)
    beschreibung = Column(Text)
    ansprechpartner = Column(String)

    bild_base64 = Column(Text, nullable=True)

    aktiv = Column(String, default="Ja")
    erstellt_am = Column(DateTime, default=datetime.utcnow)
