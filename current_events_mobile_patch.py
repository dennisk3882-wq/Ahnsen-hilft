from __future__ import annotations

from datetime import date
from html import escape

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, Response

import current_events_patch as center
from gemeinde_crud import get_gemeinde_einstellungen
from pwa_ui import page
from veranstaltungen_crud import get_aktive_veranstaltungen, get_vergangene_veranstaltungen


router = APIRouter()

# These two entries are installation/demo copy, not village news. Keep the data
# intact for administration/compatibility, but do not surface it as current news.
HIDDEN_SEED_NEWS = {
    "Digitale Bürgerplattform gestartet",
    "WhatsApp-Bot verfügbar",
}

COMPACT_CSS = r'''
<style>
.ctm{display:grid;gap:14px;min-width:0;max-width:100%;padding-bottom:165px}
.ctm-head{padding-top:2px}.ctm-back{display:inline-flex;margin-bottom:10px;color:var(--forest);font-weight:900;text-decoration:none}
.ctm-head h1{margin:0 0 6px;color:#10281e;font-size:clamp(31px,7vw,42px);line-height:1.03;letter-spacing:-.025em}
.ctm-head p{margin:0;color:var(--muted);font-size:14px;line-height:1.45}
.ctm-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ctm-tab{display:flex;align-items:center;justify-content:center;min-height:44px;padding:9px 11px;border:1px solid #d5dfd2;border-radius:15px;background:#fff;color:var(--forest);font-size:12px;font-weight:950;text-decoration:none;text-align:center}.ctm-tab.active{background:var(--forest);border-color:var(--forest);color:#fff}
.ctm-filters{display:flex;gap:7px;overflow-x:auto;max-width:100%;padding:0 0 3px;scrollbar-width:none}.ctm-filters::-webkit-scrollbar{display:none}.ctm-filter{flex:0 0 auto;padding:8px 11px;border:1px solid #d5dfd2;border-radius:999px;background:#fff;color:var(--forest);font-size:11px;font-weight:900;text-decoration:none;white-space:nowrap}.ctm-filter.active{background:var(--forest);border-color:var(--forest);color:#fff}.ctm-sep{flex:0 0 1px;width:1px;margin:3px 1px;background:#d8e0d5}
.ctm-section{display:grid;gap:9px}.ctm-title{display:flex;align-items:end;justify-content:space-between;gap:10px}.ctm-kicker{display:block;color:#90a879;font-size:10px;font-weight:950;letter-spacing:.13em;text-transform:uppercase}.ctm-title h2{margin:2px 0 0;color:var(--forest);font-size:23px;line-height:1.05}.ctm-count{color:var(--muted);font-size:10px;white-space:nowrap}
.ctm-event{display:grid;grid-template-columns:66px minmax(0,1fr);overflow:hidden;border:1px solid #dce5d9;border-radius:19px;background:#fff;color:inherit;text-decoration:none;box-shadow:0 7px 20px rgba(28,72,48,.045)}.ctm-date{display:grid;place-content:center;text-align:center;padding:9px;background:#f0f5ed;color:var(--forest);border-right:1px solid #e2e8df}.ctm-date strong{font-size:22px;line-height:1}.ctm-date span{margin-top:4px;font-size:10px;font-weight:950;text-transform:uppercase}.ctm-body{min-width:0;padding:12px 13px}.ctm-top{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.ctm-badge{display:inline-flex;padding:4px 7px;border-radius:999px;background:#edf4e9;color:var(--forest);font-size:8px;font-weight:950}.ctm-badge.past{background:#edf0eb;color:#68756c}.ctm-event h3{margin:5px 0 3px;color:var(--forest);font-size:17px;line-height:1.18;overflow-wrap:anywhere}.ctm-event p{display:-webkit-box;margin:0;overflow:hidden;color:var(--muted);font-size:12px;line-height:1.35;-webkit-line-clamp:2;-webkit-box-orient:vertical}.ctm-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:7px;color:#526158;font-size:10px}.ctm-meta span{min-width:0;overflow-wrap:anywhere}
.ctm-news-list{display:grid;gap:7px}.ctm-news{padding:12px 14px;border:1px solid #dce5d9;border-radius:17px;background:#fff;box-shadow:0 6px 18px rgba(28,72,48,.035)}.ctm-news h3{margin:2px 0 3px;color:var(--forest);font-size:15px;line-height:1.25}.ctm-news p{display:-webkit-box;margin:0;overflow:hidden;color:var(--muted);font-size:12px;line-height:1.4;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ctm-archive-link{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;border:1px solid #dce5d9;border-radius:19px;background:linear-gradient(145deg,#fff,#edf6e9);color:inherit;text-decoration:none}.ctm-archive-link h3{margin:2px 0;color:var(--forest);font-size:17px}.ctm-archive-link p{margin:0;color:var(--muted);font-size:11px;line-height:1.35}.ctm-arrow{font-size:25px;color:var(--forest)}
.ctm-empty{padding:21px 15px;border:1px dashed #ccd8c9;border-radius:18px;background:#fbfcf9;text-align:center;color:var(--muted);font-size:12px;line-height:1.45}
.ctm-archive-filters{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ctm-select{min-width:0;width:100%;height:44px;padding:0 34px 0 12px;border:1px solid #d5dfd2;border-radius:14px;background:#fff;color:var(--forest);font:inherit;font-size:12px;font-weight:900}
@media(max-width:420px){.ctm{gap:12px}.ctm-head h1{font-size:30px}.ctm-tabs{gap:6px}.ctm-tab{font-size:11px}.ctm-event{grid-template-columns:61px minmax(0,1fr)}.ctm-body{padding:11px}.ctm-archive-filters{grid-template-columns:1fr 1fr}}
</style>
'''


