from __future__ import annotations

from typing import Any
import os
from datetime import datetime

from admin_access import can_access
from community_crud import update_municipality_config
from database import SessionLocal
from gemeinde_crud import set_gemeinde_einstellung, update_gemeinde_einstellungen
from governance_models import AdminUser


PLATFORM_LIMITS = {
    "platform_name": 120, "municipality_name": 120, "claim": 180,
    "postal_code": 20, "primary_color": 20, "accent_color": 20,
    "warning_terms": 500, "short_name": 30, "description": 300,
    "default_language": 10, "languages": 300, "timezone": 80,
    "public_base_url": 500, "platform_slug": 80, "pwa_icon_192_url": 1000,
    "pwa_icon_512_url": 1000, "apple_touch_icon_url": 1000,
    "ticket_prefix": 8, "map_lat": 30, "map_lon": 30, "map_zoom": 3,
    "warning_location_name": 160, "warning_area_label": 240,
    "bbk_mowas_rss_url": 1000, "dwd_cap_index_url": 1000,
    "translation_enabled": 10, "translation_api_url": 1000,
    "translation_fallback_url": 1000, "history_mode": 20,
    "logo_url": 1000, "hero_image_url": 1000, "contact_name": 180,
    "contact_address": 500, "contact_email": 180, "contact_phone": 80,
    "website_url": 1000, "privacy_url": 1000, "imprint_url": 1000,
    "report_sla_days": 3,
}


def normalize_platform_payload(values: dict[str, Any]) -> dict[str, str]:
    return {key: str(values.get(key) or "").strip()[:limit] for key, limit in PLATFORM_LIMITS.items()}


def apply_platform_payload(values: dict[str, Any], db=None):
    if db is None:
        with SessionLocal() as session:
            result = apply_platform_payload(values, db=session)
            session.commit(); session.refresh(result)
            return result
    from platform_runtime import get_platform_snapshot
    from community_models import MunicipalityConfig
    data = normalize_platform_payload({**get_platform_snapshot(), **values})
    config = db.query(MunicipalityConfig).first()
    if config is None:
        config = MunicipalityConfig()
        db.add(config)
    for key in ("platform_name", "municipality_name", "claim", "postal_code", "primary_color", "accent_color", "warning_terms"):
        setattr(config, key, data[key])
    config.aktualisiert_am = datetime.utcnow()
    settings = {
        "plattform_kurzname": data["short_name"],
        "plattform_beschreibung": data["description"],
        "standard_sprache": data["default_language"],
        "plattform_sprachen": data["languages"],
        "zeitzone": data["timezone"],
        "plattform_basis_url": data["public_base_url"],
        "plattform_slug": data["platform_slug"],
        "pwa_icon_192_url": data["pwa_icon_192_url"],
        "pwa_icon_512_url": data["pwa_icon_512_url"],
        "apple_touch_icon_url": data["apple_touch_icon_url"],
        "ticket_prefix": data["ticket_prefix"],
        "karten_mittelpunkt_lat": data["map_lat"],
        "karten_mittelpunkt_lon": data["map_lon"],
        "karten_zoom": data["map_zoom"],
        "warnung_ortsname": data["warning_location_name"],
        "warnung_bereich": data["warning_area_label"],
        "warnung_suchbegriffe": data["warning_terms"],
        "bbk_mowas_rss_url": data["bbk_mowas_rss_url"],
        "dwd_cap_index_url": data["dwd_cap_index_url"],
        "uebersetzung_aktiv": "ja" if data["translation_enabled"] == "ja" else "nein",
        "uebersetzung_api_url": data["translation_api_url"],
        "uebersetzung_fallback_url": data["translation_fallback_url"],
        "geschichte_modus": data["history_mode"],
        "logo_bild_url": data["logo_url"],
        "hero_bild_url": data["hero_image_url"],
        "kontakt_name": data["contact_name"],
        "kontakt_adresse": data["contact_address"],
        "kontakt_email": data["contact_email"],
        "kontakt_telefon": data["contact_phone"],
        "externe_website_url": data["website_url"],
        "footer_datenschutz_url": data["privacy_url"],
        "footer_impressum_url": data["imprint_url"],
        "maengel_sla_tage": data["report_sla_days"] or "14",
        "seiten_titel": config.platform_name,
        "logo_text": config.platform_name,
        "hauptfarbe": config.primary_color,
        "akzentfarbe": config.accent_color,
    }
    for key, value in settings.items():
        _set_setting(db, key, value)
    return config


