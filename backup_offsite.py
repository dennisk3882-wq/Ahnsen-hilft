"""Optional encrypted WebDAV copies with read-back verification.

No provider is contacted unless an operator has configured an HTTPS directory.
"""
import hashlib
import json
import os
from datetime import datetime, timezone, timedelta
from urllib.parse import urlsplit
import requests


def configured():
    url = os.getenv("BACKUP_WEBDAV_URL", "").strip()
    parsed = urlsplit(url)
    return bool(parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.query and not parsed.fragment)


def sync_encrypted_backup(path):
    if not configured():
        return {"offsite": "not_configured"}
    raw = path.read_bytes()
    if not raw.startswith(b"AHNSEN-BACKUP-V2\n"):
        raise ValueError("Nur verschlüsselte Sicherungen dürfen extern gespeichert werden.")
    digest = hashlib.sha256(raw).hexdigest()
    receipt = path.with_suffix(path.suffix + ".receipt.json")
    root = os.environ["BACKUP_WEBDAV_URL"].rstrip("/") + "/"
    destination_hash = hashlib.sha256(root.encode()).hexdigest()
    if receipt.exists():
        previous = json.loads(receipt.read_text())
        if previous.get("sha256") == digest and previous.get("destination") == destination_hash:
            return {"offsite": "verified", "verified_at": previous["verified_at"]}
    auth = (os.getenv("BACKUP_WEBDAV_USER", ""), os.getenv("BACKUP_WEBDAV_PASSWORD", ""))
    url = root + path.name
    response = requests.put(url, data=raw, auth=auth, headers={"Content-Type": "application/octet-stream"}, timeout=(10, 45), allow_redirects=False)
    if response.status_code not in {200, 201, 204}:
        raise RuntimeError(f"Externe Sicherung fehlgeschlagen (HTTP {response.status_code}).")
    # Hash a streaming read instead of trusting a provider-specific ETag.
    response = requests.get(url, auth=auth, stream=True, timeout=(10, 45), allow_redirects=False)
    if response.status_code != 200:
        response.close()
        raise RuntimeError("Externe Sicherung konnte nicht zurückgelesen werden.")
    remote = hashlib.sha256()
    size = 0
    try:
        for chunk in response.iter_content(1024 * 1024):
            size += len(chunk)
            if size > len(raw):
                raise RuntimeError("Externe Sicherung hat unerwartete Größe.")
            remote.update(chunk)
    finally:
        response.close()
    if size != len(raw) or remote.hexdigest() != digest:
        raise RuntimeError("Externe Sicherung stimmt nicht mit der lokalen Datei überein.")
    result = {"sha256": digest, "destination": destination_hash, "verified_at": datetime.now(timezone.utc).isoformat()}
    receipt.write_text(json.dumps(result))
    os.chmod(receipt, 0o600)
    return {"offsite": "verified", "verified_at": result["verified_at"]}


def delete_expired_copy(path):
    receipt = path.with_suffix(path.suffix + ".receipt.json")
    if not configured() or not receipt.exists():
        return
    root = os.environ["BACKUP_WEBDAV_URL"].rstrip("/") + "/"
    previous = json.loads(receipt.read_text())
    if previous.get("destination") != hashlib.sha256(root.encode()).hexdigest():
        return
    response = requests.delete(root + path.name, auth=(os.getenv("BACKUP_WEBDAV_USER", ""), os.getenv("BACKUP_WEBDAV_PASSWORD", "")), timeout=(10, 45), allow_redirects=False)
    if response.status_code not in {200, 204, 404}:
        raise RuntimeError("Aufbewahrungsfrist: externe Kopie konnte nicht entfernt werden.")
    receipt.unlink()
