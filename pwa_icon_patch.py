from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from platform_runtime import get_platform_snapshot
from pwa_core import STATIC_DIR


router = APIRouter()
ICON_VERSION = "v6"
ICON_SOURCE = STATIC_DIR / "icon-ahnsen.svg"
ICON_SIZES = {180, 192, 512}


def _icon_path(size: int):
    return STATIC_DIR / f"ahnsen-app-{ICON_VERSION}-{size}.png"


def _ensure_icons() -> None:
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


@router.get("/manifest.webmanifest", include_in_schema=False)
async def stone_manifest():
    cfg = get_platform_snapshot()
    icon_192 = f"/pwa/ahnsen-app-{ICON_VERSION}-192.png"
    icon_512 = f"/pwa/ahnsen-app-{ICON_VERSION}-512.png"
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


@router.get("/pwa/ahnsen-app-v6-{size}.png", include_in_schema=False)
async def stone_icon_v6(size: int):
    if size not in ICON_SIZES:
        raise HTTPException(status_code=404, detail="Icon nicht gefunden")
    _ensure_icons()
    return FileResponse(
        _icon_path(size),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/pwa/ahnsen-app-v5-{size}.png", include_in_schema=False)
async def stone_icon_v5_compat(size: int):
    """Keep old Apple-touch/icon references compatible while serving the new stone."""
    if size not in ICON_SIZES:
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
