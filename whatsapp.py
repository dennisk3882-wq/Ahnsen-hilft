import base64
from io import BytesIO

import requests
from PIL import Image, ImageOps

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
        "text": {"body": str(text or "").rstrip()},
    }

    response = requests.post(url, headers=headers, json=data, timeout=20)
    print("WhatsApp Antwort:", response.status_code, response.text)
    return response


def upload_whatsapp_media(bild_base64):
    upload_url = f"https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/media"

    image_bytes = base64.b64decode(bild_base64)

    img = Image.open(BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)

    buffer = BytesIO()
    img.convert("RGB").save(buffer, format="JPEG", quality=90)
    image_bytes = buffer.getvalue()

    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
    }

    files = {
        "file": ("veranstaltung.jpg", image_bytes, "image/jpeg"),
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
            "caption": str(caption or "").rstrip(),
        },
    }

    response = requests.post(url, headers=headers, json=data, timeout=30)

    print("WhatsApp Bild:", response.status_code, response.text)

    return response
