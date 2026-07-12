from html import escape
from urllib.parse import quote

from fastapi.responses import HTMLResponse

from chat_crud import get_chat_kontakt, get_chat_verlauf
from intern_ui import intern_nav, intern_nav_css


def _datum_zeit(wert):
    if not wert:
        return "-"
    return wert.strftime("%d.%m.%Y %H:%M")


def chatbot_detail_page(whatsapp_nummer):
    kontakt = get_chat_kontakt(whatsapp_nummer)
    nachrichten = get_chat_verlauf(whatsapp_nummer)

    name = (kontakt or {}).get("name") or "Unbekannt"
    nummer = (kontakt or {}).get("whatsapp_nummer") or whatsapp_nummer

    if not nachrichten:
        verlauf_html = """
        <p class="empty-state">
            Für diese Nummer ist noch kein gespeicherter Chatverlauf vorhanden.
        </p>
        """
    else:
        verlauf_html = ""
        for nachricht in nachrichten:
            richtung = nachricht["richtung"]
            ist_eingang = richtung == "eingehend"
            klasse = "incoming" if ist_eingang else "outgoing"
            label = name if ist_eingang else "Chatbot"

            verlauf_html += f"""
            <article class="message {klasse}">
                <div class="message-meta">
                    <strong>{escape(label)}</strong>
                    <span>{_datum_zeit(nachricht["erstellt_am"])}</span>
                </div>
                <div class="bubble">
                    {escape(nachricht["inhalt"] or "-").replace(chr(10), "<br>")}
                </div>
            </article>
            """

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Chatverlauf · Ahnsen hilft</title>
        <style>
            {intern_nav_css()}
            body {{
                font-family: Arial, sans-serif;
                background:#eef2f5;
                margin:0;
                padding:20px;
                color:#2c3e50;
            }}

            .container {{
                max-width:980px;
                margin:auto;
            }}

            .top-nav {{
                margin-bottom:20px;
            }}

            .top-nav a,
            .link-button {{
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

            .header,
            .chat-box {{
                background:white;
                border-radius:16px;
                padding:20px;
                box-shadow:0 2px 8px rgba(0,0,0,.08);
            }}

            .header {{
                margin-bottom:18px;
            }}

            h1 {{
                margin:0 0 8px;
            }}

            .muted {{
                color:#687785;
            }}

            .chat-box {{
                display:flex;
                flex-direction:column;
                gap:12px;
            }}

            .message {{
                max-width:78%;
            }}

            .message.outgoing {{
                align-self:flex-end;
            }}

            .message.incoming {{
                align-self:flex-start;
            }}

            .message-meta {{
                display:flex;
                gap:10px;
                margin:0 0 5px;
                color:#6f7d88;
                font-size:12px;
            }}

            .message.outgoing .message-meta {{
                justify-content:flex-end;
            }}

            .bubble {{
                padding:12px 14px;
                border-radius:16px;
                line-height:1.45;
                white-space:normal;
                overflow-wrap:anywhere;
            }}

            .incoming .bubble {{
                background:#f2f5f7;
                border-top-left-radius:4px;
            }}

            .outgoing .bubble {{
                color:white;
                background:#2f6f9f;
                border-top-right-radius:4px;
            }}

            .empty-state {{
                margin:0;
                padding:14px;
                border-radius:12px;
                color:#6f7d88;
                background:#f4f6f7;
            }}

            @media (max-width:700px) {{
                body {{
                    padding:12px;
                }}

                .message {{
                    max-width:95%;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="container">
            {intern_nav("")}

            <section class="header">
                <a class="link-button" href="/#chatbot-verlauf">
                    ← Zurück zur Übersicht
                </a>
                <h1>Chatverlauf</h1>
                <p class="muted">
                    {escape(name)} · {escape(nummer)}
                </p>
            </section>

            <section class="chat-box">
                {verlauf_html}
            </section>
        </div>
    </body>
    </html>
    """

    return HTMLResponse(html)


def chatbot_link(whatsapp_nummer):
    return f"/intern/chatbot/{quote(str(whatsapp_nummer or ''), safe='')}"
