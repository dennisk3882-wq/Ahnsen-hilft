import mimetypes
import smtplib
from datetime import datetime
from email.message import EmailMessage

from config import EMAIL_PASSWORD, EMAIL_TO, EMAIL_USER


def _send_message(message: EmailMessage) -> None:
    if not EMAIL_USER or not EMAIL_PASSWORD or not EMAIL_TO:
        raise RuntimeError("E-Mail-Umgebungsvariablen fehlen")
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(EMAIL_USER, EMAIL_PASSWORD)
        smtp.send_message(message)


def send_email(ticket, data, sender):
    """Send an optional notification after a report has already been stored."""
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
    _send_message(msg)


def send_dgh_email(reference, data):
    """Notify the municipality after a DGH request is safely stored."""
    msg = EmailMessage()
    msg["Subject"] = f"Neue DGH-Mietanfrage {reference}"
    msg["From"] = EMAIL_USER
    msg["To"] = EMAIL_TO
    msg.set_content(
        f"""Neue DGH-Mietanfrage über Ahnsen hilft

Referenz:
{reference}

Datum:
{data.get('datum')}

Uhrzeit:
{data.get('uhrzeit') or '-'}

Anlass:
{data.get('anlass')}

Name:
{data.get('name')}

Telefon:
{data.get('telefon')}

E-Mail:
{data.get('email')}

Bemerkung:
{data.get('kommentar') or '-'}

Zeit:
{datetime.now().strftime('%d.%m.%Y %H:%M:%S')}
"""
    )
    _send_message(msg)



def send_test_email():
    """Send a neutral diagnostic email only to the configured administration inbox."""
    msg = EmailMessage()
    msg["Subject"] = "Ahnsen hilft – Systemtest E-Mail"
    msg["From"] = EMAIL_USER
    msg["To"] = EMAIL_TO
    msg.set_content(
        f"""Ahnsen hilft Systemtest

Diese Nachricht wurde im Verwaltungsbereich unter System & Diagnose bewusst ausgelöst.

Zeit:
{datetime.now().strftime('%d.%m.%Y %H:%M:%S')}

Wenn diese E-Mail angekommen ist, funktionieren SMTP-Anmeldung und Versand.
"""
    )
    _send_message(msg)
