from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from current_events_models import EventReminder
from current_events_reminders import init_event_reminders_db, reminder_active, toggle_reminder
from database import Base, SessionLocal, engine
from gemeinde_crud import get_gemeinde_einstellungen
from pwa_crud import has_push_subscription
from pwa_ui import page
from veranstaltungen_crud import get_aktive_veranstaltungen, get_veranstaltung, get_vergangene_veranstaltungen


router = APIRouter()
Base.metadata.create_all(bind=engine)
init_event_reminders_db()


CSS = r'''
<style>
.ct{display:grid;gap:18px;min-width:0;max-width:100%}.ct-head{padding:8px 0 0}.ct-back{display:inline-flex;margin-bottom:18px;color:var(--forest);font-weight:900;text-decoration:none}.ct-eye{display:block;color:#90a879;font-size:12px;font-weight:950;letter-spacing:.13em;text-transform:uppercase}.ct-head h1{margin:7px 0 10px;color:#10281e;font-size:clamp(34px,7vw,54px);line-height:1.02}.ct-head p{margin:0;color:var(--muted);font-size:16px;line-height:1.55}.ct-tabs,.ct-chips{display:flex;gap:8px;overflow-x:auto;max-width:100%;padding:2px 0 5px;scrollbar-width:none}.ct-tabs::-webkit-scrollbar,.ct-chips::-webkit-scrollbar{display:none}.ct-chip{flex:0 0 auto;padding:10px 13px;border:1px solid #d5dfd2;border-radius:999px;background:#fff;color:var(--forest);font-size:12px;font-weight:900;text-decoration:none;white-space:nowrap}.ct-chip.active{background:var(--forest);border-color:var(--forest);color:#fff}.ct-section{display:grid;gap:12px}.ct-section-title{display:flex;align-items:end;justify-content:space-between;gap:12px}.ct-section-title h2{margin:4px 0 0;color:var(--forest);font-size:25px}.ct-count{color:var(--muted);font-size:11px;white-space:nowrap}.ct-news,.ct-event,.ct-archive-link,.ct-detail-card{border:1px solid #dce5d9;border-radius:23px;background:#fff;box-shadow:0 10px 28px rgba(28,72,48,.055)}.ct-news{padding:17px}.ct-news h3{margin:5px 0 7px;color:var(--forest);font-size:19px}.ct-news p{margin:0;color:var(--muted);line-height:1.5}.ct-event{display:grid;grid-template-columns:82px minmax(0,1fr);overflow:hidden;color:inherit;text-decoration:none}.ct-date{display:grid;place-content:center;text-align:center;padding:12px;background:#f0f5ed;color:var(--forest);border-right:1px solid #e2e8df}.ct-date strong{font-size:26px;line-height:1}.ct-date span{margin-top:5px;font-size:11px;font-weight:950;text-transform:uppercase}.ct-event-body{min-width:0;padding:15px}.ct-event-top{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.ct-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:#edf4e9;color:var(--forest);font-size:9px;font-weight:950}.ct-badge.past{background:#edf0eb;color:#68756c}.ct-event h3{margin:7px 0 6px;color:var(--forest);font-size:19px;line-height:1.2;overflow-wrap:anywhere}.ct-event p{margin:0;color:var(--muted);font-size:13px;line-height:1.45}.ct-meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:9px;color:#526158;font-size:11px}.ct-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.ct-btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:8px 12px;border:1px solid #cbd8c9;border-radius:13px;background:#fff;color:var(--forest);font:inherit;font-size:11px;font-weight:900;text-decoration:none;cursor:pointer}.ct-btn.primary{background:var(--forest);border-color:var(--forest);color:#fff}.ct-empty{padding:27px 17px;border:1px dashed #ccd8c9;border-radius:20px;background:#fbfcf9;text-align:center;color:var(--muted)}.ct-archive-link{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:17px;text-decoration:none;color:inherit;background:linear-gradient(145deg,#fff,#edf6e9)}.ct-archive-link h3{margin:3px 0;color:var(--forest);font-size:20px}.ct-archive-link p{margin:0;color:var(--muted);font-size:12px}.ct-arrow{font-size:28px;color:var(--forest)}.ct-detail-hero{overflow:hidden;border-radius:25px;background:#eef4eb}.ct-detail-hero img{display:block;width:100%;max-height:360px;object-fit:cover}.ct-detail-card{padding:19px}.ct-detail-card h1{margin:6px 0 10px;color:var(--forest);font-size:clamp(30px,7vw,46px);line-height:1.05}.ct-detail-copy{color:var(--muted);font-size:15px;line-height:1.6;white-space:pre-line}.ct-detail-meta{display:grid;gap:9px;margin:17px 0}.ct-detail-meta div{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:14px;background:#f5f8f2;color:#405448}.ct-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:13px}.ct-gallery img{width:100%;aspect-ratio:1.15;object-fit:cover;border-radius:13px;background:#edf1eb}.ct-recap{margin-top:18px;padding-top:17px;border-top:1px solid #e0e6dd}.ct-recap h2{margin:5px 0 9px;color:var(--forest)}.ct-notice{padding:12px 14px;border-radius:15px;background:#edf5e9;color:#40594a;font-size:12px;line-height:1.5}.ct-bottom{height:130px}
@media(max-width:560px){.ct-event{grid-template-columns:70px minmax(0,1fr)}.ct-date strong{font-size:23px}.ct-event-body,.ct-detail-card{padding:15px}.ct-section-title{align-items:flex-start}.ct-gallery{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
'''


