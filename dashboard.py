from fastapi.responses import HTMLResponse

from crud import get_all_meldungen


def status_farbe(status):
    if status == "Offen":
        return "#e74c3c"

    if status == "In Bearbeitung":
        return "#f39c12"

    if status == "Erledigt":
        return "#2ecc71"

    return "#95a5a6"


def dashboard_page():
    meldungen = get_all_meldungen()

    rows = ""

    for m in meldungen:

        if m.status == "Offen":
            neuer_status = "In Bearbeitung"

        elif m.status == "In Bearbeitung":
            neuer_status = "Erledigt"

        else:
            neuer_status = "Offen"

        rows += f"""
        <tr>

        <td>{m.ticket}</td>

        <td>
            <span style="
                background:{status_farbe(m.status)};
                color:white;
                padding:6px 12px;
                border-radius:20px;
                font-weight:bold;">
                {m.status}
            </span>
        </td>

        <td>{m.art}</td>

        <td>{m.ort}</td>

        <td>{m.beschreibung}</td>

        <td>{m.foto_vorhanden}</td>

        <td>{m.whatsapp_absender}</td>

        <td>{m.erstellt_am.strftime("%d.%m.%Y %H:%M")}</td>

        <td>
            <a href="/status?ticket={m.ticket}&neuer_status={neuer_status}">
                <button>
                    ➜ {neuer_status}
                </button>
            </a>
        </td>

        </tr>
        """

    html = f"""
    <html>

    <head>

    <title>Ahnsen hilft Dashboard</title>

    <style>

    body {{
        font-family: Arial;
        background:#f5f5f5;
        padding:30px;
    }}

    h1 {{
        color:#2c3e50;
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
    }}

    td {{
        padding:10px;
        border-bottom:1px solid #ddd;
    }}

    tr:hover {{
        background:#f2f2f2;
    }}

    button {{
        background:#3498db;
        color:white;
        border:none;
        padding:8px 12px;
        border-radius:6px;
        cursor:pointer;
    }}

    button:hover {{
        background:#2980b9;
    }}

    </style>

    </head>

    <body>

    <h1>Ahnsen hilft Dashboard</h1>

    <table>

        <tr>

            <th>Ticket</th>
            <th>Status</th>
            <th>Art</th>
            <th>Ort</th>
            <th>Beschreibung</th>
            <th>Foto</th>
            <th>Absender</th>
            <th>Erstellt</th>
            <th>Aktion</th>

        </tr>

        {rows}

    </table>

    </body>

    </html>
    """

    return HTMLResponse(html)
