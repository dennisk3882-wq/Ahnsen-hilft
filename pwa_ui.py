from __future__ import annotations

from datetime import date, datetime
from html import escape
from typing import Iterable

from fastapi.responses import HTMLResponse


ICONS = {
    "home": "⌂", "report": "⚠", "calendar": "▣", "waste": "♻",
    "people": "●●", "news": "▤", "building": "⌂", "more": "•••",
    "search": "⌕", "pin": "⌖", "camera": "▣", "check": "✓",
    "arrow": "›", "bell": "●", "shield": "◇", "download": "↓", "phone": "☎",
}


def icon(name: str) -> str:
    return f'<span class="glyph" aria-hidden="true">{ICONS.get(name, "•")}</span>'


def _brand() -> str:
    return """
    <a class="brand" href="/" aria-label="Ahnsen hilft Startseite">
      <span class="brand-crest" aria-hidden="true">
        <svg viewBox="0 0 64 72"><path class="crest-shape" d="M7 5h50v34c0 16-12 24-25 29C19 63 7 55 7 39z"/><path class="crest-hill" d="M8 45c11-10 22-8 28-3 7-7 13-8 20-3v4c0 13-10 20-24 25C18 63 8 56 8 43z"/><path class="crest-house" d="m20 42 12-10 12 10v14H20z"/><path class="crest-roof" d="m17 43 15-13 15 13"/><path class="crest-door" d="M29 47h6v9h-6z"/><path class="crest-tree" d="M47 20v21M42 25l5-7 5 7M41 32l6-8 6 8"/><path class="crest-tower" d="M19 20h8v18h-8zM18 20l5-8 5 8"/></svg>
      </span>
      <span class="brand-copy"><strong>Ahnsen</strong><em>hilft</em><small>Dein Dorf. Unsere Gemeinschaft.</small></span>
    </a>"""


def _bottom_nav(active: str) -> str:
    items = [("home", "/", "Start"), ("report", "/mangel-melden", "Melden"), ("calendar", "/veranstaltungen", "Termine"), ("more", "/mehr", "Mehr")]
    links = []
    for key, href, label in items:
        cls = " active" if active == key else ""
        current = ' aria-current="page"' if active == key else ""
        links.append(f'<a class="bottom-link{cls}" href="{href}"{current}>{icon(key)}<small>{label}</small></a>')
    return f'<nav class="bottom-nav" aria-label="App-Navigation">{"".join(links)}</nav>'


