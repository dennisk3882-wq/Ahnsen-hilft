from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from database import Base


class GemeindeEinstellung(Base):
    __tablename__ = "gemeinde_einstellungen"

    id = Column(Integer, primary_key=True, index=True)
    schluessel = Column(String, nullable=False, unique=True, index=True)
    wert = Column(Text, default="")
    aktualisiert_am = Column(DateTime, default=datetime.utcnow)
