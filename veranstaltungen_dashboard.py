from datetime import datetime
from fastapi.responses import HTMLResponse
from html import escape

from veranstaltungen_crud import (
    get_alle_veranstaltungen,
    get_veranstaltung,
)


def parse_datum(datum_text):
    try:
        return datetime.strptime(datum_text, "%d.%m.%Y").date()
    except Exception:
        return None


def veranstaltungen_dashboard(bearbeiten_id=None):
    alle_veranstaltungen = get_alle_veranstaltungen()
    heute = datetime.today().date()

    veranstaltungen = []

    for v in alle_veranstaltungen:
        datum = parse_datum(v.datum)

        if datum and datum < heute:
            continue

        veranstaltungen.append(v)

    veranstaltungen.sort(
        key=lambda v: parse_datum(v.datum) or datetime.max.date()
    )

    edit = None
    if bearbeiten_id:
        edit = get_veranstaltung(bearbeiten_id)

    if edit:
        form_action = f"/veranstaltungen/bearbeiten/{edit.id}"
        form_title = "Veranstaltung bearbeiten"
        button_text = "Änderungen speichern"

        titel = edit.titel or ""
        datum = edit.datum or ""
        uhrzeit = edit.uhrzeit or ""
        ort = edit.ort or ""
        ansprechpartner = edit.ansprechpartner or ""
        beschreibung = edit.beschreibung or ""

    else:
        form_action = "/veranstaltungen/neue"
        form_title = "Neue Veranstaltung"
        button_text = "Veranstaltung speichern"

        titel = ""
        datum = ""
        uhrzeit = ""
        ort = ""
        ansprechpartner = ""
        beschreibung = ""

    rows = ""

    for v in veranstaltungen:
        aktiv_neu = "Nein" if v.aktiv == "Ja" else "Ja"
        aktiv_button = "Deaktivieren" if v.aktiv == "Ja" else "Aktivieren"

        status_html = "🟢 Aktiv" if v.aktiv == "Ja" else "🔴 Inaktiv"

        if v.bild_base64:
            bild_html = (
                "<img class='event-img' "
                "src='data:image/jpeg;base64,"
                + v.bild_base64
                + "'>"
            )
        else:
            bild_html = "<span class='muted'>Kein Bild</span>"

        rows += f"""
        <tr>
            <td data-label="ID">{v.id}</td>
            <td data-label="Titel"><b>{escape(v.titel or "")}</b></td>
            <td data-label="Datum">{escape(v.datum or "")}</td>
            <td data-label="Uhrzeit">{escape(v.uhrzeit or "")}</td>
            <td data-label="Ort">{escape(v.ort or "")}</td>
            <td data-label="Ansprechpartner">{escape(v.ansprechpartner or "")}</td>
            <td data-label="Bild">{bild_html}</td>
            <td data-label="Status"><span class="status-badge">{status_html}</span></td>
            <td data-label="Aktionen">
                <a href="/intern/veranstaltungen?bearbeiten_id={v.id}">
                    <button type="button">✏️ Bearbeiten</button>
                </a>

                <a href="/veranstaltungen/aktiv/{v.id}/{aktiv_neu}">
                    <button type="button">{aktiv_button}</button>
                </a>

                <a href="/veranstaltungen/loeschen/{v.id}">
                    <button type="button" class="danger">🗑 Löschen</button>
                </a>
            </td>
        </tr>
        """

    html = f"""
    <html>
    <head>
        <title>Veranstaltungen</title>
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
                font-size:32px;
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
                min-height:120px;
            }}

            button {{
                background:#3498db;
                color:white;
                border:none;
                padding:10px 14px;
                border-radius:8px;
                cursor:pointer;
                margin:3px;
                font-size:14px;
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
                margin-top:4px;
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
                white-space:nowrap;
            }}

            td {{
                padding:12px;
                border-bottom:1px solid #ddd;
                vertical-align:top;
            }}

            tr:nth-child(even) {{
                background:#f8f9fa;
            }}

            tr:hover {{
                background:#eef6ff;
            }}

            .event-img {{
                width:180px;
                max-height:120px;
                object-fit:cover;
                border-radius:10px;
                box-shadow:0 2px 8px rgba(0,0,0,.18);
            }}

            .status-badge {{
                font-weight:bold;
                white-space:nowrap;
            }}

            .muted {{
                color:#888;
            }}

            @media (max-width:800px) {{
                body {{
                    padding:12px;
                }}

                h1 {{
                    font-size:26px;
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
                thead,
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

                .event-img {{
                    width:100%;
                    max-height:240px;
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
            <a href="/">⌂ Start</a>
            <a href="/dashboard">📋 Mängel</a>
            <a href="/intern/veranstaltungen">📅 Veranstaltungen</a>
            <a href="/dgh">🏠 DGH</a>
            <a href="/muelltermine">🗑️ Müllabfuhr Termine</a>
        </div>

        <h1>📅 Veranstaltungen</h1>
        <p class="subtitle">
            Hier können Veranstaltungen erstellt, bearbeitet, aktiviert und gelöscht werden.
            Vergangene Termine werden automatisch ausgeblendet.
        </p>

        <div class="box">
            <h2>{form_title}</h2>

            <form method="post" action="{form_action}" enctype="multipart/form-data">
                <input name="titel" placeholder="Titel" value="{escape(titel)}" required>
                <input name="datum" placeholder="Datum, z. B. 12.07.2026" value="{escape(datum)}">
                <input name="uhrzeit" placeholder="Uhrzeit, z. B. 18:00 Uhr" value="{escape(uhrzeit)}">
                <input name="ort" placeholder="Ort" value="{escape(ort)}">
                <input name="ansprechpartner" placeholder="Ansprechpartner" value="{escape(ansprechpartner)}">

                <label><b>Bild:</b></label><br>
                <input type="file" name="bild" accept="image/*">

                <textarea name="beschreibung" placeholder="Beschreibung">{escape(beschreibung)}</textarea>

                <button type="submit">{button_text}</button>
                <a class="cancel" href="/intern/veranstaltungen">Abbrechen</a>
            </form>
        </div>

        <div class="box">
            <h2>Aktuelle Veranstaltungen</h2>

            <div class="table-wrap">
                <table>
                    <tr>
                        <th>ID</th>
                        <th>Titel</th>
                        <th>Datum</th>
                        <th>Uhrzeit</th>
                        <th>Ort</th>
                        <th>Ansprechpartner</th>
                        <th>Bild</th>
                        <th>Status</th>
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
