from datetime import date
from html import escape

from fastapi.responses import HTMLResponse

from muelltermine_crud import (
    get_alle_muelltermine,
    get_muell_import_info,
    get_naechste_muelltermine,
)
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


def muelltermine_dashboard(hinweis="", fehler=""):
    termine = get_alle_muelltermine()
    import_info = get_muell_import_info()
    naechste = get_naechste_muelltermine(limit=1)

    meldung_html = ""
    if hinweis:
        meldung_html = f'<div class="message success">✅ {escape(hinweis)}</div>'
    elif fehler:
        meldung_html = f'<div class="message error">⚠️ {escape(fehler)}</div>'

    import_html = """
        <p class="empty">
            Noch kein Abfuhrkalender importiert.
        </p>
    """

    if import_info:
        importiert_am = import_info["importiert_am"]
        zeitpunkt = (
            importiert_am.strftime("%d.%m.%Y um %H:%M Uhr")
            if importiert_am
            else "-"
        )
        import_html = f"""
        <dl class="import-details">
            <dt>Kalenderjahr</dt>
            <dd>{import_info["jahr"]}</dd>
            <dt>Erkannte Adresse</dt>
            <dd>{escape(import_info["adresse"] or "Ahnsen")}</dd>
            <dt>Importierte Termine</dt>
            <dd>{import_info["anzahl"]}</dd>
            <dt>Datei</dt>
            <dd>{escape(import_info["dateiname"] or "-")}</dd>
            <dt>Importiert</dt>
            <dd>{zeitpunkt}</dd>
        </dl>
        """

    naechster_html = """
        <div class="next-empty">
            Es sind keine kommenden Abfuhrtermine eingetragen.
        </div>
    """

    if naechste:
        termin = naechste[0]
        arten = "".join(
            f"<span>{escape(name)}</span>"
            for name in formatiere_abfuhrarten(termin.abfuhrarten)
        )
        naechster_html = f"""
        <div class="next-date">
            <strong>{termin.datum.strftime("%d.%m.%Y")}</strong>
            <small>{escape(termin.wochentag or "")} · {resttage_text(termin.datum)}</small>
        </div>
        <div class="waste-tags">{arten}</div>
        """

    rows = ""
    for termin in termine:
        arten = "".join(
            f"<span>{escape(name)}</span>"
            for name in formatiere_abfuhrarten(termin.abfuhrarten)
        )
        abweichung = (
            '<span class="holiday">Feiertagsverschiebung</span>'
            if termin.feiertagsabweichung == "Ja"
            else '<span class="regular">Regulärer Termin</span>'
        )

        rows += f"""
        <tr>
            <td data-label="Datum">
                <strong>{termin.datum.strftime("%d.%m.%Y")}</strong>
            </td>
            <td data-label="Wochentag">{escape(termin.wochentag or "-")}</td>
            <td data-label="Abfuhrarten">
                <div class="waste-tags table-tags">{arten}</div>
            </td>
            <td data-label="Hinweis">{abweichung}</td>
        </tr>
        """

    if not rows:
        rows = """
        <tr>
            <td colspan="4" class="empty">
                Nach dem ersten PDF-Upload erscheinen hier alle erkannten Termine.
            </td>
        </tr>
        """

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Müllabfuhr Termine</title>
        <style>
            * {{ box-sizing:border-box; }}
            body {{
                margin:0;
                padding:20px;
                color:#243442;
                background:#eef2f5;
                font-family:Arial, sans-serif;
            }}
            .container {{ max-width:1250px; margin:0 auto; }}
            .top-nav {{ margin-bottom:20px; }}
            .top-nav a {{
                display:inline-block;
                margin:0 8px 8px 0;
                padding:10px 14px;
                border-radius:8px;
                color:white;
                background:#2c3e50;
                text-decoration:none;
                font-weight:bold;
            }}
            h1 {{ margin:0 0 8px; font-size:32px; }}
            .subtitle {{ margin:0 0 22px; color:#65727d; line-height:1.5; }}
            .grid {{
                display:grid;
                grid-template-columns:minmax(0, 1.15fr) minmax(300px, .85fr);
                gap:20px;
                margin-bottom:20px;
            }}
            .box {{
                padding:22px;
                border-radius:15px;
                background:white;
                box-shadow:0 2px 10px rgba(0,0,0,.08);
            }}
            .box h2 {{ margin:0 0 15px; font-size:21px; }}
            .upload-area {{
                padding:20px;
                border:2px dashed #9bb0bd;
                border-radius:13px;
                background:#f7fafb;
            }}
            .upload-area label {{
                display:block;
                margin-bottom:9px;
                font-weight:bold;
            }}
            input[type=file] {{
                display:block;
                width:100%;
                padding:12px;
                border:1px solid #cad4da;
                border-radius:9px;
                background:white;
            }}
            button {{
                width:100%;
                margin-top:13px;
                padding:12px 16px;
                border:0;
                border-radius:9px;
                color:white;
                background:#2f6f56;
                font-size:15px;
                font-weight:bold;
                cursor:pointer;
            }}
            .help {{
                margin:13px 0 0;
                color:#687984;
                font-size:14px;
                line-height:1.5;
            }}
            .message {{
                margin-bottom:20px;
                padding:14px 17px;
                border-radius:10px;
                font-weight:bold;
            }}
            .success {{ color:#215c3c; background:#dff3e7; }}
            .error {{ color:#8c2e2e; background:#fde3e3; }}
            .import-details {{
                display:grid;
                grid-template-columns:145px 1fr;
                gap:9px 14px;
                margin:0;
            }}
            .import-details dt {{ color:#71808a; }}
            .import-details dd {{ margin:0; font-weight:bold; word-break:break-word; }}
            .next-box {{
                margin-bottom:20px;
                border-left:6px solid #2f6f56;
            }}
            .next-content {{
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:20px;
            }}
            .next-date strong {{
                display:block;
                color:#17324d;
                font-size:30px;
            }}
            .next-date small {{
                display:block;
                margin-top:5px;
                color:#687984;
                font-size:15px;
            }}
            .waste-tags {{
                display:flex;
                flex-wrap:wrap;
                gap:7px;
            }}
            .waste-tags span {{
                display:inline-block;
                padding:7px 10px;
                border-radius:999px;
                color:#26333b;
                background:#edf2f4;
                font-size:14px;
                font-weight:bold;
            }}
            .table-wrap {{ overflow-x:auto; }}
            table {{ width:100%; border-collapse:collapse; }}
            th {{
                padding:12px;
                color:white;
                background:#2c3e50;
                text-align:left;
                white-space:nowrap;
            }}
            td {{ padding:12px; border-bottom:1px solid #e1e6e9; vertical-align:top; }}
            tr:nth-child(even) {{ background:#f8fafb; }}
            .table-tags span {{ padding:5px 8px; font-size:13px; }}
            .holiday, .regular {{
                display:inline-block;
                padding:5px 8px;
                border-radius:7px;
                font-size:12px;
                font-weight:bold;
                white-space:nowrap;
            }}
            .holiday {{ color:#8b5520; background:#fff0d7; }}
            .regular {{ color:#46705b; background:#e6f2eb; }}
            .empty {{ padding:24px; color:#74828c; text-align:center; }}
            @media (max-width:800px) {{
                body {{ padding:12px; }}
                .grid {{ grid-template-columns:1fr; }}
                .next-content {{ align-items:flex-start; flex-direction:column; }}
                .top-nav a {{ width:100%; margin-right:0; text-align:center; }}
                table, tbody, tr, td {{ display:block; width:100%; }}
                thead {{ display:none; }}
                tr {{
                    margin-bottom:13px;
                    padding:5px 12px;
                    border:1px solid #dde4e8;
                    border-radius:11px;
                    background:white !important;
                }}
                td {{
                    display:grid;
                    grid-template-columns:115px 1fr;
                    gap:10px;
                    padding:9px 0;
                }}
                td::before {{
                    content:attr(data-label);
                    color:#71808a;
                    font-weight:bold;
                }}
                td.empty {{ display:block; }}
            }}
        </style>
    </head>
    <body>
        <main class="container">
            <nav class="top-nav">
                <a href="/">⌂ Start</a>
                <a href="/dashboard">📋 Mängel</a>
                <a href="/intern/veranstaltungen">📅 Veranstaltungen</a>
                <a href="/dgh">🏠 DGH</a>
                <a href="/muelltermine">🗑️ Müllabfuhr Termine</a>
            </nav>

            <h1>🗑️ Müllabfuhr Termine</h1>
            <p class="subtitle">
                Lade einmal jährlich den persönlichen AWS-Abfuhrkalender für
                Ahnsen hoch. Datum, Wochentag und Abfuhrarten werden automatisch
                erkannt und für WhatsApp bereitgestellt.
            </p>

            {meldung_html}

            <section class="grid">
                <div class="box">
                    <h2>PDF-Jahreskalender importieren</h2>
                    <form class="upload-area"
                          method="post"
                          action="/muelltermine/import"
                          enctype="multipart/form-data">
                        <label for="pdf">AWS-Abfuhrkalender auswählen</label>
                        <input id="pdf"
                               name="pdf"
                               type="file"
                               accept="application/pdf,.pdf"
                               required>
                        <button type="submit">PDF prüfen und Termine übernehmen</button>
                        <p class="help">
                            Ein neuer Upload ersetzt nur die bereits vorhandenen
                            Termine desselben Kalenderjahres. Andere Jahre bleiben
                            erhalten.
                        </p>
                    </form>
                </div>

                <div class="box">
                    <h2>Letzter Import</h2>
                    {import_html}
                </div>
            </section>

            <section class="box next-box">
                <h2>Nächste Abholung</h2>
                <div class="next-content">{naechster_html}</div>
            </section>

            <section class="box">
                <h2>Erkannte Termine</h2>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Datum</th>
                                <th>Wochentag</th>
                                <th>Abfuhrarten</th>
                                <th>Hinweis</th>
                            </tr>
                        </thead>
                        <tbody>{rows}</tbody>
                    </table>
                </div>
            </section>
        </main>
    </body>
    </html>
    """

    return HTMLResponse(html)
