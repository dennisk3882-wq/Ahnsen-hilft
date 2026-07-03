
# whatsapp.py

import requests
from config import WHATSAPP_TOKEN, PHONE_NUMBER_ID


def send_whatsapp_message(to, text):
    """Sendet eine Textnachricht über WhatsApp."""
    url = f"https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages"

    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }

    data = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {
            "body": text
        }
    }

    response = requests.post(url, headers=headers, json=data, timeout=20)

    print("WhatsApp Antwort:", response.status_code, response.text)

    return response