def _event_date(event) -> date | None:
    try:
        return datetime.strptime(str(getattr(event, "datum", "") or "").strip(), "%d.%m.%Y").date()
    except (TypeError, ValueError):
        return None


def _event_time(event) -> str:
    return str(getattr(event, "uhrzeit", "") or "").strip()


def _event_category(event) -> str:
    return str(getattr(event, "kategorie", "") or "Veranstaltung").strip() or "Veranstaltung"


def _gallery(event) -> list[tuple[str, str]]:
    raw = getattr(event, "rueckblick_bilder_json", None)
    if not raw:
        return []
    try:
        values = json.loads(raw)
    except Exception:
        return []
    result = []
    for item in values if isinstance(values, list) else []:
        if not isinstance(item, dict):
            continue
        mime = str(item.get("mime") or "image/jpeg").lower()
        data = str(item.get("data") or "")
        if mime in {"image/jpeg", "image/png", "image/webp"} and data:
            result.append((mime, data))
    return result[:12]


def _news_items(settings: dict) -> list[tuple[str, str]]:
    result = []
    for raw in str(settings.get("aktuelles") or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        if "|" in line:
            title, body = line.split("|", 1)
        else:
            title, body = line, ""
        title = title.strip()
        body = body.strip()
        if title:
            result.append((title[:180], body[:1500]))
    return result[:30]


def _period_match(event, period: str, today: date) -> bool:
    value = _event_date(event)
    if not value:
        return period == "alle"
    if period == "heute":
        return value == today
    if period == "woche":
        end = today + timedelta(days=(6 - today.weekday()))
        return today <= value <= end
    if period == "wochenende":
        days_to_sat = (5 - today.weekday()) % 7
        saturday = today + timedelta(days=days_to_sat)
        sunday = saturday + timedelta(days=1)
        return value in {saturday, sunday}
    return value >= today


def _date_tile(event, past: bool = False) -> str:
    value = _event_date(event)
    if not value:
        return '<div class="ct-date"><strong>•</strong><span>Termin</span></div>'
    return f'<div class="ct-date"><strong>{value.day:02d}</strong><span>{escape(value.strftime("%b"))}</span></div>'


def _event_card(event, *, past: bool = False, reminder_ids: set[int] | None = None) -> str:
    category = _event_category(event)
    when = _event_time(event)
    place = str(getattr(event, "ort", "") or "").strip()
    description = str(getattr(event, "beschreibung", "") or "Weitere Informationen folgen.").strip()
    recap = str(getattr(event, "rueckblick_text", "") or "").strip()
    photos = len(_gallery(event))
    if past:
        extra = []
        if recap:
            extra.append("Nachbericht")
        if photos:
            extra.append(f"{photos} Foto{'s' if photos != 1 else ''}")
        footer = " · ".join(extra) if extra else "Im Archiv ansehen"
    else:
        footer = ""
    meta = []
    if when:
        meta.append(f"🕒 {escape(when)}")
    if place:
        meta.append(f"📍 {escape(place)}")
    active_reminder = bool(reminder_ids and event.id in reminder_ids)
    reminder_badge = '<span class="ct-badge">🔔 Erinnerung aktiv</span>' if active_reminder and not past else ""
    return f'''<a class="ct-event" href="/aktuelles-termine/{event.id}">{_date_tile(event,past)}<div class="ct-event-body"><div class="ct-event-top"><span class="ct-badge{' past' if past else ''}">{'Rückblick' if past else escape(category)}</span>{reminder_badge}</div><h3>{escape(str(event.titel or 'Veranstaltung'))}</h3><p>{escape(description[:220])}</p><div class="ct-meta">{''.join(f'<span>{x}</span>' for x in meta)}{f'<span>📷 {escape(footer)}</span>' if footer else ''}</div></div></a>'''


def _query_link(*, view: str, period: str = "alle", category: str = "", year: str = "") -> str:
    params = []
    if view and view != "aktuell":
        params.append(("ansicht", view))
    if period and period != "alle" and view != "archiv":
        params.append(("zeitraum", period))
    if category:
        params.append(("kategorie", category))
    if year and view == "archiv":
        params.append(("jahr", year))
    return "/aktuelles-termine" + ("?" + "&".join(f"{k}={quote(v)}" for k, v in params) if params else "")


def _reminder_ids(user_id: int | None) -> set[int]:
    if not user_id:
        return set()
    db = SessionLocal()
    try:
        return {row.event_id for row in db.query(EventReminder).filter(EventReminder.user_id == user_id).all()}
    finally:
        db.close()


def _current_user(request: Request):
    from pwa_core import _current_user as get_user
    return get_user(request)


def _main_page(request: Request, *, period: str = "alle", category: str = "", view: str = "aktuell", year: str = "") -> HTMLResponse:
    today = date.today()
    upcoming = list(get_aktive_veranstaltungen())
    past = list(get_vergangene_veranstaltungen())
    settings = get_gemeinde_einstellungen()
    user = _current_user(request)
    reminder_ids = _reminder_ids(getattr(user, "id", None))
    categories = sorted({_event_category(x) for x in upcoming + past if _event_category(x)})

    period = period if period in {"heute", "woche", "wochenende", "alle"} else "alle"
    view = "archiv" if view == "archiv" else "aktuell"
    if category and category not in categories and category != "Gemeinde":
        category = ""

    tabs = f'''<div class="ct-tabs"><a class="ct-chip{' active' if view=='aktuell' else ''}" href="{_query_link(view='aktuell',period=period,category=category)}">Aktuell & demnächst</a><a class="ct-chip{' active' if view=='archiv' else ''}" href="{_query_link(view='archiv',category=category,year=year)}">Rückblicke & Archiv</a></div>'''

    if view == "aktuell":
        periods = [("heute","Heute"),("woche","Diese Woche"),("wochenende","Wochenende"),("alle","Alle")]
        period_chips = '<div class="ct-chips">' + ''.join(f'<a class="ct-chip{" active" if period==key else ""}" href="{_query_link(view="aktuell",period=key,category=category)}">{label}</a>' for key,label in periods) + '</div>'
        filtered = [x for x in upcoming if _period_match(x, period, today) and (not category or _event_category(x) == category)]
        event_html = ''.join(_event_card(x, reminder_ids=reminder_ids) for x in filtered) or '<div class="ct-empty"><strong>Keine passenden Termine.</strong><br>Wähle einen anderen Zeitraum oder Filter.</div>'
        news = _news_items(settings) if not category or category == "Gemeinde" else []
        news_html = ''.join(f'<article class="ct-news"><span class="ct-eye">Neuigkeit</span><h3>{escape(title)}</h3>{f"<p>{escape(body)}</p>" if body else ""}</article>' for title,body in news)
        content_sections = ""
        if news_html:
            content_sections += f'<section class="ct-section"><div class="ct-section-title"><div><span class="ct-eye">Aus dem Dorf</span><h2>Aktuelles</h2></div></div>{news_html}</section>'
        content_sections += f'<section class="ct-section"><div class="ct-section-title"><div><span class="ct-eye">Dorfkalender</span><h2>Termine</h2></div><span class="ct-count">{len(filtered)} angezeigt</span></div>{event_html}</section>'
        if past:
            content_sections += f'<a class="ct-archive-link" href="{_query_link(view="archiv")}"><div><span class="ct-eye">Dorfchronik</span><h3>Rückblicke & Archiv</h3><p>Vergangene Veranstaltungen, Nachberichte und Fotos ansehen.</p></div><span class="ct-arrow">›</span></a>'
        filters = period_chips
    else:
        years = sorted({str(d.year) for x in past if (d := _event_date(x))}, reverse=True)
        if year and year not in years:
            year = ""
        year_chips = '<div class="ct-chips"><a class="ct-chip{}" href="{}">Alle Jahre</a>{}</div>'.format(' active' if not year else '', _query_link(view='archiv',category=category), ''.join(f'<a class="ct-chip{" active" if year==y else ""}" href="{_query_link(view="archiv",category=category,year=y)}">{y}</a>' for y in years))
        filtered = [x for x in past if (not category or _event_category(x)==category) and (not year or (_event_date(x) and str(_event_date(x).year)==year))]
        archive_html = ''.join(_event_card(x,past=True) for x in filtered) or '<div class="ct-empty"><strong>Noch keine passenden Rückblicke.</strong><br>Vergangene aktive Termine erscheinen hier automatisch.</div>'
        content_sections = f'<section class="ct-section"><div class="ct-section-title"><div><span class="ct-eye">Dorfchronik</span><h2>Vergangene Veranstaltungen</h2></div><span class="ct-count">{len(filtered)} im Archiv</span></div>{archive_html}</section>'
        filters = year_chips

    all_categories = (["Gemeinde"] if view == "aktuell" else []) + categories
    category_chips = '<div class="ct-chips"><a class="ct-chip{}" href="{}">Alle Kategorien</a>{}</div>'.format(' active' if not category else '', _query_link(view=view,period=period,year=year), ''.join(f'<a class="ct-chip{" active" if category==c else ""}" href="{_query_link(view=view,period=period,category=c,year=year)}">{escape(c)}</a>' for c in all_categories))

    body = f'''{CSS}<section class="ct"><header class="ct-head"><a class="ct-back" href="/">← Start</a><span class="ct-eye">Dein Dorf auf einen Blick</span><h1>Aktuelles & Termine</h1><p>Neuigkeiten, Veranstaltungen und später die schönsten Rückblicke aus Ahnsen – an einem Ort.</p></header>{tabs}{filters}{category_chips}{content_sections}<div class="ct-bottom"></div></section>'''
    return page("Aktuelles & Termine", body, active="calendar", body_class="current-events-view")


@router.get("/aktuelles-termine")
async def current_events(request: Request, zeitraum: str = "alle", kategorie: str = "", ansicht: str = "aktuell", jahr: str = ""):
    return _main_page(request, period=zeitraum, category=kategorie, view=ansicht, year=jahr)


@router.get("/veranstaltungen")
async def legacy_events_redirect():
    return RedirectResponse("/aktuelles-termine", status_code=301)


@router.get("/aktuelles")
async def legacy_news_redirect():
    return RedirectResponse("/aktuelles-termine", status_code=301)


def _ics_escape(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@router.get("/aktuelles-termine/{event_id}.ics")
async def event_ics(event_id: int):
    event = get_veranstaltung(event_id)
    if not event or event.aktiv != "Ja":
        return Response(status_code=404)
    event_day = _event_date(event)
    if not event_day:
        return Response(status_code=404)
    match = re.search(r"(\d{1,2}):(\d{2})", _event_time(event))
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ahnsen hilft//Aktuelles und Termine//DE", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", f"UID:ahnsen-event-{event.id}@ahnsen-hilft", f"DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}"]
    if match:
        hour, minute = int(match.group(1)), int(match.group(2))
        start = datetime.combine(event_day, datetime.min.time()).replace(hour=hour, minute=minute)
        end = start + timedelta(hours=2)
        lines += [f"DTSTART;TZID=Europe/Berlin:{start.strftime('%Y%m%dT%H%M%S')}", f"DTEND;TZID=Europe/Berlin:{end.strftime('%Y%m%dT%H%M%S')}"]
    else:
        lines += [f"DTSTART;VALUE=DATE:{event_day.strftime('%Y%m%d')}", f"DTEND;VALUE=DATE:{(event_day+timedelta(days=1)).strftime('%Y%m%d')}"]
    lines += [f"SUMMARY:{_ics_escape(event.titel)}", f"LOCATION:{_ics_escape(event.ort)}", f"DESCRIPTION:{_ics_escape(event.beschreibung)}", "END:VEVENT", "END:VCALENDAR", ""]
    filename = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(event.titel or "termin")).strip("-")[:60] or "termin"
    return Response("\r\n".join(lines), media_type="text/calendar; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{filename}.ics"', "Cache-Control": "no-store"})


@router.post("/aktuelles-termine/{event_id}/erinnern")
async def event_reminder_toggle(request: Request, event_id: int):
    from pwa_core import _current_user as get_user
    user = get_user(request)
    if not user:
        return RedirectResponse(f"/anmelden?next={quote(f'/aktuelles-termine/{event_id}')}", status_code=303)
    event = get_veranstaltung(event_id)
    event_day = _event_date(event) if event else None
    if not event or event.aktiv != "Ja" or not event_day or event_day < date.today():
        return RedirectResponse("/aktuelles-termine", status_code=303)
    active = toggle_reminder(user.id, event_id)
    if active and not has_push_subscription(user.id):
        message = "Erinnerung gespeichert. Aktiviere Push in deinem Profil, damit sie zugestellt werden kann."
    else:
        message = "Erinnerung am Vorabend aktiviert." if active else "Erinnerung deaktiviert."
    return RedirectResponse(f"/aktuelles-termine/{event_id}?hinweis={quote(message)}", status_code=303)


@router.get("/aktuelles-termine/{event_id}")
async def event_detail(request: Request, event_id: int, hinweis: str = ""):
    event = get_veranstaltung(event_id)
    if not event or event.aktiv != "Ja":
        return RedirectResponse("/aktuelles-termine", status_code=303)
    event_day = _event_date(event)
    past = bool(event_day and event_day < date.today())
    user = _current_user(request)
    active = bool(user and reminder_active(user.id, event.id))
    image = f'<div class="ct-detail-hero"><img src="data:image/jpeg;base64,{event.bild_base64}" alt="{escape(str(event.titel or "Veranstaltung"))}"></div>' if getattr(event,"bild_base64",None) else ""
    meta = []
    if event_day:
        meta.append(f'<div>📅 <span>{escape(event_day.strftime("%d.%m.%Y"))}</span></div>')
    if _event_time(event):
        meta.append(f'<div>🕒 <span>{escape(_event_time(event))}</span></div>')
    if getattr(event,"ort",None):
        meta.append(f'<div>📍 <span>{escape(str(event.ort))}</span></div>')
    if getattr(event,"ansprechpartner",None):
        meta.append(f'<div>👥 <span>{escape(str(event.ansprechpartner))}</span></div>')
    notice = f'<div class="ct-notice">{escape(hinweis)}</div>' if hinweis else ""
    actions = f'<a class="ct-btn" href="/aktuelles-termine/{event.id}.ics">📅 Zum Kalender hinzufügen</a>'
    if not past:
        actions = f'<form method="post" action="/aktuelles-termine/{event.id}/erinnern"><button class="ct-btn primary" type="submit">{"✓ Erinnerung aktiv" if active else "🔔 Erinnern"}</button></form>' + actions
    recap = str(getattr(event,"rueckblick_text","") or "").strip()
    gallery = _gallery(event)
    recap_html = ""
    if past:
        images = ''.join(f'<img src="data:{escape(mime)};base64,{data}" alt="Impression von {escape(str(event.titel or "der Veranstaltung"))}" loading="lazy">' for mime,data in gallery)
        recap_html = f'''<section class="ct-recap"><span class="ct-eye">Rückblick</span><h2>{'So war es' if recap or gallery else 'Im Dorfarchiv'}</h2>{f'<p class="ct-detail-copy">{escape(recap)}</p>' if recap else '<p class="ct-detail-copy">Für diese vergangene Veranstaltung wurde noch kein Nachbericht ergänzt.</p>'}{f'<div class="ct-gallery">{images}</div>' if images else ''}</section>'''
    body = f'''{CSS}<section class="ct"><header class="ct-head"><a class="ct-back" href="/aktuelles-termine{'?ansicht=archiv' if past else ''}">← {'Archiv' if past else 'Aktuelles & Termine'}</a></header>{image}<article class="ct-detail-card"><span class="ct-eye">{'Rückblick' if past else escape(_event_category(event))}</span><h1>{escape(str(event.titel or 'Veranstaltung'))}</h1><div class="ct-detail-meta">{''.join(meta)}</div><p class="ct-detail-copy">{escape(str(event.beschreibung or 'Weitere Informationen folgen.'))}</p>{notice}<div class="ct-actions">{actions}</div>{recap_html}</article><div class="ct-bottom"></div></section>'''
    return page(str(event.titel or "Termin"), body, active="calendar", body_class="current-events-view")


@router.get("/")
async def home_current_events():
    from pwa_core import pwa_home
    response = await pwa_home()
    html = response.body.decode("utf-8")
    html = html.replace('href="/veranstaltungen"', 'href="/aktuelles-termine"')
    html = html.replace('<h3>Veranstaltungen</h3><p>Aktuelle und vergangene Veranstaltungen.</p>', '<h3>Aktuelles &amp; Termine</h3><p>Termine, Neuigkeiten und Rückblicke.</p>')
    html = re.sub(r'<a class="service-card[^\"]*" href="/aktuelles">.*?</a>', '', html, flags=re.S)
    return HTMLResponse(html, status_code=response.status_code, headers=dict(response.headers))


@router.get("/pwa.js")
async def current_events_pwa_js():
    from pwa_main import pwa_javascript_v6
    response = await pwa_javascript_v6()
    source = response.body.decode("utf-8")
    old_calendar = "{ key: 'calendar', href: '/veranstaltungen', label: 'Termine', description: 'Kalender', paths: ['/veranstaltungen'] },"
    new_calendar = "{ key: 'calendar', href: '/aktuelles-termine', label: 'Aktuelles', description: 'Termine & Archiv', paths: ['/aktuelles-termine', '/veranstaltungen', '/aktuelles', '/buergerinformationen'] },"
    old_news = "{ key: 'news', href: '/aktuelles', label: 'Aktuelles', description: 'Neuigkeiten', paths: ['/aktuelles', '/buergerinformationen'] },"
    source = source.replace(old_calendar, new_calendar).replace(old_news, "")
    return Response(source, media_type="application/javascript; charset=utf-8", headers={"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0","Pragma":"no-cache"})
