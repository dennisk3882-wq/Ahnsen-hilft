from __future__ import annotations

import json
from datetime import date, datetime
from html import escape
from typing import Iterable

from fastapi.responses import HTMLResponse

from ahnsen_history import history_content
from platform_runtime import apply_static_branding, get_platform_snapshot, platform_language_options


ICONS = {
    "home": "⌂", "report": "⚠", "calendar": "▣", "waste": "♻",
    "people": "●●", "news": "▤", "building": "⌂", "more": "•••",
    "search": "⌕", "pin": "⌖", "camera": "▣", "check": "✓",
    "arrow": "›", "bell": "●", "shield": "◇", "download": "↓", "phone": "☎",
    "search2": '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
    "map": '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15m6-12v15"/></svg>',
    "message": '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v12H8l-4 4z"/><path d="M8 9h8m-8 4h5"/></svg>',
    "idea": '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18h6m-5 3h4"/><path d="M8.5 15c-1.5-1.1-2.5-2.9-2.5-5a6 6 0 1 1 12 0c0 2.1-1 3.9-2.5 5-.8.6-1.2 1.1-1.4 2h-4.2c-.2-.9-.6-1.4-1.4-2z"/></svg>',
    "politics": '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9h18M5 9v9m4-9v9m6-9v9m4-9v9M3 21h18M12 3 3 7h18z"/></svg>',
    "neighbor": '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20v-8l8-6 8 6v8"/><path d="M9 20v-5h6v5M7 7V4h3"/></svg>',
    "fire": '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15V8h10l3 3h3a2 2 0 0 1 2 2v2"/><path d="M5 8V5h8v3M8 5V3h4v2M2 15h20M13 11h3"/><circle cx="6" cy="17" r="2"/><circle cx="18" cy="17" r="2"/></svg>',
    "info": '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>',
    "village": '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 11 8 6l5.5 5v8h-11zM6 19v-5h4v5"/><path d="M17 19V9M14.5 12 17 7l2.5 5M13.5 15l3.5-6 3.5 6"/></svg>',
}


def icon(name: str) -> str:
    return f'<span class="glyph" aria-hidden="true">{ICONS.get(name, "•")}</span>'


def _brand() -> str:
    cfg = get_platform_snapshot()
    logo = (
        f'<span class="brand-crest custom-brand-logo" aria-hidden="true"><img src="{escape(cfg["logo_url"])}" alt=""></span>'
        if cfg.get("logo_url")
        else """<span class="brand-crest" aria-hidden="true"><svg viewBox="0 0 64 72"><path class="crest-shape" d="M7 5h50v34c0 16-12 24-25 29C19 63 7 55 7 39z"/><path class="crest-hill" d="M8 45c11-10 22-8 28-3 7-7 13-8 20-3v4c0 13-10 20-24 25C18 63 8 56 8 43z"/><path class="crest-house" d="m20 42 12-10 12 10v14H20z"/><path class="crest-roof" d="m17 43 15-13 15 13"/><path class="crest-door" d="M29 47h6v9h-6z"/><path class="crest-tree" d="M47 20v21M42 25l5-7 5 7M41 32l6-8 6 8"/><path class="crest-tower" d="M19 20h8v18h-8zM18 20l5-8 5 8"/></svg></span>"""
    )
    return f"""
    <a class="brand" href="/" aria-label="{escape(cfg['platform_name'])} Startseite" translate="no">
      {logo}
      <span class="brand-copy"><strong data-platform-municipality>{escape(cfg['municipality_name'])}</strong><em data-platform-product>{escape(cfg['platform_name'].replace(cfg['municipality_name'], '').strip() or 'digital')}</em><small data-platform-claim>{escape(cfg['claim'])}</small></span>
    </a>"""


def _bottom_nav(active: str) -> str:
    items = [("home", "/", "Start"), ("report", "/mangel-melden", "Melden"), ("calendar", "/veranstaltungen", "Termine"), ("more", "/mehr", "Mehr")]
    links = []
    for key, href, label in items:
        cls = " active" if active == key else ""
        current = ' aria-current="page"' if active == key else ""
        links.append(f'<a class="bottom-link{cls}" href="{href}"{current}>{icon(key)}<small>{label}</small></a>')
    return f'<nav class="bottom-nav" aria-label="App-Navigation">{"".join(links)}</nav>'


