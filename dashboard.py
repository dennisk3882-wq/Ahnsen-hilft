from fastapi.responses import HTMLResponse
from html import escape

from crud import suche_meldungen, get_meldung, statistik


def status_farbe(status):
    if status == "Offen":
        return "#e74c3c"
    if status == "In Bearbeitung":
        return "#f39c12"
    if status == "Erledigt":
        return "#2ecc71"
    return "#95a5a6"


def naechster_status(status):
    if status == "Offen":
        return "In Bearbeitung"
    if status == "In Bearbeitung":
        return "Erledigt"
    return "Offen"


def foto_html(m, gross=False):
    if not m.foto_base64:
        return "<span class='muted'>Kein Foto vorhanden</span>"

    width = "100%" if gross else "90px"
    max_width = "700px" if gross else "90px"

    return f"""
    <a href="data:image/jpeg;base64,{m.foto_base64}" target="_blank">
        <img class="foto" src="data:image/jpeg;base64,{m.foto_base64}"
             style="width:{width}; max-width:{max_width};">
    </a>
    """


def dashboard_page(suche="", status_filter="", zeitraum=""):
    meldungen = suche_meldungen(suche, status_filter, zeitraum)
    stats = statistik()

    rows = ""

    for m in meldungen:
        neuer_status = naechster_status(m.status)

        rows += f"""
        <tr>
            <td><a href="/meldung/{escape(m.ticket)}"><b>{escape(m.ticket)}</b></a></td>
            <td><span class="status" style="background:{status_farbe(m.status)};">{escape(m.status)}</span></td>
            <td>{escape(m.art or "")}</td>
            <td>{escape(m.ort or "")}</td>
            <td>{escape(m.beschreibung or "")}</td>
            <td>{foto_html(m)}</td>
            <td>{m.erstellt_am.strftime("%d.%m.%Y %H:%M")}</td>
            <td>
                <a href="/status?ticket={escape(m.ticket)}&neuer_status={escape(neuer_status)}">
                    <button>➜ {escape(neuer_status)}</button>
                </a>
            </td>
        </tr>
        """

    html = f"""
    <html>
    <head>
        <title>Ahnsen hilft Dashboard</title>
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

            .nav-button {{
                background:#2c3e50;
                color:white !important;
                padding:12px 18px;
                border-radius:12px;
                text-decoration:none !important;
                display:inline-block;
                margin-right:12px;
                font-size:18px;
                font-weight:bold;
            }}

            .nav-button:visited {{
                color:white !important;
            }}

            .nav-button:hover {{
                background:#34495e;
            }}

            .container {{
                max-width:1300px;
                margin:auto;
            }}

            h1 {{
                margin-bottom:20px;
            }}

            .cards {{
                display:grid;
                grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));
                gap:15px;
                margin-bottom:20px;
            }}

            .card {{
                background:white;
                padding:18px;
                border-radius:14px;
                box-shadow:0 2px 8px rgba(0,0,0,0.08);
            }}

            .card b {{
                font-size:30px;
                display:block;
                margin-bottom:5px;
            }}

            .box {{
                background:white;
                padding:16px;
                border-radius:14px;
                margin-bottom:18px;
                box-shadow:0 2px 8px rgba(0,0,0,0.06);
            }}

            input {{
                padding:11px;
                width:320px;
                max-width:100%;
                border:1px solid #ccc;
                border-radius:8px;
                margin-bottom:8px;
            }}

            button, .link-button {{
                background:#3498db;
                color:white;
                border:none;
                padding:10px 14px;
                border-radius:8px;
                cursor:pointer;
                text-decoration:none;
                display:inline-block;
                font-size:14px;
            }}

            button:hover, .link-button:hover {{
                background:#2980b9;
            }}

            .filter a {{
                margin:4px 6px 4px 0;
            }}

            .active-filter {{
                background:#27ae60 !important;
                color:white !important;
                font-weight:bold;
                box-shadow:0 2px 8px rgba(0,0,0,.18);
            }}

            .table-wrap {{
                overflow-x:auto;
                background:white;
                border-radius:14px;
                box-shadow:0 2px 8px rgba(0,0,0,0.06);
            }}

            table {{
                width:100%;
                border-collapse:collapse;
                min-width:900px;
            }}

            th {{
                background:#2c3e50;
                color:white;
                padding:12px;
                text-align:left;
            }}

            td {{
                padding:11px;
                border-bottom:1px solid #e5e5e5;
                vertical-align:top;
            }}

            tr:hover {{
                background:#f8fafc;
            }}

            .status {{
                color:white;
                padding:6px 12px;
                border-radius:20px;
                font-weight:bold;
                display:inline-block;
                white-space:nowrap;
            }}

            .foto {{
                border-radius:10px;
                box-shadow:0 2px 8px rgba(0,0,0,0.18);
            }}

            .muted {{
                color:#888;
            }}

            @media (max-width:700px) {{
                body {{
                    padding:12px;
                }}

                h1 {{
                    font-size:24px;
                }}

                .box {{
                    padding:12px;
                }}

                button, .link-button {{
                    margin-top:4px;
                }}
            }}
        </style>
    </head>

    <body>
    <div class="container">

        <div class="top-nav">
            <a class="nav-button" href="/dashboard">📋 Mängel</a>
            <a class="nav-button" href="/veranstaltungen">📅 Veranstaltungen</a>
            <a class="nav-button" href="/dgh">🏠 DGH</a>
        </div>

        <h1>Ahnsen hilft Dashboard</h1>

        <div class="cards">
            <div class="card"><b>{stats["gesamt"]}</b>Gesamt</div>
            <div class="card"><b>{stats["offen"]}</b>Offen</div>
            <div class="card"><b>{stats["bearbeitung"]}</b>In Bearbeitung</div>
            <div class="card"><b>{stats["erledigt"]}</b>Erledigt</div>
        </div>

        <div class="box">
            <form method="get" action="/dashboard">
                <input type="text" name="suche" placeholder="Suche nach Ticket, Ort, Art, Status..."
                       value="{escape(suche)}">
                <input type="hidden" name="status_filter" value="{escape(status_filter)}">
                <input type="hidden" name="zeitraum" value="{escape(zeitraum)}">
                <button type="submit">Suchen</button>
                <a href="/dashboard" class="link-button">Zurücksetzen</a>
            </form>
        </div>

        <div class="box filter">
            <b>Statusfilter:</b><br><br>
            <a class="link-button {'active-filter' if status_filter == '' else ''}" href="/dashboard">Alle</a>
            <a class="link-button {'active-filter' if status_filter == 'Offen' else ''}" href="/dashboard?status_filter=Offen">Offen</a>
            <a class="link-button {'active-filter' if status_filter == 'In Bearbeitung' else ''}" href="/dashboard?status_filter=In Bearbeitung">In Bearbeitung</a>
            <a class="link-button {'active-filter' if status_filter == 'Erledigt' else ''}" href="/dashboard?status_filter=Erledigt">Erledigt</a>
        </div>

        <div class="box filter">
            <b>Zeitraum:</b><br><br>
            <a class="link-button {'active-filter' if zeitraum == '' else ''}" href="/dashboard">Alle</a>
            <a class="link-button {'active-filter' if zeitraum == 'heute' else ''}" href="/dashboard?zeitraum=heute">Heute</a>
            <a class="link-button {'active-filter' if zeitraum == 'woche' else ''}" href="/dashboard?zeitraum=woche">Letzte 7 Tage</a>
            <a class="link-button {'active-filter' if zeitraum == 'monat' else ''}" href="/dashboard?zeitraum=monat">Letzte 30 Tage</a>
        </div>

        <div class="table-wrap">
            <table>
                <tr>
                    <th>Ticket</th>
                    <th>Status</th>
                    <th>Art</th>
                    <th>Ort</th>
                    <th>Beschreibung</th>
                    <th>Foto</th>
                    <th>Erstellt</th>
                    <th>Aktion</th>
                </tr>
                {rows}
            </table>
        </div>
    </div>
    </body>
    </html>
    """

    return HTMLResponse(html)


