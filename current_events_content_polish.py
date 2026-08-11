from __future__ import annotations

from html import escape

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

import current_events_patch as center
from veranstaltungen_crud import get_veranstaltung


router = APIRouter()


def _display_title(value: str | None) -> str:
    text = str(value or "Veranstaltung").strip() or "Veranstaltung"
    if text and text[0].islower():
        return text[0].upper() + text[1:]
    return text


def _display_time_value(value: str | None) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.lower().endswith("uhr"):
        return text
    if text.isdigit() and 0 <= int(text) <= 23:
        return f"{int(text):02d}:00 Uhr"
    if ":" in text:
        parts = text.split(":", 1)
        if len(parts) == 2 and all(part.isdigit() for part in parts):
            hour, minute = int(parts[0]), int(parts[1])
            if 0 <= hour <= 23 and 0 <= minute <= 59:
                return f"{hour:02d}:{minute:02d} Uhr"
    return text


def normalized_event_time(event) -> str:
    return _display_time_value(getattr(event, "uhrzeit", ""))


# Detail rendering and ICS generation in current_events_patch both call this
# helper. Normalizing it here makes hour-only legacy values such as "17"
# become a real 17:00 appointment instead of an all-day ICS event.
center._event_time = normalized_event_time


@router.get("/aktuelles-termine/{event_id}")
async def polished_event_detail(request: Request, event_id: int, hinweis: str = ""):
    response = await center.event_detail(request, event_id, hinweis)
    event = get_veranstaltung(event_id)
    if not event or getattr(event, "aktiv", "") != "Ja" or not hasattr(response, "body"):
        return response

    html = response.body.decode("utf-8")
    raw_title = escape(str(getattr(event, "titel", "") or "Veranstaltung"))
    shown_title = escape(_display_title(getattr(event, "titel", "")))
    html = html.replace(f"<h1>{raw_title}</h1>", f"<h1>{shown_title}</h1>", 1)
    return HTMLResponse(html, status_code=response.status_code)
