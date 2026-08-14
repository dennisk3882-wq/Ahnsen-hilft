from pathlib import Path
import unittest


ROOT = Path(__file__).parent


class ComplianceContractTests(unittest.TestCase):
    def test_public_mandatory_pages_and_feedback_exist(self):
        core = (ROOT / "pwa_core.py").read_text(encoding="utf-8")
        for route in ("/impressum", "/datenschutz", "/barrierefreiheit", "/leichte-sprache", "/barrierefreiheit-feedback"):
            self.assertIn(route, core)

    def test_placeholders_are_not_used_by_public_routes(self):
        core = (ROOT / "pwa_core.py").read_text(encoding="utf-8")
        self.assertIn("return legal_notice_page()", core)
        self.assertIn("return privacy_page()", core)

    def test_feedback_has_privacy_consent_rate_limit_and_honeypot(self):
        module = (ROOT / "compliance_center.py").read_text(encoding="utf-8")
        core = (ROOT / "pwa_core.py").read_text(encoding="utf-8")
        self.assertIn('name="privacy"', module)
        self.assertIn('name="website"', module)
        self.assertIn('consume_rate_limit("accessibility-feedback"', core)

    def test_every_public_page_has_legal_footer(self):
        ui = (ROOT / "pwa_ui.py").read_text(encoding="utf-8")
        for link in ("/impressum", "/datenschutz", "/barrierefreiheit", "/leichte-sprache"):
            self.assertIn(f'href="{link}"', ui)

    def test_readiness_does_not_claim_unconfirmed_approval(self):
        module = (ROOT / "compliance_center.py").read_text(encoding="utf-8")
        for flag in ("OFFICIAL_DPA_CONFIRMED", "OFFICIAL_IMPRINT_APPROVED", "OFFICIAL_PRIVACY_APPROVED", "OFFICIAL_ACCESSIBILITY_APPROVED", "OFFICIAL_RETENTION_APPROVED"):
            self.assertIn(flag, module)
        self.assertIn("Noch nicht zur amtlichen Veröffentlichung freigegeben", module)

    def test_required_operating_documents_exist(self):
        docs = ROOT / "docs" / "compliance"
        for name in ("DATENFLUESSE.md", "LOESCHKONZEPT.md", "TOM.md", "BACKUP_UND_VORFALL.md", "WCAG_SELBSTBEWERTUNG.md", "AVV_DSFA_CHECKLISTE.md", "REDAKTION_UND_MODERATION.md"):
            self.assertTrue((docs / name).is_file(), name)


if __name__ == "__main__":
    unittest.main()
