from fastapi.responses import HTMLResponse
from html import escape

from veranstaltungen_crud import (
    get_alle_veranstaltungen,
)


def veranstaltungen_dashboard():
    veranstaltungen = get_alle_veranstaltungen()

    rows = ""

    for v in veranstaltungen:
        rows += f"""
        <tr>
            <td>{v.id}</td>
            <td>{escape(v.titel or "")}</td>
            <td>{escape(v.datum or "")}</td>
            <td>{escape(v.uhrzeit or "")}</td>
            <td>{escape(v.ort or "")}</td>
            <td>{escape(v.ansprechpartner or "")}</td>
            <td>{escape(v.aktiv or "")}</td>
        </tr>
        """

    html = f"""
    <html>
    <head>

    <meta name="viewport" content="width=device-width, initial-scale=1">

    <style>

    body {{
        font-family: Arial;
        background:#eef2f5;
        margin:0;
        padding:20px;
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

    button {{
        background:#3498db;
        color:white;
        border:none;
        padding:10px 18px;
        border-radius:8px;
        cursor:pointer;
    }}

    table {{
        width:100%;
        border-collapse:collapse;
    }}

    th {{
        background:#2c3e50;
        color:white;
        padding:10px;
    }}

    td {{
        padding:10px;
        border-bottom:1px solid #ddd;
    }}

    </style>

    </head>

    <body>

    <h1>📅 Veranstaltungen</h1>

    <div class="box">

    <h2>Neue Veranstaltung</h2>

    <form method="post" action="/veranstaltungen/neue">

        <input
            name="titel"
            placeholder="Titel"
            required>

        <input
            name="datum"
            placeholder="Datum">

        <input
            name="uhrzeit"
            placeholder="Uhrzeit">

        <input
            name="ort"
            placeholder="Ort">

        <input
            name="ansprechpartner"
            placeholder="Ansprechpartner">

        <textarea
            name="beschreibung"
            placeholder="Beschreibung"></textarea>

        <button type="submit">
            Veranstaltung speichern
        </button>

    </form>

    </div>

    <div class="box">

    <h2>Vorhandene Veranstaltungen</h2>

    <table>

    <tr>

    <th>ID</th>
    <th>Titel</th>
    <th>Datum</th>
    <th>Uhrzeit</th>
    <th>Ort</th>
    <th>Ansprechpartner</th>
    <th>Aktiv</th>

    </tr>

    {rows}

    </table>

    </div>

    </body>

    </html>
    """

    return HTMLResponse(html)
