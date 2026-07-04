import base64
import requests

from config import WHATSAPP_TOKEN, PHONE_NUMBER_ID


def send_whatsapp_message(to, text):
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


def send_whatsapp_image(to, bild_base64, caption=""):
    url = f"https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages"

    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }

    data = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "image",
        "image": {
            "caption": caption,
            "data": bild_base64
        }
    }

    response = requests.post(
        url,
        headers=headers,
        json=data,
        timeout=30,
    )

    print("WhatsApp Bild:", response.status_code, response.text)

    return response
