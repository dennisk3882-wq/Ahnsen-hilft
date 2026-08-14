from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import struct
import time
from datetime import datetime

from sqlalchemy import inspect

from database import Base, SessionLocal, engine
from governance_models import AdminUser, CaseHistory, ContentRevision
from models import Meldung
from pwa_crud import hash_password, verify_password


ROLES = {
    "superadmin": "Vollzugriff",
    "municipality": "Gemeindeverwaltung",
    "mayor": "Bürgermeister",
    "public_works": "Bauhof",
    "fire_service": "Feuerwehr",
    "event_editor": "Veranstaltungsredaktion",
    "club_editor": "Vereinsredaktion",
    "read_only": "Nur lesen",
}

ROLE_PERMISSIONS = {
    "superadmin": {"*"},
    "municipality": {"cases", "content", "dgh", "waste", "events", "clubs", "warnings", "push", "messages", "moderation", "reports", "read"},
    "mayor": {"cases", "content", "messages", "reports", "read"},
    "public_works": {"cases", "read"},
    "fire_service": {"warnings", "content", "read"},
    "event_editor": {"events", "content", "read"},
    "club_editor": {"clubs", "content", "read"},
    "read_only": {"read"},
}


def init_governance_db() -> None:
    Base.metadata.create_all(bind=engine)
    existing = {item["name"] for item in inspect(engine).get_columns("meldungen")}
    migrations = {
        "assigned_to": "VARCHAR(120) DEFAULT ''",
        "responsibility": "VARCHAR(120) DEFAULT ''",
        "priority": "VARCHAR(20) DEFAULT 'Normal'",
        "due_at": "TIMESTAMP",
        "public_note": "TEXT DEFAULT ''",
        "updated_at": "TIMESTAMP",
    }
    for name, sql_type in migrations.items():
        if name not in existing:
            with engine.begin() as connection:
                connection.exec_driver_sql(f"ALTER TABLE meldungen ADD COLUMN {name} {sql_type}")

    username = str(os.getenv("DASHBOARD_USER") or "").strip()
    password = str(os.getenv("DASHBOARD_PASSWORD") or "")
    if username and password:
        db = SessionLocal()
        try:
            if not db.query(AdminUser).filter(AdminUser.username == username).first():
                db.add(AdminUser(username=username, display_name="Hauptadministration", password_hash=hash_password(password), role="superadmin"))
                db.commit()
        finally:
            db.close()


def get_admin(username: str) -> AdminUser | None:
    db = SessionLocal()
    try:
        return db.query(AdminUser).filter(AdminUser.username == str(username or "").strip(), AdminUser.active.is_(True)).first()
    finally:
        db.close()


def authenticate_admin(username: str, password: str) -> AdminUser | None:
    user = get_admin(username)
    return user if user and verify_password(password, user.password_hash) else None


def has_permission(role: str, permission: str) -> bool:
    permissions = ROLE_PERMISSIONS.get(role, set())
    return "*" in permissions or permission in permissions or (permission == "read" and bool(permissions))


def new_totp_secret() -> str:
    return base64.b32encode(os.urandom(20)).decode("ascii").rstrip("=")


