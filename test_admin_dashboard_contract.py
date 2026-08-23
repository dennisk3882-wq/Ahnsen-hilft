from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent


def source(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


class AdminDashboardContractTests(unittest.TestCase):
    def test_encrypted_backup_roundtrip_and_dependency_order(self):
        from database import Base, engine
        from operations import create_backup, decrypt_backup, encrypt_backup, restore_table_order, validate_backup
        Base.metadata.create_all(bind=engine)
        payload = create_backup()
        encrypted = encrypt_backup(payload, "ein-sehr-sicheres-testkennwort")
        self.assertTrue(encrypted.startswith(b"AHNSEN-BACKUP-V2"))
        restored = decrypt_backup(encrypted, "ein-sehr-sicheres-testkennwort")
        self.assertTrue(validate_backup(restored)["valid"])
        order = restore_table_order(list(restored["tables"]))
        self.assertEqual(set(order), set(restored["tables"]))

    def test_destructive_routes_are_post_only(self):
        main = source("main.py")
        self.assertIn('@app.post("/veranstaltungen/loeschen/{veranstaltung_id}")', main)
        self.assertIn('@app.post("/dgh/loeschen/{termin_id}")', main)
        self.assertNotIn('@app.get("/veranstaltungen/loeschen/{veranstaltung_id}")', main)
        self.assertNotIn('@app.get("/dgh/loeschen/{termin_id}")', main)

        event_ui = source("veranstaltungen_dashboard.py")
        dgh_ui = source("dgh_dashboard.py")
        self.assertIn('method="post" action="/veranstaltungen/loeschen/', event_ui)
        self.assertIn('method="post" action="/dgh/loeschen/', dgh_ui)

    def test_private_pages_are_never_service_worker_cached(self):
        core = source("pwa_core.py")
        self.assertIn("const PRIVATE_PREFIXES", core)
        for prefix in ("/intern", "/verwaltung", "/profil", "/nachrichten", "/api"):
            self.assertIn(f"'{prefix}'", core)
        self.assertIn("no-store", core)

    def test_permission_map_covers_sensitive_sections(self):
        access = source("admin_access.py")
        for route in (
            "/intern/benutzer",
            "/intern/sicherung",
            "/intern/system",
            "/intern/freigabe",
            "/intern/audit",
            "/intern/berichte",
            "/intern/politik",
        ):
            self.assertIn(f'("{route}"', access)

    def test_roles_use_one_permission_source_and_read_only_cannot_write(self):
        from admin_access import can_access, requires_two_factor, visible_navigation
        self.assertTrue(can_access("read_only", "cases", method="GET"))
        self.assertFalse(can_access("read_only", "cases", method="POST"))
        self.assertFalse(can_access("read_only", "backup", method="GET"))
        self.assertFalse(can_access("fire_service", "content", method="GET"))
        self.assertTrue(can_access("event_editor", "events", method="POST"))
        self.assertTrue(requires_two_factor("municipality"))
        self.assertFalse(requires_two_factor("event_editor"))
        self.assertNotIn("sicherung", {item[0] for item in visible_navigation("read_only")})

    def test_uploads_are_validated_by_content(self):
        main = source("main.py")
        report = source("mangel_duplicate_patch.py")
        self.assertIn("def _sanitize_image", main)
        self.assertGreaterEqual(main.count("_sanitize_image("), 4)
        self.assertIn("core.legacy._sanitize_image", report)
        self.assertIn("startswith(b\"%PDF-\")", main)

    def test_admin_actions_use_real_actor_and_manual_waste_routes_exist(self):
        core = source("pwa_core.py")
        community = source("community_routes.py")
        neighborhood = source("neighborhood_enhanced_patch.py")
        main = source("main.py")
        self.assertNotIn('audit_event("Verwaltung"', core)
        self.assertNotIn('audit_event("Verwaltung"', community)
        self.assertNotIn('audit_event("Verwaltung"', neighborhood)
        self.assertIn('@app.post("/muelltermine/termin")', main)
        self.assertIn('@app.post("/muelltermine/termin/{termin_id}/loeschen")', main)

    def test_login_and_account_controls_are_operational(self):
        core = source("pwa_core.py")
        governance = source("governance_routes.py")
        self.assertIn("record_admin_login(admin.username)", core)
        self.assertIn('@router.post("/intern/benutzer/{username}/aktiv")', governance)
        self.assertIn("Zwei-Faktor-Anmeldung selbst aktiviert", governance)
        self.assertIn('@router.get("/intern/2fa/einrichten")', governance)
        self.assertIn("requires_two_factor(admin.role)", core)

    def test_backup_can_be_scheduled_encrypted_and_validated(self):
        from database import Base, engine
        from operations import load_backup_bytes, run_scheduled_backup, validate_backup
        Base.metadata.create_all(bind=engine)
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            "BACKUP_DIRECTORY": directory,
            "BACKUP_ENCRYPTION_KEY": "dies-ist-ein-langes-test-kennwort",
            "BACKUP_RETENTION_DAYS": "30",
        }):
            result = run_scheduled_backup(force=True)
            self.assertEqual(result["status"], "created")
            raw = (Path(directory) / result["filename"]).read_bytes()
            payload, encrypted = load_backup_bytes(raw, "dies-ist-ein-langes-test-kennwort")
            self.assertTrue(encrypted)
            self.assertTrue(validate_backup(payload)["valid"])

    def test_content_four_eyes_rollback_audit_and_reports_are_present(self):
        governance = source("governance.py") + source("governance_routes.py")
        audit = source("community_crud.py") + source("community_routes.py")
        reports = source("community_crud.py") + source("community_dashboard.py")
        self.assertIn("Erstellung und Freigabe müssen durch zwei unterschiedliche Konten erfolgen", governance)
        self.assertIn("create_restore_revision", governance)
        self.assertIn("previous_hash", audit)
        self.assertIn("hmac.compare_digest", audit)
        self.assertIn('@router.get("/intern/audit/export.csv")', audit)
        self.assertIn("comparison_previous_period", reports)
        self.assertIn("reports_first_response_hours", reports)
        self.assertIn("dgh_occupancy_rate", reports)

    def test_admin_pages_share_one_shell(self):
        ui = source("intern_ui.py")
        community = source("community_dashboard.py")
        governance = source("governance_routes.py")
        compliance = source("compliance_center.py")
        self.assertIn("def admin_page", ui)
        self.assertIn("return admin_page(title, active, body)", community)
        self.assertIn("from intern_ui import admin_page as _page", governance)
        self.assertIn("from intern_ui import admin_page", compliance)

    def test_cockpit_prioritizes_operations_and_reports_are_printable(self):
        crud = source("community_crud.py")
        dashboard = source("community_dashboard.py")
        routes = source("community_routes.py")
        for metric in (
            "reports_overdue",
            "dgh_pending",
            "active_warnings",
            "push_devices",
            "system_errors",
            "warning_source_errors",
            "events_without_image",
            "reports_completion_rate",
            "reports_average_days",
        ):
            self.assertIn(metric, crud + dashboard)
        self.assertIn("Drucken / als PDF speichern", dashboard)
        self.assertIn('@router.get("/intern/berichte/{report_id}/druck")', routes)


if __name__ == "__main__":
    unittest.main()
