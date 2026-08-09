from pathlib import Path


# Add query for active events whose date is before today.
path = Path("veranstaltungen_crud.py")
text = path.read_text(encoding="utf-8")
marker = "\n\ndef get_alle_veranstaltungen():\n"
if "def get_vergangene_veranstaltungen()" not in text:
    func = '''

def get_vergangene_veranstaltungen():
    from datetime import datetime

    db = SessionLocal()

    try:
        alle = (
            db.query(Veranstaltung)
            .filter(Veranstaltung.aktiv == "Ja")
            .all()
        )

        heute = datetime.now().date()
        vergangene = []

        for v in alle:
            try:
                datum = datetime.strptime(v.datum, "%d.%m.%Y").date()
            except (TypeError, ValueError):
                continue
            if datum < heute:
                vergangene.append(v)

        def sortierschluessel(veranstaltung):
            try:
                return datetime.strptime(veranstaltung.datum, "%d.%m.%Y")
            except (TypeError, ValueError):
                return datetime.min

        vergangene.sort(key=sortierschluessel, reverse=True)
        return vergangene

    finally:
        db.close()
'''
    if marker not in text:
        raise SystemExit("CRUD insertion marker not found")
    text = text.replace(marker, func + marker, 1)
    path.write_text(text, encoding="utf-8")


# Pass upcoming and past events to the public page.
path = Path("pwa_core.py")
text = path.read_text(encoding="utf-8")
old_import = "from veranstaltungen_crud import get_aktive_veranstaltungen, init_veranstaltungen_db"
new_import = "from veranstaltungen_crud import (\n    get_aktive_veranstaltungen,\n    get_vergangene_veranstaltungen,\n    init_veranstaltungen_db,\n)"
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif "get_vergangene_veranstaltungen" not in text:
    raise SystemExit("PWA import marker not found")

old_route = "    return events_page(get_aktive_veranstaltungen())"
new_route = "    return events_page(get_aktive_veranstaltungen(), get_vergangene_veranstaltungen())"
if old_route in text:
    text = text.replace(old_route, new_route, 1)
elif new_route not in text:
    raise SystemExit("PWA events route marker not found")
path.write_text(text, encoding="utf-8")


# Render a separate archive below upcoming events.
path = Path("pwa_ui.py")
text = path.read_text(encoding="utf-8")
start = text.index("def events_page(")
end = text.index("\n\ndef dgh_page", start)
new_func = """def events_page(events: Iterable, past_events: Iterable = ()) -> HTMLResponse:
    def event_card(event, *, past: bool = False) -> str:
        image = f'<img class="event-image" src="data:image/jpeg;base64,{event.bild_base64}" alt="">' if getattr(event, "bild_base64", None) else ""
        past_label = ' <span class="past-event-label">Vergangen</span>' if past else ""
        card_class = "event-card past-event" if past else "event-card"
        time_meta = f'<span>🕒 {escape(event.uhrzeit)}</span>' if getattr(event, "uhrzeit", "") else ""
        place_meta = f'<span>📍 {escape(event.ort)}</span>' if getattr(event, "ort", "") else ""
        return f'<article class="{card_class}">{image}<div class="event-body"><span class="event-date">{escape(getattr(event, "datum", "") or "Termin")}{past_label}</span><h2>{escape(getattr(event, "titel", "") or "Veranstaltung")}</h2><p>{escape(getattr(event, "beschreibung", "") or "Weitere Informationen folgen.")}</p><div class="meta-row">{time_meta}{place_meta}</div></div></article>'

    upcoming = [event_card(event) for event in events]
    if not upcoming:
        upcoming.append('<section class="empty-state"><span>📅</span><h2>Keine kommenden Termine</h2><p>Sobald neue Veranstaltungen eingetragen sind, erscheinen sie hier.</p></section>')

    past = [event_card(event, past=True) for event in past_events]
    archive = ""
    if past:
        archive = f'<section class="past-events-section"><div class="past-events-head"><div><span class="eyebrow">Archiv</span><h2>Vergangene Veranstaltungen</h2><p>Die zuletzt vergangenen Termine stehen zuerst.</p></div><span class="past-events-count">{len(past)} vergangen</span></div><div class="event-list past-event-list">{"".join(past)}</div></section>'

    styles = '<style>.past-events-section{margin-top:28px;padding-top:22px;border-top:1px solid var(--line)}.past-events-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}.past-events-head h2{margin:3px 0 4px;color:var(--forest);font-size:22px}.past-events-head p{margin:0;color:var(--muted);font-size:13px}.past-events-count{flex:0 0 auto;padding:6px 10px;border-radius:999px;background:#eef1eb;color:#67736b;font-size:11px;font-weight:850}.event-card.past-event{background:#f8faf7;border-color:#e3e8df;box-shadow:none;opacity:.88}.event-card.past-event .event-image{filter:saturate(.72) brightness(.96)}.past-event-label{display:inline-flex;margin-left:6px;padding:3px 7px;border-radius:999px;background:#e8ece6;color:#667269;font-size:10px;font-weight:850;vertical-align:middle}@media(max-width:560px){.past-events-head{align-items:flex-start}.past-events-count{margin-top:2px}}</style>'
    content = f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Dorfkalender</span><h1>Veranstaltungen</h1><p>Termine, Aktionen und Feste in Ahnsen.</p></section>{styles}<div class="event-list">{"".join(upcoming)}</div>{archive}'
    return page("Veranstaltungen", content, active="calendar")
"""
text = text[:start] + new_func + text[end:]
path.write_text(text, encoding="utf-8")
