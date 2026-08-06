from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.routing import APIRoute

from pwa_core import STATIC_DIR, app


ICON_VERSION = "v5"
ICON_SOURCE = STATIC_DIR / "icon-ahnsen.svg"
ICON_SIZES = {180, 192, 512}


def _icon_path(size: int) -> Path:
    return STATIC_DIR / f"ahnsen-app-{ICON_VERSION}-{size}.png"


def _ensure_icons() -> None:
    """Render the versioned raster icons from the professional Ahnsen SVG."""
    import cairosvg

    if not ICON_SOURCE.exists():
        raise RuntimeError(f"Icon source missing: {ICON_SOURCE}")

    source_mtime = ICON_SOURCE.stat().st_mtime
    for size in ICON_SIZES:
        target = _icon_path(size)
        if target.exists() and target.stat().st_mtime >= source_mtime:
            continue
        cairosvg.svg2png(
            url=str(ICON_SOURCE),
            write_to=str(target),
            output_width=size,
            output_height=size,
        )


_ensure_icons()


async def manifest_v5():
    icon_192 = f"/pwa/ahnsen-app-{ICON_VERSION}-192.png"
    icon_512 = f"/pwa/ahnsen-app-{ICON_VERSION}-512.png"
    return JSONResponse(
        {
            "id": "/?app-id=ahnsen-hilft-v5",
            "name": "Ahnsen hilft",
            "short_name": "Ahnsen",
            "description": "Digitale Bürgerplattform der Gemeinde Ahnsen",
            "lang": "de-DE",
            "start_url": "/?installed=v5",
            "scope": "/",
            "display": "standalone",
            "orientation": "portrait-primary",
            "background_color": "#fbf8f0",
            "theme_color": "#174936",
            "prefer_related_applications": False,
            "categories": ["government", "utilities", "social"],
            "icons": [
                {
                    "src": icon_192,
                    "sizes": "192x192",
                    "type": "image/png",
                    "purpose": "any maskable",
                },
                {
                    "src": icon_512,
                    "sizes": "512x512",
                    "type": "image/png",
                    "purpose": "any maskable",
                },
            ],
            "shortcuts": [
                {
                    "name": "Mangel melden",
                    "url": "/mangel-melden",
                    "icons": [{"src": icon_192, "sizes": "192x192", "type": "image/png"}],
                },
                {
                    "name": "DGH anfragen",
                    "url": "/dgh-anfrage",
                    "icons": [{"src": icon_192, "sizes": "192x192", "type": "image/png"}],
                },
                {
                    "name": "Mein Profil",
                    "url": "/profil",
                    "icons": [{"src": icon_192, "sizes": "192x192", "type": "image/png"}],
                },
            ],
        },
        media_type="application/manifest+json",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


async def versioned_icon(size: int):
    if size not in ICON_SIZES:
        raise HTTPException(status_code=404, detail="Icon nicht gefunden")
    _ensure_icons()
    return FileResponse(
        _icon_path(size),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


async def legacy_icon(size: int):
    """Serve the new design even for old icon URLs used by existing pages."""
    if size not in {192, 512}:
        raise HTTPException(status_code=404, detail="Icon nicht gefunden")
    _ensure_icons()
    return FileResponse(
        _icon_path(size),
        media_type="image/png",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


_PUSH_HELPER = r"""
;(() => {
  const blockedMessage =
    'Benachrichtigungen sind für diese Website im Browser blockiert. ' +
    'Tippe auf das Symbol links neben der Internetadresse, öffne Berechtigungen ' +
    'oder Website-Einstellungen, stelle Benachrichtigungen auf Zulassen und lade die Seite neu.';

  const improvePushMessage = () => {
    const status = document.getElementById('push-status');
    if (!status) return;
    const text = String(status.textContent || '');
    if (/permission denied|registration failed|notallowederror/i.test(text)) {
      status.textContent = blockedMessage;
    }
  };

  const setup = () => {
    const status = document.getElementById('push-status');
    const button = document.getElementById('enable-push');

    if (status) {
      new MutationObserver(improvePushMessage).observe(status, {
        childList: true,
        characterData: true,
        subtree: true
      });
      improvePushMessage();
    }

    if (button && 'Notification' in window) {
      button.addEventListener('click', () => {
        if (Notification.permission === 'denied' && status) {
          status.textContent = blockedMessage;
        }
      }, true);
    }

    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) {
      manifest.href = '/manifest.webmanifest?v=5';
    }

    document.querySelectorAll('link[rel="apple-touch-icon"]').forEach(link => {
      link.href = '/pwa/ahnsen-app-v5-180.png';
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();
"""


async def pwa_javascript_v5():
    source = (STATIC_DIR / "pwa.js").read_text(encoding="utf-8")
    source = source.replace("ahnsen-hilft-public-v3", "ahnsen-hilft-public-v5")
    source = source.replace("/pwa/icon-192.png", "/pwa/ahnsen-app-v5-192.png")
    source = source.replace("/pwa/icon-512.png", "/pwa/ahnsen-app-v5-512.png")
    source = source.replace("?worker=3", "?worker=5")
    return Response(
        source + _PUSH_HELPER,
        media_type="application/javascript; charset=utf-8",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


# FastAPI resolves matching routes in registration order. Insert the corrected
# endpoints before the legacy routes imported from pwa_core.
for route in reversed(
    [
        APIRoute(
            "/manifest.webmanifest",
            manifest_v5,
            methods=["GET"],
            name="manifest_v5",
        ),
        APIRoute(
            "/pwa/ahnsen-app-v5-{size}.png",
            versioned_icon,
            methods=["GET"],
            name="versioned_ahnsen_icon",
        ),
        APIRoute(
            "/pwa/icon-{size}.png",
            legacy_icon,
            methods=["GET"],
            name="legacy_icon_v5",
        ),
        APIRoute(
            "/pwa.js",
            pwa_javascript_v5,
            methods=["GET"],
            name="pwa_javascript_v5",
        ),
    ]
):
    app.router.routes.insert(0, route)
