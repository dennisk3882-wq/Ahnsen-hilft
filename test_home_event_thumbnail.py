from __future__ import annotations

import base64
from io import BytesIO
import unittest
import importlib.util
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image


class HomeEventThumbnailTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class Router:
            def get(self, *_args, **_kwargs):
                return lambda function: function

        fastapi = SimpleNamespace(
            APIRouter=Router,
            HTTPException=type("HTTPException", (Exception,), {}),
            Request=object,
        )
        responses = SimpleNamespace(HTMLResponse=object, Response=object)
        center = SimpleNamespace(_local_now=lambda: None)
        waste = SimpleNamespace(get_naechste_muelltermine=lambda limit=1: [])
        events = SimpleNamespace(
            get_aktive_veranstaltungen=lambda: [],
            get_veranstaltung=lambda _event_id: None,
        )
        path = Path(__file__).with_name("home_dashboard_final_polish.py")
        spec = importlib.util.spec_from_file_location("home_event_thumbnail_test_target", path)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {
            "fastapi": fastapi,
            "fastapi.responses": responses,
            "home_weather_center": center,
            "muelltermine_crud": waste,
            "veranstaltungen_crud": events,
        }):
            spec.loader.exec_module(module)
        cls.home = module

    def _render(self, event):
        home = self.home
        with (
            patch.object(home.center, "_local_now", return_value=SimpleNamespace(date=lambda: date(2026, 8, 23), hour=16)),
            patch.object(home.center, "_event_date", return_value=date(2026, 11, 11), create=True),
            patch.object(home.center, "_display_title", side_effect=lambda value, fallback: value or fallback, create=True),
            patch.object(home, "get_aktive_veranstaltungen", return_value=[event]),
            patch.object(home, "get_naechste_muelltermine", return_value=[]),
        ):
            return home._quick_overview()

    def test_event_image_is_shown_as_compact_home_thumbnail(self):
        event = SimpleNamespace(
            id=42,
            titel="Winterfest",
            datum="11.11.2026",
            bild_base64="aW1hZ2U=",
        )

        html = self._render(event)

        self.assertIn('class="home-quick-event-thumb"', html)
        self.assertIn('src="/assets/veranstaltungen/42/thumbnail.webp?v=', html)
        self.assertIn('alt=""', html)
        self.assertNotIn("<span>▣</span>", html)

    def test_event_without_image_keeps_the_existing_icon(self):
        event = SimpleNamespace(
            id=43,
            titel="Dorftreffen",
            datum="12.11.2026",
            bild_base64=None,
        )

        html = self._render(event)

        self.assertIn('<span aria-hidden="true">▣</span>', html)
        self.assertNotIn('class="home-quick-event-thumb"', html)
        self.assertNotIn("/thumbnail.webp", html)

    def test_thumbnail_endpoint_uses_a_small_square_webp(self):
        source = BytesIO()
        Image.new("RGB", (480, 240), color=(36, 88, 57)).save(source, format="JPEG")

        thumbnail = self.home._thumbnail_bytes(
            base64.b64encode(source.getvalue()).decode("ascii")
        )

        with Image.open(BytesIO(thumbnail)) as image:
            self.assertEqual(image.format, "WEBP")
            self.assertEqual(image.size, (160, 160))


if __name__ == "__main__":
    unittest.main()