def _totp(secret: str, counter: int) -> str:
    padded = secret + "=" * (-len(secret) % 8)
    key = base64.b32decode(padded, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 15
    number = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{number:06d}"


def verify_totp(secret: str, code: str, now: int | None = None) -> bool:
    value = "".join(ch for ch in str(code or "") if ch.isdigit())
    if len(value) != 6 or not secret:
        return False
    counter = int(now or time.time()) // 30
    return any(hmac.compare_digest(value, _totp(secret, counter + drift)) for drift in (-1, 0, 1))


def list_admins() -> list[AdminUser]:
    db = SessionLocal()
    try:
        return db.query(AdminUser).order_by(AdminUser.username.asc()).all()
    finally:
        db.close()


def save_admin(username: str, display_name: str, role: str, password: str = "") -> AdminUser:
    db = SessionLocal()
    try:
        item = db.query(AdminUser).filter(AdminUser.username == username).first()
        if not item:
            if len(password) < 12:
                raise ValueError("Ein neues Verwaltungskonto benötigt mindestens 12 Passwortzeichen.")
            item = AdminUser(username=username, password_hash=hash_password(password))
            db.add(item)
        elif password:
            if len(password) < 12:
                raise ValueError("Das Passwort benötigt mindestens 12 Zeichen.")
            item.password_hash = hash_password(password)
            item.session_version = int(item.session_version or 1) + 1
        item.display_name = display_name[:120] or username
        item.role = role if role in ROLES else "read_only"
        item.updated_at = datetime.utcnow()
        db.commit(); db.refresh(item); return item
    finally:
        db.close()


def begin_admin_totp(username: str) -> str:
    db = SessionLocal()
    try:
        item = db.query(AdminUser).filter(AdminUser.username == username).first()
        if not item:
            return ""
        item.totp_pending_secret = new_totp_secret()
        item.updated_at = datetime.utcnow(); db.commit(); db.refresh(item)
        return item.totp_pending_secret
    finally:
        db.close()


def _recovery_hash(code: str) -> str:
    normalized = str(code or "").strip().upper().replace(" ", "")
    key = str(os.getenv("PWA_SESSION_SECRET") or os.getenv("DASHBOARD_SESSION_SECRET") or "ahnsen-disabled").encode()
    return hmac.new(key, normalized.encode(), hashlib.sha256).hexdigest()


def confirm_admin_totp(username: str, code: str) -> list[str]:
    db = SessionLocal()
    try:
        item = db.query(AdminUser).filter(AdminUser.username == username).first()
        if not item or not verify_totp(item.totp_pending_secret, code):
            return []
        recovery_codes = [f"AHNS-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}" for _ in range(8)]
        item.totp_secret = item.totp_pending_secret
        item.totp_pending_secret = ""
        item.totp_enabled = True
        item.recovery_codes_hash = json.dumps([_recovery_hash(value) for value in recovery_codes])
        item.session_version = int(item.session_version or 1) + 1
        item.updated_at = datetime.utcnow(); db.commit()
        return recovery_codes
    finally:
        db.close()


def disable_admin_totp(username: str) -> None:
    db = SessionLocal()
    try:
        item = db.query(AdminUser).filter(AdminUser.username == username).first()
        if item:
            item.totp_secret = ""; item.totp_pending_secret = ""; item.totp_enabled = False
            item.recovery_codes_hash = ""; item.session_version = int(item.session_version or 1) + 1
            item.updated_at = datetime.utcnow(); db.commit()
    finally:
        db.close()


def verify_admin_second_factor(admin: AdminUser, code: str) -> bool:
    if not admin.totp_enabled:
        return True
    if verify_totp(admin.totp_secret, code):
        return True
    candidate = _recovery_hash(code)
    db = SessionLocal()
    try:
        item = db.query(AdminUser).filter(AdminUser.id == admin.id).first()
        hashes = json.loads(item.recovery_codes_hash or "[]") if item else []
        match = next((value for value in hashes if hmac.compare_digest(value, candidate)), None)
        if not match:
            return False
        hashes.remove(match)
        item.recovery_codes_hash = json.dumps(hashes); item.updated_at = datetime.utcnow(); db.commit()
        return True
    finally:
        db.close()


def set_admin_totp(username: str, enabled: bool) -> str:
    """Compatibility wrapper for older callers."""
    if not enabled:
        disable_admin_totp(username)
        return ""
    return begin_admin_totp(username)


def update_case(ticket: str, values: dict, actor: str = "Verwaltung") -> Meldung | None:
    db = SessionLocal()
    try:
        item = db.query(Meldung).filter(Meldung.ticket == ticket).first()
        if not item:
            return None
        tracked = ("status", "assigned_to", "responsibility", "priority", "due_at", "public_note")
        for field in tracked:
            if field not in values:
                continue
            old = getattr(item, field, None)
            new = values[field]
            if field == "due_at" and isinstance(new, str):
                try: new = datetime.fromisoformat(new) if new else None
                except ValueError: new = None
            if str(old or "") == str(new or ""):
                continue
            setattr(item, field, new)
            db.add(CaseHistory(ticket=ticket, actor=actor[:120], action=field, old_value=str(old or ""), new_value=str(new or ""), public_note=str(values.get("public_note") or "")[:2000]))
        item.updated_at = datetime.utcnow(); db.commit(); db.refresh(item); return item
    finally:
        db.close()


def case_history(ticket: str) -> list[CaseHistory]:
    db = SessionLocal()
    try:
        return db.query(CaseHistory).filter(CaseHistory.ticket == ticket).order_by(CaseHistory.created_at.desc()).all()
    finally:
        db.close()


def save_content_revision(area: str, object_id: str, state: str, title: str, payload: dict, actor: str) -> ContentRevision:
    db = SessionLocal()
    try:
        latest = db.query(ContentRevision).filter(ContentRevision.area == area, ContentRevision.object_id == object_id).order_by(ContentRevision.version.desc()).first()
        item = ContentRevision(area=area[:80], object_id=object_id[:120], version=(latest.version + 1 if latest else 1), state=state if state in {"Entwurf", "Prüfung", "Freigegeben", "Archiviert"} else "Entwurf", title=title[:200], payload_json=json.dumps(payload, ensure_ascii=False), actor=actor[:120])
        db.add(item); db.commit(); db.refresh(item); return item
    finally:
        db.close()
