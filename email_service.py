# email_service.py

import smtplib
from datetime import datetime
from email.message import EmailMessage

from config import EMAIL_USER, EMAIL_PASSWORD, EMAIL_TO


def send_email(ticket, data, sender):
    print("send_email() gestartet")

    if not EMAIL_USER or not EMAIL_PASSWORD or not EMAIL_TO:
        raise Exception("E-Mail Umgebungsvariablen fehlen")

    msg = EmailMessage()

    msg["Subject"] = f"Neue Mängelmeldung {ticket}"
    msg["From"] = EMAIL_USER
    msg["To"] = EMAIL_TO

    body = f"""
Neue Mängelmeldung über Ahnsen hilft

Vorgangsnummer:
{ticket}

Art des Mangels:
{data.get("art")}

Ort:
{data.get("ort")}

Beschreibung:
{data.get("beschreibung")}

WhatsApp-Absender:
{sender}

Zeit:
{datetime.now().strftime("%d.%m.%Y %H:%M:%S")}
"""

    msg.set_content(body)

    if data.get("foto_bytes"):
        msg.add_attachment(
            data["foto_bytes"],
            maintype="image",
            subtype="jpeg",
            filename=f"{ticket}.jpg"
        )
        print("Foto angehängt")
    else:
        print("Kein Foto vorhanden")

    print("SMTP Verbindung wird aufgebaut")

    with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()

        print("SMTP Login...")
        smtp.login(EMAIL_USER, EMAIL_PASSWORD)

        print("E-Mail wird versendet...")
        smtp.send_message(msg)

    print("E-Mail erfolgreich versendet")
