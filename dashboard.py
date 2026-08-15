from html import escape
from urllib.parse import urlencode

from fastapi.responses import HTMLResponse

from crud import get_meldung, statistik, suche_meldungen
from governance import case_history, list_admins
from intern_ui import intern_nav, intern_nav_css


def status_farbe(status):
    return {
        "Offen": "#b64a42",
        "In Bearbeitung": "#c78a1b",
        "Erledigt": "#287052",
    }.get(status, "#778078")


def naechster_status(status):
    if status == "Offen":
        return "In Bearbeitung"
    if status == "In Bearbeitung":
        return "Erledigt"
    return "Offen"


def status_klasse(status):
    return {
        "Offen": "status-offen",
        "In Bearbeitung": "status-bearbeitung",
        "Erledigt": "status-erledigt",
    }.get(status, "status-neutral")


def _icon(name):
    icons = {
        "all": '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
        "open": '<svg viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg>',
        "work": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
        "done": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
        "search": '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg>',
        "plus": '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
        "eye": '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
        "photo": '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m5 17 4-4 3 3 2-2 5 3"/></svg>',
        "pin": '<svg viewBox="0 0 24 24"><path d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>',
    }
    return icons.get(name, icons["all"])


def _query_url(**values):
    params = {key: value for key, value in values.items() if value}
    return "/intern/maengel" + ("?" + urlencode(params) if params else "")


def _shorten(value, length=110):
    text = str(value or "").strip()
    return text if len(text) <= length else text[: length - 1].rstrip() + "…"


def foto_html(m, gross=False):
    if not m.foto_base64:
        return '<span class="admin-no-photo">Kein Foto</span>'

    klasse = "admin-detail-photo" if gross else "admin-photo-thumb"
    return f"""
    <a class="admin-photo-link" href="data:image/jpeg;base64,{m.foto_base64}" target="_blank" rel="noopener">
        <img class="foto {klasse}" src="data:image/jpeg;base64,{m.foto_base64}" alt="Foto zur Meldung {escape(m.ticket)}">
    </a>
    """


def _status_form(ticket, current):
    options = "".join(
        f'<option value="{escape(status)}"{" selected" if status == current else ""}>{escape(status)}</option>'
        for status in ("Offen", "In Bearbeitung", "Erledigt")
    )
    return f"""
    <form class="admin-status-form" method="post" action="/status" onsubmit="return confirm('Status wirklich ändern? Wenn der Bürger Push für eigene Mängel aktiviert hat, erhält er direkt eine Benachrichtigung.')">
        <input type="hidden" name="ticket" value="{escape(ticket)}">
        <select name="neuer_status" aria-label="Status für {escape(ticket)}">{options}</select>
        <button type="submit">Speichern</button>
        <small class="admin-push-hint">🔔 Push bei Statusänderung</small>
    </form>
    """


