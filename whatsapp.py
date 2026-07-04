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
        "text": {"body": text},
    }

    response = requests.post(url, headers=headers, json=data, timeout=20)
    print("WhatsApp Antwort:", response.status_code, response.text)
    return response


def _detect_mime_type(image_bytes):
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "veranstaltung.jpg"

    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "veranstaltung.png"

    if image_bytes.startswith(b"RIFF") and b"WEBP" in image_bytes[:20]:
        return "image/webp", "veranstaltung.webp"

    return "image/jpeg", "veranstaltung.jpg"


def upload_whatsapp_media(bild_base64):
    upload_url = f"https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/media"

    image_bytes = base64.b64decode(bild_base64)
    mime_type, filename = _detect_mime_type(image_bytes)

    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
    }

    files = {
        "file": (filename, image_bytes, mime_type),
    }

    data = {
        "messaging_product": "whatsapp",
    }

    response = requests.post(
        upload_url,
        headers=headers,
        data=data,
        files=files,
        timeout=30,
    )

    print("WhatsApp Media Upload:", response.status_code, response.text)

    if response.status_code != 200:
        return None

    return response.json().get("id")


def send_whatsapp_image(to, bild_base64, caption=""):
    media_id = upload_whatsapp_media(bild_base64)

    if not media_id:
        print("Kein Media-ID erhalten.")
        return None

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
            "id": media_id,
            "caption": caption,
        },
    }

    response = requests.post(
        url,
        headers=headers,
        json=data,
        timeout=30,
    )

    print("WhatsApp Bild:", response.status_code, response.text)

    return response