def _display_title(value: str | None) -> str:
    text = str(value or "Veranstaltung").strip() or "Veranstaltung"
    if text and text[0].islower():
        return text[0].upper() + text[1:]
    return text


def _display_time(value: str | None) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    low = text.lower()
    if low.endswith("uhr"):
        return text
    if text.isdigit() and 0 <= int(text) <= 23:
        return f"{int(text):02d}:00 Uhr"
    if len(text) in {4, 5} and ":" in text:
        parts = text.split(":", 1)
        if all(part.isdigit() for part in parts):
            hour, minute = int(parts[0]), int(parts[1])
            if 0 <= hour <= 23 and 0 <= minute <= 59:
                return f"{hour:02d}:{minute:02d} Uhr"
    return text


def _compact_news(settings: dict) -> list[tuple[str, str]]:
    return [item for item in center._news_items(settings) if item[0] not in HIDDEN_SEED_NEWS]


def _date_tile(event) -> str:
    value = center._event_date(event)
    if not value:
        return '<div class="ctm-date"><strong>•</strong><span>Termin</span></div>'
    return f'<div class="ctm-date"><strong>{value.day:02d}</strong><span>{escape(value.strftime("%b"))}</span></div>'


def _event_card(event, *, past: bool = False, reminder_ids: set[int] | None = None) -> str:
    category = center._event_category(event)
    when = _display_time(getattr(event, "uhrzeit", ""))
    place = str(getattr(event, "ort", "") or "").strip()
    description = str(getattr(event, "beschreibung", "") or "Weitere Informationen folgen.").strip()
    recap = str(getattr(event, "rueckblick_text", "") or "").strip()
    photos = len(center._gallery(event))
    meta: list[str] = []
    if when:
        meta.append(f"🕒 {escape(when)}")
    if place:
        meta.append(f"📍 {escape(place)}")
    if past:
        if recap:
            meta.append("📝 Nachbericht")
        if photos:
            meta.append(f"📷 {photos} Foto{'s' if photos != 1 else ''}")
    active_reminder = bool(reminder_ids and event.id in reminder_ids)
    reminder = '<span class="ctm-badge">🔔 aktiv</span>' if active_reminder and not past else ""
    badge = "Rückblick" if past else category
    return (
        f'<a class="ctm-event" href="/aktuelles-termine/{event.id}">{_date_tile(event)}'
        f'<div class="ctm-body"><div class="ctm-top"><span class="ctm-badge{" past" if past else ""}">{escape(badge)}</span>{reminder}</div>'
        f'<h3>{escape(_display_title(getattr(event, "titel", "Veranstaltung")))}</h3>'
        f'<p>{escape(description[:220])}</p><div class="ctm-meta">'
        + "".join(f"<span>{item}</span>" for item in meta)
        + "</div></div></a>"
    )


