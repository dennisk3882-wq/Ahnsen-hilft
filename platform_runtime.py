from __future__ import annotations

import os
import re
from functools import lru_cache


DEFAULT_LANGUAGES = {
    "de": "DE",
    "en": "EN",
    "pl": "PL",
    "uk": "UA",
    "tr": "TR",
    "fr": "FR",
    "es": "ES",
    "it": "IT",
    "nl": "NL",
    "ro": "RO",
    "cs": "CZ",
    "da": "DK",
    "sv": "SE",
    "ar": "AR",
    "ru": "RU",
}


def _float(value, default: float) -> float:
    try:
        return float(str(value or "").replace(",", "."))
    except (TypeError, ValueError):
        return default


def _int(value, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(str(value or ""))
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(parsed, maximum))


def _bool(value, default: bool = False) -> bool:
    raw = str(value if value is not None else "").strip().casefold()
    if not raw:
        return default
    return raw not in {"0", "false", "nein", "no", "off", "aus"}


def _safe_color(value: str, default: str) -> str:
    raw = str(value or "").strip()
    return raw if re.fullmatch(r"#[0-9a-fA-F]{6}", raw) else default


def _slug(value: str, default: str = "plattform") -> str:
    raw = str(value or "").strip().casefold()
    raw = raw.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    raw = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return raw[:80] or default


def _safe_url(value: str, default: str = "") -> str:
    raw = str(value or "").strip()
    if not raw:
        return default
    if raw.startswith("https://") or raw.startswith("/"):
        return raw[:1000]
    return default


def get_platform_snapshot() -> dict:
    """Return one merged, database-backed tenant configuration.

    MunicipalityConfig contains the core brand values. GemeindeEinstellung keeps
    all flexible white-label settings so existing installations do not need a
    destructive schema migration for every new tenant option.
    """
    try:
        from community_crud import get_municipality_config
        from gemeinde_crud import get_gemeinde_einstellungen

        core = get_municipality_config()
        settings = get_gemeinde_einstellungen()
    except Exception:
        core = None
        settings = {}

    municipality = str(getattr(core, "municipality_name", "") or os.getenv("MUNICIPALITY_NAME") or "Ahnsen").strip()
    platform_name = str(getattr(core, "platform_name", "") or os.getenv("PLATFORM_NAME") or f"{municipality} hilft").strip()
    claim = str(getattr(core, "claim", "") or settings.get("plattform_claim") or "Dein Ort. Unsere Gemeinschaft.").strip()
    postal_code = str(getattr(core, "postal_code", "") or settings.get("plattform_postleitzahl") or "").strip()
    primary = _safe_color(getattr(core, "primary_color", "") or settings.get("hauptfarbe"), "#174936")
    accent = _safe_color(getattr(core, "accent_color", "") or settings.get("akzentfarbe"), "#8da77a")

    raw_languages = str(settings.get("plattform_sprachen") or "de,en,pl,uk,tr,fr,es,it,nl,ro,cs,da,sv,ar,ru")
    language_codes = []
    for item in re.split(r"[,;|\s]+", raw_languages):
        code = item.strip().casefold()
        if code in DEFAULT_LANGUAGES and code not in language_codes:
            language_codes.append(code)
    if "de" not in language_codes:
        language_codes.insert(0, "de")

    short_name = str(settings.get("plattform_kurzname") or municipality)[:30].strip() or municipality
    description = str(settings.get("plattform_beschreibung") or f"Digitale Bürgerplattform für {municipality}").strip()
    contact_name = str(settings.get("kontakt_name") or f"Gemeinde {municipality}").strip()

    warning_terms = str(getattr(core, "warning_terms", "") or settings.get("warnung_suchbegriffe") or municipality)
    warning_location = str(settings.get("warnung_ortsname") or municipality).strip()
    warning_area = str(settings.get("warnung_bereich") or municipality).strip()

    ticket_prefix = re.sub(r"[^A-Z0-9]", "", str(settings.get("ticket_prefix") or municipality[:3]).upper())[:8] or "TKT"

    return {
        "platform_name": platform_name,
        "short_name": short_name,
        "municipality_name": municipality,
        "claim": claim,
        "postal_code": postal_code,
        "description": description,
        "primary_color": primary,
        "accent_color": accent,
        "default_language": str(settings.get("standard_sprache") or "de").strip().casefold() or "de",
        "languages": language_codes,
        "language_labels": {code: DEFAULT_LANGUAGES[code] for code in language_codes},
        "timezone": str(settings.get("zeitzone") or "Europe/Berlin").strip(),
        "ticket_prefix": ticket_prefix,
        "public_base_url": _safe_url(settings.get("plattform_basis_url") or os.getenv("PUBLIC_BASE_URL", "")),
        "platform_slug": _slug(settings.get("plattform_slug") or platform_name, "plattform"),
        "logo_url": _safe_url(settings.get("logo_bild_url") or ""),
        "pwa_icon_192_url": _safe_url(settings.get("pwa_icon_192_url") or "/pwa/ahnsen-app-v5-192.png", "/pwa/ahnsen-app-v5-192.png"),
        "pwa_icon_512_url": _safe_url(settings.get("pwa_icon_512_url") or "/pwa/ahnsen-app-v5-512.png", "/pwa/ahnsen-app-v5-512.png"),
        "apple_touch_icon_url": _safe_url(settings.get("apple_touch_icon_url") or "/pwa/ahnsen-app-v5-180.png", "/pwa/ahnsen-app-v5-180.png"),
        "hero_image_url": _safe_url(settings.get("hero_bild_url") or "/assets/ahnsen-startseite.png", "/assets/ahnsen-startseite.png"),
        "contact_name": contact_name,
        "contact_address": str(settings.get("kontakt_adresse") or "").strip(),
        "contact_email": str(settings.get("kontakt_email") or "").strip(),
        "contact_phone": str(settings.get("kontakt_telefon") or "").strip(),
        "website_url": _safe_url(settings.get("externe_website_url") or ""),
        "privacy_url": _safe_url(settings.get("footer_datenschutz_url") or "/datenschutz", "/datenschutz"),
        "imprint_url": _safe_url(settings.get("footer_impressum_url") or "/impressum", "/impressum"),
        "map_lat": _float(settings.get("karten_mittelpunkt_lat"), 52.258),
        "map_lon": _float(settings.get("karten_mittelpunkt_lon"), 9.099),
        "map_zoom": _int(settings.get("karten_zoom"), 15, 8, 19),
        "warning_terms": warning_terms,
        "warning_location_name": warning_location,
        "warning_area_label": warning_area,
        "bbk_mowas_rss_url": _safe_url(settings.get("bbk_mowas_rss_url") or "https://warnung.bund.de/api31/mowas/rss/032570000000.rss"),
        "dwd_cap_index_url": _safe_url(settings.get("dwd_cap_index_url") or "https://opendata.dwd.de/weather/alerts/cap/COMMUNEUNION_DWD_STAT/"),
        "translation_enabled": _bool(settings.get("uebersetzung_aktiv"), True),
        "translation_api_url": _safe_url(settings.get("uebersetzung_api_url") or "https://translate.fedilab.app/translate"),
        "translation_fallback_url": _safe_url(settings.get("uebersetzung_fallback_url") or "https://translate.cutie.dating/translate"),
        "history_mode": str(settings.get("geschichte_modus") or ("ahnsen" if municipality.casefold() == "ahnsen" else "custom")).strip().casefold(),
    }


