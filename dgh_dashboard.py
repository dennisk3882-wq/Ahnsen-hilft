import calendar
from datetime import date, datetime
from html import escape

from fastapi.responses import HTMLResponse

from dgh_crud import get_alle_dgh_termine, get_dgh_termin, parse_datum
from intern_ui import intern_nav, intern_nav_css


MONATSNAMEN = [
    "",
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
]


def _status(term):
    if term.aktiv != "Ja":
        return "Inaktiv", "inactive"
    if term.status == "Anfrage":
        return "Anfrage", "request"
    if term.status == "Bestätigt":
        return "Bestätigt", "confirmed"
    if term.status == "Abgelehnt":
        return "Abgelehnt", "rejected"
    return term.status or "Unbekannt", "inactive"


def _status_select(term):
    options = "".join(
        f'<option value="{value}"{" selected" if term.status == value else ""}>{value}</option>'
        for value in ("Anfrage", "Bestätigt", "Abgelehnt")
    )
    return f"""
    <form class="dgh-status-form" method="post" action="/dgh/status/{term.id}" onsubmit="return confirm('Status wirklich ändern? Wenn der Bürger Push für DGH-Anfragen aktiviert hat, erhält er direkt eine Benachrichtigung.')">
        <select name="status" aria-label="Status für Termin {term.id}">{options}</select>
        <button type="submit">Speichern</button>
        <small class="dgh-push-hint">🔔 Push bei Statusänderung</small>
    </form>
    """


