from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint

from database import Base


class PWAUser(Base):
    __tablename__ = "pwa_users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(254), unique=True, index=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    name = Column(String(120), nullable=False)
    telefon = Column(String(60), default="")
    aktiv = Column(Boolean, default=True, nullable=False)
    push_muell = Column(Boolean, default=False, nullable=False)
    push_meldungen = Column(Boolean, default=True, nullable=False)
    push_dgh = Column(Boolean, default=True, nullable=False)
    push_veranstaltungen = Column(Boolean, default=False, nullable=False)
    push_aktuelles = Column(Boolean, default=False, nullable=False)
    push_buergerinfo = Column(Boolean, default=False, nullable=False)
    push_vereine = Column(Boolean, default=False, nullable=False)
    push_feuerwehr = Column(Boolean, default=False, nullable=False)
    push_verkehr = Column(Boolean, default=False, nullable=False)
    push_warnungen = Column(Boolean, default=False, nullable=False)
    push_unwetter = Column(Boolean, default=False, nullable=False)
    push_bevoelkerungsschutz = Column(Boolean, default=False, nullable=False)
    push_hochwasser = Column(Boolean, default=False, nullable=False)
    warn_min_level = Column(Integer, default=2, nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class PushSubscription(Base):
    __tablename__ = "pwa_push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    endpoint = Column(Text, unique=True, nullable=False)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    user_agent = Column(String(500), default="")
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
    aktualisiert_am = Column(DateTime, default=datetime.utcnow, nullable=False)


class PushDelivery(Base):
    __tablename__ = "pwa_push_deliveries"
    __table_args__ = (
        UniqueConstraint("user_id", "delivery_key", name="uq_pwa_push_delivery"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    delivery_key = Column(String(180), nullable=False)
    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)
