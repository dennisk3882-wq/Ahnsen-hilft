"""Exercise the installed route chain against disposable CI data."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import json
import re
from unittest.mock import patch
from fastapi.testclient import TestClient
import pwa_main
import pwa_core
import main
from database import SessionLocal
from models import Meldung
from governance import save_admin
from pwa_crud import create_user


with patch("pwa_core.seed_official_ratsarchive"), TestClient(pwa_main.app, base_url="https://testserver") as client:
    private = create_user("route-private@example.test", "test-password-123", "Privater Vorname")
    user_token = pwa_core._new_user_session(private.id)
    for url in ("/profil", "/nachrichten", "/nachbarschaft/chats", "/meldestatus?ticket=UNKNOWN", "/profil/datenexport"):
        response = client.get(url, cookies={pwa_core.PWA_SESSION_COOKIE: user_token}, follow_redirects=True)
        assert "no-store" in response.headers.get("cache-control", ""), (url, response.status_code)
        assert response.status_code < 500, (url, response.status_code)
        if response.headers.get("content-type", "").startswith("text/html"):
            tokens = re.search(r'id="public-translation-capabilities"[^>]*>(.*?)</script>', response.text, re.S)
            assert not tokens or "Privater Vorname" not in tokens.group(1)
    denied = client.post("/api/uebersetzen", json={"texts": ["Private Nachricht"], "source": "de", "target": "en"})
    assert denied.status_code == 403
    editor = save_admin("route-editor", "Redaktion", "event_editor", "test-password-123")
    editor_cookie = {main.SESSION_COOKIE: main._neue_session(editor.username, editor.role, editor.session_version)}
    response = client.get("/intern/veranstaltungen", cookies=editor_cookie)
    assert response.status_code == 200
    assert 'href="/intern/sicherung"' not in response.text
    assert client.get("/intern/sicherung", cookies=editor_cookie, follow_redirects=False).status_code == 403
    assert client.get("/intern/2fa/einrichten", cookies=editor_cookie, follow_redirects=False).status_code == 200
    reader = save_admin("route-reader", "Lesezugang", "read_only", "test-password-123")
    reader_cookie = {main.SESSION_COOKIE: main._neue_session(reader.username, reader.role, reader.session_version)}
    denied = client.post("/veranstaltungen/neue", cookies=reader_cookie, data={"titel": "Unerlaubt"}, follow_redirects=False)
    assert denied.status_code == 403
    from community_routes import _public_report_points
    with SessionLocal() as db:
        report = Meldung(ticket="MAP-TEST", art="Straße", ort="Privatweg 12", beschreibung="GPS-Position: 52.25842, 9.09923", public_visible=False)
        db.add(report); db.commit(); db.refresh(report); report_id = report.id
    assert not any(row["id"] == report_id for row in _public_report_points())
    with SessionLocal() as db:
        db.get(Meldung, report_id).public_visible = True; db.commit()
    point = next(row for row in _public_report_points() if row["id"] == report_id)
    assert "Privatweg" not in json.dumps(point)
    assert point["lat"] == 52.258
    worker = client.get("/service-worker.js")
    assert "static-only" in worker.text
    print("Installed routes: private headers, translation boundary, role navigation, optional 2FA, write denial and map moderation passed.")