def page(title: str, content: str, *, active: str = "home", description: str = "", show_header: bool = True, body_class: str = "") -> HTMLResponse:
    cfg = get_platform_snapshot()
    language_options = platform_language_options()
    content = apply_static_branding(content, cfg)
    title = apply_static_branding(title, cfg)
    description = apply_static_branding(description or cfg["description"], cfg)
    header = f'<header class="topbar">{_brand()}<div class="topbar-community-actions"><button class="accessibility-button" id="accessibility-toggle" type="button" aria-expanded="false" aria-controls="accessibility-panel" title="Darstellung und Barrierefreiheit">Aa</button><label class="language-picker" translate="no"><span class="sr-only">Sprache</span><select id="platform-language" aria-label="Sprache auswählen">{language_options}</select></label><span id="translation-state" class="translation-state" role="status" aria-live="polite" hidden translate="no">↻</span><a class="message-center-link" id="message-center-link" href="/nachrichten" aria-label="Nachrichten" hidden style="display:none!important">{icon("message")}<span class="message-badge" hidden style="display:none!important"></span></a><button class="install-button" id="install-app" type="button" hidden>{icon("download")}<span>Installieren</span></button></div></header>' if show_header else ""
    style = f'<style>:root{{--forest:{cfg["primary_color"]};--sage:{cfg["accent_color"]};}} .custom-brand-logo img{{width:100%;height:100%;object-fit:contain}} .translation-state{{font-weight:900;opacity:.65}}</style>'
    html = f"""<!doctype html><html lang="{escape(cfg['default_language'])}"><head>
<meta charset="utf-8"><meta name="application-name" content="{escape(cfg['platform_name'])}"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="{escape(cfg['primary_color'])}"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="{escape(cfg['short_name'])}"><meta name="description" content="{escape(description)}"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="{escape(cfg['apple_touch_icon_url'])}"><link rel="icon" href="{escape(cfg['pwa_icon_192_url'])}"><link rel="stylesheet" href="/pwa.css?v=1"><link rel="stylesheet" href="/community.css?v=3"><link rel="stylesheet" href="/warning.css?v=1"><link rel="stylesheet" href="/accessibility.css?v=2"><title>{escape(title)} · {escape(cfg['platform_name'])}</title>{style}</head>
<body class="{escape(body_class)}" data-platform-municipality-name="{escape(cfg['municipality_name'])}" data-platform-default-language="{escape(cfg['default_language'])}"><a class="skip-link" href="#main-content">Direkt zum Inhalt</a><div class="app-shell">{header}<main class="app-main" id="main-content" tabindex="-1">{content}</main>{_bottom_nav(active)}</div><section class="accessibility-panel" id="accessibility-panel" aria-label="Darstellung und Barrierefreiheit" hidden><h2>Darstellung</h2><p>Die Grundseite bleibt gleich. Diese Optionen passen sie zusätzlich an deine Bedürfnisse an.</p><div class="accessibility-options"><button type="button" data-a11y="large" aria-pressed="false">Größere Schrift</button><button type="button" data-a11y="contrast" aria-pressed="false">Hoher Kontrast</button><button type="button" data-a11y="simple" aria-pressed="false">Einfache Ansicht</button><button type="button" data-a11y="reduce" aria-pressed="false">Weniger Bewegung</button></div></section><div class="offline-banner" id="offline-banner" role="status" aria-live="polite" hidden>Du bist offline. Bereits geladene Inhalte bleiben verfügbar.</div><script src="/accessibility.js?v=1" defer></script><script src="/pwa.js?v=1" defer></script><script src="/community.js?v=3" defer></script></body></html>"""
    return HTMLResponse(html)


def _entries(value: str) -> list[tuple[str, str]]:
    result = []
    for raw in str(value or "").splitlines():
        parts = [part.strip() for part in raw.split("|")]
        if parts and parts[0]:
            result.append((parts[0], parts[1] if len(parts) > 1 else ""))
    return result


def _date(value) -> str:
    return value.strftime("%d.%m.%Y") if isinstance(value, (date, datetime)) else str(value or "Termin")


def _days(value) -> str:
    if not isinstance(value, date): return ""
    days = (value - date.today()).days
    return "heute" if days == 0 else "morgen" if days == 1 else f"in {days} Tagen" if days > 1 else ""


