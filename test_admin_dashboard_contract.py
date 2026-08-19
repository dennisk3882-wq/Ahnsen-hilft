from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parent


def source(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


class AdminDashboardContractTests(unittest.TestCase):
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
        main = source("main.py")
        for route in (
            "/intern/benutzer",
            "/intern/sicherung",
            "/intern/system",
            "/intern/freigabe",
            "/intern/audit",
            "/intern/berichte",
            "/intern/politik",
        ):
            self.assertIn(f'("{route}"', main)

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
        self.assertIn("Zwei-Faktor-Anmeldung aktiviert", governance)

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
