from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime

from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from database import Base, SessionLocal, engine
from pwa_models import PWAUser, PushDelivery, PushSubscription


PUSH_PREFERENCE_DEFAULTS = {
    "push_meldungen": True,
    "push_dgh": True,
    "push_muell": False,
    "push_veranstaltungen": False,
    "push_aktuelles": False,
    "push_buergerinfo": False,
    "push_vereine": False,
    "push_feuerwehr": False,
    "push_verkehr": False,
    "push_warnungen": False,
    "push_unwetter": False,
    "push_bevoelkerungsschutz": False,
    "push_hochwasser": False,
}

PUSH_PREFERENCE_FIELDS = {
    "push_meldungen": "Status eigener Mängelmeldungen",
    "push_dgh": "Status eigener DGH-Anfragen",
    "push_muell": "Müllabfuhr",
    "push_veranstaltungen": "Veranstaltungen",
    "push_aktuelles": "Aktuelles aus Ahnsen",
    "push_buergerinfo": "Bürgerinformationen",
    "push_vereine": "Vereine & Dorfleben",
    "push_feuerwehr": "Feuerwehr & Sicherheit",
    "push_verkehr": "Verkehr & Straßensperrungen",
    "push_warnungen": "Wichtige Hinweise der Verwaltung",
    "push_unwetter": "Amtliche Wetter- & Unwetterwarnungen",
    "push_bevoelkerungsschutz": "Amtliche Bevölkerungsschutz-Warnungen",
    "push_hochwasser": "Hochwasser- & Überflutungswarnungen",
}

PUSH_BROADCAST_CATEGORIES = {
    key: PUSH_PREFERENCE_FIELDS[key]
    for key in (
        "push_veranstaltungen",
        "push_aktuelles",
        "push_buergerinfo",
        "push_vereine",
        "push_feuerwehr",
        "push_verkehr",
        "push_warnungen",
        "push_muell",
    )
}

OFFICIAL_WARNING_CATEGORIES = {
    key: PUSH_PREFERENCE_FIELDS[key]
    for key in ("push_unwetter", "push_bevoelkerungsschutz", "push_hochwasser")
}


def init_pwa_db() -> None:
    Base.metadata.create_all(bind=engine)

    existing = {column["name"] for column in inspect(engine).get_columns("pwa_users")}
    for column, default in PUSH_PREFERENCE_DEFAULTS.items():
        if column in existing:
            continue
        sql_default = "TRUE" if default else "FALSE"
        with engine.begin() as conn:
            conn.exec_driver_sql(
                f"ALTER TABLE pwa_users ADD COLUMN {column} BOOLEAN NOT NULL DEFAULT {sql_default}"
            )
        print(f"Spalte pwa_users.{column} hinzugefügt.")

    existing = {column["name"] for column in inspect(engine).get_columns("pwa_users")}
    if "warn_min_level" not in existing:
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "ALTER TABLE pwa_users ADD COLUMN warn_min_level INTEGER NOT NULL DEFAULT 2"
            )
        print("Spalte pwa_users.warn_min_level hinzugefügt.")


def normalize_email(value: str) -> str:
    return str(value or "").strip().casefold()[:254]


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    n, r, p = 2**14, 8, 1
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=64
    )
    return f"scrypt${n}${r}${p}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = encoded.split("$", 5)
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_unb64(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=64,
        )
        return hmac.compare_digest(digest, _unb64(expected))
    except (TypeError, ValueError):
        return False