def home_page(data: dict) -> HTMLResponse:
    settings, events, waste = data.get("einstellungen", {}), data.get("veranstaltungen", []), data.get("muelltermine", [])
    warnings = list(data.get("warnungen", []) or [])
    greeting = "Guten Morgen" if datetime.now().hour < 11 else "Guten Tag" if datetime.now().hour < 18 else "Guten Abend"
    next_event = events[0] if events else None
    event_hint = f"{escape(getattr(next_event, 'titel', '') or 'Nächster Termin')} · {escape(_date(getattr(next_event, 'datum', '')))}" if next_event else "Neue Termine aus dem Dorf"
    if waste:
        item, value = waste[0], getattr(waste[0], "datum", None)
        waste_card = f'<section class="notice-card"><span class="notice-icon">{icon("bell")}</span><div><small>Nächste Müllabfuhr · {escape(_days(value))}</small><strong>{escape(getattr(item, "abfuhrarten", "") or "Müllabfuhr")}</strong><span>{escape(_date(value))}</span></div><a href="/muelltermine-info">{icon("arrow")}</a></section>'
    else:
        waste_card = f'<section class="notice-card empty-notice"><span class="notice-icon">{icon("waste")}</span><div><small>Müllabfuhr</small><strong>Noch keine Termine eingetragen</strong></div><a href="/muelltermine-info">{icon("arrow")}</a></section>'
    warning_card = ""
    if warnings:
        highest = max(int(getattr(item, "level", 2) or 2) for item in warnings)
        top_warning = sorted(warnings, key=lambda item: int(getattr(item, "level", 2) or 2), reverse=True)[0]
        warn_class = " danger-warning" if highest >= 3 else " active-warning"
        warning_card = f'<a class="home-warning-monitor{warn_class}" href="/warnungen"><span class="warning-monitor-dot"></span><div><strong>⚠ Amtliche Warnung für Ahnsen</strong><small>{escape(getattr(top_warning, "title", "Warnlage prüfen"))}</small></div><span class="card-arrow">{icon("arrow")}</span></a>'
    services = [
        ("report", "Mängel melden", "Direkt mit Foto und Standort.", "/mangel-melden"), ("calendar", "Veranstaltungen", "Aktuelle und vergangene Veranstaltungen.", "/veranstaltungen"),
        ("building", "DGH-Kalender", "Freie Tage und Belegungen.", "/dgh-mieten"), ("waste", "Müllabfuhr", "Termine und Kalenderexport.", "/muelltermine-info"),
        ("people", "Vereine & Gruppen", "Gemeinschaft erleben.", "/vereine"), ("news", "Aktuelles", "Neuigkeiten aus dem Dorf.", "/aktuelles"),
        ("info", "Bürgerinformationen", "Hinweise der Gemeinde.", "/buergerinformationen"), ("village", "Über Ahnsen", "Unser Dorf im Überblick.", "/ueber-gemeinde"),
        ("phone", "Ansprechpartner", "Wichtige Kontakte auf einen Blick.", "/ansprechpartner"),
        ("shield", "Warnlage", "Amtliche Wetter- und Gefahrenwarnungen für Ahnsen.", "/warnungen"),
        ("map", "Mängelkarte", "Öffentliche Meldungen auf der Dorfkarte.", "/karte"),
        ("idea", "Ideen für Ahnsen", "Vorschlagen, unterstützen und kommentieren.", "/ideen"),
        ("politics", "Politik & Rat", "Sitzungen, Protokolle und Beschlüsse.", "/politik-rat"),
        ("neighbor", "Nachbarschaftshilfe", "Hilfe im Dorf suchen oder anbieten.", "/nachbarschaft"),
    ]
    cards = "".join(f'<a class="service-card{" featured" if key == "report" else ""}" href="{href}"><span class="service-icon">{icon(key)}</span><div><h3>{title}</h3><p>{text}</p></div><span class="card-arrow">{icon("arrow")}</span></a>' for key, title, text, href in services)
    cfg = get_platform_snapshot()
    hero_url = str(settings.get("hero_bild_url") or cfg.get("hero_image_url") or "")
    hero_style = f' style="background-image:url(\'{escape(hero_url)}\')"' if hero_url else ""
    hero_kicker = settings.get("hero_titel") or f"Willkommen in {cfg['municipality_name']}"
    hero_subtitle = settings.get("hero_untertitel") or "Digital. Direkt. Gemeinsam."
    hero_text = settings.get("hero_text") or cfg["description"]
    content = f"""
<section class="hero-card"><div class="hero-image" role="img" aria-label="Ansicht {escape(cfg['municipality_name'])}"{hero_style}></div><div class="hero-overlay"><span class="hero-kicker">{escape(hero_kicker)}</span><h1>{escape(hero_subtitle)}</h1><p>{escape(hero_text)}</p></div></section>
<section class="greeting-row"><div><span class="eyebrow">{escape(greeting)} 👋</span><h2>Schön, dass du da bist.</h2></div><a class="today-card" href="/veranstaltungen"><span>{icon('calendar')}</span><div><small>Heute in Ahnsen</small><strong>{event_hint}</strong></div>{icon('arrow')}</a></section>
{warning_card}
<form class="home-search" method="get" action="/suche"><input name="q" aria-label="Suche" placeholder="Was suchst du? Müll, DGH, Rat, Feuerwehr …"><button type="submit" aria-label="Suchen">⌕</button></form>
<section class="service-grid" aria-label="Digitale Dienste">{cards}</section>{waste_card}
"""
    return page(settings.get("seiten_titel") or "Ahnsen hilft", content, body_class="home-view")


