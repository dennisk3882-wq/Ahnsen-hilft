from __future__ import annotations

import ast
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LANGUAGES = ["de", "en", "pl", "uk", "tr"]


class TranslationContractTests(unittest.TestCase):
    def test_backend_and_client_expose_exactly_the_five_core_languages(self):
        runtime = ast.parse((ROOT / "platform_runtime.py").read_text(encoding="utf-8"))
        assignment = next(
            node for node in runtime.body
            if isinstance(node, ast.Assign) and any(getattr(target, "id", "") == "DEFAULT_LANGUAGES" for target in node.targets)
        )
        self.assertEqual(list(ast.literal_eval(assignment.value)), LANGUAGES)

        client = (ROOT / "static" / "community.js").read_text(encoding="utf-8")
        self.assertIn("new Set(['de', 'en', 'pl', 'uk', 'tr'])", client)

    def test_core_ui_has_an_offline_translation_in_each_target_language(self):
        client = (ROOT / "static" / "community.js").read_text(encoding="utf-8")
        for phrase in (
            "Sprache auswählen",
            "Mängel melden",
            "Was können wir verbessern?",
            "Bitte mindestens 10 Zeichen eingeben.",
            "Du bist offline. Bereits geladene Inhalte bleiben verfügbar.",
        ):
            row = re.search(r"\['" + re.escape(phrase) + r"'.*?\](?:,|\n)", client)
            self.assertIsNotNone(row, phrase)
            self.assertEqual(row.group(0).count("', '"), 4, phrase)

    def test_translation_requests_use_german_source_and_never_form_values(self):
        client = (ROOT / "static" / "community.js").read_text(encoding="utf-8")
        self.assertIn("source: 'de'", client)
        self.assertNotIn("source: 'auto'", client)
        self.assertEqual(re.search(r"const ATTRS = \[(.*?)\]", client).group(1), "'placeholder', 'title', 'aria-label'")
        self.assertNotRegex(client, r"(?:input|textarea|form)\.value")

    def test_pwa_uses_the_new_translation_assets(self):
        page = (ROOT / "pwa_ui.py").read_text(encoding="utf-8")
        worker = (ROOT / "pwa_core.py").read_text(encoding="utf-8")
        self.assertIn('/community.js?v=4', page)
        self.assertIn('/community.css?v=4', page)
        self.assertIn('/community.js?v=4', worker)
        self.assertIn("citizen-platform-pwa-v5-i18n", worker)


if __name__ == "__main__":
    unittest.main()