def meldung_detail_page(ticket):
    m = get_meldung(ticket)

    if not m:
        return HTMLResponse("<h1>Meldung nicht gefunden</h1>")

    html = f"""
    <html>
    <head>
        <title>{escape(m.ticket)}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body {{
                font-family: Arial, sans-serif;
                background:#eef2f5;
                margin:0;
                padding:20px;
                color:#2c3e50;
            }}

            .box {{
                background:white;
                padding:25px;
                border-radius:14px;
                max-width:900px;
                margin:auto;
                box-shadow:0 2px 10px rgba(0,0,0,0.08);
            }}

            textarea {{
                width:100%;
                min-height:130px;
                padding:10px;
                border-radius:8px;
                border:1px solid #ccc;
            }}

            button, .link-button {{
                background:#3498db;
                color:white;
                border:none;
                padding:10px 14px;
                border-radius:8px;
                cursor:pointer;
                text-decoration:none;
                display:inline-block;
            }}

            .status {{
                background:{status_farbe(m.status)};
                color:white;
                padding:6px 12px;
                border-radius:20px;
                font-weight:bold;
            }}

            .foto {{
                border-radius:12px;
                box-shadow:0 2px 10px rgba(0,0,0,0.2);
            }}

            .muted {{
                color:#888;
            }}

            @media (max-width:700px) {{
                body {{
                    padding:12px;
                }}

                .box {{
                    padding:16px;
                }}
            }}
        </style>
    </head>

    <body>
        <div class="box">
            <a class="link-button" href="/dashboard">← Zurück zum Dashboard</a>

            <h1>{escape(m.ticket)}</h1>

            <p><b>Status:</b> <span class="status">{escape(m.status)}</span></p>
            <p><b>Art:</b> {escape(m.art or "")}</p>
            <p><b>Ort:</b> {escape(m.ort or "")}</p>
            <p><b>Beschreibung:</b><br>{escape(m.beschreibung or "")}</p>
            <p><b>WhatsApp-Absender:</b> {escape(m.whatsapp_absender or "")}</p>
            <p><b>Erstellt am:</b> {m.erstellt_am.strftime("%d.%m.%Y %H:%M")}</p>

            <h2>Foto</h2>
            {foto_html(m, gross=True)}

            <h2>Interne Notiz</h2>
            <form method="post" action="/notiz">
                <input type="hidden" name="ticket" value="{escape(m.ticket)}">
                <textarea name="notiz">{escape(m.interne_notiz or "")}</textarea><br><br>
                <button type="submit">Notiz speichern</button>
            </form>
        </div>
    </body>
    </html>
    """

    return HTMLResponse(html)