def report_page(error: str = "", values: dict | None = None) -> HTMLResponse:
    values = values or {}; selected = str(values.get("art", "")); alert = f'<div class="form-alert" role="alert">{escape(error)}</div>' if error else ""
    categories = ["Straßenlaterne defekt", "Schlagloch oder Straßenschaden", "Straßenschild beschädigt", "Müllablagerung", "Spielplatz oder Grünfläche", "Sonstiger Schaden"]
    options = '<option value="">Bitte auswählen</option>' + "".join(f'<option value="{escape(x)}"{" selected" if x == selected else ""}>{escape(x)}</option>' for x in categories)
    content = f"""
<section class="page-heading"><a class="back-link" href="/">← Start</a><span class="eyebrow">Digitaler Mängelmelder</span><h1>Was können wir verbessern?</h1><p>Deine Meldung landet direkt im Verwaltungs-Dashboard und erhält eine Vorgangsnummer.</p></section>{alert}
<form class="report-form" method="post" action="/api/maengel" enctype="multipart/form-data" novalidate>
<section class="form-section"><div class="section-number">1</div><div class="section-copy"><h2>Art des Mangels</h2><p>Wähle die passendste Kategorie.</p></div><label class="field full"><span>Kategorie *</span><select name="art" required>{options}</select></label></section>
<section class="form-section"><div class="section-number">2</div><div class="section-copy"><h2>Wo ist der Mangel?</h2><p>Je genauer der Ort, desto schneller kann er geprüft werden.</p></div><label class="field full"><span>Straße, Hausnummer oder Ortsbeschreibung *</span><input name="ort" maxlength="180" required value="{escape(str(values.get('ort', '')))}" placeholder="z. B. Schulstraße 5, gegenüber der Bushaltestelle"></label><div class="location-row"><button class="secondary-button" id="use-location" type="button">{icon('pin')} Standort übernehmen</button><small id="location-status" aria-live="polite">Optional – nur nach deiner Freigabe.</small></div><input id="latitude" name="latitude" type="hidden"><input id="longitude" name="longitude" type="hidden"></section>
<section class="form-section"><div class="section-number">3</div><div class="section-copy"><h2>Kurze Beschreibung</h2><p>Beschreibe, was genau auffällig oder beschädigt ist.</p></div><label class="field full"><span>Beschreibung *</span><textarea name="beschreibung" minlength="10" maxlength="1500" required placeholder="Was ist passiert und seit wann besteht das Problem?">{escape(str(values.get('beschreibung', '')))}</textarea></label></section>
<section class="form-section"><div class="section-number">4</div><div class="section-copy"><h2>Foto hinzufügen</h2><p>Ein Foto ist optional, hilft aber häufig bei der Einschätzung.</p></div><label class="photo-picker full" for="foto"><span class="photo-icon">{icon('camera')}</span><strong>Foto aufnehmen oder auswählen</strong><small>JPG, PNG oder WEBP · maximal 8 MB</small><input id="foto" name="foto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><img id="photo-preview" alt="Vorschau" hidden></label></section>
<section class="form-section"><div class="section-number">5</div><div class="section-copy"><h2>Kontakt für Rückfragen</h2><p>Freiwillig. Die Meldung kann auch ohne Kontaktdaten gesendet werden.</p></div><div class="two-columns full"><label class="field"><span>Name</span><input name="name" maxlength="120" autocomplete="name" value="{escape(str(values.get('name', '')))}"></label><label class="field"><span>E-Mail</span><input name="email" type="email" maxlength="180" autocomplete="email" value="{escape(str(values.get('email', '')))}"></label></div><label class="honeypot" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><label class="consent full"><input name="datenschutz" type="checkbox" value="ja" required><span>Ich habe die <a href="/datenschutz" target="_blank">Datenschutzhinweise</a> gelesen und stimme der Verarbeitung für diese Meldung zu. *</span></label></section>
<button class="primary-button submit-button" type="submit">{icon('check')} Meldung verbindlich absenden</button><p class="form-footnote">Nach dem Absenden erhältst du sofort eine Vorgangsnummer.</p></form>"""
    return page("Mangel melden", content, active="report")


