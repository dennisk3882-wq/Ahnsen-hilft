from __future__ import annotations

import base64
import hashlib
import json
import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from sqlalchemy import Column, DateTime, Integer, LargeBinary, String, Text, inspect, text

from database import Base, SessionLocal, engine


BACKUP_FORMAT = "ahnsen-hilft-backup-v1"
ENCRYPTED_BACKUP_MAGIC = b"AHNSEN-BACKUP-V2\n"


class PlatformAsset(Base):
    __tablename__ = "platform_assets"
    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    filename = Column(String(255), default="", nullable=False)
    content_type = Column(String(100), nullable=False)
    content = Column(LargeBinary, nullable=False)
    checksum = Column(String(64), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class SchemaMigration(Base):
    __tablename__ = "schema_migrations"
    id = Column(Integer, primary_key=True)
    version = Column(String(80), unique=True, index=True, nullable=False)
    description = Column(String(255), nullable=False)
    applied_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class RateLimitEvent(Base):
    __tablename__ = "rate_limit_events"
    id = Column(Integer, primary_key=True)
    bucket = Column(String(50), index=True, nullable=False)
    client_hash = Column(String(64), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)


def _columns(table: str) -> set[str]:
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return set()
    return {item["name"] for item in inspector.get_columns(table)}


def _add_column(table: str, name: str, sql_type: str) -> None:
    if name in _columns(table):
        return
    with engine.begin() as connection:
        connection.exec_driver_sql(f'ALTER TABLE "{table}" ADD COLUMN "{name}" {sql_type}')


def run_migrations() -> None:
    """Apply and record small, idempotent production schema migrations."""
    Base.metadata.create_all(bind=engine)
    steps = (
        ("2026-08-14-pwa-session-v1", "Bürgersitzungen widerrufbar", "pwa_users", "session_version", "INTEGER NOT NULL DEFAULT 1"),
        ("2026-08-14-admin-session-v1", "Verwaltungssitzungen widerrufbar", "admin_users", "session_version", "INTEGER NOT NULL DEFAULT 1"),
        ("2026-08-14-admin-2fa-pending", "Bestätigte 2FA-Einrichtung", "admin_users", "totp_pending_secret", "VARCHAR(64) NOT NULL DEFAULT ''"),
        ("2026-08-14-admin-recovery", "2FA-Wiederherstellungscodes", "admin_users", "recovery_codes_hash", "TEXT NOT NULL DEFAULT ''"),
        ("2026-08-15-admin-last-login", "Letzte erfolgreiche Verwaltungsanmeldung", "admin_users", "last_login_at", "TIMESTAMP"),
        ("2026-08-15-content-reviewed-by", "Vier-Augen-Prüfung von Inhaltsversionen", "content_revisions", "reviewed_by", "VARCHAR(120) NOT NULL DEFAULT ''"),
        ("2026-08-15-content-reviewed-at", "Prüfzeitpunkt von Inhaltsversionen", "content_revisions", "reviewed_at", "TIMESTAMP"),
        ("2026-08-15-content-applied-at", "Veröffentlichungszeitpunkt von Inhaltsversionen", "content_revisions", "applied_at", "TIMESTAMP"),
        ("2026-08-15-content-source", "Quelle einer wiederhergestellten Inhaltsversion", "content_revisions", "source_revision_id", "INTEGER"),
        ("2026-08-15-audit-previous-hash", "Verkettete Audit-Prüfsumme", "platform_audit_log", "previous_hash", "VARCHAR(64) NOT NULL DEFAULT ''"),
        ("2026-08-15-audit-entry-hash", "Signierte Audit-Prüfsumme", "platform_audit_log", "entry_hash", "VARCHAR(64) NOT NULL DEFAULT ''"),
    )
    db = SessionLocal()
    try:
        for version, description, table, column, sql_type in steps:
            _add_column(table, column, sql_type)
            if not db.query(SchemaMigration).filter(SchemaMigration.version == version).first():
                db.add(SchemaMigration(version=version, description=description))
        db.commit()
    finally:
        db.close()


def save_asset(key: str, filename: str, content_type: str, content: bytes) -> PlatformAsset:
    digest = hashlib.sha256(content).hexdigest()
    db = SessionLocal()
    try:
        item = db.query(PlatformAsset).filter(PlatformAsset.key == key).first()
        if not item:
            item = PlatformAsset(key=key)
            db.add(item)
        item.filename = filename[:255]
        item.content_type = content_type[:100]
        item.content = content
        item.checksum = digest
        item.updated_at = datetime.utcnow()
        db.commit(); db.refresh(item); return item
    finally:
        db.close()


def get_asset(key: str) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        item = db.query(PlatformAsset).filter(PlatformAsset.key == key).first()
        if not item:
            return None
        return {"filename": item.filename, "content_type": item.content_type, "content": bytes(item.content), "checksum": item.checksum}
    finally:
        db.close()


def create_backup() -> dict[str, Any]:
    """Create a portable JSON snapshot without pg_dump or paid storage."""
    inspector = inspect(engine)
    tables: dict[str, list[dict[str, Any]]] = {}
    with engine.connect() as connection:
        for table_name in sorted(set(inspector.get_table_names()) - {"rate_limit_events"}):
            encoded_rows = []
            for row in connection.execute(text(f'SELECT * FROM "{table_name}"')).mappings():
                encoded = {}
                for key, value in row.items():
                    if isinstance(value, bytes):
                        encoded[key] = {"$binary": base64.b64encode(value).decode("ascii")}
                    elif isinstance(value, datetime):
                        encoded[key] = {"$datetime": value.isoformat()}
                    elif isinstance(value, date):
                        encoded[key] = {"$date": value.isoformat()}
                    elif isinstance(value, Decimal):
                        encoded[key] = {"$decimal": str(value)}
                    else:
                        encoded[key] = value
                encoded_rows.append(encoded)
            tables[table_name] = encoded_rows
    payload = {"format": BACKUP_FORMAT, "created_at": datetime.now(timezone.utc).isoformat(), "tables": tables}
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    payload["sha256"] = hashlib.sha256(canonical).hexdigest()
    return payload


def validate_backup(payload: dict[str, Any]) -> dict[str, Any]:
    candidate = dict(payload or {})
    provided = str(candidate.pop("sha256", ""))
    canonical = json.dumps(candidate, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    valid_hash = bool(provided) and hashlib.sha256(canonical).hexdigest() == provided
    tables = candidate.get("tables") if isinstance(candidate.get("tables"), dict) else {}
    return {"valid": candidate.get("format") == BACKUP_FORMAT and valid_hash and bool(tables), "format": candidate.get("format"), "created_at": candidate.get("created_at"), "tables": len(tables), "rows": sum(len(value) for value in tables.values() if isinstance(value, list)), "checksum": valid_hash}


def _backup_key(passphrase: str, salt: bytes) -> bytes:
    secret = str(passphrase or "")
    if len(secret) < 12:
        raise ValueError("Das Sicherungskennwort benötigt mindestens 12 Zeichen.")
    return Scrypt(salt=salt, length=32, n=2**14, r=8, p=1).derive(secret.encode("utf-8"))


def encrypt_backup(payload: dict[str, Any], passphrase: str) -> bytes:
    salt = os.urandom(16)
    nonce = os.urandom(12)
    plaintext = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    encrypted = AESGCM(_backup_key(passphrase, salt)).encrypt(nonce, plaintext, ENCRYPTED_BACKUP_MAGIC)
    return ENCRYPTED_BACKUP_MAGIC + salt + nonce + encrypted


def decrypt_backup(raw: bytes, passphrase: str) -> dict[str, Any]:
    if not bytes(raw or b"").startswith(ENCRYPTED_BACKUP_MAGIC):
        raise ValueError("Unbekanntes verschlüsseltes Sicherungsformat.")
    offset = len(ENCRYPTED_BACKUP_MAGIC)
    salt, nonce, encrypted = raw[offset:offset + 16], raw[offset + 16:offset + 28], raw[offset + 28:]
    if len(salt) != 16 or len(nonce) != 12 or not encrypted:
        raise ValueError("Die Sicherungsdatei ist unvollständig.")
    try:
        plaintext = AESGCM(_backup_key(passphrase, salt)).decrypt(nonce, encrypted, ENCRYPTED_BACKUP_MAGIC)
        payload = json.loads(plaintext.decode("utf-8"))
    except Exception as error:
        raise ValueError("Kennwort falsch oder Sicherungsdatei beschädigt.") from error
    result = validate_backup(payload)
    if not result["valid"]:
        raise ValueError("Die entschlüsselte Sicherung hat eine ungültige Prüfsumme.")
    return payload


def load_backup_bytes(raw: bytes, passphrase: str = "") -> tuple[dict[str, Any], bool]:
    if bytes(raw or b"").startswith(ENCRYPTED_BACKUP_MAGIC):
        return decrypt_backup(raw, passphrase), True
    return json.loads(raw.decode("utf-8")), False


def backup_directory() -> Path | None:
    raw = str(os.getenv("BACKUP_DIRECTORY") or "").strip()
    return Path(raw).expanduser().resolve() if raw else None


def backup_retention_days() -> int:
    try:
        return max(7, min(int(os.getenv("BACKUP_RETENTION_DAYS", "30")), 3650))
    except ValueError:
        return 30


def scheduled_backup_status() -> dict[str, Any]:
    directory = backup_directory()
    key_configured = len(str(os.getenv("BACKUP_ENCRYPTION_KEY") or "")) >= 12
    files = sorted(directory.glob("ahnsen-automatik-*.ahnsenbak"), reverse=True) if directory and directory.exists() else []
    latest = files[0] if files else None
    return {
        "configured": bool(directory and key_configured),
        "directory": str(directory or ""),
        "key_configured": key_configured,
        "latest": latest.name if latest else "",
        "latest_mtime": datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc).isoformat() if latest else "",
        "retention_days": backup_retention_days(),
        "count": len(files),
    }


def run_scheduled_backup(*, force: bool = False) -> dict[str, Any]:
    directory = backup_directory()
    passphrase = str(os.getenv("BACKUP_ENCRYPTION_KEY") or "")
    if not directory or len(passphrase) < 12:
        return {"status": "disabled", **scheduled_backup_status()}
    directory.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    filename = f"ahnsen-automatik-{now:%Y-%m-%d}.ahnsenbak"
    target = directory / filename
    if target.exists() and not force:
        return {"status": "current", **scheduled_backup_status()}
    raw = encrypt_backup(create_backup(), passphrase)
    temporary = directory / f".{filename}.tmp"
    temporary.write_bytes(raw)
    os.chmod(temporary, 0o600)
    temporary.replace(target)
    cutoff = now - timedelta(days=backup_retention_days())
    removed = 0
    for item in directory.glob("ahnsen-automatik-*.ahnsenbak"):
        if datetime.fromtimestamp(item.stat().st_mtime, tz=timezone.utc) < cutoff:
            item.unlink()
            removed += 1
    return {"status": "created", "filename": filename, "bytes": len(raw), "removed": removed, **scheduled_backup_status()}


def restore_table_order(table_names: list[str]) -> list[str]:
    """Return parent tables before dependent tables for a transactional restore."""
    metadata = Base.metadata
    available = set(table_names)
    ordered = [table.name for table in metadata.sorted_tables if table.name in available]
    ordered.extend(sorted(available - set(ordered)))
    return ordered


def consume_rate_limit(bucket: str, client_key: str, maximum: int, window_seconds: int) -> bool:
    """Return False when the shared database-backed limit has been exceeded."""
    digest = hashlib.sha256(client_key.encode("utf-8")).hexdigest()
    cutoff = datetime.utcnow() - timedelta(seconds=window_seconds)
    db = SessionLocal()
    try:
        db.query(RateLimitEvent).filter(RateLimitEvent.created_at < cutoff).delete(synchronize_session=False)
        count = db.query(RateLimitEvent).filter(RateLimitEvent.bucket == bucket, RateLimitEvent.client_hash == digest, RateLimitEvent.created_at >= cutoff).count()
        if count >= maximum:
            db.commit()
            return False
        db.add(RateLimitEvent(bucket=bucket[:50], client_hash=digest)); db.commit()
        return True
    finally:
        db.close()
