from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime

from sqlalchemy.exc import IntegrityError

from database import Base, SessionLocal, engine
from pwa_models import PWAUser, PushDelivery, PushSubscription


def init_pwa_db() -> None:
    Base.metadata.create_all(bind=engine)


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


def update_user_profile(user_id: int, name: str, telefon: str, push_muell: bool) -> PWAUser | None:
    db = SessionLocal()
    try:
        user = db.query(PWAUser).filter(PWAUser.id == user_id).first()
        if user:
            user.name = str(name or "").strip()[:120]
            user.telefon = str(telefon or "").strip()[:60]
            user.push_muell = bool(push_muell)
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
