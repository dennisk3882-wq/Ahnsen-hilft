import base64
import json
from uuid import uuid4
from admin_content import submit_content
from veranstaltungen_crud import get_veranstaltung, _gallery_laden, _gallery_neue_eintraege, MAX_RUECKBLICK_BILDER


def submit_event(event_id, values, actor, *, image=None, gallery=None, clear_gallery=False):
    existing = get_veranstaltung(event_id) if event_id else None
    if event_id and existing is None:
        raise ValueError("Veranstaltung nicht gefunden.")
    payload = {column.name: getattr(existing, column.name) for column in existing.__table__.columns if column.name != "erstellt_am"} if existing else {"aktiv": "Ja"}
    payload.update(values)
    if image is not None:
        payload["bild_base64"] = base64.b64encode(image).decode("ascii")
    if gallery or clear_gallery:
        previous = [] if clear_gallery else _gallery_laden(payload.get("rueckblick_bilder_json"))
        payload["rueckblick_bilder_json"] = json.dumps((previous + _gallery_neue_eintraege(gallery))[:MAX_RUECKBLICK_BILDER])
    return submit_content("veranstaltungen", str(event_id) if event_id else "neu-" + uuid4().hex, str(payload.get("titel") or "Veranstaltung"), payload, actor)