def page(title: str, content: str, *, active: str = "home", description: str = "Digitale Bürgerplattform für Ahnsen", show_header: bool = True, body_class: str = "") -> HTMLResponse:
    header = f'<header class="topbar">{_brand()}<button class="install-button" id="install-app" type="button" hidden>{icon("download")}<span>Installieren</span></button></header>' if show_header else ""
    html = f"""<!doctype html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#174936"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="Ahnsen hilft"><meta name="description" content="{escape(description)}"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/pwa/icon-192.png"><link rel="icon" href="/pwa/icon-192.png"><link rel="stylesheet" href="/pwa.css?v=1"><link rel="stylesheet" href="/warning.css?v=1"><title>{escape(title)} · Ahnsen hilft</title></head>
<body class="{escape(body_class)}"><div class="app-shell">{header}<main class="app-main">{content}</main>{_bottom_nav(active)}</div><div class="offline-banner" id="offline-banner" role="status" aria-live="polite" hidden>Du bist offline. Bereits geladene Inhalte bleiben verfügbar.</div><script src="/pwa.js?v=1" defer></script></body></html>"""
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
    if warnings:
        highest = max(int(getattr(item, "level", 2) or 2) for item in warnings)
        top_warning = sorted(warnings, key=lambda item: int(getattr(item, "level", 2) or 2), reverse=True)[0]
        warn_class = " danger-warning" if highest >= 3 else " active-warning"
        warning_card = f'<a class="home-warning-monitor{warn_class}" href="/warnungen"><span class="warning-monitor-dot"></span><div><strong>⚠ Amtliche Warnung für Ahnsen</strong><small>{escape(getattr(top_warning, "title", "Warnlage prüfen"))}</small></div><span class="card-arrow">{icon("arrow")}</span></a>'
    else:
        warning_card = f'<a class="home-warning-monitor" href="/warnungen"><span class="warning-monitor-dot"></span><div><strong>Warnmonitor für Ahnsen aktiv</strong><small>DWD- und Bevölkerungsschutz-Warnungen werden automatisch überwacht. Push kannst du im Profil aktivieren.</small></div><span class="card-arrow">{icon("arrow")}</span></a>'
    services = [
        ("report", "Mängel melden", "Direkt mit Foto und Standort.", "/mangel-melden"), ("calendar", "Veranstaltungen", "Was ist los in Ahnsen?", "/veranstaltungen"),
        ("building", "DGH-Kalender", "Freie Tage und Belegungen.", "/dgh-mieten"), ("waste", "Müllabfuhr", "Termine und Kalenderexport.", "/muelltermine-info"),
        ("people", "Vereine & Gruppen", "Gemeinschaft erleben.", "/vereine"), ("news", "Aktuelles", "Neuigkeiten aus dem Dorf.", "/aktuelles"),
        ("shield", "Warnungen", "Amtliche Warnlage für Ahnsen.", "/warnungen"),
    ]
    cards = "".join(f'<a class="service-card{" featured" if key == "report" else ""}" href="{href}"><span class="service-icon">{icon(key)}</span><div><h3>{title}</h3><p>{text}</p></div><span class="card-arrow">{icon("arrow")}</span></a>' for key, title, text, href in services)
    content = f"""
<section class="hero-card"><div class="hero-image" role="img" aria-label="Dorfansicht von Ahnsen"></div><div class="hero-overlay"><span class="hero-kicker">Willkommen in Ahnsen</span><h1>Digital. Direkt.<br>Gemeinsam.</h1><p>Alles Wichtige aus dem Dorf in einer App.</p></div></section>
<section class="greeting-row"><div><span class="eyebrow">{escape(greeting)} 👋</span><h2>Schön, dass du da bist.</h2></div><a class="today-card" href="/veranstaltungen"><span>{icon('calendar')}</span><div><small>Heute in Ahnsen</small><strong>{event_hint}</strong></div>{icon('arrow')}</a></section>
{warning_card}
<section class="service-grid" aria-label="Digitale Dienste">{cards}</section>{waste_card}
<section class="trust-strip"><span>{icon('shield')}</span><div><strong>Einfach und datensparsam</strong><small>Keine App-Store-Anmeldung und kein WhatsApp-Konto erforderlich.</small></div></section>"""
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
        result = f'<section class="status-result"><div class="status-head"><span class="status-dot {key}"></span><div><small>Aktueller Status</small><strong>{status}</strong></div></div><dl><div><dt>Vorgang</dt><dd>{escape(report.ticket)}</dd></div><div><dt>Kategorie</dt><dd>{escape(report.art or "")}</dd></div><div><dt>Ort</dt><dd>{escape(report.ort or "")}</dd></div><div><dt>Eingegangen</dt><dd>{created}</dd></div></dl></section>'
    elif not_found:
        result = '<div class="form-alert">Zu dieser Vorgangsnummer wurde keine Meldung gefunden.</div>'
    content = f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Bearbeitungsstand</span><h1>Meldestatus prüfen</h1><p>Gib die Vorgangsnummer aus deiner Bestätigung ein.</p></section><form class="lookup-form" method="get" action="/meldestatus"><label class="field"><span>Vorgangsnummer</span><input name="ticket" value="{escape(ticket)}" placeholder="AHN-20260806-ABC123" required></label><button class="primary-button" type="submit">{icon("search")} Status abrufen</button></form>{result}'
    return page("Meldestatus", content, active="report")