def _set_setting(db, key, value):
    from gemeinde_models import GemeindeEinstellung
    item = db.query(GemeindeEinstellung).filter(GemeindeEinstellung.schluessel == key).first()
    if item is None:
        item = GemeindeEinstellung(schluessel=key)
        db.add(item)
    item.wert = str(value or "").strip()
    item.aktualisiert_am = datetime.utcnow()


def content_permission(area):
    return "events" if area == "veranstaltungen" else "content"


def apply_content_payload(area: str, payload: dict[str, Any], db=None):
    if not isinstance(payload, dict):
        raise ValueError("Inhalt muss ein Objekt sein.")
    if db is None:
        with SessionLocal() as session:
            result = apply_content_payload(area, payload, db=session)
            session.commit()
            return result
    if area == "gemeindeseite":
        from gemeinde_crud import DEFAULT_GEMEINDE_EINSTELLUNGEN
        for key, value in payload.items():
            if key in DEFAULT_GEMEINDE_EINSTELLUNGEN:
                _set_setting(db, key, value)
        return
    if area == "plattform":
        return apply_platform_payload(payload, db=db)
    if area == "veranstaltungen":
        from veranstaltungen_models import Veranstaltung
        event_id = payload.get("id")
        event = db.get(Veranstaltung, int(event_id)) if event_id else None
        if payload.get("_delete"):
            if event: db.delete(event)
            return
        if event is None:
            event = Veranstaltung()
            if event_id: event.id = int(event_id)
            db.add(event)
        for column in Veranstaltung.__table__.columns:
            key = column.name
            if key not in {"id", "erstellt_am"} and key in payload:
                setattr(event, key, payload[key])
        db.flush()
        return event.id
    raise ValueError("Dieser Inhaltsbereich unterstützt noch keine automatische Wiederherstellung.")


def content_approval_available(actor_username: str, area="gemeindeseite", db=None) -> bool:
    if os.getenv("CONTENT_APPROVAL_MODE", "auto").casefold() == "required":
        return True
    if db is None:
        with SessionLocal() as session:
            return content_approval_available(actor_username, area, db=session)
    accounts = db.query(AdminUser).filter(AdminUser.active.is_(True)).all()
    return any(item.username.casefold() != actor_username.casefold() and can_access(item.role, content_permission(area), method="POST") for item in accounts)


def submit_content(area, object_id, title, payload, actor):
    """Persist the version and its publication in one transaction."""
    import json
    from db_coordination import transaction_lock
    from governance_models import ContentRevision
    with SessionLocal() as db:
        transaction_lock(db, "content-workflow")
        pending = content_approval_available(actor, area, db=db)
        latest = db.query(ContentRevision).filter(ContentRevision.area == area, ContentRevision.object_id == object_id).order_by(ContentRevision.version.desc()).first()
        now = datetime.utcnow()
        values = dict(payload)
        if not pending:
            event_id = apply_content_payload(area, values, db=db)
            if area == "veranstaltungen" and event_id:
                values["id"] = event_id
                object_id = str(event_id)
        revision = ContentRevision(area=area, object_id=object_id, title=title[:200], payload_json=json.dumps(values, ensure_ascii=False), actor=actor, version=latest.version + 1 if latest else 1, state="Prüfung" if pending else "Freigegeben", reviewed_by="" if pending else actor, reviewed_at=None if pending else now, applied_at=None if pending else now)
        db.add(revision); db.commit(); db.refresh(revision)
        return revision
