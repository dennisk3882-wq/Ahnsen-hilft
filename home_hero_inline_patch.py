from __future__ import annotations

import base64
from functools import lru_cache

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

import home_dashboard_final_polish as final


router = APIRouter()

HERO_LAYOUT_FIX = r'''
<style id="hero-layout-root-fix">
.home-dashboard-v2 .hero-image{position:absolute!important;inset:0!important;width:auto!important;height:auto!important}
.home-dashboard-v2 .hero-card:after{background:transparent!important}
</style>
'''


@lru_cache(maxsize=1)
def _hero_data_uri() -> str:
    encoded = base64.b64encode(final._hero_image_bytes()).decode("ascii")
    return f"data:image/webp;base64,{encoded}"


def _with_inline_hero(response: HTMLResponse) -> HTMLResponse:
    html = response.body.decode("utf-8")
    html = html.replace(
        "url('/assets/ahnsen-hero.webp?v=4')",
        f'url("{_hero_data_uri()}")',
        1,
    )
    html = html.replace('href="/buergerinformationen"', 'href="/buergerservice"', 1)
    html = html.replace("Bürgerinformationen", "Bürgerservice", 1)
    html = html.replace("Hinweise der Gemeinde.", "Anträge, Dokumente &amp; Rathausservices.", 1)
    html = html.replace("</head>", HERO_LAYOUT_FIX + "</head>", 1)
    headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower() not in {"content-length", "content-type"}
    }
    return HTMLResponse(html, status_code=response.status_code, headers=headers)


@router.get("/")
async def home_with_inline_hero(request: Request = None):
    response = await final.final_home_dashboard(request)
    return _with_inline_hero(response)
