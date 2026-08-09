from __future__ import annotations

import os
import threading
import time
from pathlib import Path

import requests
from fastapi import HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.routing import APIRoute

from pwa_core import STATIC_DIR, app
from platform_runtime import get_platform_snapshot


ICON_VERSION = "v5"
SERVICE_WORKER_VERSION = "v6"
ICON_SOURCE = STATIC_DIR / "icon-ahnsen.svg"
ICON_SIZES = {180, 192, 512}
GEOCODER_REVERSE_URL = os.getenv(
    "GEOCODER_REVERSE_URL",
    "https://nominatim.openstreetmap.org/reverse",
)
GEOCODER_USER_AGENT = os.getenv(
    "GEOCODER_USER_AGENT",
    f"{get_platform_snapshot()['platform_slug']}/1.0 (+{get_platform_snapshot().get('public_base_url') or 'municipal-pwa'})",
)
_GEOCODER_LOCK = threading.Lock()
_GEOCODER_LAST_REQUEST = 0.0
_LOCATION_CACHE: dict[tuple[float, float], str] = {}


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


def _format_reverse_address(payload: dict) -> str:
    address = payload.get("address") or {}
    street = next(
        (
            str(address.get(key) or "").strip()
            for key in ("road", "pedestrian", "residential", "path", "footway")
            if str(address.get(key) or "").strip()
        ),
        "",
    )
    house_number = str(address.get("house_number") or "").strip()
    locality = next(
        (
            str(address.get(key) or "").strip()
            for key in ("village", "town", "city", "municipality")
            if str(address.get(key) or "").strip()
        ),
        "",
    )

    street_line = " ".join(part for part in (street, house_number) if part).strip()
    if street_line and locality:
        return f"{street_line}, {locality}"[:180]
    if street_line:
        return street_line[:180]

    display_name = str(payload.get("display_name") or "").strip()
    if display_name:
        parts = [part.strip() for part in display_name.split(",") if part.strip()]
        return ", ".join(parts[:3])[:180]
    return ""


def reverse_location(lat: float, lon: float):
    """Resolve a user-triggered GPS coordinate into a human-readable address."""
    global _GEOCODER_LAST_REQUEST

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="Ungültige GPS-Koordinaten")

    cache_key = (round(lat, 5), round(lon, 5))
    cached = _LOCATION_CACHE.get(cache_key)
    if cached:
        return JSONResponse({"address": cached, "source": "OpenStreetMap"})

    with _GEOCODER_LOCK:
        cached = _LOCATION_CACHE.get(cache_key)
        if cached:
            return JSONResponse({"address": cached, "source": "OpenStreetMap"})

        wait_seconds = 1.05 - (time.monotonic() - _GEOCODER_LAST_REQUEST)
        if wait_seconds > 0:
            time.sleep(wait_seconds)

        try:
            response = requests.get(
                GEOCODER_REVERSE_URL,
                params={
                    "lat": f"{lat:.6f}",
                    "lon": f"{lon:.6f}",
                    "format": "jsonv2",
                    "addressdetails": 1,
                    "accept-language": "de",
                    "zoom": 18,
                },
                headers={
                    "User-Agent": GEOCODER_USER_AGENT,
                    "Accept": "application/json",
                },
                timeout=6,
            )
        except requests.RequestException as error:
            raise HTTPException(
                status_code=502,
                detail="Adresse konnte gerade nicht ermittelt werden",
            ) from error
        finally:
            _GEOCODER_LAST_REQUEST = time.monotonic()

        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="Adressdienst ist vorübergehend nicht erreichbar",
            )

        try:
            payload = response.json()
        except ValueError as error:
            raise HTTPException(
                status_code=502,
                detail="Adressdienst hat keine gültige Antwort geliefert",
            ) from error

        address = _format_reverse_address(payload)
        if not address:
            raise HTTPException(
                status_code=404,
                detail="Für diesen Standort wurde keine Adresse gefunden",
            )

        if len(_LOCATION_CACHE) >= 500:
            _LOCATION_CACHE.clear()
        _LOCATION_CACHE[cache_key] = address
        return JSONResponse({"address": address, "source": "OpenStreetMap"})