def report_success_page(ticket: str) -> HTMLResponse:
    content = f'<section class="success-card"><span class="success-icon">{icon("check")}</span><span class="eyebrow">Meldung erfolgreich übermittelt</span><h1>Vielen Dank fürs Mithelfen!</h1><p>Deine Meldung ist im Verwaltungs-Dashboard eingegangen und wird geprüft.</p><div class="ticket-box"><small>Deine Vorgangsnummer</small><strong>{escape(ticket)}</strong></div><p class="ticket-hint">Speichere die Nummer, um den Bearbeitungsstand abzurufen.</p><div class="button-stack"><a class="primary-button" href="/meldestatus?ticket={escape(ticket)}">Status ansehen</a><a class="secondary-button" href="/">Zur Startseite</a></div></section>'
    return page("Meldung gesendet", content, active="report")


def status_page(ticket: str = "", report=None, not_found: bool = False) -> HTMLResponse:
    result = ""
    if report:
        status = escape(getattr(report, "status", "Offen") or "Offen"); key = "done" if status == "Erledigt" else "progress" if status == "In Bearbeitung" else "open"
        created = getattr(report, "erstellt_am", datetime.now()).strftime("%d.%m.%Y %H:%M")
        due = getattr(report, "due_at", None)
        due_text = due.strftime("%d.%m.%Y") if due else "Noch keine Frist"
        result = f'<section class="status-result"><div class="status-head"><span class="status-dot {key}"></span><div><small>Aktueller Status</small><strong>{status}</strong></div></div><dl><div><dt>Vorgang</dt><dd>{escape(report.ticket)}</dd></div><div><dt>Kategorie</dt><dd>{escape(report.art or "")}</dd></div><div><dt>Ort</dt><dd>{escape(report.ort or "")}</dd></div><div><dt>Eingegangen</dt><dd>{created}</dd></div><div><dt>Zuständigkeit</dt><dd>{escape(getattr(report,"responsibility","") or "Wird zugeordnet")}</dd></div><div><dt>Geplante Bearbeitung</dt><dd>{due_text}</dd></div></dl>{f"<div class=public-case-note><strong>Rückmeldung der Verwaltung</strong><p>{escape(report.public_note)}</p></div>" if getattr(report,"public_note","") else ""}</section>'
    elif not_found:
        result = '<div class="form-alert">Zu dieser Vorgangsnummer wurde keine Meldung gefunden.</div>'
    content = f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Bearbeitungsstand</span><h1>Meldestatus prüfen</h1><p>Gib die Vorgangsnummer aus deiner Bestätigung ein.</p></section><form class="lookup-form" method="get" action="/meldestatus"><label class="field"><span>Vorgangsnummer</span><input name="ticket" value="{escape(ticket)}" placeholder="{escape(get_platform_snapshot()["ticket_prefix"])}-20260806-ABC123" required></label><button class="primary-button" type="submit">{icon("search")} Status abrufen</button></form>{result}'
    return page("Meldestatus", content, active="report")


