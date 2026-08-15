from datetime import date
from html import escape

from fastapi.responses import HTMLResponse

from intern_ui import intern_nav, intern_nav_css
from muelltermine_crud import get_alle_muelltermine, get_muell_import_info, get_naechste_muelltermine
from muelltermine_texte import formatiere_abfuhrarten


def resttage_text(datum):
    tage = (datum - date.today()).days
    if tage == 0:
        return "heute"
    if tage == 1:
        return "morgen"
    if tage > 1:
        return f"in {tage} Tagen"
    if tage == -1:
        return "gestern"
    return f"vor {abs(tage)} Tagen"


def _waste_tags(value):
    names = formatiere_abfuhrarten(value)
    return "".join(f'<span>{escape(name)}</span>' for name in names) or '<span>Unbekannte Abfuhr</span>'


def muelltermine_dashboard(hinweis="", fehler=""):
    termine = get_alle_muelltermine()
    import_info = get_muell_import_info()
    naechste = get_naechste_muelltermine(limit=1)

    message_html = ""
    if hinweis:
        message_html = f'<div class="message">✓ {escape(hinweis)}</div>'
    elif fehler:
        message_html = f'<div class="message error">⚠ {escape(fehler)}</div>'

    if import_info:
        importiert_am = import_info["importiert_am"]
        zeitpunkt = importiert_am.strftime("%d.%m.%Y um %H:%M Uhr") if importiert_am else "-"
        import_html = f"""
        <dl class="waste-import-details">
            <div><dt>Kalenderjahr</dt><dd>{import_info['jahr']}</dd></div>
            <div><dt>Erkannte Adresse</dt><dd>{escape(import_info['adresse'] or 'Ahnsen')}</dd></div>
            <div><dt>Importierte Termine</dt><dd>{import_info['anzahl']}</dd></div>
            <div><dt>Datei</dt><dd>{escape(import_info['dateiname'] or '-')}</dd></div>
            <div><dt>Importiert</dt><dd>{zeitpunkt}</dd></div>
        </dl>
        """
    else:
        import_html = '<div class="waste-empty-inline">Noch kein Abfuhrkalender importiert.</div>'

    if naechste:
        termin = naechste[0]
        next_html = f"""
        <div class="waste-next-date">
            <small>Nächste Abholung · {escape(resttage_text(termin.datum))}</small>
            <strong>{termin.datum.strftime('%d.%m.%Y')}</strong>
            <span>{escape(termin.wochentag or '')}</span>
        </div>
        <div class="waste-tags">{_waste_tags(termin.abfuhrarten)}</div>
        """
    else:
        next_html = '<div class="waste-empty-inline">Es sind keine kommenden Abfuhrtermine eingetragen.</div>'

    rows = []
    cards = []
    for termin in termine:
        hinweis_badge = (
            '<span class="waste-note shifted">Feiertagsverschiebung</span>'
            if termin.feiertagsabweichung == "Ja"
            else '<span class="waste-note regular">Regulärer Termin</span>'
        )
        rows.append(
            f"""
            <tr>
                <td><strong>{termin.datum.strftime('%d.%m.%Y')}</strong><small>{escape(resttage_text(termin.datum))}</small></td>
                <td>{escape(termin.wochentag or '-')}</td>
                <td><div class="waste-tags compact">{_waste_tags(termin.abfuhrarten)}</div></td>
                <td>{hinweis_badge}</td>
                <td><details><summary>Bearbeiten</summary><form method="post" action="/muelltermine/termin"><input type="hidden" name="termin_id" value="{termin.id}"><label>Datum<input type="date" name="datum" value="{termin.datum.isoformat()}" required></label><label>Abfuhrarten<input name="abfuhrarten" value="{escape(termin.abfuhrarten or '', quote=True)}" required></label><label><input type="checkbox" name="feiertagsabweichung" value="ja"{" checked" if termin.feiertagsabweichung == "Ja" else ""}> Feiertagsverschiebung</label><button type="submit">Speichern</button></form><form method="post" action="/muelltermine/termin/{termin.id}/loeschen" onsubmit="return confirm('Abfuhrtermin wirklich löschen?')"><button class="danger" type="submit">Löschen</button></form></details></td>
            </tr>
            """
        )
        cards.append(
            f"""
            <article class="waste-mobile-card">
                <div class="waste-mobile-head"><div><small>{escape(termin.wochentag or '-')}</small><h3>{termin.datum.strftime('%d.%m.%Y')}</h3><span>{escape(resttage_text(termin.datum))}</span></div>{hinweis_badge}</div>
                <div class="waste-tags">{_waste_tags(termin.abfuhrarten)}</div>
                <details><summary>Termin bearbeiten</summary><form method="post" action="/muelltermine/termin"><input type="hidden" name="termin_id" value="{termin.id}"><label>Datum<input type="date" name="datum" value="{termin.datum.isoformat()}" required></label><label>Abfuhrarten<input name="abfuhrarten" value="{escape(termin.abfuhrarten or '', quote=True)}" required></label><label><input type="checkbox" name="feiertagsabweichung" value="ja"{" checked" if termin.feiertagsabweichung == "Ja" else ""}> Feiertagsverschiebung</label><button type="submit">Speichern</button></form><form method="post" action="/muelltermine/termin/{termin.id}/loeschen" onsubmit="return confirm('Abfuhrtermin wirklich löschen?')"><button class="danger" type="submit">Löschen</button></form></details>
            </article>
            """
        )

    current_year = date.today().year
    upcoming_count = sum(1 for item in termine if item.datum >= date.today())

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#174936">
        <title>Müllabfuhr · Ahnsen hilft Verwaltung</title>
        <style>
            {intern_nav_css()}

            .waste-kpis {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:13px; margin-bottom:20px; }}
            .waste-kpi {{ padding:18px; border:1px solid var(--admin-line); border-radius:21px; background:var(--admin-paper); box-shadow:var(--admin-shadow-soft); }}
            .waste-kpi span {{ color:var(--admin-muted); font-size:11px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }}
            .waste-kpi strong {{ display:block; margin-top:7px; color:var(--admin-forest); font-family:Georgia,serif; font-size:34px; }}

            .waste-grid {{ display:grid; grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr); gap:20px; margin-bottom:20px; }}
            .waste-card-heading {{ margin-bottom:16px; }}
            .waste-card-heading h2 {{ margin:0 0 6px; }}
            .waste-card-heading p {{ margin:0; color:var(--admin-muted); line-height:1.5; }}
            .waste-upload-area {{ display:grid; gap:12px; padding:18px; border:1.5px dashed #b7cbb2; border-radius:19px; background:#f7faf4; }}
            .waste-upload-area input {{ margin:0 !important; }}
            .waste-upload-area button {{ width:100% !important; margin:0 !important; }}
            .waste-upload-help {{ margin:0; color:var(--admin-muted); font-size:12px; line-height:1.5; }}

            .waste-import-details {{ display:grid; gap:10px; margin:0; }}
            .waste-import-details div {{ display:grid; grid-template-columns:145px 1fr; gap:12px; padding-bottom:9px; border-bottom:1px solid #e8eee5; }}
            .waste-import-details div:last-child {{ padding-bottom:0; border-bottom:0; }}
            .waste-import-details dt {{ color:var(--admin-muted); font-size:11px; font-weight:900; text-transform:uppercase; }}
            .waste-import-details dd {{ margin:0; font-weight:800; overflow-wrap:anywhere; }}

            .waste-next {{ display:flex; align-items:center; justify-content:space-between; gap:20px; padding:24px !important; border-left:7px solid var(--admin-green) !important; }}
            .waste-next-date small {{ display:block; color:var(--admin-muted); font-weight:850; }}
            .waste-next-date strong {{ display:block; margin:5px 0 2px; color:var(--admin-forest); font-family:Georgia,serif; font-size:36px; }}
            .waste-next-date span {{ color:#536057; }}
            .waste-tags {{ display:flex; flex-wrap:wrap; gap:7px; }}
            .waste-tags span {{ display:inline-flex; align-items:center; min-height:32px; padding:6px 10px; border-radius:999px; color:#33453a; background:#eaf1e5; font-size:12px; font-weight:900; }}
            .waste-tags.compact span {{ min-height:28px; padding:5px 8px; font-size:11px; }}
            .waste-note {{ display:inline-flex; min-height:30px; align-items:center; padding:5px 9px; border-radius:999px; font-size:11px; font-weight:900; white-space:nowrap; }}
            .waste-note.shifted {{ color:#805a13; background:#fff0c5; }}
            .waste-note.regular {{ color:#1d603f; background:#dff1e5; }}
            .waste-empty-inline {{ padding:24px; border:1px dashed #b9cbb4; border-radius:18px; color:var(--admin-muted); background:#f7faf4; text-align:center; }}

            .waste-table-heading {{ display:flex; align-items:center; justify-content:space-between; gap:14px; margin-bottom:16px; }}
            .waste-table-heading h2 {{ margin:0; }}
            .waste-table-wrap {{ overflow:auto; border:1px solid var(--admin-line); border-radius:19px; }}
            .waste-table-wrap table {{ min-width:720px; }}
            td small {{ display:block; margin-top:5px; color:var(--admin-muted); }}
            .waste-mobile-list {{ display:none; }}
            .waste-mobile-card {{ padding:17px; border:1px solid var(--admin-line); border-radius:20px; background:var(--admin-paper); box-shadow:var(--admin-shadow-soft); }}
            .waste-mobile-card + .waste-mobile-card {{ margin-top:11px; }}
            .waste-mobile-head {{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:13px; }}
            .waste-mobile-head small {{ color:var(--admin-green); font-size:11px; font-weight:900; text-transform:uppercase; }}
            .waste-mobile-head h3 {{ margin:4px 0 2px; font-size:24px; }}
            .waste-mobile-head span {{ color:var(--admin-muted); font-size:12px; }}

            @media (max-width:900px) {{ .waste-grid {{ grid-template-columns:1fr; }} }}
            @media (max-width:820px) {{ .waste-kpis {{ grid-template-columns:1fr 1fr; }} .waste-next {{ align-items:flex-start; flex-direction:column; }} .waste-table-wrap {{ display:none; }} .waste-mobile-list {{ display:block; }} }}
            @media (max-width:520px) {{ .waste-kpis {{ grid-template-columns:1fr; }} .waste-import-details div {{ grid-template-columns:1fr; gap:3px; }} }}
        </style>
    </head>
    <body>
        <main class="admin-page">
            {intern_nav("muell")}

            <section class="admin-hero">
                <span class="admin-eyebrow">Abfallkalender verwalten</span>
                <h1>Müllabfuhr</h1>
                <p>Importiere den AWS-Abfuhrkalender. Die Termine erscheinen automatisch in der Bürger-PWA und bilden die Grundlage für Push-Erinnerungen.</p>
                <div class="admin-hero-actions"><a href="/muelltermine-info" target="_blank" rel="noopener">Öffentliche Termine ansehen</a><a href="/muelltermine.ics" target="_blank" rel="noopener">Kalenderexport prüfen</a></div>
            </section>

            {message_html}

            <section class="waste-kpis">
                <article class="waste-kpi"><span>Kalenderjahr</span><strong>{import_info['jahr'] if import_info else current_year}</strong></article>
                <article class="waste-kpi"><span>Alle Termine</span><strong>{len(termine)}</strong></article>
                <article class="waste-kpi"><span>Kommende Termine</span><strong>{upcoming_count}</strong></article>
            </section>

            <section class="box waste-next">{next_html}</section>

            <div class="waste-grid">
                <section class="box">
                    <div class="waste-card-heading"><h2>Abfuhrkalender importieren</h2><p>Ein PDF-Upload ersetzt die bestehenden Termine durch den neu erkannten Jahreskalender.</p></div>
                    <form class="waste-upload-area" method="post" action="/muelltermine/import" enctype="multipart/form-data">
                        <label for="datei"><strong>AWS-PDF auswählen</strong></label>
                        <input id="datei" type="file" name="datei" accept="application/pdf" required>
                        <button type="submit">PDF prüfen und importieren</button>
                        <p class="waste-upload-help">Verwende den persönlichen Abfuhrkalender für Ahnsen. Adresse, Jahr und Termine werden automatisch erkannt.</p>
                    </form>
                </section>

                <section class="box">
                    <div class="waste-card-heading"><h2>Letzter Import</h2><p>Kontrolliere, aus welcher Datei die aktiven Termine stammen.</p></div>
                    {import_html}
                </section>
            </div>

            <section class="box">
                <div class="waste-card-heading"><h2>Einzelnen Termin ergänzen</h2><p>Für kurzfristige Änderungen oder Korrekturen ohne neuen PDF-Import.</p></div>
                <form class="waste-upload-area" method="post" action="/muelltermine/termin">
                    <label>Datum<input type="date" name="datum" required></label>
                    <label>Abfuhrarten<input name="abfuhrarten" maxlength="500" placeholder="z. B. Restabfall, Biotonne" required></label>
                    <label><input type="checkbox" name="feiertagsabweichung" value="ja"> Feiertagsverschiebung</label>
                    <button type="submit">Termin hinzufügen</button>
                </form>
            </section>

            <section class="box">
                <div class="waste-table-heading"><h2>Alle Abfuhrtermine</h2><span class="muted">{len(termine)} Einträge</span></div>
                <div class="waste-table-wrap"><table><thead><tr><th>Datum</th><th>Wochentag</th><th>Abfuhrarten</th><th>Hinweis</th><th>Aktionen</th></tr></thead><tbody>{''.join(rows) if rows else '<tr><td colspan="5">Noch keine Termine importiert.</td></tr>'}</tbody></table></div>
                <div class="waste-mobile-list">{''.join(cards) if cards else '<div class="waste-empty-inline">Noch keine Termine importiert.</div>'}</div>
            </section>
        </main>
    </body>
    </html>
    """
    return HTMLResponse(html)