def dashboard_page(suche="", status_filter="", zeitraum=""):
    meldungen = suche_meldungen(suche, status_filter, zeitraum)
    stats = statistik()

    rows = []
    mobile_cards = []

    for m in meldungen:
        status_class = status_klasse(m.status)
        datum = m.erstellt_am.strftime("%d.%m.%Y %H:%M")
        detail_url = f"/intern/meldung/{escape(m.ticket)}"
        source = escape(m.whatsapp_absender or "Bürger-PWA")

        rows.append(
            f"""
            <tr>
                <td>
                    <a class="admin-ticket" href="{detail_url}">{escape(m.ticket)}</a>
                    <small class="admin-source">{source}</small>
                </td>
                <td><span class="status admin-status {status_class}">{escape(m.status)}</span></td>
                <td>
                    <strong>{escape(m.art or "Ohne Kategorie")}</strong>
                    <small class="admin-location">{_icon('pin')}{escape(m.ort or "Kein Ort")}</small>
                </td>
                <td class="admin-description-cell">{escape(_shorten(m.beschreibung))}</td>
                <td>{foto_html(m)}</td>
                <td><time datetime="{m.erstellt_am.isoformat()}">{datum}</time></td>
                <td>
                    <div class="admin-row-actions">
                        <a class="admin-view-button" href="{detail_url}">{_icon('eye')} Details</a>
                        {_status_form(m.ticket, m.status)}
                    </div>
                </td>
            </tr>
            """
        )

        mobile_cards.append(
            f"""
            <article class="admin-mobile-card">
                <div class="admin-mobile-card-head">
                    <div>
                        <a class="admin-ticket" href="{detail_url}">{escape(m.ticket)}</a>
                        <small>{datum}</small>
                    </div>
                    <span class="status admin-status {status_class}">{escape(m.status)}</span>
                </div>
                <div class="admin-mobile-card-body">
                    <div class="admin-mobile-photo">{foto_html(m)}</div>
                    <div>
                        <strong>{escape(m.art or "Ohne Kategorie")}</strong>
                        <span class="admin-location">{_icon('pin')}{escape(m.ort or "Kein Ort")}</span>
                        <p>{escape(_shorten(m.beschreibung, 150))}</p>
                    </div>
                </div>
                <div class="admin-mobile-card-actions">
                    <a class="admin-view-button" href="{detail_url}">{_icon('eye')} Details ansehen</a>
                    {_status_form(m.ticket, m.status)}
                </div>
            </article>
            """
        )

    status_links = [
        ("", "Alle"),
        ("Offen", "Offen"),
        ("In Bearbeitung", "In Bearbeitung"),
        ("Erledigt", "Erledigt"),
    ]
    status_buttons = "".join(
        f'<a class="link-button{" active-filter" if status_filter == value else ""}" '
        f'href="{_query_url(suche=suche, status_filter=value, zeitraum=zeitraum)}">{label}</a>'
        for value, label in status_links
    )

    period_links = [
        ("", "Alle"),
        ("heute", "Heute"),
        ("woche", "7 Tage"),
        ("monat", "30 Tage"),
    ]
    period_buttons = "".join(
        f'<a class="link-button{" active-filter" if zeitraum == value else ""}" '
        f'href="{_query_url(suche=suche, status_filter=status_filter, zeitraum=value)}">{label}</a>'
        for value, label in period_links
    )

    empty = ""
    if not meldungen:
        empty = """
        <section class="admin-empty-state">
            <span>✓</span>
            <h2>Keine passenden Meldungen</h2>
            <p>Ändere die Suche oder Filter, um weitere Vorgänge anzuzeigen.</p>
            <a class="link-button" href="/intern/maengel">Filter zurücksetzen</a>
        </section>
        """

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#174936">
        <title>Mängelverwaltung · Ahnsen hilft</title>
        <style>
            {intern_nav_css()}

            .admin-hero-grid {{
                display:grid;
                grid-template-columns:minmax(0, 1fr) auto;
                gap:26px;
                align-items:end;
            }}
            .admin-hero-kpi {{
                min-width:190px;
                padding:18px;
                border:1px solid rgba(255,255,255,.2);
                border-radius:21px;
                background:rgba(255,255,255,.1);
                backdrop-filter:blur(12px);
            }}
            .admin-hero-kpi small {{ display:block; color:#dce9d5; font-weight:800; }}
            .admin-hero-kpi strong {{ display:block; margin-top:6px; color:white; font-family:Georgia,serif; font-size:38px; }}

            .admin-stat-card {{ border:1px solid var(--admin-line); border-radius:24px; background:rgba(255,254,250,.94); box-shadow:var(--admin-shadow-soft); }}
            .admin-stat-card-top {{ display:flex; align-items:center; justify-content:space-between; gap:10px; }}
            .admin-stat-card small {{ color:var(--admin-muted); font-weight:800; }}

            .admin-controls {{ display:grid; gap:18px; }}
            .admin-search-form {{ display:grid; grid-template-columns:minmax(200px,1fr) auto auto; gap:9px; align-items:center; }}
            .admin-search-field {{ position:relative; }}
            .admin-search-field svg {{ position:absolute; left:14px; top:50%; width:20px; height:20px; transform:translateY(-50%); fill:none; stroke:var(--admin-muted); stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }}
            .admin-search-field input {{ padding-left:44px !important; margin:0 !important; }}
            .admin-controls button,.admin-controls .link-button {{ margin:0 !important; min-height:46px !important; }}

            .admin-filter-title {{ margin:0 0 11px; color:var(--admin-muted); font-size:11px; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }}
            .admin-filter-row .link-button {{ min-height:38px !important; padding:8px 12px !important; }}

            .admin-ticket {{ display:inline-block; color:var(--admin-forest); font-weight:900; text-decoration:none; white-space:nowrap; }}
            .admin-ticket:hover {{ text-decoration:underline; }}
            .admin-source {{ display:block; max-width:230px; margin-top:5px; color:var(--admin-muted); font-size:11px; line-height:1.35; }}
            .admin-location {{ display:flex; align-items:center; gap:4px; margin-top:5px; color:var(--admin-muted); font-size:12px; }}
            .admin-location svg {{ width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }}
            .admin-description-cell {{ min-width:220px; max-width:360px; }}
            .admin-photo-thumb {{ width:74px !important; height:58px; object-fit:cover; display:block; }}
            .admin-no-photo {{ display:inline-flex; align-items:center; min-height:34px; padding:6px 9px; border-radius:11px; color:var(--admin-muted); background:#f0f3ee; font-size:11px; font-weight:800; white-space:nowrap; }}

            .admin-status {{ border:0 !important; }}
            .status-offen {{ color:#953f39 !important; background:#fbe3df !important; }}
            .status-bearbeitung {{ color:#805913 !important; background:#fff0c7 !important; }}
            .status-erledigt {{ color:#1d603f !important; background:#dff1e5 !important; }}
            .status-neutral {{ color:#5f6961 !important; background:#edf0ec !important; }}

            .admin-row-actions {{ display:grid; gap:7px; min-width:185px; }}
            .admin-view-button {{ min-height:39px; display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:8px 12px; border:1px solid var(--admin-line); border-radius:12px; color:var(--admin-forest); background:#f6f9f3; font-size:12px; font-weight:850; text-decoration:none; }}
            .admin-view-button svg {{ width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }}
            .admin-status-form {{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px; align-items:center; }}
            .admin-push-hint {{ grid-column:1/-1; color:#8a6115; font-size:10px; font-weight:850; }}
            .admin-status-form select {{ min-height:39px !important; margin:0 !important; padding:8px 10px !important; font-size:12px !important; }}
            .admin-status-form button {{ min-height:39px !important; margin:0 !important; padding:8px 10px !important; font-size:11px !important; }}

            .admin-mobile-card-head {{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }}
            .admin-mobile-card-head small {{ display:block; margin-top:4px; color:var(--admin-muted); }}
            .admin-mobile-card-body {{ display:grid; grid-template-columns:auto 1fr; gap:13px; margin:15px 0; }}
            .admin-mobile-card-body p {{ margin:7px 0 0; color:#536057; line-height:1.5; }}
            .admin-mobile-card-actions {{ display:grid; gap:8px; }}
            .admin-mobile-card-actions .admin-status-form {{ grid-template-columns:1fr auto; }}
            .admin-mobile-photo .admin-no-photo {{ width:64px; min-height:58px; justify-content:center; text-align:center; white-space:normal; }}

            .admin-empty-state {{ padding:42px 22px; border:1px dashed #b9cbb4; border-radius:24px; background:#f8faf5; text-align:center; }}
            .admin-empty-state > span {{ width:58px; height:58px; display:grid; place-items:center; margin:0 auto 14px; border-radius:18px; color:white; background:var(--admin-green); font-size:27px; }}
            .admin-empty-state h2 {{ margin:0 0 8px; }}
            .admin-empty-state p {{ margin:0 0 16px; color:var(--admin-muted); }}

            @media (max-width:900px) {{
                .admin-hero-grid {{ grid-template-columns:1fr; }}
                .admin-hero-kpi {{ min-width:0; width:min(100%,260px); }}
                .admin-search-form {{ grid-template-columns:1fr 1fr; }}
                .admin-search-field {{ grid-column:1 / -1; }}
            }}
            @media (max-width:520px) {{
                .admin-search-form {{ grid-template-columns:1fr; }}
                .admin-search-field {{ grid-column:auto; }}
                .admin-mobile-card-body {{ grid-template-columns:1fr; }}
                .admin-mobile-photo .admin-photo-thumb {{ width:100% !important; height:150px; }}
            }}
        </style>
    </head>
    <body>
        <main class="admin-page">
            {intern_nav("maengel")}

            <section class="admin-hero">
                <div class="admin-hero-grid">
                    <div>
                        <span class="admin-eyebrow">Bürgeranliegen verwalten</span>
                        <h1>Mängel & Meldungen</h1>
                        <p>Alle Hinweise aus der Bürger-PWA zentral prüfen, bearbeiten und transparent abschließen.</p>
                        <div class="admin-hero-actions">
                            <a href="/" target="_blank" rel="noopener">Bürger-App öffnen</a>
                            <a href="/mangel-melden" target="_blank" rel="noopener">Meldeformular ansehen</a>
                        </div>
                    </div>
                    <div class="admin-hero-kpi">
                        <small>Aktuell offen oder in Arbeit</small>
                        <strong>{stats['offen'] + stats['bearbeitung']}</strong>
                    </div>
                </div>
            </section>

            <section class="admin-stat-grid" aria-label="Meldungsstatistik">
                <article class="admin-stat-card">
                    <div class="admin-stat-card-top"><span class="admin-stat-label">Gesamt</span><span class="admin-stat-icon">{_icon('all')}</span></div>
                    <strong>{stats['gesamt']}</strong><small>Alle Vorgänge</small>
                </article>
                <article class="admin-stat-card">
                    <div class="admin-stat-card-top"><span class="admin-stat-label">Offen</span><span class="admin-stat-icon">{_icon('open')}</span></div>
                    <strong>{stats['offen']}</strong><small>Noch nicht begonnen</small>
                </article>
                <article class="admin-stat-card">
                    <div class="admin-stat-card-top"><span class="admin-stat-label">In Bearbeitung</span><span class="admin-stat-icon">{_icon('work')}</span></div>
                    <strong>{stats['bearbeitung']}</strong><small>Aktiv in Klärung</small>
                </article>
                <article class="admin-stat-card">
                    <div class="admin-stat-card-top"><span class="admin-stat-label">Erledigt</span><span class="admin-stat-icon">{_icon('done')}</span></div>
                    <strong>{stats['erledigt']}</strong><small>Abgeschlossen</small>
                </article>
            </section>

            <section class="box admin-controls">
                <form class="admin-search-form" method="get" action="/intern/maengel">
                    <div class="admin-search-field">{_icon('search')}<input type="search" name="suche" placeholder="Ticket, Ort, Kategorie oder Text durchsuchen …" value="{escape(suche)}"></div>
                    <input type="hidden" name="status_filter" value="{escape(status_filter)}">
                    <input type="hidden" name="zeitraum" value="{escape(zeitraum)}">
                    <button type="submit">Suchen</button>
                    <a class="link-button" href="/intern/maengel">Zurücksetzen</a>
                </form>
                <div class="admin-filter-groups">
                    <div class="admin-filter-group">
                        <span>Status</span>
                        <div class="admin-filter-row">{status_buttons}</div>
                    </div>
                    <div class="admin-filter-group">
                        <span>Zeitraum</span>
                        <div class="admin-filter-row">{period_buttons}</div>
                    </div>
                </div>
            </section>

            {empty or f'''<section class="admin-table-desktop table-wrap"><table><thead><tr><th>Vorgang</th><th>Status</th><th>Kategorie & Ort</th><th>Beschreibung</th><th>Foto</th><th>Eingang</th><th>Bearbeitung</th></tr></thead><tbody>{''.join(rows)}</tbody></table></section><section class="admin-mobile-list">{''.join(mobile_cards)}</section>'''}
        </main>
    </body>
    </html>
    """

    return HTMLResponse(html)


def meldung_detail_page(ticket):
    m = get_meldung(ticket)

    if not m:
        return HTMLResponse(
            """<!doctype html><html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main style="font-family:Arial;padding:30px"><h1>Meldung nicht gefunden</h1><p>Der angegebene Vorgang existiert nicht.</p><a href="/intern/maengel">Zurück zur Übersicht</a></main></body></html>""",
            status_code=404,
        )

    status_class = status_klasse(m.status)
    history = case_history(m.ticket)
    datum = m.erstellt_am.strftime("%d.%m.%Y um %H:%M Uhr")
    source = escape(m.whatsapp_absender or "Bürger-PWA")
    admins = [item for item in list_admins() if item.active]
    assignee_options = ['<option value="">Noch nicht zugewiesen</option>']
    known_assignee = False
    for item in admins:
        value = item.display_name or item.username
        selected = (m.assigned_to or "") == value
        known_assignee = known_assignee or selected
        assignee_options.append(f'<option value="{escape(value, quote=True)}"{" selected" if selected else ""}>{escape(value)} · {escape(item.username)}</option>')
    if m.assigned_to and not known_assignee:
        assignee_options.append(f'<option value="{escape(m.assigned_to, quote=True)}" selected>{escape(m.assigned_to)} · bisherige Angabe</option>')

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#174936">
        <title>{escape(m.ticket)} · Ahnsen hilft</title>
        <style>
            {intern_nav_css()}
            .admin-detail-back {{ display:inline-flex; align-items:center; gap:7px; margin-bottom:14px; color:white !important; text-decoration:none; font-weight:850; }}
            .admin-detail-grid {{ display:grid; grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr); gap:20px; align-items:start; }}
            .admin-detail-card {{ padding:24px; border:1px solid var(--admin-line); border-radius:24px; background:var(--admin-paper); box-shadow:var(--admin-shadow-soft); }}
            .admin-detail-card h2 {{ margin:0 0 18px; }}
            .admin-detail-list {{ display:grid; grid-template-columns:150px 1fr; gap:13px 18px; margin:0; }}
            .admin-detail-list dt {{ color:var(--admin-muted); font-size:12px; font-weight:900; letter-spacing:.06em; text-transform:uppercase; }}
            .admin-detail-list dd {{ margin:0; color:#354239; line-height:1.55; overflow-wrap:anywhere; }}
            .admin-description {{ margin-top:20px; padding:18px; border-radius:18px; background:#f5f8f2; }}
            .admin-description small {{ display:block; margin-bottom:8px; color:var(--admin-muted); font-weight:900; letter-spacing:.08em; text-transform:uppercase; }}
            .admin-description p {{ margin:0; line-height:1.65; white-space:pre-wrap; }}
            .admin-detail-photo {{ width:100% !important; max-height:520px; object-fit:contain; background:#f2f5ef; }}
            .admin-note-form {{ display:grid; gap:12px; }}
            .admin-note-form textarea {{ margin:0 !important; }}
            .admin-detail-status {{ display:grid; grid-template-columns:1fr auto; gap:8px; margin-bottom:20px; }}
            .admin-detail-status select,.admin-detail-status button {{ margin:0 !important; }}
            .admin-detail-meta {{ display:flex; flex-wrap:wrap; gap:9px; margin-top:15px; }}
            .admin-detail-meta span {{ display:inline-flex; align-items:center; min-height:34px; padding:7px 10px; border-radius:999px; color:#dfead8; background:rgba(255,255,255,.1); font-size:12px; font-weight:800; }}
            .admin-status.status-offen {{ color:#953f39 !important; background:#fbe3df !important; }}
            .admin-status.status-bearbeitung {{ color:#805913 !important; background:#fff0c7 !important; }}
            .admin-status.status-erledigt {{ color:#1d603f !important; background:#dff1e5 !important; }}
            @media (max-width:880px) {{ .admin-detail-grid {{ grid-template-columns:1fr; }} }}
            @media (max-width:560px) {{ .admin-detail-list {{ grid-template-columns:1fr; gap:5px; }} .admin-detail-list dd {{ margin-bottom:11px; }} .admin-detail-status {{ grid-template-columns:1fr; }} }}
        </style>
    </head>
    <body>
        <main class="admin-page">
            {intern_nav("maengel")}

            <section class="admin-hero">
                <a class="admin-detail-back" href="/intern/maengel">← Zurück zur Übersicht</a>
                <span class="admin-eyebrow">Meldungsdetails</span>
                <h1>{escape(m.ticket)}</h1>
                <p>{escape(m.art or "Meldung")} · {escape(m.ort or "Ahnsen")}</p>
                <div class="admin-detail-meta">
                    <span>{datum}</span>
                    <span>{source}</span>
                    <span class="status admin-status {status_class}">{escape(m.status)}</span>
                </div>
            </section>

            <div class="admin-detail-grid">
                <section class="admin-detail-card">
                    <h2>Vorgang</h2>
                    <dl class="admin-detail-list">
                        <dt>Vorgangsnummer</dt><dd><strong>{escape(m.ticket)}</strong></dd>
                        <dt>Status</dt><dd><span class="status admin-status {status_class}">{escape(m.status)}</span></dd>
                        <dt>Kategorie</dt><dd>{escape(m.art or "-")}</dd>
                        <dt>Ort</dt><dd>{escape(m.ort or "-")}</dd>
                        <dt>Eingegangen</dt><dd>{datum}</dd>
                        <dt>Kontakt / Herkunft</dt><dd>{source}</dd>
                    </dl>
                    <div class="admin-description"><small>Beschreibung</small><p>{escape(m.beschreibung or "Keine Beschreibung vorhanden.")}</p></div>
                </section>

                <aside>
                    <section class="admin-detail-card">
                        <h2>Status ändern</h2>
                        <form class="admin-note-form" method="post" action="/intern/meldung/{escape(m.ticket)}/workflow">
                            <label>Status<select name="status"><option {"selected" if m.status == "Offen" else ""}>Offen</option><option {"selected" if m.status == "In Bearbeitung" else ""}>In Bearbeitung</option><option {"selected" if m.status == "Warten auf Rückmeldung" else ""}>Warten auf Rückmeldung</option><option {"selected" if m.status == "Erledigt" else ""}>Erledigt</option><option {"selected" if m.status == "Abgelehnt" else ""}>Abgelehnt</option></select></label>
                            <label>Priorität<select name="priority">{"".join(f'<option value="{x}"{" selected" if (m.priority or "Normal") == x else ""}>{x}</option>' for x in ("Niedrig","Normal","Hoch","Dringend"))}</select></label>
                            <label>Zuständiger Bereich<input name="responsibility" maxlength="120" value="{escape(m.responsibility or '')}" placeholder="z. B. Bauhof"></label>
                            <label>Bearbeitung durch<select name="assigned_to">{"".join(assignee_options)}</select></label>
                            <label>Frist<input type="datetime-local" name="due_at" value="{m.due_at.strftime('%Y-%m-%dT%H:%M') if m.due_at else ''}"></label>
                            <label>Öffentliche Rückmeldung<textarea name="public_note" maxlength="2000" placeholder="Dieser Text ist für den Bürger sichtbar.">{escape(m.public_note or '')}</textarea></label>
                            <button type="submit">Vorgang aktualisieren</button>
                        </form>

                        <h2>Interne Notiz</h2>
                        <form class="admin-note-form" method="post" action="/notiz">
                            <input type="hidden" name="ticket" value="{escape(m.ticket)}">
                            <textarea name="notiz" placeholder="Bearbeitungsstand, Rückfragen oder interne Hinweise …">{escape(m.interne_notiz or "")}</textarea>
                            <button type="submit">Notiz speichern</button>
                        </form>
                    </section>
                </aside>
            </div>

            <section class="admin-detail-card" style="margin-top:20px">
                <h2>Foto zur Meldung</h2>
                {foto_html(m, gross=True)}
                {f'<form method="post" action="/intern/meldung/{escape(m.ticket)}/foto-loeschen" onsubmit="return confirm(\'Foto wirklich dauerhaft aus diesem Vorgang entfernen?\')"><button class="danger" type="submit">Foto entfernen</button></form>' if m.foto_base64 else ''}
            </section>
            <section class="admin-detail-card" style="margin-top:20px"><h2>Bearbeitungsverlauf</h2>{''.join(f'<p><strong>{entry.created_at:%d.%m.%Y %H:%M} · {escape(entry.actor)}</strong><br>{escape(entry.action)}: {escape(entry.old_value)} → {escape(entry.new_value)}</p>' for entry in history) or '<p>Noch keine Änderungen protokolliert.</p>'}</section>
        </main>
    </body>
    </html>
    """

    return HTMLResponse(html)
