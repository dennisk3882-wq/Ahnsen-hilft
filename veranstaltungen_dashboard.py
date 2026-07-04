from fastapi.responses import HTMLResponse
from html import escape

from veranstaltungen_crud import (
    get_alle_veranstaltungen,
    get_veranstaltung,
)


def veranstaltungen_dashboard(bearbeiten_id=None):
    veranstaltungen = get_alle_veranstaltungen()

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
        aktiv_label = "Aktiv" if v.aktiv == "Ja" else "Inaktiv"
        aktiv_neu = "Nein" if v.aktiv == "Ja" else "Ja"
        aktiv_button = "Deaktivieren" if v.aktiv == "Ja" else "Aktivieren"

        rows += f"""
        <tr>
            <td>{v.id}</td>
            <td>{escape(v.titel or "")}</td>
            <td>{escape(v.datum or "")}</td>
            <td>{escape(v.uhrzeit or "")}</td>
            <td>{escape(v.ort or "")}</td>
            <td>{escape(v.ansprechpartner or "")}</td>

<td>
    {"<img src='data:image/jpeg;base64," + v.bild_base64 + "' width='90'>" if v.bild_base64 else "-"}
</td>

<td>{aktiv_label}</td>
            <td>
                <a href="/veranstaltungen?bearbeiten_id={v.id}">
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

            h1 {{
                margin-top:0;
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
            }}

            .box {{
                background:white;
                border-radius:12px;
                padding:20px;
                margin-bottom:20px;
                box-shadow:0 2px 8px rgba(0,0,0,.08);
            }}

            input,
            textarea {{
                width:100%;
                padding:10px;
                margin-bottom:10px;
                border:1px solid #ccc;
                border-radius:8px;
                box-sizing:border-box;
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

            table {{
                width:100%;
                border-collapse:collapse;
                background:white;
            }}

            th {{
                background:#2c3e50;
                color:white;
                padding:10px;
                text-align:left;
            }}

            td {{
                padding:10px;
                border-bottom:1px solid #ddd;
                vertical-align:top;
            }}

            .table-wrap {{
                overflow-x:auto;
            }}

            .cancel {{
                background:#7f8c8d;
                color:white;
                padding:10px 14px;
                border-radius:8px;
                text-decoration:none;
                display:inline-block;
            }}
        </style>
    </head>

    <body>
        <div class="top-nav">
            <a href="/dashboard">📋 Mängel</a>
            <a href="/veranstaltungen">📅 Veranstaltungen</a>
        </div>

        <h1>📅 Veranstaltungen</h1>

        <div class="box">
            <h2>{form_title}</h2>

            <form method="post" action="{form_action}" enctype="multipart/form-data">
                <input name="titel" placeholder="Titel" value="{escape(titel)}" required>
                <input name="datum" placeholder="Datum, z. B. 12.07.2026" value="{escape(datum)}">
                <input name="uhrzeit" placeholder="Uhrzeit, z. B. 18:00 Uhr" value="{escape(uhrzeit)}">
                <input name="ort" placeholder="Ort" value="{escape(ort)}">
                <input name="ansprechpartner" placeholder="Ansprechpartner" value="{escape(ansprechpartner)}">
<label><b>Bild:</b></label><br>
<input type="file" name="bild" accept="image/*"><br><br>
                <textarea name="beschreibung" placeholder="Beschreibung">{escape(beschreibung)}</textarea>

                <button type="submit">{button_text}</button>
                <a class="cancel" href="/veranstaltungen">Abbrechen</a>
            </form>
        </div>

        <div class="box">
            <h2>Vorhandene Veranstaltungen</h2>

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
