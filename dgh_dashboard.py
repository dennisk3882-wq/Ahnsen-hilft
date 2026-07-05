from datetime import datetime, timedelta
from fastapi.responses import HTMLResponse
from html import escape

from dgh_crud import (
    get_alle_dgh_termine,
    get_dgh_termin,
    parse_datum,
)


def dgh_dashboard(bearbeiten_id=None):
    termine = get_alle_dgh_termine()

    edit = None
    if bearbeiten_id:
        edit = get_dgh_termin(bearbeiten_id)

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
        form_title = "Neuer DGH-Termin"
        button_text = "Termin speichern"

        datum = ""
        uhrzeit = ""
        anlass = ""
        name = ""
        telefon = ""
        kommentar = ""

    belegte_daten = set()
    for t in termine:
        d = parse_datum(t.datum)
        if d and t.aktiv == "Ja":
            belegte_daten.add(d)

    heute = datetime.today().date()
    kalender_html = ""

    for i in range(30):
        tag = heute + timedelta(days=i)
        belegt = tag in belegte_daten

        css = "belegt" if belegt else "frei"
        label = "Belegt" if belegt else "Frei"

        kalender_html += f"""
        <div class="day {css}">
            <b>{tag.strftime("%d.%m.")}</b>
            <span>{label}</span>
        </div>
        """

    rows = ""

    for t in termine:
        aktiv_neu = "Nein" if t.aktiv == "Ja" else "Ja"
        aktiv_button = "Deaktivieren" if t.aktiv == "Ja" else "Aktivieren"
        status = "🔴 Belegt" if t.aktiv == "Ja" else "⚪ Inaktiv"

        rows += f"""
        <tr>
            <td data-label="Datum">{escape(t.datum or "")}</td>
            <td data-label="Uhrzeit">{escape(t.uhrzeit or "")}</td>
            <td data-label="Anlass">{escape(t.anlass or "")}</td>
            <td data-label="Name">{escape(t.name or "")}</td>
            <td data-label="Telefon">{escape(t.telefon or "")}</td>
            <td data-label="Status">{status}</td>
            <td data-label="Kommentar">{escape(t.kommentar or "")}</td>
            <td data-label="Aktionen">
                <a href="/dgh?bearbeiten_id={t.id}">
                    <button type="button">✏️ Bearbeiten</button>
                </a>

                <a href="/dgh/aktiv/{t.id}/{aktiv_neu}">
                    <button type="button">{aktiv_button}</button>
                </a>

                <a href="/dgh/loeschen/{t.id}">
                    <button type="button" class="danger">🗑 Löschen</button>
                </a>
            </td>
        </tr>
        """

    html = f"""
    <html>
    <head>
        <title>DGH buchen</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <style>
            body {{
                font-family: Arial, sans-serif;
                background:#eef2f5;
                margin:0;
                padding:20px;
                color:#2c3e50;
            }}

            .top-nav {{
                margin-bottom:20px;
            }}

            .top-nav a {{
                background:#2c3e50;
                color:white;
                padding:10px 14px;
                border-radius:8px;
                text-decoration:none;
                display:inline-block;
                margin-right:8px;
                margin-bottom:8px;
                font-weight:bold;
            }}

            h1 {{
                margin:0 0 8px 0;
            }}

            .subtitle {{
                color:#666;
                margin-bottom:20px;
            }}

            .box {{
                background:white;
                border-radius:14px;
                padding:20px;
                margin-bottom:20px;
                box-shadow:0 2px 8px rgba(0,0,0,.08);
            }}

            input,
            textarea {{
                width:100%;
                padding:12px;
                margin-bottom:12px;
                border:1px solid #ccc;
                border-radius:8px;
                box-sizing:border-box;
                font-size:15px;
            }}

            textarea {{
                min-height:110px;
            }}

            button {{
                background:#3498db;
                color:white;
                border:none;
                padding:10px 14px;
                border-radius:8px;
                cursor:pointer;
                margin:3px;
            }}

            button:hover {{
                background:#2980b9;
            }}

            .danger {{
                background:#e74c3c;
            }}

            .danger:hover {{
                background:#c0392b;
            }}

            .cancel {{
                background:#7f8c8d;
                color:white;
                padding:10px 14px;
                border-radius:8px;
                text-decoration:none;
                display:inline-block;
            }}

            .calendar {{
                display:grid;
                grid-template-columns:repeat(auto-fit, minmax(90px, 1fr));
                gap:10px;
            }}

            .day {{
                border-radius:12px;
                padding:12px;
                text-align:center;
                font-size:14px;
            }}

            .day b {{
                display:block;
                margin-bottom:5px;
            }}

            .frei {{
                background:#eafaf1;
                color:#1e8449;
                border:1px solid #abebc6;
            }}

            .belegt {{
                background:#fdecea;
                color:#c0392b;
                border:1px solid #f5b7b1;
            }}

            .table-wrap {{
                overflow-x:auto;
            }}

            table {{
                width:100%;
                border-collapse:collapse;
                background:white;
            }}

            th {{
                background:#2c3e50;
                color:white;
                padding:12px;
                text-align:left;
            }}

            td {{
                padding:12px;
                border-bottom:1px solid #ddd;
                vertical-align:top;
            }}

            tr:nth-child(even) {{
                background:#f8f9fa;
            }}

            @media (max-width:800px) {{
                body {{
                    padding:12px;
                }}

                .box {{
                    padding:14px;
                }}

                .top-nav a {{
                    width:100%;
                    box-sizing:border-box;
                    text-align:center;
                    margin-right:0;
                }}

                table,
                tbody,
                th,
                td,
                tr {{
                    display:block;
                }}

                table tr:first-child {{
                    display:none;
                }}

                tr {{
                    background:white !important;
                    margin-bottom:16px;
                    border-radius:14px;
                    box-shadow:0 2px 8px rgba(0,0,0,.08);
                    padding:12px;
                }}

                td {{
                    border:none;
                    padding:8px 0;
                }}

                td::before {{
                    content:attr(data-label);
                    display:block;
                    font-size:12px;
                    font-weight:bold;
                    color:#7f8c8d;
                    margin-bottom:3px;
                }}

                button,
                .cancel {{
                    width:100%;
                    box-sizing:border-box;
                    margin:5px 0;
                    text-align:center;
                }}
            }}
        </style>
    </head>

    <body>
        <div class="top-nav">
            <a href="/dashboard">📋 Mängel</a>
            <a href="/veranstaltungen">📅 Veranstaltungen</a>
            <a href="/dgh">🏠 DGH</a>
        </div>

        <h1>🏠 DGH buchen</h1>
        <p class="subtitle">Termine verwalten, Belegung ansehen und interne Kommentare speichern.</p>

        <div class="box">
            <h2>📅 Kalenderübersicht nächste 30 Tage</h2>
            <div class="calendar">
                {kalender_html}
            </div>
        </div>

        <div class="box">
            <h2>{form_title}</h2>

            <form method="post" action="{form_action}">
                <input name="datum" placeholder="Datum, z. B. 12.08.2026" value="{escape(datum)}" required>
                <input name="uhrzeit" placeholder="Uhrzeit, z. B. 18:00 Uhr" value="{escape(uhrzeit)}">
                <input name="anlass" placeholder="Anlass, z. B. Geburtstag" value="{escape(anlass)}">
                <input name="name" placeholder="Name / Mieter" value="{escape(name)}">
                <input name="telefon" placeholder="Telefonnummer" value="{escape(telefon)}">
                <textarea name="kommentar" placeholder="Interner Kommentar">{escape(kommentar)}</textarea>

                <button type="submit">{button_text}</button>
                <a class="cancel" href="/dgh">Abbrechen</a>
            </form>
        </div>

        <div class="box">
            <h2>📋 Terminübersicht</h2>

            <div class="table-wrap">
                <table>
                    <tr>
                        <th>Datum</th>
                        <th>Uhrzeit</th>
                        <th>Anlass</th>
                        <th>Name</th>
                        <th>Telefon</th>
                        <th>Status</th>
                        <th>Kommentar</th>
                        <th>Aktionen</th>
                    </tr>
                    {rows}
                </table>
            </div>
        </div>
    </body>
    </html>
    """

    return HTMLResponse(html)
