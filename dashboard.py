from fastapi.responses import HTMLResponse
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


def foto_html(m):
    if m.foto_base64:
        return f"""
        <a href="data:image/jpeg;base64,{m.foto_base64}" target="_blank">
            <img src="data:image/jpeg;base64,{m.foto_base64}" style="width:90px;border-radius:8px;">
        </a>
        """
    return "Nein"


def dashboard_page(suche="", status_filter=""):
    meldungen = suche_meldungen(suche, status_filter)
    stats = statistik()

    rows = ""

    for m in meldungen:
        neuer_status = naechster_status(m.status)

        rows += f"""
        <tr>
            <td><a href="/meldung/{m.ticket}"><b>{m.ticket}</b></a></td>
            <td>
                <span class="status" style="background:{status_farbe(m.status)};">
                    {m.status}
                </span>
            </td>
            <td>{m.art}</td>
            <td>{m.ort}</td>
            <td>{m.beschreibung}</td>
            <td>{foto_html(m)}</td>
            <td>{m.erstellt_am.strftime("%d.%m.%Y %H:%M")}</td>
            <td>
                <a href="/status?ticket={m.ticket}&neuer_status={neuer_status}">
                    <button>➜ {neuer_status}</button>
                </a>
            </td>
        </tr>
        """

    html = f"""
    <html>
    <head>
        <title>Ahnsen hilft Dashboard</title>
        <style>
            body {{ font-family: Arial; background:#f5f5f5; padding:30px; }}
            h1 {{ color:#2c3e50; }}
            .cards {{ display:flex; gap:15px; margin-bottom:20px; flex-wrap:wrap; }}
            .card {{ background:white; padding:18px; border-radius:10px; min-width:160px; box-shadow:0 2px 6px #ddd; }}
            .card b {{ font-size:28px; display:block; }}
            .box {{ background:white; padding:15px; border-radius:10px; margin-bottom:20px; }}
            input {{ padding:10px; width:300px; max-width:90%; border:1px solid #ccc; border-radius:6px; }}
            button {{ background:#3498db; color:white; border:none; padding:10px 14px; border-radius:6px; cursor:pointer; }}
            button:hover {{ background:#2980b9; }}
            .filter a {{ margin-right:10px; text-decoration:none; }}
            table {{ width:100%; border-collapse:collapse; background:white; }}
            th {{ background:#2c3e50; color:white; padding:12px; }}
            td {{ padding:10px; border-bottom:1px solid #ddd; vertical-align:top; }}
            tr:hover {{ background:#f2f2f2; }}
            .status {{ color:white; padding:6px 12px; border-radius:20px; font-weight:bold; display:inline-block; }}
            a {{ color:#2980b9; }}
        </style>
    </head>

    <body>
        <h1>Ahnsen hilft Dashboard</h1>

        <div class="cards">
            <div class="card"><b>{stats["gesamt"]}</b>Gesamt</div>
            <div class="card"><b>{stats["offen"]}</b>Offen</div>
            <div class="card"><b>{stats["bearbeitung"]}</b>In Bearbeitung</div>
            <div class="card"><b>{stats["erledigt"]}</b>Erledigt</div>
        </div>

        <div class="box">
            <form method="get" action="/dashboard">
                <input type="text" name="suche" placeholder="Suche nach Ticket, Ort, Art, Status..." value="{suche}">
                <input type="hidden" name="status_filter" value="{status_filter}">
                <button type="submit">Suchen</button>
                <a href="/dashboard"><button type="button">Zurücksetzen</button></a>
            </form>
        </div>

        <div class="box filter">
            <b>Statusfilter:</b><br><br>
            <a href="/dashboard">Alle</a>
            <a href="/dashboard?status_filter=Offen">Offen</a>
            <a href="/dashboard?status_filter=In Bearbeitung">In Bearbeitung</a>
            <a href="/dashboard?status_filter=Erledigt">Erledigt</a>
        </div>

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
    </body>
    </html>
    """

    return HTMLResponse(html)


def meldung_detail_page(ticket):
    m = get_meldung(ticket)

    if not m:
        return HTMLResponse("<h1>Meldung nicht gefunden</h1>")

    foto = foto_html(m)

    html = f"""
    <html>
    <head>
        <title>{m.ticket}</title>
        <style>
            body {{ font-family: Arial; background:#f5f5f5; padding:30px; }}
            .box {{ background:white; padding:25px; border-radius:10px; max-width:900px; }}
            textarea {{ width:100%; height:120px; padding:10px; }}
            button {{ background:#3498db; color:white; border:none; padding:10px 14px; border-radius:6px; cursor:pointer; }}
            .status {{ background:{status_farbe(m.status)}; color:white; padding:6px 12px; border-radius:20px; font-weight:bold; }}
        </style>
    </head>
    <body>
        <a href="/dashboard">← Zurück zum Dashboard</a>

        <div class="box">
            <h1>{m.ticket}</h1>

            <p><b>Status:</b> <span class="status">{m.status}</span></p>
            <p><b>Art:</b> {m.art}</p>
            <p><b>Ort:</b> {m.ort}</p>
            <p><b>Beschreibung:</b><br>{m.beschreibung}</p>
            <p><b>WhatsApp-Absender:</b> {m.whatsapp_absender}</p>
            <p><b>Erstellt am:</b> {m.erstellt_am.strftime("%d.%m.%Y %H:%M")}</p>

            <h2>Foto</h2>
            <p>{foto}</p>

            <h2>Interne Notiz</h2>
            <form method="post" action="/notiz">
                <input type="hidden" name="ticket" value="{m.ticket}">
                <textarea name="notiz">{m.interne_notiz or ""}</textarea><br><br>
                <button type="submit">Notiz speichern</button>
            </form>
        </div>
    </body>
    </html>
    """

    return HTMLResponse(html)
