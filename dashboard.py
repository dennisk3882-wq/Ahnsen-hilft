from fastapi.responses import HTMLResponse

from database import SessionLocal
from models import Meldung


def dashboard_page():
    db = SessionLocal()

    try:
        meldungen = db.query(Meldung).order_by(Meldung.erstellt_am.desc()).all()

        rows = ""

        for m in meldungen:
            rows += f"""
            <tr>
                <td>{m.ticket}</td>
                <td>{m.status}</td>
                <td>{m.art}</td>
                <td>{m.ort}</td>
                <td>{m.beschreibung}</td>
                <td>{m.foto_vorhanden}</td>
                <td>{m.whatsapp_absender}</td>
                <td>{m.erstellt_am.strftime('%d.%m.%Y %H:%M')}</td>
            </tr>
            """

        html = f"""
        <html>
        <head>
            <title>Ahnsen hilft Dashboard</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    padding: 30px;
                    background: #f5f5f5;
                }}
                h1 {{
                    color: #1f2937;
                }}
                table {{
                    width: 100%;
                    border-collapse: collapse;
                    background: white;
                }}
                th, td {{
                    border: 1px solid #ddd;
                    padding: 10px;
                    text-align: left;
                    vertical-align: top;
                }}
                th {{
                    background: #1f2937;
                    color: white;
                }}
                tr:nth-child(even) {{
                    background: #f2f2f2;
                }}
            </style>
        </head>
        <body>
            <h1>Ahnsen hilft - Mängelmeldungen</h1>

            <table>
                <tr>
                    <th>Vorgangsnummer</th>
                    <th>Status</th>
                    <th>Art</th>
                    <th>Ort</th>
                    <th>Beschreibung</th>
                    <th>Foto</th>
                    <th>Absender</th>
                    <th>Erstellt am</th>
                </tr>
                {rows}
            </table>
        </body>
        </html>
        """

        return HTMLResponse(content=html)

    finally:
        db.close()
