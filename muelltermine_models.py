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