def platform_language_options() -> str:
    from html import escape

    snapshot = get_platform_snapshot()
    return "".join(
        f'<option value="{escape(code)}">{escape(snapshot["language_labels"].get(code, code.upper()))}</option>'
        for code in snapshot["languages"]
    )


def apply_static_branding(text: str, snapshot: dict | None = None) -> str:
    """Replace legacy *static UI phrases* without rewriting arbitrary place names.

    This deliberately avoids a blanket replacement of every 'Ahnsen' token so
    citizen-entered text is not silently falsified. Only known product/UI phrases
    inherited from the original tenant are changed.
    """
    if not text:
        return text
    cfg = snapshot or get_platform_snapshot()
    municipality = cfg["municipality_name"]
    platform = cfg["platform_name"]
    replacements = (
        ("Ahnsen hilft", platform),
        ("Gemeinde Ahnsen", cfg["contact_name"] or f"Gemeinde {municipality}"),
        ("Mein Ahnsen", f"Mein {municipality}"),
        ("Ideen für Ahnsen", f"Ideen für {municipality}"),
        ("Über Ahnsen", f"Über {municipality}"),
        ("Aktuelles aus Ahnsen", f"Aktuelles aus {municipality}"),
        ("Feuerwehr Ahnsen", f"Feuerwehr {municipality}"),
        ("Mehr aus Ahnsen", f"Mehr aus {municipality}"),
        ("Heute in Ahnsen", f"Heute in {municipality}"),
        ("Willkommen in Ahnsen", f"Willkommen in {municipality}"),
        ("Warnung für Ahnsen", f"Warnung für {municipality}"),
        ("Idee für Ahnsen", f"Idee für {municipality}"),
        ("Was ist los in Ahnsen?", f"Was ist los in {municipality}?"),
        ("Termine, Aktionen und Feste in Ahnsen.", f"Termine, Aktionen und Feste in {municipality}."),
        ("Die nächsten Abholtermine für Ahnsen.", f"Die nächsten Abholtermine für {municipality}."),
        ("Kommende Termine in Ahnsen", f"Kommende Termine in {municipality}"),
        ("Vereine in Ahnsen", f"Vereine in {municipality}"),
        ("Ahnsen im Überblick", f"{municipality} im Überblick"),
        ("Warnzentrale Ahnsen", f"Warnzentrale {municipality}"),
        ("Verfügbarkeit DGH Ahnsen", f"Verfügbarkeit DGH {municipality}"),
        ("für Ahnsen und den Landkreis Schaumburg", f"für {cfg['warning_area_label']}"),
        ("AHN-", str(cfg["ticket_prefix"]) + "-"),
    )
    result = str(text)
    for old, new in replacements:
        result = result.replace(old, new)
    return result
