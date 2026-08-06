import mimetypes
import smtplib
from datetime import datetime
from email.message import EmailMessage

from config import EMAIL_PASSWORD, EMAIL_TO, EMAIL_USER


def send_email(ticket, data, sender):
    """Send an optional notification after a report has already been stored."""
    if not EMAIL_USER or not EMAIL_PASSWORD or not EMAIL_TO:
        raise RuntimeError("E-Mail-Umgebungsvariablen fehlen")

    msg = EmailMessage()
    msg["Subject"] = f"Neue Mängelmeldung {ticket}"
    msg["From"] = EMAIL_USER
    msg["To"] = EMAIL_TO
    msg.set_content(
        f"""Neue Mängelmeldung über Ahnsen hilft

Vorgangsnummer:
{ticket}

Art des Mangels:
{data.get('art')}

Ort:
{data.get('ort')}

Beschreibung:
{data.get('beschreibung')}

Quelle / freiwillige Kontaktdaten:
{sender or 'Keine Angabe'}

Zeit:
{datetime.now().strftime('%d.%m.%Y %H:%M:%S')}
"""
    )

    photo_bytes = data.get("foto_bytes")
    if photo_bytes:
        maintype, subtype = "image", "jpeg"
        guessed = mimetypes.guess_type(str(data.get("foto_name") or ""))[0]
        if guessed and "/" in guessed:
            maintype, subtype = guessed.split("/", 1)
        msg.add_attachment(
            photo_bytes,
            maintype=maintype,
            subtype=subtype,
            filename=f"{ticket}.{subtype}",
        )

    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(EMAIL_USER, EMAIL_PASSWORD)
        smtp.send_message(msg)