def events_page(events: Iterable, past_events: Iterable = ()) -> HTMLResponse:
    def gallery_items(event) -> list[tuple[str, str]]:
        raw = getattr(event, "rueckblick_bilder_json", None)
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except Exception:
            return []
        if not isinstance(data, list):
            return []
        result = []
        for item in data:
            if not isinstance(item, dict):
                continue
            mime = str(item.get("mime") or "image/jpeg").lower()
            encoded = str(item.get("data") or "")
            if mime in {"image/jpeg", "image/png", "image/webp"} and encoded:
                result.append((mime, encoded))
        return result[:12]

    def event_card(event, *, past: bool = False) -> str:
        image = f'<img class="event-image" src="data:image/jpeg;base64,{event.bild_base64}" alt="">' if getattr(event, "bild_base64", None) else ""
        past_label = ' <span class="past-event-label">Vergangen</span>' if past else ""
        card_class = "event-card past-event" if past else "event-card"
        time_meta = f'<span>🕒 {escape(event.uhrzeit)}</span>' if getattr(event, "uhrzeit", "") else ""
        place_meta = f'<span>📍 {escape(event.ort)}</span>' if getattr(event, "ort", "") else ""
        recap_html = ""
        if past:
            recap = str(getattr(event, "rueckblick_text", "") or "").strip()
            gallery = gallery_items(event)
            recap_copy = f'<p>{escape(recap).replace(chr(10), "<br>")}</p>' if recap else ""
            gallery_html = ""
            if gallery:
                images = "".join(
                    f'<img src="data:{escape(mime)};base64,{encoded}" alt="Impression der Veranstaltung" loading="lazy">'
                    for mime, encoded in gallery
                )
                gallery_html = f'<div class="past-event-gallery">{images}</div>'
            if recap or gallery:
                heading = "Rückblick" if recap else "Impressionen"
                recap_html = f'<section class="event-recap"><strong>{heading}</strong>{recap_copy}{gallery_html}</section>'
        return f'<article class="{card_class}">{image}<div class="event-body"><span class="event-date">{escape(getattr(event, "datum", "") or "Termin")}{past_label}</span><h2>{escape(getattr(event, "titel", "") or "Veranstaltung")}</h2><p>{escape(getattr(event, "beschreibung", "") or "Weitere Informationen folgen.")}</p><div class="meta-row">{time_meta}{place_meta}</div>{recap_html}</div></article>'

    upcoming = [event_card(event) for event in events]
    if not upcoming:
        upcoming.append('<section class="empty-state"><span>📅</span><h2>Keine kommenden Termine</h2><p>Sobald neue Veranstaltungen eingetragen sind, erscheinen sie hier.</p></section>')

    past = [event_card(event, past=True) for event in past_events]
    archive = ""
    if past:
        archive = f'<section class="past-events-section"><div class="past-events-head"><div><span class="eyebrow">Archiv</span><h2>Vergangene Veranstaltungen</h2><p>Rückblicke, Fotos und die zuletzt vergangenen Termine.</p></div><span class="past-events-count">{len(past)} vergangen</span></div><div class="event-list past-event-list">{"".join(past)}</div></section>'

    styles = '<style>.past-events-section{margin-top:28px;padding-top:22px;border-top:1px solid var(--line)}.past-events-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}.past-events-head h2{margin:3px 0 4px;color:var(--forest);font-size:22px}.past-events-head p{margin:0;color:var(--muted);font-size:13px}.past-events-count{flex:0 0 auto;padding:6px 10px;border-radius:999px;background:#eef1eb;color:#67736b;font-size:11px;font-weight:850}.event-card.past-event{background:#fbfcf9;border-color:#e3e8df;box-shadow:none}.past-event-label{display:inline-flex;margin-left:6px;padding:3px 7px;border-radius:999px;background:#e8ece6;color:#667269;font-size:10px;font-weight:850;vertical-align:middle}.event-recap{margin-top:15px;padding-top:14px;border-top:1px solid #dfe6dc}.event-recap>strong{display:block;margin-bottom:6px;color:var(--forest);font-size:13px;text-transform:uppercase;letter-spacing:.05em}.event-recap>p{margin:0 0 11px;color:#526057;line-height:1.55}.past-event-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.past-event-gallery img{width:100%;aspect-ratio:1.2;object-fit:cover;border-radius:10px;background:#eef1eb}@media(max-width:560px){.past-events-head{align-items:flex-start}.past-events-count{margin-top:2px}.past-event-gallery{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>'
    content = f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Dorfkalender</span><h1>Veranstaltungen</h1><p>Aktuelle Termine sowie Rückblicke auf vergangene Veranstaltungen in Ahnsen.</p></section>{styles}<div class="event-list">{"".join(upcoming)}</div>{archive}'
    return page("Veranstaltungen", content, active="calendar")


