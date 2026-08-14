from pathlib import Path
import unittest


ROOT = Path(__file__).parent


class AccessibilityContractTests(unittest.TestCase):
    def test_large_text_scales_fixed_pixel_text_and_restores_it(self):
        script = (ROOT / "static" / "accessibility.js").read_text(encoding="utf-8")
        self.assertIn("getComputedStyle(element).fontSize", script)
        self.assertIn("LARGE_SCALE = 1.22", script)
        self.assertIn("originalFontSizes", script)
        self.assertIn("element.style.removeProperty('font-size')", script)

    def test_dynamic_content_is_scaled_too(self):
        script = (ROOT / "static" / "accessibility.js").read_text(encoding="utf-8")
        self.assertIn("new MutationObserver", script)
        self.assertIn("childList: true, subtree: true", script)

    def test_large_text_removes_card_clipping(self):
        styles = (ROOT / "static" / "accessibility.css").read_text(encoding="utf-8")
        self.assertNotIn("html.a11y-large{font-size:120%}", styles)
        self.assertIn("html.a11y-large .service-card", styles)
        self.assertIn("-webkit-line-clamp:unset!important", styles)


if __name__ == "__main__":
    unittest.main()
