from __future__ import annotations

import re
from datetime import date, timedelta
from html import escape

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

import home_weather_center as center
from muelltermine_crud import get_naechste_muelltermine
from veranstaltungen_crud import get_aktive_veranstaltungen


router = APIRouter()

FINAL_HOME_CSS = r'''
<style id="home-dashboard-final-polish">
.home-dashboard-v2 .hero-card{min-height:225px!important}
.home-dashboard-v2 .hero-overlay{inset:auto 22px 17px!important}
.home-dashboard-v2 .hero-overlay h1{font-size:clamp(29px,5.9vw,45px)!important}
.home-quick-card{min-height:90px!important;grid-template-columns:39px minmax(0,1fr) 13px!important;align-items:center!important}
.home-quick-card>div{display:grid!important;grid-template-rows:14px 32px 14px;align-content:center;min-width:0}
.home-quick-card small{align-self:end}
.home-quick-card strong{align-self:start;margin-top:1px!important;line-height:1.22!important}
.home-quick-card .home-quick-meta{align-self:start;margin-top:1px!important}
.home-quick-arrow{align-self:center}
@media(max-width:560px){
  .home-dashboard-v2 .hero-card{min-height:205px!important}
  .home-dashboard-v2 .hero-overlay{inset:auto 18px 14px!important}
  .home-dashboard-v2 .hero-overlay h1{font-size:29px!important;line-height:1!important}
  .home-dashboard-v2 .hero-overlay p{font-size:11px!important;line-height:1.3!important}
}
</style>
'''


def _waste_summary(value: str | None) -> str:
    text = str(value or "").strip()
    if not text:
        return "Müllabfuhr"
    parts = [part.strip() for part in re.split(r"[,;/]+", text) if part.strip()]
    if not parts:
        return "Müllabfuhr"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} + {len(parts) - 1} weitere"


def _waste_day_label(value: date | None, today: date) -> str:
    if value == today:
        return "Heute"
    if value == today + timedelta(days=1):
        return "Morgen"
    return "Nächste Müllabfuhr"


def _quick_overview() -> str:
    now = center._local_now()
    today = now.date()
    greeting = "Guten Morgen" if now.hour < 11 else "Guten Tag" if now.hour < 18 else "Guten Abend"

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
  <div class="home-greeting-compact"><div><span class="eyebrow">{escape(greeting)} 👋</span><h2>Schön, dass du da bist.</h2></div></div>
  <div class="home-quick-grid">
    <a class="home-quick-card" href="{escape(event_href)}" aria-label="{escape(event_label)}: {escape(event_title)}"><span>▣</span><div><small>{escape(event_label)}</small><strong>{escape(event_title)}</strong><span class="home-quick-meta">{escape(event_meta)}</span></div><span class="home-quick-arrow">›</span></a>
    <a class="home-quick-card" href="/muelltermine-info" aria-label="{escape(waste_label)}: {escape(waste_full)}" title="{escape(waste_full)}"><span>♻</span><div><small>{escape(waste_label)}</small><strong>{escape(waste_title)}</strong><span class="home-quick-meta">{escape(waste_meta)}</span></div><span class="home-quick-arrow">›</span></a>
  </div>
</section>
'''


def _polish_response(response: HTMLResponse) -> HTMLResponse:
    html = response.body.decode("utf-8")
    html = html.replace("</head>", FINAL_HOME_CSS + "</head>", 1)
    html = re.sub(
        r"Informationen,\s*Veranstaltungen,\s*DGH,\s*Mülltermine\s*und\s*Anliegen\s*an\s*einem\s*Ort\s*–\s*modern,\s*direkt\s*und\s*bürgernah\.",
        "Informationen, Termine, DGH, Müllabfuhr und Anliegen an einem Ort – modern, direkt und bürgernah.",
        html,
        count=1,
    )
    html = re.sub(
        r'<section class="home-day-overview">.*?</section>',
        _quick_overview(),
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


@router.get("/")
async def final_home_dashboard():
    response = await center.compact_home_with_weather()
    return _polish_response(response)
