from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from platform_runtime import get_platform_snapshot
from pwa_core import STATIC_DIR


router = APIRouter()
ICON_VERSION = "v7"
ICON_SIZES = {180, 192, 512}
MASTER_SIZE = 512


def _icon_path(size: int):
    return STATIC_DIR / f"ahnsen-app-{ICON_VERSION}-{size}.png"


def _hero_photo() -> Image.Image:
    """Load the real Ahnsen stone photo already used by the production homepage."""
    from home_dashboard_final_polish import _hero_image_bytes

    return Image.open(BytesIO(_hero_image_bytes())).convert("RGB")


def _build_master_icon() -> Image.Image:
    """Create the photographic launcher icon from the real Ahnsen hero image."""
    photo = _hero_photo()

    # The memorial stone sits in the central/right part of the hero image.
    # Keep it prominent while retaining enough sunset, village and meadow to
    # match the photographic icon design used by Ahnsen hilft.
    photo = ImageEnhance.Brightness(photo).enhance(1.04)
    photo = ImageEnhance.Color(photo).enhance(1.04)
    photo = ImageEnhance.Contrast(photo).enhance(1.03)
    photo = ImageOps.fit(
        photo,
        (444, 444),
        method=Image.Resampling.LANCZOS,
        centering=(0.66, 0.55),
    )

    canvas = Image.new("RGB", (MASTER_SIZE, MASTER_SIZE), "#174936")

    # Soft shadow below the light frame so the icon keeps depth even at small
    # launcher sizes.
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (20, 23, 492, 495),
        radius=78,
        fill=(4, 25, 17, 105),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(8))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB")

    # Warm ivory frame matching the supplied app-icon design.
    frame = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    frame_draw = ImageDraw.Draw(frame)
    frame_draw.rounded_rectangle(
        (22, 18, 490, 486),
        radius=78,
        fill="#f1e3ba",
    )
    canvas = Image.alpha_composite(canvas.convert("RGBA"), frame).convert("RGB")

    # Photographic inner area with a slightly tighter corner radius.
    inner_mask = Image.new("L", canvas.size, 0)
    mask_draw = ImageDraw.Draw(inner_mask)
    mask_draw.rounded_rectangle((35, 31, 477, 473), radius=66, fill=255)
    photo_layer = Image.new("RGB", canvas.size, "#174936")
    photo_layer.paste(photo, (34, 30))
    canvas.paste(photo_layer, (0, 0), inner_mask)

    return canvas


def _ensure_icons() -> None:
    master = _build_master_icon()
    for size in ICON_SIZES:
        target = _icon_path(size)
        if target.exists():
            continue
        rendered = master.resize((size, size), Image.Resampling.LANCZOS)
        rendered.save(target, format="PNG", optimize=True)


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


@router.get("/pwa/ahnsen-app-v7-{size}.png", include_in_schema=False)
async def stone_icon_v7(size: int):
    if size not in ICON_SIZES:
        raise HTTPException(status_code=404, detail="Icon nicht gefunden")
    _ensure_icons()
    return FileResponse(
        _icon_path(size),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


async def _compat_icon(size: int):
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


@router.get("/pwa/ahnsen-app-v6-{size}.png", include_in_schema=False)
async def stone_icon_v6_compat(size: int):
    """Serve the new photographic icon for older v6 references."""
    return await _compat_icon(size)


@router.get("/pwa/ahnsen-app-v5-{size}.png", include_in_schema=False)
async def stone_icon_v5_compat(size: int):
    """Serve the new photographic icon for older Apple/PWA references."""
    return await _compat_icon(size)