def _filter_bar(period: str, category: str, categories: list[str]) -> str:
    periods = [("heute", "Heute"), ("woche", "Woche"), ("wochenende", "Wochenende"), ("alle", "Alle Tage")]
    left = "".join(
        f'<a class="ctm-filter{" active" if period == key else ""}" href="{center._query_link(view="aktuell", period=key, category=category)}">{label}</a>'
        for key, label in periods
    )
    topic_all = f'<a class="ctm-filter{" active" if not category else ""}" href="{center._query_link(view="aktuell", period=period)}">Alle Themen</a>'
    topics = []
    for item in ["Gemeinde", *categories]:
        if item in topics:
            continue
        topics.append(item)
    right = "".join(
        f'<a class="ctm-filter{" active" if category == item else ""}" href="{center._query_link(view="aktuell", period=period, category=item)}">{escape(item)}</a>'
        for item in topics
    )
    return f'<div class="ctm-filters">{left}<span class="ctm-sep" aria-hidden="true"></span>{topic_all}{right}</div>'


def _archive_filters(category: str, year: str, categories: list[str], years: list[str]) -> str:
    year_options = '<option value="">Alle Jahre</option>' + "".join(
        f'<option value="{escape(item)}"{" selected" if year == item else ""}>{escape(item)}</option>' for item in years
    )
    category_options = '<option value="">Alle Kategorien</option>' + "".join(
        f'<option value="{escape(item)}"{" selected" if category == item else ""}>{escape(item)}</option>' for item in categories
    )
    return (
        '<form class="ctm-archive-filters" method="get" action="/aktuelles-termine">'
        '<input type="hidden" name="ansicht" value="archiv">'
        f'<select class="ctm-select" name="jahr" aria-label="Jahr" onchange="this.form.submit()">{year_options}</select>'
        f'<select class="ctm-select" name="kategorie" aria-label="Kategorie" onchange="this.form.submit()">{category_options}</select>'
        '</form>'
    )