def create_user(email: str, password: str, name: str, telefon: str = "") -> PWAUser:
    db = SessionLocal()
    try:
        user = PWAUser(
            email=normalize_email(email),
            password_hash=hash_password(password),
            name=str(name or "").strip()[:120],
            telefon=str(telefon or "").strip()[:60],
            aktiv=True,
            push_muell=False,
            push_meldungen=True,
            push_dgh=True,
            push_veranstaltungen=False,
            push_aktuelles=False,
            push_buergerinfo=False,
            push_vereine=False,
            push_feuerwehr=False,
            push_verkehr=False,
            push_warnungen=False,
            push_unwetter=False,
            push_bevoelkerungsschutz=False,
            push_hochwasser=False,
            warn_min_level=2,
            erstellt_am=datetime.utcnow(),
            aktualisiert_am=datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except IntegrityError as error:
        db.rollback()
        raise ValueError("Für diese E-Mail-Adresse besteht bereits ein Konto.") from error
    finally:
        db.close()


def get_user_by_email(email: str) -> PWAUser | None:
    db = SessionLocal()
    try:
        return (
            db.query(PWAUser)
            .filter(PWAUser.email == normalize_email(email))
            .filter(PWAUser.aktiv.is_(True))
            .first()
        )
    finally:
        db.close()


def get_user_by_id(user_id: int | None) -> PWAUser | None:
    if not user_id:
        return None
    db = SessionLocal()
    try:
        return (
            db.query(PWAUser)
            .filter(PWAUser.id == user_id)
            .filter(PWAUser.aktiv.is_(True))
            .first()
        )
    finally:
        db.close()


def update_user_profile(
    user_id: int,
    name: str,
    telefon: str,
    push_muell: bool,
    push_preferences: dict[str, bool] | None = None,
    warn_min_level: int = 2,
) -> PWAUser | None:
    db = SessionLocal()
    try:
        user = db.query(PWAUser).filter(PWAUser.id == user_id).first()
        if user:
            user.name = str(name or "").strip()[:120]
            user.telefon = str(telefon or "").strip()[:60]
            preferences = dict(push_preferences or {})
            preferences["push_muell"] = bool(push_muell)
            for field in PUSH_PREFERENCE_DEFAULTS:
                setattr(user, field, bool(preferences.get(field, False)))
            try:
                level = int(warn_min_level)
            except (TypeError, ValueError):
                level = 2
            user.warn_min_level = max(1, min(level, 4))
            user.aktualisiert_am = datetime.utcnow()
            db.commit()
            db.refresh(user)
        return user
    finally:
        db.close()


def update_user_password(user_id: int, new_password: str) -> bool:
    db = SessionLocal()
    try:
        user = db.query(PWAUser).filter(PWAUser.id == user_id).first()
        if not user:
            return False
        user.password_hash = hash_password(new_password)
        user.session_version = int(user.session_version or 1) + 1
        user.aktualisiert_am = datetime.utcnow()
        db.commit()
        return True
    finally:
        db.close()


def upsert_push_subscription(
    user_id: int,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str = "",
) -> PushSubscription:
    db = SessionLocal()
    try:
        item = (
            db.query(PushSubscription)
            .filter(PushSubscription.endpoint == endpoint)
            .first()
        )
        if item:
            item.user_id = user_id
            item.p256dh = p256dh
            item.auth = auth
            item.user_agent = str(user_agent or "")[:500]
            item.aktualisiert_am = datetime.utcnow()
        else:
            item = PushSubscription(
                user_id=user_id,
                endpoint=endpoint,
                p256dh=p256dh,
                auth=auth,
                user_agent=str(user_agent or "")[:500],
            )
            db.add(item)
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def delete_push_subscription(endpoint: str, user_id: int | None = None) -> None:
    db = SessionLocal()
    try:
        query = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint)
        if user_id:
            query = query.filter(PushSubscription.user_id == user_id)
        item = query.first()
        if item:
            db.delete(item)
            db.commit()
    finally:
        db.close()


def get_push_subscriptions_for_user(user_id: int) -> list[PushSubscription]:
    db = SessionLocal()
    try:
        return (
            db.query(PushSubscription)
            .filter(PushSubscription.user_id == user_id)
            .all()
        )
    finally:
        db.close()


def has_push_subscription(user_id: int) -> bool:
    db = SessionLocal()
    try:
        return (
            db.query(PushSubscription)
            .filter(PushSubscription.user_id == user_id)
            .count()
            > 0
        )
    finally:
        db.close()


def user_wants_push(user_id: int, category: str) -> bool:
    if category not in PUSH_PREFERENCE_DEFAULTS:
        return False
    db = SessionLocal()
    try:
        user = (
            db.query(PWAUser)
            .filter(PWAUser.id == user_id)
            .filter(PWAUser.aktiv.is_(True))
            .first()
        )
        return bool(user and getattr(user, category, False))
    finally:
        db.close()


def get_users_for_push_category(category: str) -> list[PWAUser]:
    if category not in PUSH_PREFERENCE_DEFAULTS:
        return []
    db = SessionLocal()
    try:
        column = getattr(PWAUser, category)
        return (
            db.query(PWAUser)
            .filter(PWAUser.aktiv.is_(True))
            .filter(column.is_(True))
            .all()
        )
    finally:
        db.close()


def get_users_with_waste_push() -> list[PWAUser]:
    db = SessionLocal()
    try:
        return (
            db.query(PWAUser)
            .filter(PWAUser.aktiv.is_(True))
            .filter(PWAUser.push_muell.is_(True))
            .all()
        )
    finally:
        db.close()


def delivery_already_sent(user_id: int, delivery_key: str) -> bool:
    db = SessionLocal()
    try:
        return (
            db.query(PushDelivery)
            .filter(PushDelivery.user_id == user_id)
            .filter(PushDelivery.delivery_key == delivery_key)
            .count()
            > 0
        )
    finally:
        db.close()


def mark_delivery_sent(user_id: int, delivery_key: str) -> None:
    db = SessionLocal()
    try:
        db.add(PushDelivery(user_id=user_id, delivery_key=delivery_key[:180]))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    finally:
        db.close()
