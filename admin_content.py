from __future__ import annotations

from typing import Any

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


def apply_platform_payload(values: dict[str, Any]):
    data = normalize_platform_payload(values)
    config = update_municipality_config({key: data[key] for key in (
        "platform_name", "municipality_name", "claim", "postal_code",
        "primary_color", "accent_color", "warning_terms",
    )})
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
        set_gemeinde_einstellung(key, value)
    return config


def apply_content_payload(area: str, payload: dict[str, Any]) -> None:
    if area == "gemeindeseite":
        update_gemeinde_einstellungen(payload)
        return
    if area == "plattform":
        apply_platform_payload(payload)
        return
    raise ValueError("Dieser Inhaltsbereich unterstützt noch keine automatische Wiederherstellung.")


def content_approval_available(actor_username: str) -> bool:
    db = SessionLocal()
    try:
        accounts = db.query(AdminUser).filter(AdminUser.active.is_(True), AdminUser.username != actor_username).all()
        return any(can_access(item.role, "content", method="POST") for item in accounts)
    finally:
        db.close()