def _compact_main_page(request: Request, *, period: str = "alle", category: str = "", view: str = "aktuell", year: str = "") -> HTMLResponse:
    today = date.today()
    upcoming = list(get_aktive_veranstaltungen())
    past = list(get_vergangene_veranstaltungen())
    settings = get_gemeinde_einstellungen()
    user = center._current_user(request)
    reminder_ids = center._reminder_ids(getattr(user, "id", None))
    categories = sorted({center._event_category(item) for item in upcoming + past if center._event_category(item)})

    period = period if period in {"heute", "woche", "wochenende", "alle"} else "alle"
    view = "archiv" if view == "archiv" else "aktuell"
    if category and category not in categories and category != "Gemeinde":
        category = ""

    tabs = (
        f'<div class="ctm-tabs"><a class="ctm-tab{" active" if view == "aktuell" else ""}" href="{center._query_link(view="aktuell", period=period, category=category)}">Aktuell</a>'
        f'<a class="ctm-tab{" active" if view == "archiv" else ""}" href="{center._query_link(view="archiv", category=category, year=year)}">Archiv</a></div>'
    )

    if view == "aktuell":
        filtered = [item for item in upcoming if center._period_match(item, period, today) and (not category or center._event_category(item) == category)]
        event_html = "".join(_event_card(item, reminder_ids=reminder_ids) for item in filtered) or '<div class="ctm-empty"><strong>Keine passenden Termine.</strong><br>Wähle einen anderen Filter.</div>'
        filters = _filter_bar(period, category, categories)
        sections = (
            f'<section class="ctm-section"><div class="ctm-title"><div><span class="ctm-kicker">Dorfkalender</span><h2>Termine</h2></div><span class="ctm-count">{len(filtered)} angezeigt</span></div>{event_html}</section>'
        )
        news = _compact_news(settings) if not category or category == "Gemeinde" else []
        if news:
            news_html = "".join(
                f'<article class="ctm-news"><span class="ctm-kicker">Neuigkeit</span><h3>{escape(title)}</h3>{f"<p>{escape(body)}</p>" if body else ""}</article>'
                for title, body in news
            )
            sections += f'<section class="ctm-section"><div class="ctm-title"><div><span class="ctm-kicker">Aus dem Dorf</span><h2>Neuigkeiten</h2></div></div><div class="ctm-news-list">{news_html}</div></section>'
        if past:
            sections += '<a class="ctm-archive-link" href="/aktuelles-termine?ansicht=archiv"><div><span class="ctm-kicker">Dorfchronik</span><h3>Rückblicke & Archiv</h3><p>Fotos und Nachberichte vergangener Veranstaltungen.</p></div><span class="ctm-arrow">›</span></a>'
    else:
        years = sorted({str(value.year) for item in past if (value := center._event_date(item))}, reverse=True)
        if year and year not in years:
            year = ""
        filtered = [
            item for item in past
            if (not category or center._event_category(item) == category)
            and (not year or (center._event_date(item) and str(center._event_date(item).year) == year))
        ]
        filters = _archive_filters(category, year, categories, years)
        archive_html = "".join(_event_card(item, past=True) for item in filtered) or '<div class="ctm-empty"><strong>Noch keine passenden Rückblicke.</strong><br>Vergangene aktive Termine erscheinen hier automatisch.</div>'
        sections = f'<section class="ctm-section"><div class="ctm-title"><div><span class="ctm-kicker">Dorfchronik</span><h2>Rückblicke</h2></div><span class="ctm-count">{len(filtered)} im Archiv</span></div>{archive_html}</section>'

    body = (
        f'{COMPACT_CSS}<section class="ctm"><header class="ctm-head"><a class="ctm-back" href="/">← Start</a>'
        '<h1>Aktuelles &amp; Termine</h1><p>Was heute und demnächst in Ahnsen passiert.</p></header>'
        f'{tabs}{filters}{sections}</section>'
    )
    return page("Aktuelles & Termine", body, active="calendar", body_class="current-events-view")


@router.get("/aktuelles-termine")
async def compact_current_events(request: Request, zeitraum: str = "alle", kategorie: str = "", ansicht: str = "aktuell", jahr: str = ""):
    return _compact_main_page(request, period=zeitraum, category=kategorie, view=ansicht, year=jahr)


@router.get("/pwa.js")
async def compact_current_events_pwa_js():
    response = await center.current_events_pwa_js()
    source = response.body.decode("utf-8")
    source = source.replace(
        "{ key: 'calendar', href: '/aktuelles-termine', label: 'Aktuelles', description: 'Termine & Archiv', paths: ['/aktuelles-termine', '/veranstaltungen', '/aktuelles', '/buergerinformationen'] },",
        "{ key: 'calendar', href: '/aktuelles-termine', label: 'Aktuell', description: 'Termine', paths: ['/aktuelles-termine', '/veranstaltungen', '/aktuelles', '/buergerinformationen'] },",
    )
    return Response(
        source,
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache"},
    )
