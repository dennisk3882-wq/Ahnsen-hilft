# media.py

import requests
from config import WHATSAPP_TOKEN


def download_whatsapp_image(media_id):
    """Lädt ein WhatsApp-Bild über die Media-ID herunter."""
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}"
    }

    meta_url = f"https://graph.facebook.com/v25.0/{media_id}"
    meta = requests.get(meta_url, headers=headers, timeout=20)

    print("Media Meta:", meta.status_code, meta.text)

    if meta.status_code != 200:
        return None

    file_url = meta.json().get("url")

    if not file_url:
        return None

    file_response = requests.get(file_url, headers=headers, timeout=30)

    print("Bild Download:", file_response.status_code)

    if file_response.status_code != 200:
        print("Bild Download Fehler:", file_response.text)
        return None

    return file_response.content