def dgh_dashboard(bearbeiten_id=None, hinweis="", fehler="", tag=""):
    termine = get_alle_dgh_termine()
    edit = get_dgh_termin(bearbeiten_id) if bearbeiten_id else None

    if edit:
        form_action = f"/dgh/bearbeiten/{edit.id}"
        form_title = "DGH-Termin bearbeiten"
        button_text = "Änderungen speichern"
        datum = edit.datum or ""
        uhrzeit = edit.uhrzeit or ""
        anlass = edit.anlass or ""
        name = edit.name or ""
        telefon = edit.telefon or ""
        kommentar = edit.kommentar or ""
    else:
        form_action = "/dgh/neuer-termin"
        form_title = "Neuen Termin anlegen"
        button_text = "Termin speichern"
        datum = uhrzeit = anlass = name = telefon = kommentar = ""

    termine_nach_datum = {}
    for termin in termine:
        parsed = parse_datum(termin.datum)
        if parsed and termin.aktiv == "Ja" and termin.status in {"Anfrage", "Bestätigt"}:
            termine_nach_datum.setdefault(parsed, []).append(termin)

    heute = datetime.today().date()
    kalender = calendar.Calendar(firstweekday=0)
    kalender_html = []

    for jahr in (heute.year, heute.year + 1):
        monate = []
        for monat in range(1, 13):
            tage = []
            for woche in kalender.monthdayscalendar(jahr, monat):
                for nummer in woche:
                    if nummer == 0:
                        tage.append('<span class="dgh-day empty"></span>')
                        continue
                    aktuelles_datum = date(jahr, monat, nummer)
                    tag_termine = termine_nach_datum.get(aktuelles_datum, [])
                    if any(item.status == "Bestätigt" for item in tag_termine):
                        klasse = "confirmed"
                    elif any(item.status == "Anfrage" for item in tag_termine):
                        klasse = "request"
                    else:
                        klasse = "free"
                    if aktuelles_datum == heute:
                        klasse += " today"
                    if tag_termine:
                        inhalt = f'<a href="/intern/dgh?tag={aktuelles_datum.isoformat()}#tag-details">{nummer}</a>'
                    else:
                        inhalt = str(nummer)
                    tage.append(f'<span class="dgh-day {klasse}">{inhalt}</span>')

            monate.append(
                f"""
                <article class="dgh-month">
                    <h4>{MONATSNAMEN[monat]}</h4>
                    <div class="dgh-weekdays"><span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span></div>
                    <div class="dgh-days">{''.join(tage)}</div>
                </article>
                """
            )
        kalender_html.append(
            f'<section class="dgh-year"><div class="dgh-year-title"><h3>{jahr}</h3><span>12 Monate</span></div><div class="dgh-months">{"".join(monate)}</div></section>'
        )

    selected_date = None
    try:
        if tag:
            selected_date = date.fromisoformat(tag)
    except ValueError:
        selected_date = None

    detail_html = ""
    if selected_date:
        selected_terms = termine_nach_datum.get(selected_date, [])
        detail_cards = []
        for term in selected_terms:
            status_label, status_class = _status(term)
            detail_cards.append(
                f"""
                <article class="dgh-detail-card">
                    <div class="dgh-detail-head"><div><span class="dgh-status {status_class}">{escape(status_label)}</span><h3>{escape(term.anlass or 'Ohne Anlass')}</h3></div><a class="secondary" href="/intern/dgh?bearbeiten_id={term.id}&tag={tag}#terminformular">Bearbeiten</a></div>
                    <dl>
                        <div><dt>Name</dt><dd>{escape(term.name or '-')}</dd></div>
                        <div><dt>Uhrzeit</dt><dd>{escape(term.uhrzeit or '-')}</dd></div>
                        <div><dt>Telefon</dt><dd>{escape(term.telefon or '-')}</dd></div>
                        <div><dt>Kommentar</dt><dd>{escape(term.kommentar or '-')}</dd></div>
                    </dl>
                </article>
                """
            )
        detail_html = f"""
        <section class="box" id="tag-details">
            <div class="dgh-section-heading"><div><span class="admin-eyebrow">Ausgewählter Tag</span><h2>{selected_date.strftime('%d.%m.%Y')}</h2></div><a class="secondary" href="/intern/dgh">Auswahl schließen</a></div>
            <div class="dgh-detail-grid">{''.join(detail_cards) if detail_cards else '<p class="muted">Keine Buchungen an diesem Tag.</p>'}</div>
        </section>
        """

    rows = []
    mobile_cards = []
    for term in termine:
        status_label, status_class = _status(term)
        aktiv_neu = "Nein" if term.aktiv == "Ja" else "Ja"
        aktiv_text = "Deaktivieren" if term.aktiv == "Ja" else "Aktivieren"
        edit_url = f"/intern/dgh?bearbeiten_id={term.id}#terminformular"

        rows.append(
            f"""
            <tr>
                <td><strong>{escape(term.datum or '-')}</strong><small>{escape(term.uhrzeit or 'Keine Uhrzeit')}</small></td>
                <td><strong>{escape(term.anlass or 'Ohne Anlass')}</strong><small>{escape(term.kommentar or '')}</small></td>
                <td>{escape(term.name or '-')}<small>{escape(term.telefon or '')}</small></td>
                <td><span class="dgh-status {status_class}">{escape(status_label)}</span></td>
                <td>{_status_select(term)}</td>
                <td><div class="dgh-actions"><a class="secondary" href="{edit_url}">Bearbeiten</a><form method="post" action="/dgh/aktiv/{term.id}/{aktiv_neu}"><button type="submit">{aktiv_text}</button></form><form method="post" action="/dgh/loeschen/{term.id}" onsubmit="return confirm('DGH-Termin wirklich löschen?')"><button class="danger" type="submit">Löschen</button></form></div></td>
            </tr>
            """
        )

        mobile_cards.append(
            f"""
            <article class="dgh-mobile-card">
                <div class="dgh-mobile-head"><div><small>{escape(term.datum or '-')} · {escape(term.uhrzeit or 'ohne Uhrzeit')}</small><h3>{escape(term.anlass or 'Ohne Anlass')}</h3></div><span class="dgh-status {status_class}">{escape(status_label)}</span></div>
                <dl><div><dt>Name</dt><dd>{escape(term.name or '-')}</dd></div><div><dt>Telefon</dt><dd>{escape(term.telefon or '-')}</dd></div><div><dt>Kommentar</dt><dd>{escape(term.kommentar or '-')}</dd></div></dl>
                {_status_select(term)}
                <div class="dgh-actions"><a class="secondary" href="{edit_url}">Bearbeiten</a><form method="post" action="/dgh/aktiv/{term.id}/{aktiv_neu}"><button type="submit">{aktiv_text}</button></form><form method="post" action="/dgh/loeschen/{term.id}" onsubmit="return confirm('DGH-Termin wirklich löschen?')"><button class="danger" type="submit">Löschen</button></form></div>
            </article>
            """
        )

    confirmed = sum(1 for term in termine if term.aktiv == "Ja" and term.status == "Bestätigt")
    requested = sum(1 for term in termine if term.aktiv == "Ja" and term.status == "Anfrage")

    message_html = ""
    if hinweis:
        message_html += f'<div class="message">✓ {escape(hinweis)}</div>'
    if fehler:
        message_html += f'<div class="message error">⚠ {escape(fehler)}</div>'

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#174936">
        <title>DGH-Verwaltung · Ahnsen hilft</title>
        <style>
            {intern_nav_css()}

            .dgh-kpis {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:13px; margin-bottom:20px; }}
            .dgh-kpi {{ padding:18px; border:1px solid var(--admin-line); border-radius:21px; background:var(--admin-paper); box-shadow:var(--admin-shadow-soft); }}
            .dgh-kpi span {{ color:var(--admin-muted); font-size:11px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }}
            .dgh-kpi strong {{ display:block; margin-top:7px; color:var(--admin-forest); font-family:Georgia,serif; font-size:34px; }}
            .dgh-calendar-card h2 {{ margin:0; }}
            .dgh-section-heading {{ display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:17px; }}
            .dgh-section-heading .admin-eyebrow {{ color:var(--admin-green); margin-bottom:5px; }}
            .dgh-section-heading h2 {{ margin:0; }}
            .dgh-legend {{ display:flex; flex-wrap:wrap; gap:8px; margin:15px 0 20px; }}
            .dgh-legend span {{ display:inline-flex; align-items:center; gap:7px; min-height:34px; padding:6px 10px; border-radius:999px; color:#4d5a51; background:#f4f7f1; font-size:12px; font-weight:850; }}
            .dgh-legend i {{ width:12px; height:12px; display:block; border-radius:4px; }}
            .dgh-legend .free {{ background:#dfead9; }} .dgh-legend .request {{ background:#f5cc67; }} .dgh-legend .confirmed {{ background:var(--admin-green); }}
            .dgh-year + .dgh-year {{ margin-top:24px; }}
            .dgh-year-title {{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; }}
            .dgh-year-title h3 {{ margin:0; font-size:28px; }}
            .dgh-year-title span {{ color:var(--admin-muted); font-size:12px; font-weight:800; }}
            .dgh-months {{ display:grid; grid-template-columns:repeat(4,minmax(190px,1fr)); gap:11px; }}
            .dgh-month {{ padding:12px; border:1px solid var(--admin-line); border-radius:17px; background:#fffefa; }}
            .dgh-month h4 {{ margin:0 0 9px; text-align:center; font-size:14px !important; }}
            .dgh-weekdays,.dgh-days {{ display:grid; grid-template-columns:repeat(7,1fr); gap:3px; text-align:center; }}
            .dgh-weekdays {{ margin-bottom:4px; color:var(--admin-muted); font-size:9px; font-weight:900; }}
            .dgh-day {{ min-height:29px; display:grid; place-items:center; border:1px solid transparent; border-radius:8px; font-size:10px; font-weight:850; }}
            .dgh-day a {{ width:100%; height:100%; display:grid; place-items:center; color:inherit; text-decoration:none; }}
            .dgh-day.free {{ color:#45634f; background:#edf4e9; }}
            .dgh-day.request {{ color:#805a13; background:#fff0c5; }}
            .dgh-day.confirmed {{ color:white; background:var(--admin-green); }}
            .dgh-day.today {{ box-shadow:inset 0 0 0 2px var(--admin-forest); }}
            .dgh-day.empty {{ background:transparent; }}

            .dgh-detail-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }}
            .dgh-detail-card,.dgh-mobile-card {{ padding:17px; border:1px solid var(--admin-line); border-radius:20px; background:#fffefa; }}
            .dgh-detail-head,.dgh-mobile-head {{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }}
            .dgh-detail-head h3,.dgh-mobile-head h3 {{ margin:8px 0 0; }}
            .dgh-detail-card dl,.dgh-mobile-card dl {{ display:grid; gap:8px; margin:15px 0; }}
            .dgh-detail-card dl div,.dgh-mobile-card dl div {{ display:grid; grid-template-columns:90px 1fr; gap:8px; }}
            .dgh-detail-card dt,.dgh-mobile-card dt {{ color:var(--admin-muted); font-size:11px; font-weight:900; text-transform:uppercase; }}
            .dgh-detail-card dd,.dgh-mobile-card dd {{ margin:0; white-space:pre-line; }}

            .dgh-layout {{ display:grid; grid-template-columns:minmax(330px,.68fr) minmax(0,1.32fr); gap:20px; align-items:start; }}
            .dgh-form-card {{ position:sticky; top:118px; }}
            .dgh-form {{ display:grid; gap:11px; }}
            .dgh-push-hint {{ grid-column:1/-1; color:#8a6115; font-size:10px; font-weight:850; }}
            .dgh-form-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }}
            .dgh-field {{ display:grid; gap:6px; }}
            .dgh-field.full {{ grid-column:1/-1; }}
            .dgh-field span {{ color:#465349; font-size:12px; font-weight:900; }}
            .dgh-field input,.dgh-field textarea {{ margin:0 !important; }}
            .dgh-form-actions,.dgh-actions {{ display:flex; flex-wrap:wrap; gap:6px; }}
            .dgh-form-actions button,.dgh-form-actions a,.dgh-actions a {{ margin:0 !important; }}
            .dgh-actions a {{ min-height:37px; display:inline-flex; align-items:center; justify-content:center; padding:8px 10px; border-radius:11px; color:white; background:var(--admin-green); font-size:11px; font-weight:850; text-decoration:none; }}
            .dgh-actions .secondary {{ color:var(--admin-forest) !important; border:1px solid var(--admin-line) !important; background:#f5f8f2 !important; }}
            .dgh-actions .danger {{ background:var(--admin-danger) !important; }}

            .dgh-status {{ display:inline-flex; min-height:30px; align-items:center; padding:5px 10px; border-radius:999px; font-size:12px; font-weight:900; white-space:nowrap; }}
            .dgh-status.request {{ color:#805a13; background:#fff0c5; }}
            .dgh-status.confirmed {{ color:#1d603f; background:#dff1e5; }}
            .dgh-status.rejected {{ color:#913c36; background:#fae2df; }}
            .dgh-status.inactive {{ color:#667169; background:#edf0ec; }}
            td small {{ display:block; margin-top:5px; color:var(--admin-muted); }}
            .dgh-status-form {{ display:grid; grid-template-columns:minmax(120px,1fr) auto; gap:6px; }}
            .dgh-status-form select,.dgh-status-form button {{ min-height:39px !important; margin:0 !important; padding:8px 10px !important; font-size:12px !important; }}
            .dgh-table {{ overflow:auto; border:1px solid var(--admin-line); border-radius:19px; }}
            .dgh-table table {{ min-width:980px; }}
            .dgh-mobile-list {{ display:none; }}
            .dgh-mobile-card + .dgh-mobile-card {{ margin-top:12px; }}
            .dgh-mobile-head small {{ color:var(--admin-green); font-size:11px; font-weight:900; }}

            @media (max-width:1180px) {{ .dgh-months {{ grid-template-columns:repeat(3,minmax(180px,1fr)); }} }}
            @media (max-width:1050px) {{ .dgh-layout {{ grid-template-columns:1fr; }} .dgh-form-card {{ position:static; }} }}
            @media (max-width:820px) {{ .dgh-kpis {{ grid-template-columns:1fr 1fr; }} .dgh-months {{ grid-template-columns:repeat(2,minmax(150px,1fr)); }} .dgh-table {{ display:none; }} .dgh-mobile-list {{ display:block; }} }}
            @media (max-width:540px) {{ .dgh-kpis {{ grid-template-columns:1fr; }} .dgh-months {{ grid-template-columns:1fr; }} .dgh-form-grid {{ grid-template-columns:1fr; }} .dgh-field.full {{ grid-column:auto; }} .dgh-detail-card dl div,.dgh-mobile-card dl div {{ grid-template-columns:1fr; gap:3px; }} .dgh-status-form {{ grid-template-columns:1fr; }} }}
        </style>
    </head>
    <body>
        <main class="admin-page">
            {intern_nav("dgh")}

            <section class="admin-hero">
                <span class="admin-eyebrow">Dorfgemeinschaftshaus</span>
                <h1>DGH-Verwaltung</h1>
                <p>Anfragen prüfen, Belegungen bestätigen und freie Termine für die Bürger-PWA aktuell halten.</p>
                <div class="admin-hero-actions"><a href="/dgh-mieten" target="_blank" rel="noopener">Öffentliche DGH-Seite ansehen</a></div>
            </section>

            {message_html}

            <section class="dgh-kpis">
                <article class="dgh-kpi"><span>Alle Einträge</span><strong>{len(termine)}</strong></article>
                <article class="dgh-kpi"><span>Offene Anfragen</span><strong>{requested}</strong></article>
                <article class="dgh-kpi"><span>Bestätigte Termine</span><strong>{confirmed}</strong></article>
            </section>

            <section class="box dgh-calendar-card">
                <div class="dgh-section-heading"><div><span class="admin-eyebrow">Belegungsübersicht</span><h2>Kalender {heute.year}–{heute.year + 1}</h2></div></div>
                <div class="dgh-legend"><span><i class="free"></i>Frei</span><span><i class="request"></i>Anfrage</span><span><i class="confirmed"></i>Bestätigt</span></div>
                {''.join(kalender_html)}
            </section>

            {detail_html}

            <div class="dgh-layout">
                <section class="box dgh-form-card" id="terminformular">
                    <h2>{form_title}</h2>
                    <p class="muted">Interne Kommentare sind ausschließlich im Verwaltungsbereich sichtbar.</p>
                    <form class="dgh-form" method="post" action="{form_action}">
                        <div class="dgh-form-grid">
                            <label class="dgh-field"><span>Datum *</span><input name="datum" value="{escape(datum)}" required placeholder="12.08.2026"></label>
                            <label class="dgh-field"><span>Uhrzeit</span><input name="uhrzeit" value="{escape(uhrzeit)}" placeholder="18:00 Uhr"></label>
                            <label class="dgh-field full"><span>Anlass</span><input name="anlass" value="{escape(anlass)}" placeholder="Geburtstag, Sitzung, Feier …"></label>
                            <label class="dgh-field"><span>Name / Mieter</span><input name="name" value="{escape(name)}"></label>
                            <label class="dgh-field"><span>Telefon</span><input name="telefon" value="{escape(telefon)}"></label>
                            <label class="dgh-field full"><span>Interner Kommentar</span><textarea name="kommentar" placeholder="Hinweise zur Bearbeitung …">{escape(kommentar)}</textarea></label>
                        </div>
                        <div class="dgh-form-actions"><button type="submit">{button_text}</button><a class="cancel" href="/intern/dgh">Formular leeren</a></div>
                    </form>
                </section>

                <section class="box">
                    <div class="dgh-section-heading"><div><span class="admin-eyebrow">Vorgänge</span><h2>Terminübersicht</h2></div><span class="muted">{len(termine)} Einträge</span></div>
                    <div class="dgh-table"><table><thead><tr><th>Termin</th><th>Anlass</th><th>Kontakt</th><th>Status</th><th>Status ändern</th><th>Aktionen</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div>
                    <div class="dgh-mobile-list">{''.join(mobile_cards)}</div>
                </section>
            </div>
        </main>
    </body>
    </html>
    """
    return HTMLResponse(html)