def dgh_page(free_days: Iterable[date], terms: Iterable) -> HTMLResponse:
    chips = "".join(f'<span>{day.strftime("%d.%m.%Y")}</span>' for day in list(free_days)[:12]) or '<p class="muted">Freie Termine werden derzeit aktualisiert.</p>'
    count = sum(1 for item in terms if getattr(item, "status", "") == "Bestätigt")
    content = f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Dorfgemeinschaftshaus</span><h1>DGH-Kalender</h1><p>Prüfe freie Termine. Eine Reservierung wird erst nach Bestätigung verbindlich.</p></section><section class="info-hero"><span>{icon("building")}</span><div><small>Aktuelle Übersicht</small><strong>{count} bestätigte Belegungen</strong><p>Die nächsten freien Tage findest du direkt darunter.</p></div></section><section class="content-card"><div class="section-title"><span class="eyebrow">Nächste Verfügbarkeiten</span><h2>Freie Tage</h2></div><div class="date-chips">{chips}</div></section><section class="trust-strip"><span>{icon("phone")}</span><div><strong>Mietanfrage</strong><small>Die digitale Buchungsanfrage folgt im nächsten Ausbauschritt.</small></div></section>'
    return page("DGH-Kalender", content, active="calendar")


def waste_page(terms: Iterable) -> HTMLResponse:
    rows = []
    for item in list(terms)[:20]:
        value = getattr(item, "datum", None)
        rows.append(f'<article class="waste-row"><div class="waste-date"><strong>{escape(_date(value))}</strong><small>{escape(_days(value))}</small></div><span class="waste-symbol">{icon("waste")}</span><div><strong>{escape(getattr(item, "abfuhrarten", "") or "Müllabfuhr")}</strong><small>{"Feiertagsverschiebung" if getattr(item, "feiertagsabweichung", "") == "Ja" else "Regulärer Termin"}</small></div></article>')
    if not rows: rows.append('<section class="empty-state"><span>🗑️</span><h2>Noch keine Abfuhrtermine</h2><p>Der Jahreskalender kann im Verwaltungsbereich importiert werden.</p></section>')
    content = f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Abfallkalender</span><h1>Müllabfuhr</h1><p>Die nächsten Abholtermine für Ahnsen.</p></section><a class="download-card" href="/muelltermine.ics">{icon("download")}<div><strong>In Kalender übernehmen</strong><small>ICS-Datei für Handy, Outlook oder Google Kalender</small></div>{icon("arrow")}</a><div class="waste-list">{"".join(rows)}</div>'
    return page("Müllabfuhr", content, active="calendar")


