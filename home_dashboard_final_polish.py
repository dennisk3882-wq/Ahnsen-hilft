from __future__ import annotations

import base64
import re
from datetime import date, timedelta
from html import escape
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, Response

import home_weather_center as center
from muelltermine_crud import get_naechste_muelltermine
from veranstaltungen_crud import get_aktive_veranstaltungen


router = APIRouter()
HERO_PARTS_DIR = Path(__file__).resolve().parent / "static" / "hero_parts"
HERO_IMAGE_VERSION = "v4"

FINAL_HOME_CSS = r'''
<style id="home-dashboard-final-polish">
.home-dashboard-v2 .hero-card{min-height:225px!important}
.home-dashboard-v2 .hero-image{position:relative!important;overflow:hidden!important;background-color:#315543!important;background-image:linear-gradient(90deg,rgba(8,31,22,.58) 0%,rgba(8,31,22,.42) 22%,rgba(8,31,22,.13) 33%,rgba(8,31,22,0) 43%),url('/assets/ahnsen-hero.webp?v=4')!important;background-size:cover!important;background-position:center 54%!important;background-repeat:no-repeat!important}
.home-dashboard-v2 .hero-image::after{content:none!important;display:none!important;background:none!important}
.home-dashboard-v2 .hero-overlay{inset:18px auto auto 22px!important;max-width:52%!important;z-index:3}
.home-dashboard-v2 .hero-kicker,.home-dashboard-v2 .hero-overlay p{display:none!important}
.home-dashboard-v2 .hero-overlay h1{max-width:none!important;margin:0!important;font-size:clamp(29px,5.5vw,42px)!important;line-height:.98!important;text-shadow:0 2px 12px rgba(0,0,0,.28)}
.home-quick-card{min-height:102px!important;grid-template-columns:39px minmax(0,1fr) 13px!important;align-items:center!important}
.home-quick-card>div{display:grid!important;grid-template-rows:14px 46px 14px;align-content:center;min-width:0}
.home-quick-card small{align-self:end}
.home-quick-card strong{align-self:start;margin-top:1px!important;line-height:1.18!important;-webkit-line-clamp:3!important}
.home-quick-card .home-quick-meta{align-self:start;margin-top:1px!important}
.home-quick-arrow{align-self:center}
.home-quick-card.waste-card strong{font-size:11px!important}
@media(max-width:560px){
  .home-dashboard-v2 .hero-card{min-height:205px!important}
  .home-dashboard-v2 .hero-image{background-position:center 56%!important}
  .home-dashboard-v2 .hero-overlay{inset:16px auto auto 18px!important;max-width:52%!important}
  .home-dashboard-v2 .hero-overlay h1{font-size:25px!important;line-height:.98!important}
}
</style>
'''


def _hero_image_bytes() -> bytes:
    parts = sorted(HERO_PARTS_DIR.glob("ahnsen-hero-*.b64"))
    if not parts:
        raise FileNotFoundError("Hero-Bildteile fehlen")
    encoded = "".join(part.read_text(encoding="ascii").strip() for part in parts)
    return base64.b64decode(encoded, validate=True)


def _first_name_for_request(request: Request | None) -> str:
    if request is None:
        return ""
    try:
        from pwa_core import _current_user

        user = _current_user(request)
    except Exception:
        return ""
    full_name = str(getattr(user, "name", "") or "").strip() if user else ""
    if not full_name:
        return ""
    return full_name.split()[0][:60]


def _waste_summary(value: str | None) -> str:
    text = str(value or "").strip()
    if not text:
        return "Müllabfuhr"
    parts = [part.strip() for part in re.split(r"[,;/]+", text) if part.strip()]
    if not parts:
        return "Müllabfuhr"
    return ", ".join(parts)


def _waste_day_label(value: date | None, today: date) -> str:
    if value == today:
        return "Heute"
    if value == today + timedelta(days=1):
        return "Morgen"
    return "Nächste Müllabfuhr"


