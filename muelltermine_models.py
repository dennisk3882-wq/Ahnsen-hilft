from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Integer, String, Text

from database import Base


class Muelltermin(Base):
    __tablename__ = "muelltermine"

    id = Column(Integer, primary_key=True, index=True)
    datum = Column(Date, nullable=False, index=True)
    jahr = Column(Integer, nullable=False, index=True)
    wochentag = Column(String)
    abfuhrarten = Column(Text, nullable=False)
    feiertagsabweichung = Column(String, default="Nein")

    quelle = Column(String)
    adresse = Column(String)
    importiert_am = Column(DateTime, default=datetime.utcnow, index=True)


class MuellAbo(Base):
    __tablename__ = "muell_abos"

    id = Column(Integer, primary_key=True, index=True)
    whatsapp_absender = Column(String, nullable=False, unique=True, index=True)
    aktiv = Column(String, default="Ja", nullable=False, index=True)
    erstellt_am = Column(DateTime, default=datetime.utcnow)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow)
    letzte_erinnerung_fuer = Column(Date, nullable=True)