def info_page(kind: str, settings: dict) -> HTMLResponse:
    cfg = get_platform_snapshot()
    if kind in {"ueber-ahnsen", "ueber-gemeinde"}:
        if cfg.get("history_mode") == "ahnsen" and cfg["municipality_name"].casefold() == "ahnsen":
            return page(
                f"Über {cfg['municipality_name']}",
                history_content(),
                active="home",
                description=f"{cfg['municipality_name']} von den Anfängen bis heute – Ortsgeschichte",
                body_class="history-view",
            )
        raw = str(settings.get("ueber_ahnsen_text") or settings.get("ueber_ahnsen_seite_text") or cfg["description"])
        paragraphs = "".join(f'<p>{escape(part.strip())}</p>' for part in raw.splitlines() if part.strip()) or f'<p>{escape(cfg["description"])}</p>'
        return page(f"Über {cfg['municipality_name']}", f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Unser Ort</span><h1>Über {escape(cfg["municipality_name"])}</h1></section><section class="content-card">{paragraphs}</section>', active="more")
    config = {"vereine": ("Vereine & Gruppen", "Gemeinschaft", "people", settings.get("vereine", "")), "aktuelles": ("Aktuelles aus Ahnsen", "Neuigkeiten", "news", settings.get("aktuelles", "")), "ansprechpartner": ("Ansprechpartner", "Kontakt", "phone", settings.get("ansprechpartner", "")), "feuerwehr": ("Feuerwehr Ahnsen", "Sicherheit & Ehrenamt", "fire", settings.get("feuerwehr_text", "")), "buergerinformationen": ("Bürgerinformationen", "Gut informiert", "info", settings.get("buergerinfo_text", "")), "ueber-ahnsen": ("Über Ahnsen", "Unser Dorf", "village", settings.get("ueber_ahnsen_text", ""))}
    title, eyebrow, key, raw = config.get(kind, config["buergerinformationen"]); entries = _entries(raw)
    card_rows = []
    if kind == "vereine":
        card_rows.append(f'<a class="info-card" href="/feuerwehr" style="text-decoration:none;color:inherit"><span class="info-icon">{icon("fire")}</span><h2>Freiwillige Feuerwehr Ahnsen</h2><p>Brandschutz, Einsatzdienst und Ehrenamt – Informationen zur Ortsfeuerwehr.</p><span class="community-chip" style="margin-top:10px">Feuerwehr ansehen ›</span></a>')
    card_rows.extend(f'<article class="info-card"><span class="info-icon">{icon(key)}</span><h2>{escape(t)}</h2><p>{escape(d or "Weitere Informationen folgen.")}</p></article>' for t, d in entries)
    cards = "".join(card_rows)
    if not cards: cards = f'<article class="info-card wide"><span class="info-icon">{icon(key)}</span><h2>{escape(title)}</h2><p>{escape(str(raw or "Dieser Bereich wird gerade gepflegt."))}</p></article>'
    return page(title, f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">{eyebrow}</span><h1>{title}</h1></section><div class="info-grid">{cards}</div>', active="more")


def more_page(settings: dict) -> HTMLResponse:
    items = [("Meldestatus", "/meldestatus", "search", "Bearbeitungsstand prüfen"), ("Verwaltung", "/verwaltung", "building", "Geschützter Bereich"), ("Datenschutz", "/datenschutz", "shield", "Datenverarbeitung"), ("Impressum", "/impressum", "news", "Anbieterkennzeichnung")]
    links = "".join(f'<a class="menu-row" href="{href}"><span>{icon(key)}</span><div><strong>{label}</strong><small>{desc}</small></div>{icon("arrow")}</a>' for label, href, key, desc in items)
    return page("Mehr", f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Weitere Bereiche</span><h1>Mehr aus Ahnsen</h1></section><section class="menu-list">{links}</section><section class="install-panel"><span>{icon("download")}</span><div><strong>Ahnsen hilft installieren</strong><small>Über das Browser-Menü zum Startbildschirm hinzufügen.</small></div></section>', active="more")


def legal_page(kind: str, settings: dict) -> HTMLResponse:
    title = "Datenschutz" if kind == "datenschutz" else "Impressum"
    key = "datenschutz_seite_text" if kind == "datenschutz" else "impressum_seite_text"
    text = settings.get(key, f"{title} wird ergänzt.")
    paragraphs = "".join(f'<p>{escape(x.strip())}</p>' for x in str(text or "").splitlines() if x.strip())
    translation_note = ""
    if kind == "datenschutz" and get_platform_snapshot().get("translation_enabled"):
        translation_note = '<section class="legal-translation-note"><h2>Maschinelle Übersetzung</h2><p>Wenn eine Fremdsprache ausgewählt wird, werden sichtbare Seitentexte zur maschinellen Übersetzung an den in der Plattform-Konfiguration hinterlegten LibreTranslate-kompatiblen Übersetzungsdienst übertragen. Inhalte in Formular-Eingabefeldern werden nicht automatisch übertragen. Übersetzungen können Fehler enthalten; bei amtlichen Informationen ist die deutsche Originalfassung maßgeblich.</p></section>'
    return page(title, f'<section class="page-heading compact"><a class="back-link" href="/mehr">← Mehr</a><span class="eyebrow">Rechtliches</span><h1>{title}</h1></section><article class="legal-card">{paragraphs}{translation_note}</article>', active="more")


def admin_login_page(error: str = "") -> HTMLResponse:
    alert = f'<div class="form-alert" role="alert">{escape(error)}</div>' if error else ""
    content = f'<section class="success-card admin-login-card"><span class="success-icon">{icon("building")}</span><span class="eyebrow">Geschützter Bereich</span><h1>Verwaltung</h1><p>Melde dich an, um Mängel, Veranstaltungen, DGH und Mülltermine zu verwalten.</p>{alert}<form class="admin-login-form" method="post" action="/login"><label class="field"><span>Benutzername</span><input name="username" autocomplete="username" required autofocus></label><label class="field"><span>Passwort</span><input name="password" type="password" autocomplete="current-password" required></label><label class="field"><span>Authenticator- oder Wiederherstellungscode (falls aktiviert)</span><input name="otp" inputmode="numeric" autocomplete="one-time-code"></label><button class="primary-button" type="submit">Sicher anmelden</button></form><a class="back-link admin-back" href="/">← Zur Bürger-App</a></section>'
    return page("Verwaltung anmelden", content, active="more", show_header=False, body_class="admin-login-view")