def events_page(events: Iterable) -> HTMLResponse:
    cards = []
    for event in events:
        image = f'<img class="event-image" src="data:image/jpeg;base64,{event.bild_base64}" alt="">' if getattr(event, "bild_base64", None) else ""
        cards.append(f'<article class="event-card">{image}<div class="event-body"><span class="event-date">{escape(getattr(event, "datum", "") or "Termin")}</span><h2>{escape(getattr(event, "titel", "") or "Veranstaltung")}</h2><p>{escape(getattr(event, "beschreibung", "") or "Weitere Informationen folgen.")}</p><div class="meta-row">{f"<span>🕒 {escape(event.uhrzeit)}</span>" if getattr(event, "uhrzeit", "") else ""}{f"<span>📍 {escape(event.ort)}</span>" if getattr(event, "ort", "") else ""}</div></div></article>')
    if not cards: cards.append('<section class="empty-state"><span>📅</span><h2>Noch keine Termine</h2><p>Aktive Veranstaltungen erscheinen automatisch hier.</p></section>')
    return page("Veranstaltungen", f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Dorfkalender</span><h1>Veranstaltungen</h1><p>Termine, Aktionen und Feste in Ahnsen.</p></section><div class="event-list">{"".join(cards)}</div>', active="calendar")


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
    config = {"vereine": ("Vereine & Gruppen", "Gemeinschaft", "people", settings.get("vereine", "")), "aktuelles": ("Aktuelles aus Ahnsen", "Neuigkeiten", "news", settings.get("aktuelles", "")), "ansprechpartner": ("Ansprechpartner", "Kontakt", "phone", settings.get("ansprechpartner", "")), "feuerwehr": ("Feuerwehr Ahnsen", "Sicherheit & Ehrenamt", "shield", settings.get("feuerwehr_text", "")), "buergerinformationen": ("Bürgerinformationen", "Gut informiert", "news", settings.get("buergerinfo_text", "")), "ueber-ahnsen": ("Über Ahnsen", "Unser Dorf", "home", settings.get("ueber_ahnsen_text", ""))}
    title, eyebrow, key, raw = config.get(kind, config["buergerinformationen"]); entries = _entries(raw)
    cards = "".join(f'<article class="info-card"><span class="info-icon">{icon(key)}</span><h2>{escape(t)}</h2><p>{escape(d or "Weitere Informationen folgen.")}</p></article>' for t, d in entries)
    if not cards: cards = f'<article class="info-card wide"><span class="info-icon">{icon(key)}</span><h2>{escape(title)}</h2><p>{escape(str(raw or "Dieser Bereich wird gerade gepflegt."))}</p></article>'
    return page(title, f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">{eyebrow}</span><h1>{title}</h1></section><div class="info-grid">{cards}</div>', active="more")


def more_page(settings: dict) -> HTMLResponse:
    items = [("Ansprechpartner", "/ansprechpartner", "phone", "Wichtige Kontakte"), ("Feuerwehr", "/feuerwehr", "shield", "Sicherheit und Ehrenamt"), ("Warnlage", "/warnungen", "bell", "Amtliche Wetter- und Gefahrenwarnungen"), ("Bürgerinformationen", "/buergerinformationen", "news", "Hinweise der Gemeinde"), ("Über Ahnsen", "/ueber-ahnsen", "home", "Unser Dorf"), ("Meldestatus", "/meldestatus", "search", "Bearbeitungsstand prüfen"), ("Verwaltung", "/verwaltung", "building", "Geschützter Bereich"), ("Datenschutz", "/datenschutz", "shield", "Datenverarbeitung"), ("Impressum", "/impressum", "news", "Anbieterkennzeichnung")]
    links = "".join(f'<a class="menu-row" href="{href}"><span>{icon(key)}</span><div><strong>{label}</strong><small>{desc}</small></div>{icon("arrow")}</a>' for label, href, key, desc in items)
    return page("Mehr", f'<section class="page-heading compact"><a class="back-link" href="/">← Start</a><span class="eyebrow">Weitere Bereiche</span><h1>Mehr aus Ahnsen</h1></section><section class="menu-list">{links}</section><section class="install-panel"><span>{icon("download")}</span><div><strong>Ahnsen hilft installieren</strong><small>Über das Browser-Menü zum Startbildschirm hinzufügen.</small></div></section>', active="more")


def legal_page(kind: str, settings: dict) -> HTMLResponse:
    title = "Datenschutz" if kind == "datenschutz" else "Impressum"; key = "datenschutz_seite_text" if kind == "datenschutz" else "impressum_seite_text"; text = settings.get(key, f"{title} wird ergänzt.")
    paragraphs = "".join(f'<p>{escape(x.strip())}</p>' for x in str(text or "").splitlines() if x.strip())
    return page(title, f'<section class="page-heading compact"><a class="back-link" href="/mehr">← Mehr</a><span class="eyebrow">Rechtliches</span><h1>{title}</h1></section><article class="legal-card">{paragraphs}</article>', active="more")


def admin_login_page(error: str = "") -> HTMLResponse:
    alert = f'<div class="form-alert" role="alert">{escape(error)}</div>' if error else ""
    content = f'<section class="success-card admin-login-card"><span class="success-icon">{icon("building")}</span><span class="eyebrow">Geschützter Bereich</span><h1>Verwaltung</h1><p>Melde dich an, um Mängel, Veranstaltungen, DGH und Mülltermine zu verwalten.</p>{alert}<form class="admin-login-form" method="post" action="/login"><label class="field"><span>Benutzername</span><input name="username" autocomplete="username" required autofocus></label><label class="field"><span>Passwort</span><input name="password" type="password" autocomplete="current-password" required></label><button class="primary-button" type="submit">Sicher anmelden</button></form><a class="back-link admin-back" href="/">← Zur Bürger-App</a></section>'
    return page("Verwaltung anmelden", content, active="more", show_header=False, body_class="admin-login-view")
