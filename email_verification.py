import hashlib
import secrets
from datetime import datetime, timedelta
from email.message import EmailMessage
from sqlalchemy import Column, DateTime, Integer, String
from database import Base, SessionLocal
from pwa_models import PWAUser


class EmailVerificationToken(Base):
    __tablename__ = "pwa_email_verification_tokens"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, index=True, nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)


def issue_token(user_id):
    token = secrets.token_urlsafe(32)
    with SessionLocal() as db:
        user = db.query(PWAUser).filter(PWAUser.id == user_id, PWAUser.aktiv.is_(True)).with_for_update().one()
        db.query(EmailVerificationToken).filter_by(user_id=user.id).delete()
        db.add(EmailVerificationToken(user_id=user.id, token_hash=hashlib.sha256(token.encode()).hexdigest(), expires_at=datetime.utcnow() + timedelta(hours=24)))
        db.commit()
    return token


def confirm_token(token):
    if not token or len(token) > 200:
        return False
    with SessionLocal() as db:
        row = db.query(EmailVerificationToken).filter_by(token_hash=hashlib.sha256(token.encode()).hexdigest()).with_for_update().first()
        if not row or row.expires_at < datetime.utcnow():
            return False
        user = db.get(PWAUser, row.user_id)
        if not user or not user.aktiv:
            return False
        user.email_verified_at = datetime.utcnow()
        db.delete(row)
        db.commit()
        return True


def send_verification(user):
    from email_service import _send_message, EMAIL_USER
    from platform_runtime import get_platform_snapshot
    cfg = get_platform_snapshot()
    url = str(cfg["public_base_url"]).rstrip("/") + "/email-bestaetigen#" + issue_token(user.id)
    message = EmailMessage()
    message["From"], message["To"] = EMAIL_USER, user.email
    message["Subject"] = cfg["platform_name"] + " – E-Mail-Adresse bestätigen"
    message.set_content("Bitte bestätige deine E-Mail-Adresse innerhalb von 24 Stunden:\n" + url + "\n\nFalls du kein Konto angelegt hast, ignoriere diese Nachricht.")
    _send_message(message)
