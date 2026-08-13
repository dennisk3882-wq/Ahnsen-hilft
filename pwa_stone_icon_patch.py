from __future__ import annotations

import io
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response
from PIL import Image

import current_events_mobile_patch as current_mobile
from platform_runtime import get_platform_snapshot


router = APIRouter()
SOURCE = Path(__file__).resolve().parent / "static" / "ahnsen-stone-icon-v1.png"
ICON_VERSION = "stone-v1"
ICON_SIZES = {180, 192, 512}


@lru_cache(maxsize=3)
def _icon_bytes(size: int) -> bytes:
    if size not in ICON_SIZES or not SOURCE.exists():
        raise FileNotFoundError("PWA-Steinicon fehlt")
    with Image.open(SOURCE) as image:
        image = image.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format="PNG", optimize=True)
        return output.getvalue()


def _icon_url(size: int) -> str:
    return f"/pwa/ahnsen-{ICON_VERSION}-{size}.png"


@router.get("/pwa/ahnsen-stone-v1-{size}.png", include_in_schema=False)
async def stone_icon(size: int):
    if size not in ICON_SIZES:
        raise HTTPException(status_code=404, detail="Icon nicht gefunden")
    try:
        data = _icon_bytes(size)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Icon nicht gefunden") from error
    return Response(
        content=data,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/manifest.webmanifest", include_in_schema=False)
async def stone_manifest():
    cfg = get_platform_snapshot()
    icon_192 = _icon_url(192)
    icon_512 = _icon_url(512)
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
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.get("/pwa.js", include_in_schema=False)
async def stone_icon_pwa_js():
    response = await current_mobile.compact_current_events_pwa_js()
    source = response.body.decode("utf-8")
    source = source.replace("/manifest.webmanifest?v=5", "/manifest.webmanifest?v=6")
    source = source.replace("/pwa/ahnsen-app-v5-180.png", _icon_url(180))
    source = source.replace("/pwa/ahnsen-app-v5-192.png", _icon_url(192))
    source = source.replace("/pwa/ahnsen-app-v5-512.png", _icon_url(512))
    source = source.replace("/pwa/icon-192.png", _icon_url(192))
    source = source.replace("/pwa/icon-512.png", _icon_url(512))
    return Response(
        source,
        media_type="application/javascript; charset=utf-8",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )
