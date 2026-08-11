from __future__ import annotations

import html as html_lib
import re
from html import escape

from fastapi.responses import HTMLResponse

import current_events_content_polish as detail
import current_events_mobile_patch as mobile
import current_events_patch as center
import main as legacy
from event_time_utils import (
    canonical_event_time,
    display_event_place,
    display_event_title,
    time_input_value,
)
from veranstaltungen_crud import get_veranstaltung


FINAL_MOBILE_CSS = r'''
<style>
/* Final mobile pass: clear space above the fixed bottom navigation. */
.ctm{padding-bottom:235px!important}
.ctm-section:last-child{padding-bottom:28px}
/* Keep one compact filter rail and make the swipe affordance visible. */
.ctm-filters{
  padding-right:30px!important;
  -webkit-mask-image:linear-gradient(to right,#000 0,#000 calc(100% - 26px),transparent 100%);
  mask-image:linear-gradient(to right,#000 0,#000 calc(100% - 26px),transparent 100%);
}
.ctm-filter{padding:8px 10px!important;font-size:10.5px!important}
/* The top Archiv tab already provides the archive entry point. */
.ctm-archive-link{display:none!important}
@media(max-width:420px){
  .ctm{padding-bottom:245px!important}
  .ctm-filter{padding:7px 9px!important;font-size:10px!important}
}
</style>
'''

ADMIN_TIME_CSS = r'''
<style>
.event-time-hint{display:block;margin-top:5px;color:var(--admin-muted);font-size:11px;line-height:1.35}
.event-form input[type="time"]{min-height:44px;background:var(--admin-paper)}
</style>
'''


def _response_with_html(response, html: str) -> HTMLResponse:
    headers = {
        key: value
        for key, value in getattr(response, "headers", {}).items()
        if key.lower() not in {"content-length", "content-type"}
    }
    return HTMLResponse(html, status_code=getattr(response, "status_code", 200), headers=headers)


# --- Public list helpers ---------------------------------------------------
mobile._display_time = canonical_event_time
mobile._display_title = display_event_title

_original_event_card = mobile._event_card


def _polished_event_card(event, *, past: bool = False, reminder_ids: set[int] | None = None) -> str:
    card = _original_event_card(event, past=past, reminder_ids=reminder_ids)
    raw_place = str(getattr(event, "ort", "") or "").strip()
    shown_place = display_event_place(raw_place)
    if raw_place and shown_place != raw_place:
        card = card.replace(f"📍 {escape(raw_place)}", f"📍 {escape(shown_place)}")
    return card


mobile._event_card = _polished_event_card

_original_compact_main_page = mobile._compact_main_page


def _final_compact_main_page(request, *, period: str = "alle", category: str = "", view: str = "aktuell", year: str = ""):
    response = _original_compact_main_page(
        request,
        period=period,
        category=category,
        view=view,
        year=year,
    )
    if not hasattr(response, "body"):
        return response
    html = response.body.decode("utf-8")
    if view != "archiv":
        # The top Archiv tab is enough; avoid a second large archive card.
        html = re.sub(
            r'<a class="ctm-archive-link"[^>]*>.*?</a>',
            "",
            html,
            count=1,
            flags=re.S,
        )
    if FINAL_MOBILE_CSS not in html:
        html = html.replace("</head>", FINAL_MOBILE_CSS + "</head>", 1)
    return _response_with_html(response, html)


mobile._compact_main_page = _final_compact_main_page


# --- Detail page + ICS normalization --------------------------------------
detail._display_title = display_event_title
detail._display_time_value = canonical_event_time
center._event_time = lambda event: canonical_event_time(getattr(event, "uhrzeit", ""))

_original_center_event_detail = center.event_detail


async def _final_center_event_detail(request, event_id: int, hinweis: str = ""):
    response = await _original_center_event_detail(request, event_id, hinweis)
    event = get_veranstaltung(event_id)
    if not event or not hasattr(response, "body"):
        return response
    html = response.body.decode("utf-8")
    raw_place = str(getattr(event, "ort", "") or "").strip()
    shown_place = display_event_place(raw_place)
    if raw_place and shown_place != raw_place:
        html = html.replace(
            f"📍 <span>{escape(raw_place)}</span>",
            f"📍 <span>{escape(shown_place)}</span>",
            1,
        )
    return _response_with_html(response, html)


center.event_detail = _final_center_event_detail


# --- Administration: native time picker ----------------------------------
_original_admin_dashboard = legacy.veranstaltungen_dashboard
_TIME_INPUT = re.compile(
    r'<input name="uhrzeit" value="([^"]*)" placeholder="18:00 Uhr">'
)


def _admin_time_replacement(match: re.Match[str]) -> str:
    raw = html_lib.unescape(match.group(1))
    value = escape(time_input_value(raw), quote=True)
    return (
        f'<input type="time" name="uhrzeit" value="{value}" step="300" '
        'aria-label="Uhrzeit">'
        '<small class="event-time-hint">Uhrzeit auswählen · 5-Minuten-Schritte</small>'
    )


def polished_veranstaltungen_dashboard(bearbeiten_id=None):
    response = _original_admin_dashboard(bearbeiten_id)
    if not hasattr(response, "body"):
        return response
    html = response.body.decode("utf-8")
    html = _TIME_INPUT.sub(_admin_time_replacement, html, count=1)
    if ADMIN_TIME_CSS not in html:
        html = html.replace("</head>", ADMIN_TIME_CSS + "</head>", 1)
    return _response_with_html(response, html)


# main.py's already registered admin endpoint reads this module global at
# request time, so replacing it here updates the existing route without a
# second admin route or a second dashboard.
legacy.veranstaltungen_dashboard = polished_veranstaltungen_dashboard
