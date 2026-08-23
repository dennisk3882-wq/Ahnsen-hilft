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
    selected_date = None
    try:
        if tag:
            selected_date = date.fromisoformat(tag)
    except ValueError:
        selected_date = None

    kalender_html = []
    kalender_labels = []
    jahr, monat = heute.year, heute.month
    initial_index = 0
    if selected_date:
        selected_offset = (selected_date.year - heute.year) * 12 + selected_date.month - heute.month
        if 0 <= selected_offset < 12:
            initial_index = selected_offset
    for index in range(12):
        tage = []
        for woche in kalender.monthdayscalendar(jahr, monat):
            for nummer in woche:
                if nummer == 0:
                    tage.append('<span class="dgh-day empty" aria-hidden="true"></span>')
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
                if aktuelles_datum == selected_date:
                    klasse += " selected"
                nummer_html = f'<span class="dgh-day-number">{nummer}</span>'
                if tag_termine:
                    tage.append(
                        f'<a class="dgh-day {klasse}" href="/intern/dgh?tag={aktuelles_datum.isoformat()}#tag-details" '
                        f'aria-label="{nummer}. {MONATSNAMEN[monat]} {jahr}: Buchungen anzeigen">{nummer_html}<i aria-hidden="true"></i></a>'
                    )
                else:
                    tage.append(f'<span class="dgh-day {klasse}">{nummer_html}<i aria-hidden="true"></i></span>')

        label = f"{MONATSNAMEN[monat]} {jahr}"
        kalender_labels.append(label)
        hidden = "" if index == initial_index else " hidden"
        kalender_html.append(
            f'<section class="dgh-month-panel" data-dgh-month="{index}" data-label="{label}"{hidden}>'
            f'<div class="dgh-month-heading"><h3>{label}</h3><span>Belegung DGH Ahnsen</span></div>'
            '<div class="dgh-weekdays"><span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span></div>'
            f'<div class="dgh-month-grid">{"".join(tage)}</div></section>'
        )
        monat += 1
        if monat > 12:
            monat = 1
            jahr += 1

    initial_label = kalender_labels[initial_index]

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
            .dgh-calendar-card {{ overflow:hidden; padding:0; }}
            .dgh-section-heading {{ display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:17px; }}
            .dgh-section-heading .admin-eyebrow {{ color:var(--admin-green); margin-bottom:5px; }}
            .dgh-section-heading h2 {{ margin:0; }}
            .dgh-calendar-top {{ display:flex; align-items:center; justify-content:space-between; gap:16px; padding:19px 20px 15px; border-bottom:1px solid var(--admin-line); background:linear-gradient(135deg,#fff,#f5f8f2); }}
            .dgh-calendar-title h2 {{ margin:5px 0 0; color:var(--admin-forest); font-size:26px; }}
            .dgh-calendar-title p {{ margin:6px 0 0; color:var(--admin-muted); font-size:12px; }}
            .dgh-calendar-nav {{ display:flex; align-items:center; gap:7px; }}
            .dgh-calendar-nav button {{ min-width:42px; height:42px; margin:0 !important; padding:0 12px !important; border:1px solid var(--admin-line) !important; border-radius:13px !important; color:var(--admin-forest) !important; background:#fff !important; font-size:18px !important; font-weight:900 !important; }}
            .dgh-calendar-nav button:disabled {{ opacity:.35; cursor:not-allowed; }}
            .dgh-calendar-nav .dgh-today-button {{ width:auto; font-size:12px !important; }}
            .dgh-legend {{ display:flex; flex-wrap:wrap; gap:8px; margin:0; padding:12px 20px; border-bottom:1px solid var(--admin-line); }}
            .dgh-legend span {{ display:inline-flex; align-items:center; gap:7px; min-height:34px; padding:6px 10px; border-radius:999px; color:#4d5a51; background:#f4f7f1; font-size:12px; font-weight:850; }}
            .dgh-legend i {{ width:12px; height:12px; display:block; border-radius:4px; }}
            .dgh-legend .free {{ background:#dfead9; }} .dgh-legend .request {{ background:#f5cc67; }} .dgh-legend .confirmed {{ background:var(--admin-green); }}
            .dgh-calendar-body {{ padding:17px 20px 20px; }}
            .dgh-month-panel[hidden] {{ display:none !important; }}
            .dgh-month-heading {{ display:flex; align-items:end; justify-content:space-between; gap:12px; margin-bottom:12px; }}
            .dgh-month-heading h3 {{ margin:0; color:var(--admin-forest); font-size:22px; }}
            .dgh-month-heading span {{ color:var(--admin-muted); font-size:10px; font-weight:800; }}
            .dgh-weekdays,.dgh-month-grid {{ display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:6px; text-align:center; }}
            .dgh-weekdays {{ margin-bottom:6px; color:var(--admin-muted); font-size:9px; font-weight:900; }}
            .dgh-weekdays span {{ padding:4px 0; }}
            .dgh-day {{ min-height:58px; position:relative; display:flex; align-items:flex-start; justify-content:flex-end; padding:7px; border:1px solid #e4e9e2; border-radius:14px; color:#3d4a42; background:#fbfcfa; text-decoration:none; font-weight:900; }}
            .dgh-day.free {{ color:#45634f; border-color:#d9e7d6; background:#f1f7ee; }}
            .dgh-day.request {{ color:#805a13; border-color:#ead79d; background:#fff6dc; }}
            .dgh-day.confirmed {{ color:#1f6544; border-color:#b9d8c3; background:#e4f2e7; }}
            .dgh-day.today {{ box-shadow:inset 0 0 0 2px var(--admin-forest); }}
            .dgh-day.selected {{ outline:3px solid #f0a928; outline-offset:2px; }}
            .dgh-day.empty {{ background:transparent; }}
            .dgh-day-number {{ font-size:14px; }}
            .dgh-day i {{ position:absolute; left:8px; bottom:8px; width:9px; height:9px; border-radius:50%; background:#83ad7d; }}
            .dgh-day.request i {{ background:#e1aa31; }} .dgh-day.confirmed i {{ background:var(--admin-green); }}
            .dgh-calendar-note {{ margin:13px 0 0; padding:11px 12px; border-radius:14px; color:var(--admin-muted); background:#f5f8f3; font-size:11px; line-height:1.45; }}

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

            @media (max-width:1050px) {{ .dgh-layout {{ grid-template-columns:1fr; }} .dgh-form-card {{ position:static; }} }}
            @media (max-width:820px) {{ .dgh-kpis {{ grid-template-columns:1fr 1fr; }} .dgh-table {{ display:none; }} .dgh-mobile-list {{ display:block; }} }}
            @media (max-width:540px) {{ .dgh-kpis {{ grid-template-columns:1fr; }} .dgh-calendar-top {{ align-items:flex-start; flex-direction:column; }} .dgh-calendar-nav {{ width:100%; justify-content:space-between; }} .dgh-calendar-nav .dgh-today-button {{ flex:1; }} .dgh-calendar-body {{ padding:14px 11px 17px; }} .dgh-legend {{ padding-left:12px; padding-right:12px; }} .dgh-weekdays,.dgh-month-grid {{ gap:4px; }} .dgh-day {{ min-height:49px; padding:6px; border-radius:11px; }} .dgh-day i {{ left:6px; bottom:6px; width:7px; height:7px; }} .dgh-day-number {{ font-size:12px; }} .dgh-form-grid {{ grid-template-columns:1fr; }} .dgh-field.full {{ grid-column:auto; }} .dgh-detail-card dl div,.dgh-mobile-card dl div {{ grid-template-columns:1fr; gap:3px; }} .dgh-status-form {{ grid-template-columns:1fr; }} }}
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

            <section class="box dgh-calendar-card" data-dgh-calendar data-initial-month="{initial_index}">
                <div class="dgh-calendar-top">
                    <div class="dgh-calendar-title"><span class="admin-eyebrow">Belegungsübersicht</span><h2 data-dgh-month-label aria-live="polite">{initial_label}</h2><p>Ein Monat auf einen Blick. Belegte Tage öffnen direkt die zugehörigen Vorgänge.</p></div>
                    <div class="dgh-calendar-nav"><button type="button" data-dgh-prev aria-label="Vorheriger Monat">‹</button><button class="dgh-today-button" type="button" data-dgh-today>Heute</button><button type="button" data-dgh-next aria-label="Nächster Monat">›</button></div>
                </div>
                <div class="dgh-legend"><span><i class="free"></i>Frei</span><span><i class="request"></i>Anfrage</span><span><i class="confirmed"></i>Bestätigt</span></div>
                <div class="dgh-calendar-body">{''.join(kalender_html)}<p class="dgh-calendar-note">Der Kalender zeigt – wie auf der öffentlichen DGH-Seite – jeweils einen Monat. Mit den Pfeilen wechselst du durch die kommenden zwölf Monate.</p></div>
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
        <script>
        (() => {{
            const root = document.querySelector('[data-dgh-calendar]');
            if (!root) return;
            const panels = [...root.querySelectorAll('[data-dgh-month]')];
            const label = root.querySelector('[data-dgh-month-label]');
            const previous = root.querySelector('[data-dgh-prev]');
            const next = root.querySelector('[data-dgh-next]');
            const todayButton = root.querySelector('[data-dgh-today]');
            const initial = Number.parseInt(root.dataset.initialMonth || '0', 10) || 0;
            let index = 0;
            const show = value => {{
                index = Math.max(0, Math.min(value, panels.length - 1));
                panels.forEach((panel, position) => {{ panel.hidden = position !== index; }});
                if (label) label.textContent = panels[index]?.dataset.label || '';
                if (previous) previous.disabled = index === 0;
                if (next) next.disabled = index === panels.length - 1;
            }};
            previous?.addEventListener('click', () => show(index - 1));
            next?.addEventListener('click', () => show(index + 1));
            todayButton?.addEventListener('click', () => show(0));
            show(initial);
        }})();
        </script>
    </body>
    </html>
    """
    return HTMLResponse(html)