def _quick_overview(request: Request | None = None) -> str:
    now = center._local_now()
    today = now.date()
    greeting = "Guten Morgen" if now.hour < 11 else "Guten Tag" if now.hour < 18 else "Guten Abend"
    first_name = _first_name_for_request(request)
    welcome = f"Schön, dass du da bist, {escape(first_name)}." if first_name else "Schön, dass du da bist."

    events = list(get_aktive_veranstaltungen())
    event = events[0] if events else None
    event_day = center._event_date(event) if event else None
    if event and event_day:
        if event_day == today:
            event_label = "Heute in Ahnsen"
        elif event_day == today + timedelta(days=1):
            event_label = "Morgen in Ahnsen"
        else:
            event_label = "Nächster Termin"
        event_title = center._display_title(getattr(event, "titel", ""), "Termin")
        event_meta = event_day.strftime("%d.%m.%Y")
        event_href = f"/aktuelles-termine/{event.id}"
    else:
        event_label = "Aktuelles & Termine"
        event_title = "Keine kommenden Termine"
        event_meta = "Kalender ansehen"
        event_href = "/aktuelles-termine"

    waste = list(get_naechste_muelltermine(limit=1))
    item = waste[0] if waste else None
    waste_day = getattr(item, "datum", None) if item else None
    if item:
        waste_label = _waste_day_label(waste_day if isinstance(waste_day, date) else None, today)
        waste_full = str(getattr(item, "abfuhrarten", "") or "Müllabfuhr").strip() or "Müllabfuhr"
        waste_title = _waste_summary(waste_full)
        waste_meta = waste_day.strftime("%d.%m.%Y") if isinstance(waste_day, date) else "Termin ansehen"
    else:
        waste_label = "Nächste Müllabfuhr"
        waste_full = "Noch kein Termin verfügbar"
        waste_title = waste_full
        waste_meta = "Abfallkalender ansehen"

    return f'''
<section class="home-day-overview">
  <div class="home-greeting-compact"><div><span class="eyebrow">{escape(greeting)} 👋</span><h2>{welcome}</h2></div></div>
  <div class="home-quick-grid">
    <a class="home-quick-card" href="{escape(event_href)}" aria-label="{escape(event_label)}: {escape(event_title)}"><span>▣</span><div><small>{escape(event_label)}</small><strong>{escape(event_title)}</strong><span class="home-quick-meta">{escape(event_meta)}</span></div><span class="home-quick-arrow">›</span></a>
    <a class="home-quick-card waste-card" href="/muelltermine-info" aria-label="{escape(waste_label)}: {escape(waste_full)}" title="{escape(waste_full)}"><span>♻</span><div><small>{escape(waste_label)}</small><strong>{escape(waste_title)}</strong><span class="home-quick-meta">{escape(waste_meta)}</span></div><span class="home-quick-arrow">›</span></a>
  </div>
</section>
'''


def _polish_response(response: HTMLResponse, request: Request | None = None) -> HTMLResponse:
    html = response.body.decode("utf-8")
    html = html.replace("</head>", FINAL_HOME_CSS + "</head>", 1)
    html = re.sub(
        r'<span class="hero-kicker">.*?</span>',
        "",
        html,
        count=1,
        flags=re.S,
    )
    html = re.sub(
        r'(<div class="hero-overlay">\s*<h1>.*?</h1>)\s*<p>.*?</p>',
        r"\1",
        html,
        count=1,
        flags=re.S,
    )
    html = re.sub(
        r'<section class="home-day-overview">.*?</section>',
        _quick_overview(request),
        html,
        count=1,
        flags=re.S,
    )
    headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower() not in {"content-length", "content-type"}
    }
    return HTMLResponse(html, status_code=response.status_code, headers=headers)


@router.get("/assets/ahnsen-hero.webp", include_in_schema=False)
async def ahnsen_hero_image():
    try:
        image = _hero_image_bytes()
    except (FileNotFoundError, ValueError, base64.binascii.Error) as error:
        raise HTTPException(status_code=404, detail="Hero-Bild nicht gefunden") from error
    return Response(
        content=image,
        media_type="image/webp",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/")
async def final_home_dashboard(request: Request = None):
    response = await center.compact_home_with_weather()
    return _polish_response(response, request)
