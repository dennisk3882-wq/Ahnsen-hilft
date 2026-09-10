import json
import os
import tempfile
import unittest
from contextlib import ExitStack
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class BrowserBoundaryTests(unittest.TestCase):
    def test_personal_urls_are_never_public_assets(self):
        from privacy_policy import browser_headers, is_public_asset
        for path in ("/", "/nachbarschaft/chat/123", "/nachbarschaft/chats", "/dgh-anfrage-erfolgreich/1?token=secret", "/meldestatus?ticket=secret", "/meldung-erfolgreich/secret", "/intern/2fa/einrichten", "/profil/datenexport"):
            self.assertFalse(is_public_asset(path), path)
            self.assertIn("no-store", browser_headers(path)["Cache-Control"])
        self.assertTrue(is_public_asset("/community.js?v=6"))

    def test_translation_capabilities_reject_private_or_modified_text(self):
        from public_translation import public_capabilities, valid_capability
        with patch.dict(os.environ, {"PWA_SESSION_SECRET": "capability-test-secret"}):
            tokens = public_capabilities('<p>Öffentlicher Termin</p><div data-no-translate>Private Nachricht</div><input value="Geheim"><script>Geheimcode</script>')
            self.assertIn("Öffentlicher Termin", tokens)
            self.assertNotIn("Private Nachricht", tokens)
            self.assertNotIn("Geheimcode", tokens)
            token = tokens["Öffentlicher Termin"]
            self.assertTrue(valid_capability("Öffentlicher Termin", token))
            self.assertFalse(valid_capability("Private Nachricht", token))
            with patch("public_translation.time.time", return_value=9999999999):
                self.assertFalse(valid_capability("Öffentlicher Termin", token))

    def test_no_admin_context_is_least_privilege(self):
        from admin_access import set_current_admin, current_admin, visible_navigation
        set_current_admin(None)
        self.assertEqual(visible_navigation(current_admin()["role"]), [])