async def manifest_v5():
    cfg = get_platform_snapshot()
    icon_192 = cfg.get("pwa_icon_192_url") or f"/pwa/ahnsen-app-{ICON_VERSION}-192.png"
    icon_512 = cfg.get("pwa_icon_512_url") or f"/pwa/ahnsen-app-{ICON_VERSION}-512.png"
    return JSONResponse(
        {
            "id": f"/?app-id={cfg['platform_slug']}",
            "name": cfg["platform_name"],
            "short_name": cfg["short_name"],
            "description": cfg["description"],
            "lang": cfg["default_language"],
            "start_url": "/?installed=1",
            "scope": "/",
            "display": "standalone",
            "orientation": "portrait-primary",
            "background_color": "#fbf8f0",
            "theme_color": cfg["primary_color"],
            "prefer_related_applications": False,
            "categories": ["government", "utilities", "social"],
            "icons": [
                {"src": icon_192, "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
                {"src": icon_512, "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
            ],
            "shortcuts": [
                {"name": "Mangel melden", "url": "/mangel-melden", "icons": [{"src": icon_192, "sizes": "192x192", "type": "image/png"}]},
                {"name": "DGH anfragen", "url": "/dgh-anfrage", "icons": [{"src": icon_192, "sizes": "192x192", "type": "image/png"}]},
                {"name": "Warnungen", "url": "/warnungen", "icons": [{"src": icon_192, "sizes": "192x192", "type": "image/png"}]},
                {"name": "Mein Profil", "url": "/profil", "icons": [{"src": icon_192, "sizes": "192x192", "type": "image/png"}]},
            ],
        },
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache", "Expires": "0"},
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
if (typeof document !== 'undefined') {
  (() => {
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
}
"""


_LOCATION_HELPER = r"""
if (typeof document !== 'undefined') {
  (() => {
    const setupLocationLookup = () => {
      const button = document.getElementById('use-location');
      const status = document.getElementById('location-status');
      if (!button || !status || button.dataset.addressLookupReady === '1') return;
      button.dataset.addressLookupReady = '1';

      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (!navigator.geolocation) {
          status.textContent = 'Standortfunktion wird von diesem Gerät nicht unterstützt.';
          return;
        }

        button.disabled = true;
        status.textContent = 'Standort wird ermittelt …';

        navigator.geolocation.getCurrentPosition(
          async position => {
            const latValue = position.coords.latitude.toFixed(6);
            const lonValue = position.coords.longitude.toFixed(6);
            const latitude = document.getElementById('latitude');
            const longitude = document.getElementById('longitude');
            const locationInput = document.querySelector('input[name="ort"]');

            if (latitude) latitude.value = latValue;
            if (longitude) longitude.value = lonValue;
            status.textContent = 'Adresse wird aus dem Standort ermittelt …';

            try {
              const response = await fetch(
                `/api/location/address?lat=${encodeURIComponent(latValue)}&lon=${encodeURIComponent(lonValue)}`,
                { credentials: 'same-origin' }
              );
              if (!response.ok) throw new Error('Adresse nicht verfügbar');
              const data = await response.json();
              if (!data.address || !locationInput) throw new Error('Adresse nicht verfügbar');

              locationInput.value = data.address;
              locationInput.dispatchEvent(new Event('input', { bubbles: true }));
              locationInput.dispatchEvent(new Event('change', { bubbles: true }));
              status.innerHTML = 'Adresse automatisch erkannt · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap-Mitwirkende</a>';
            } catch (_error) {
              status.textContent = 'GPS wurde gespeichert. Die Adresse konnte nicht automatisch erkannt werden – bitte den Ort kurz ergänzen.';
            } finally {
              button.disabled = false;
            }
          },
          () => {
            status.textContent = 'Standort konnte nicht übernommen werden. Bitte Standortfreigabe prüfen oder den Ort manuell eintragen.';
            button.disabled = false;
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      }, true);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupLocationLookup, { once: true });
    } else {
      setupLocationLookup();
    }
  })();
}
"""


async def pwa_javascript_v6():
    cfg = get_platform_snapshot()
    source = (STATIC_DIR / "pwa.js").read_text(encoding="utf-8")
    source = source.replace("ahnsen-hilft-public-v3", f"{cfg['platform_slug']}-public-v7")
    source = source.replace("Ahnsen hilft", cfg["platform_name"])
    source = source.replace("/pwa/icon-192.png", cfg.get("pwa_icon_192_url") or "/pwa/ahnsen-app-v5-192.png")
    source = source.replace("/pwa/icon-512.png", cfg.get("pwa_icon_512_url") or "/pwa/ahnsen-app-v5-512.png")
    source = source.replace("?worker=3", f"?worker={SERVICE_WORKER_VERSION}")
    source = source.replace(
        "          const registration = await navigator.serviceWorker.ready;\n",
        """          const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(
              () => reject(new Error('Der Push-Dienst konnte nicht gestartet werden. Lade die Seite neu und versuche es erneut.')),
              12000
            ))
          ]);
""",
        1,
    )
    return Response(
        source + _PUSH_HELPER.replace("/pwa/ahnsen-app-v5-180.png", cfg.get("apple_touch_icon_url") or "/pwa/ahnsen-app-v5-180.png") + _LOCATION_HELPER,
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
            "/api/location/address",
            reverse_location,
            methods=["GET"],
            name="reverse_location",
        ),
        APIRoute(
            "/pwa.js",
            pwa_javascript_v6,
            methods=["GET"],
            name="pwa_javascript_v6",
        ),
    ]
):
    app.router.routes.insert(0, route)

# Ensure every community feature route is present in the actual production
# application. APIRouter routes are safe to append directly because they are
# already fully configured APIRoute instances. Missing routes only are added,
# so the compatibility layer stays idempotent.
from community_routes import router as _community_router
for _feature_route in _community_router.routes:
    _feature_path = getattr(_feature_route, "path", "")
    _feature_methods = frozenset(getattr(_feature_route, "methods", set()) or set())
    if not any(
        getattr(_existing_route, "path", "") == _feature_path
        and frozenset(getattr(_existing_route, "methods", set()) or set()) == _feature_methods
        for _existing_route in app.router.routes
    ):
        app.router.routes.append(_feature_route)

# Bus & Mobilität: install public mobility routes and the home-page tile.
from mobility_routes import install_mobility
install_mobility(app)