class DatabaseHardeningTests(unittest.TestCase):
    def setUp(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        import operations, governance, community_crud, dgh_crud, citizen_privacy, admin_content, veranstaltungen_crud, pwa_crud, gemeinde_crud, email_verification
        from database import Base
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_engine("sqlite:///" + self.temp.name + "/test.db")
        self.session = sessionmaker(bind=self.engine, expire_on_commit=False)
        Base.metadata.create_all(self.engine)
        self.stack = ExitStack()
        self.stack.enter_context(patch.dict(os.environ, {"AUDIT_SIGNING_SECRET": "audit-test-secret", "CONTENT_APPROVAL_MODE": "auto"}))
        for module in (operations, governance, community_crud, dgh_crud, citizen_privacy, admin_content, veranstaltungen_crud, pwa_crud, gemeinde_crud, email_verification):
            self.stack.enter_context(patch.object(module, "SessionLocal", self.session))
            if hasattr(module, "engine"):
                self.stack.enter_context(patch.object(module, "engine", self.engine))

    def tearDown(self):
        self.stack.close()
        self.engine.dispose()
        self.temp.cleanup()

    def test_restore_then_insert_and_reject_incomplete_snapshot(self):
        from models import Meldung
        from operations import create_backup
        from scripts.restore_backup import restore_payload
        with self.session() as db:
            db.add(Meldung(id=42, ticket="TEST-42")); db.commit()
        payload = create_backup()
        restore_payload(payload, self.engine)
        with self.session() as db:
            db.add(Meldung(ticket="TEST-NEW")); db.commit()
            self.assertGreater(db.query(Meldung).filter_by(ticket="TEST-NEW").one().id, 42)
        payload = create_backup()
        payload["tables"].pop("meldungen")
        import hashlib
        payload.pop("sha256")
        payload["sha256"] = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        with self.assertRaises(ValueError):
            restore_payload(payload, self.engine)
        with self.session() as db:
            self.assertEqual(db.query(Meldung).count(), 2)

    def test_dgh_reactivation_and_iso_date_cannot_double_book(self):
        from dgh_crud import save_dgh_termin, set_dgh_termin_aktiv
        args = dict(uhrzeit="18:00", anlass="Test", name="Test", telefon="", kommentar="")
        first = save_dgh_termin(datum="2026-09-20", **args)
        set_dgh_termin_aktiv(first.id, "Nein")
        save_dgh_termin(datum="20.09.2026", **args)
        with self.assertRaises(ValueError):
            set_dgh_termin_aktiv(first.id, "Ja")
        with self.assertRaises(ValueError):
            save_dgh_termin(datum="kein Datum", **args)

    def test_case_completion_is_not_changed_by_later_note(self):
        from models import Meldung
        from governance import update_case
        with self.session() as db:
            db.add(Meldung(ticket="CASE", status="Offen")); db.commit()
        closed = update_case("CASE", {"status": "Erledigt"}, "tester")
        revised = update_case("CASE", {"public_note": "Fertig"}, "tester")
        self.assertEqual(closed.closed_at, revised.closed_at)
        self.assertIsNotNone(revised.first_response_at)
        self.assertIsNone(update_case("CASE", {"status": "In Bearbeitung"}).closed_at)

    def test_audit_detects_tail_deletion_and_checks_more_than_limit(self):
        from community_crud import audit_event, verify_audit_chain
        from community_models import AuditLog
        for index in range(3): audit_event("tester", "Test", object_id=str(index))
        self.assertTrue(verify_audit_chain(limit=1)["valid"])
        self.assertEqual(verify_audit_chain(limit=1)["checked"], 3)
        with self.session() as db:
            db.delete(db.query(AuditLog).order_by(AuditLog.id.desc()).first()); db.commit()
        self.assertFalse(verify_audit_chain()["valid"])

    def test_required_approval_never_falls_back_to_single_user(self):
        from admin_content import submit_content
        from gemeinde_models import GemeindeEinstellung
        with patch.dict(os.environ, {"CONTENT_APPROVAL_MODE": "required"}):
            revision = submit_content("gemeindeseite", "standard", "Test", {"hero_titel": "Neu"}, "author")
        self.assertEqual(revision.state, "Prüfung")
        with self.session() as db:
            self.assertIsNone(db.query(GemeindeEinstellung).filter_by(schluessel="hero_titel").first())

    def test_event_review_is_atomic_and_prevents_self_approval(self):
        from admin_content import submit_content
        from governance import review_content_revision
        from governance_models import AdminUser, ContentRevision
        from veranstaltungen_models import Veranstaltung
        with self.session() as db:
            for name in ("author", "reviewer"):
                db.add(AdminUser(username=name, display_name=name, role="event_editor", password_hash="unused", active=True))
            db.commit()
        revision = submit_content("veranstaltungen", "neu-test", "Fest", {"titel": "Fest", "aktiv": "Ja"}, "author")
        with self.assertRaises(ValueError): review_content_revision(revision.id, "author", approve=True)
        with patch("admin_content.apply_content_payload", side_effect=ValueError("failed")):
            with self.assertRaises(ValueError): review_content_revision(revision.id, "reviewer", approve=True)
        with self.session() as db:
            self.assertEqual(db.get(ContentRevision, revision.id).state, "Prüfung")
            self.assertEqual(db.query(Veranstaltung).count(), 0)
        review_content_revision(revision.id, "reviewer", approve=True)
        with self.session() as db: self.assertEqual(db.query(Veranstaltung).one().titel, "Fest")

    def test_partial_settings_do_not_erase_unrelated_fields(self):
        from admin_content import submit_content
        from gemeinde_models import GemeindeEinstellung
        submit_content("gemeindeseite", "standard", "Titel", {"hero_titel": "Bleibt"}, "author")
        submit_content("gemeindeseite", "standard", "Bild", {"hero_bild_url": "/media/new"}, "author")
        with self.session() as db:
            self.assertEqual(db.query(GemeindeEinstellung).filter_by(schluessel="hero_titel").one().wert, "Bleibt")

    def test_account_erasure_includes_contacts_chats_and_reset_tokens(self):
        from citizen_privacy import export_account, erase_account
        from pwa_models import PWAUser, PasswordResetToken
        from models import Meldung
        from neighborhood_models import NeighborConversation, NeighborChatMessage
        with self.session() as db:
            db.add(PWAUser(id=1, email="private@example.test", name="Private Person", password_hash="hash"))
            db.add(Meldung(ticket="PRIV", pwa_user_id=1, whatsapp_absender="private@example.test", public_visible=True))
            db.add(NeighborConversation(id=1, post_id=1, participant_a=1, participant_b=2))
            db.add(NeighborChatMessage(conversation_id=1, sender_user_id=1, body="Private Nachricht"))
            db.add(PasswordResetToken(user_id=1, token_hash="a" * 64, expires_at=datetime(2030, 1, 1)))
            db.commit()
        payload = export_account(1)
        self.assertNotIn("password_hash", payload["profil"])
        self.assertEqual(payload["chats"][0]["nachrichten"][0]["body"], "Private Nachricht")
        erase_account(1)
        with self.session() as db:
            self.assertFalse(db.get(PWAUser, 1).aktiv)
            self.assertFalse(db.query(Meldung).one().public_visible)
            self.assertNotIn("private@example.test", db.query(Meldung).one().whatsapp_absender)
            self.assertNotEqual(db.query(NeighborChatMessage).one().body, "Private Nachricht")
            self.assertEqual(db.query(PasswordResetToken).count(), 0)

    def test_offsite_backup_is_verified_and_wrong_copy_is_rejected(self):
        from backup_offsite import sync_encrypted_backup
        path = Path(self.temp.name) / "ahnsen-automatik-2026-09-10.ahnsenbak"
        raw = b"AHNSEN-BACKUP-V2\nencrypted-test-content"
        path.write_bytes(raw)
        response = SimpleNamespace(status_code=200, close=lambda: None, iter_content=lambda size: [raw])
        with patch.dict(os.environ, {"BACKUP_WEBDAV_URL": "https://backup.example.test/ahnsen/"}), patch("backup_offsite.requests.put", return_value=response) as put, patch("backup_offsite.requests.get", return_value=response):
            self.assertEqual(sync_encrypted_backup(path)["offsite"], "verified")
            sync_encrypted_backup(path)
            self.assertEqual(put.call_count, 1)
            path.with_suffix(path.suffix + ".receipt.json").unlink()
            response.iter_content = lambda size: [b"wrong"]
            with self.assertRaises(RuntimeError): sync_encrypted_backup(path)
            self.assertFalse(path.with_suffix(path.suffix + ".receipt.json").exists())

    def test_email_confirmation_expires_and_is_single_use(self):
        from pwa_crud import create_user
        from email_verification import issue_token, confirm_token, EmailVerificationToken
        user = create_user("verify@example.test", "password-123", "Verification", verification_required=True)
        token = issue_token(user.id)
        self.assertTrue(confirm_token(token))
        self.assertFalse(confirm_token(token))
        token = issue_token(user.id)
        with self.session() as db:
            db.query(EmailVerificationToken).one().expires_at = datetime(2000, 1, 1)
            db.commit()
        self.assertFalse(confirm_token(token))

    def test_quiet_hours_and_digest_do_not_depend_on_start_minute(self):
        from smart_push import in_quiet_hours
        pref = SimpleNamespace(quiet_start="22:00", quiet_end="07:00")
        self.assertTrue(in_quiet_hours(pref, datetime(2026, 9, 10, 23, 42)))
        self.assertTrue(in_quiet_hours(pref, datetime(2026, 9, 11, 6, 12)))
        self.assertFalse(in_quiet_hours(pref, datetime(2026, 9, 11, 7, 0)))
        from community_models import CitizenPreference
        from pwa_models import PWAUser
        from community_crud import get_due_digest_users
        with self.session() as db:
            db.add(PWAUser(id=1, email="digest@example.test", name="Digest", password_hash="hash"))
            db.add(CitizenPreference(user_id=1, push_mode="taeglich", digest_hour=18)); db.commit()
        self.assertEqual(len(get_due_digest_users(datetime(2026, 9, 10, 18, 42))), 1)


if __name__ == "__main__":
    unittest.main()
