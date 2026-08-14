from __future__ import annotations

import json
import os
import smtplib
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import requests
from sqlalchemy import Column, DateTime, Integer, String, Text, func, inspect, text

from config import DATABASE_URL, EMAIL_PASSWORD, EMAIL_TO, EMAIL_USER
from database import Base, SessionLocal, engine
from pwa_models import PWAUser, PushSubscription
from push_service import VAPID_SUBJECT, push_configured
from warning_service import get_warning_stats, init_warning_db, probe_warning_sources
from operations import SchemaMigration


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
GEOCODER_REVERSE_URL = os.getenv(
    "GEOCODER_REVERSE_URL",
    "https://nominatim.openstreetmap.org/reverse",
).strip()
GEOCODER_USER_AGENT = os.getenv(
    "GEOCODER_USER_AGENT",
    "Ahnsen-hilft/1.0 (+https://ahnsen-hilft.onrender.com)",
).strip()


class SystemEvent(Base):
    __tablename__ = "system_events"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(80), index=True, nullable=False)
    status = Column(String(20), nullable=False)
    message = Column(Text, default="", nullable=False)
    details_json = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)


def init_system_diagnostics_db() -> None:
    Base.metadata.create_all(bind=engine)


def record_system_event(
    kind: str,
    status: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> None:
    init_system_diagnostics_db()
    db = SessionLocal()
    try:
        db.add(
            SystemEvent(
                kind=str(kind or "system")[:80],
                status=str(status or "info")[:20],
                message=str(message or "")[:4000],
                details_json=json.dumps(details or {}, ensure_ascii=False, default=str)[:20000],
                created_at=datetime.utcnow(),
            )
        )
        db.commit()
    finally:
        db.close()


def get_last_system_event(kind: str) -> SystemEvent | None:
    init_system_diagnostics_db()
    db = SessionLocal()
    try:
        return (
            db.query(SystemEvent)
            .filter(SystemEvent.kind == str(kind or "")[:80])
            .order_by(SystemEvent.created_at.desc())
            .first()
        )
    finally:
        db.close()


def get_push_test_targets(limit: int = 100) -> list[dict[str, Any]]:
    init_system_diagnostics_db()
    db = SessionLocal()
    try:
        rows = (
            db.query(
                PWAUser.id,
                PWAUser.name,
                PWAUser.email,
                func.count(PushSubscription.id).label("device_count"),
            )
            .join(PushSubscription, PushSubscription.user_id == PWAUser.id)
            .filter(PWAUser.aktiv.is_(True))
            .group_by(PWAUser.id, PWAUser.name, PWAUser.email)
            .order_by(PWAUser.name.asc(), PWAUser.email.asc())
            .limit(max(1, min(int(limit or 100), 500)))
            .all()
        )
        return [
            {
                "id": int(row.id),
                "name": str(row.name or ""),
                "email": str(row.email or ""),
                "device_count": int(row.device_count or 0),
            }
            for row in rows
        ]
    finally:
        db.close()


def _route_map(app) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for route in getattr(app, "router", object()).routes:
        path = str(getattr(route, "path", "") or "")
        if not path:
            continue
        methods = set(getattr(route, "methods", set()) or set())
        result.setdefault(path, set()).update(methods)
    return result


def _table_count(table_name: str, existing_tables: set[str]) -> int | None:
    if table_name not in existing_tables:
        return None
    with engine.connect() as connection:
        value = connection.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar()
    return int(value or 0)


def _result(
    key: str,
    label: str,
    group: str,
    status: str,
    detail: str,
    duration_ms: int,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "group": group,
        "status": status,
        "detail": str(detail or ""),
        "duration_ms": max(0, int(duration_ms)),
    }


def _smtp_login_check() -> tuple[str, str]:
    if not EMAIL_USER or not EMAIL_PASSWORD or not EMAIL_TO:
        return "warn", "E-Mail ist nicht vollständig konfiguriert; der Login-Test wurde übersprungen."
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=10) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(EMAIL_USER, EMAIL_PASSWORD)
    return "ok", f"SMTP-Anmeldung erfolgreich; Testziel ist {EMAIL_TO}."


def _geocoder_live_check() -> tuple[str, str]:
    if not GEOCODER_REVERSE_URL.startswith("https://"):
        return "error", "Der konfigurierte Adressdienst verwendet kein HTTPS."
    response = requests.get(
        GEOCODER_REVERSE_URL,
        params={
            "lat": "52.375900",
            "lon": "9.732000",
            "format": "jsonv2",
            "addressdetails": 1,
            "accept-language": "de",
            "zoom": 18,
        },
        headers={"User-Agent": GEOCODER_USER_AGENT, "Accept": "application/json"},
        timeout=7,
    )
    if response.status_code != 200:
        return "error", f"Adressdienst antwortet mit HTTP {response.status_code}."
    try:
        payload = response.json()
    except ValueError:
        return "error", "Adressdienst hat keine gültige JSON-Antwort geliefert."
    if not (payload.get("display_name") or payload.get("address")):
        return "warn", "Adressdienst ist erreichbar, lieferte beim Test aber keine Adresse."
    return "ok", "OpenStreetMap/Nominatim ist erreichbar und liefert Adressdaten."


def run_system_checks(app, request=None, deep: bool = False) -> dict[str, Any]:
    """Run safe live diagnostics. Deep mode additionally contacts external services.

    The routine does not create citizen reports, bookings, events or push messages.
    The database write probe uses a temporary table and removes it immediately.
    """

    init_system_diagnostics_db()
    init_warning_db()
    started = time.perf_counter()
    checks: list[dict[str, Any]] = []
    routes = _route_map(app)

    inspector = inspect(engine)
    try:
        tables = set(inspector.get_table_names())
    except Exception:
        tables = set()

    def add(key: str, label: str, group: str, callback) -> None:
        checkpoint = time.perf_counter()
        try:
            status, detail = callback()
        except Exception as error:
            status = "error"
            detail = f"{type(error).__name__}: {str(error)[:260]}"
        checks.append(
            _result(
                key,
                label,
                group,
                status,
                detail,
                int((time.perf_counter() - checkpoint) * 1000),
            )
        )

    def check_webserver():
        required = {"/", "/health", "/verwaltung", "/intern/maengel", "/intern/push", "/warnungen", "/intern/warnungen"}
        missing = sorted(required - set(routes))
        if missing:
            return "error", "Fehlende Kernrouten: " + ", ".join(missing)
        return "ok", f"FastAPI ist aktiv; {len(routes)} Routen sind registriert."

    add("webserver", "Webserver & PWA", "Kernsystem", check_webserver)

    def check_https():
        if request is None:
            return "warn", "HTTPS kann ohne aktuellen Browser-Request nicht sicher bewertet werden."
        forwarded = str(request.headers.get("x-forwarded-proto", "") or "").split(",", 1)[0].strip()
        scheme = forwarded or str(getattr(request.url, "scheme", "") or "")
        if scheme.casefold() == "https":
            return "ok", "Die Verwaltungsseite wird über HTTPS ausgeliefert."
        return "warn", f"Erkanntes Protokoll: {scheme or 'unbekannt'}. Hinter einem Proxy kann das abweichen."

    add("https", "HTTPS / Transport", "Sicherheit & Betrieb", check_https)

    def check_database():
        with engine.connect() as connection:
            connection.execute(text("SELECT 1")).scalar()
        dialect = str(engine.dialect.name or "unbekannt")
        if dialect == "postgresql":
            return "ok", "PostgreSQL-Verbindung erfolgreich."
        return "warn", f"Datenbank erreichbar; aktiver Treiber ist {dialect}."

    add("database", "Datenbankverbindung", "Kernsystem", check_database)

    def check_database_write():
        probe_name = f"ahnsen_diag_probe_{int(time.time() * 1000)}"
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                connection.exec_driver_sql(f"CREATE TEMPORARY TABLE {probe_name} (value INTEGER)")
                connection.exec_driver_sql(f"INSERT INTO {probe_name} (value) VALUES (73)")
                value = connection.exec_driver_sql(f"SELECT value FROM {probe_name}").scalar()
                connection.exec_driver_sql(f"DROP TABLE {probe_name}")
                if int(value or 0) != 73:
                    raise RuntimeError("Geschriebener Testwert konnte nicht korrekt gelesen werden")
            finally:
                transaction.rollback()
        return "ok", "Temporärer Schreib-/Lesetest war erfolgreich; keine Bürgerdaten wurden verändert."

    add("database_write", "Datenbank Schreiben & Lesen", "Kernsystem", check_database_write)

    def check_operations_schema():
        required = {"schema_migrations", "platform_assets", "rate_limit_events"}
        missing = sorted(required - tables)
        if missing:
            return "error", "Betriebstabellen fehlen: " + ", ".join(missing)
        db = SessionLocal()
        try:
            versions = db.query(SchemaMigration).count()
        finally:
            db.close()
        if versions < 4:
            return "warn", f"Nur {versions} versionierte Migration(en) protokolliert."
        return "ok", f"Versionierte Migrationen, dauerhafte Medien und gemeinsames Rate-Limit aktiv ({versions} Migrationen)."

    add("operations_schema", "Migrationen & dauerhafte Medien", "Kernsystem", check_operations_schema)

    def check_accessibility_assets():
        css_path = STATIC_DIR / "accessibility.css"
        js_path = STATIC_DIR / "accessibility.js"
        if not css_path.exists() or not js_path.exists():
            return "error", "Barrierefreiheits-CSS oder -JavaScript fehlt."
        css = css_path.read_text(encoding="utf-8")
        js = js_path.read_text(encoding="utf-8")
        required_css = (":focus-visible", "prefers-reduced-motion", "bottom:calc(84px", "width:44px")
        if any(value not in css for value in required_css) or "aria-pressed" not in js:
            return "error", "Tastatur-, Bewegungs- oder mobile Aa-Regeln sind unvollständig."
        return "ok", "Tastaturfokus, Bewegungsreduktion und kompakte mobile Aa-Leiste sind eingebaut."

    add("accessibility", "Barrierefreiheit", "PWA", check_accessibility_assets)

    def check_accounts():
        if "pwa_users" not in tables:
            return "error", "Tabelle pwa_users fehlt."
        columns = {item["name"] for item in inspect(engine).get_columns("pwa_users")}
        required = {
            "id", "email", "password_hash", "aktiv", "push_muell", "push_meldungen",
            "push_dgh", "push_veranstaltungen", "push_aktuelles", "push_buergerinfo",
            "push_vereine", "push_feuerwehr", "push_verkehr", "push_warnungen",
            "push_unwetter", "push_bevoelkerungsschutz", "push_hochwasser", "warn_min_level",
        }
        missing = sorted(required - columns)
        if missing:
            return "error", "Fehlende Konto-/Push-Spalten: " + ", ".join(missing)
        reset_routes = {"/passwort-vergessen", "/passwort-zuruecksetzen"}
        missing_reset = sorted(reset_routes - set(routes))
        if "pwa_password_reset_tokens" not in tables or missing_reset:
            return "error", "Passwort-Wiederherstellung ist unvollständig" + ((": " + ", ".join(missing_reset)) if missing_reset else ".")
        count = _table_count("pwa_users", tables) or 0
        return "ok", f"Kontoschema einschließlich sicherer Passwort-Wiederherstellung vollständig; {count} Bürgerkonto/-konten vorhanden."

    add("accounts", "Benutzerkonten & Profile", "Funktionen", check_accounts)

    def check_reports():
        required_routes = {"/mangel-melden", "/api/maengel", "/meldestatus", "/intern/maengel"}
        missing_routes = sorted(required_routes - set(routes))
        if "meldungen" not in tables or missing_routes:
            detail = []
            if "meldungen" not in tables:
                detail.append("Tabelle meldungen fehlt")
            if missing_routes:
                detail.append("Routen fehlen: " + ", ".join(missing_routes))
            return "error", "; ".join(detail)
        count = _table_count("meldungen", tables) or 0
        return "ok", f"Mängelmelder und Verwaltung sind registriert; {count} Meldung(en) gespeichert."

    add("reports", "Mängelmelder", "Funktionen", check_reports)

    def check_events():
        required_routes = {"/veranstaltungen", "/intern/veranstaltungen", "/veranstaltungen/neue"}
        missing_routes = sorted(required_routes - set(routes))
        if "veranstaltungen" not in tables or missing_routes:
            return "error", "Veranstaltungsmodul unvollständig: " + ", ".join(missing_routes or ["Tabelle fehlt"])
        count = _table_count("veranstaltungen", tables) or 0
        return "ok", f"Veranstaltungsmodul verfügbar; {count} Termin(e) in der Datenbank."

    add("events", "Veranstaltungen", "Funktionen", check_events)

    def check_dgh():
        required_routes = {"/dgh-mieten", "/dgh-anfrage", "/api/dgh-anfragen", "/intern/dgh"}
        missing_routes = sorted(required_routes - set(routes))
        if "dgh_termine" not in tables or missing_routes:
            return "error", "DGH-Modul unvollständig: " + ", ".join(missing_routes or ["Tabelle fehlt"])
        count = _table_count("dgh_termine", tables) or 0
        return "ok", f"DGH-Anfragen und Verwaltung verfügbar; {count} Datensatz/Datensätze vorhanden."

    add("dgh", "DGH-Anfragen", "Funktionen", check_dgh)

    def check_waste():
        required_routes = {"/muelltermine-info", "/intern/muelltermine", "/muelltermine.ics"}
        missing_routes = sorted(required_routes - set(routes))
        if "muelltermine" not in tables or missing_routes:
            return "error", "Müllmodul unvollständig: " + ", ".join(missing_routes or ["Tabelle fehlt"])
        count = _table_count("muelltermine", tables) or 0
        if count == 0:
            return "warn", "Müllmodul funktioniert, aber aktuell sind keine Abfuhrtermine gespeichert."
        return "ok", f"Mülltermine verfügbar; {count} Termin(e) gespeichert."

    add("waste", "Mülltermine & Kalender", "Funktionen", check_waste)

    def check_push():
        subscription_count = _table_count("pwa_push_subscriptions", tables) or 0
        if not push_configured():
            return "error", "VAPID-Konfiguration ist unvollständig; Push kann nicht versendet werden."
        if not str(VAPID_SUBJECT or "").startswith("mailto:"):
            return "warn", f"Push ist konfiguriert, VAPID_SUBJECT sollte jedoch mit mailto: beginnen. {subscription_count} Gerät(e) registriert."
        if subscription_count == 0:
            return "warn", "VAPID ist konfiguriert, aber aktuell ist kein Push-Gerät registriert."
        return "ok", f"VAPID vollständig; {subscription_count} Push-Gerät(e) registriert."

    add("push", "Browser-Push", "Dienste", check_push)

    def check_warning_monitor():
        stats = get_warning_stats()
        sources = stats.get("sources") or {}
        states = [sources.get(name, {}).get("status", "unknown") for name in ("DWD", "BBK")]
        if states.count("error") == 2:
            return "error", "DWD und Bundeswarnportal waren bei der letzten Warnabfrage nicht erreichbar."
        if "error" in states:
            return "warn", "Eine amtliche Warnquelle war bei der letzten Abfrage nicht erreichbar; die andere Quelle läuft weiter."
        if "unknown" in states:
            return "warn", "Warnmonitor ist eingerichtet; nach dem ersten automatischen Lauf werden beide Quellen bewertet."
        return "ok", f"Amtlicher Warnmonitor aktiv; {stats.get('active', 0)} aktive Warnung(en), {stats.get('total', 0)} insgesamt gespeichert."

    add("warning_monitor", "Amtlicher Warnmonitor", "Dienste", check_warning_monitor)

    if deep:
        probes = probe_warning_sources()
        for source, label in (("DWD", "DWD Warnquelle"), ("BBK", "Bundeswarnportal / BBK")):
            probe = probes.get(source) or {}
            checks.append(
                _result(
                    f"warning_source_{source.lower()}",
                    label,
                    "Dienste",
                    probe.get("status", "error"),
                    probe.get("detail", "Keine Antwort"),
                    int(probe.get("duration_ms", 0) or 0),
                )
            )

    def check_geolocation():
        script_path = STATIC_DIR / "pwa.js"
        wrapper_path = BASE_DIR / "pwa_main.py"
        script = script_path.read_text(encoding="utf-8") if script_path.exists() else ""
        wrapper = wrapper_path.read_text(encoding="utf-8") if wrapper_path.exists() else ""
        route_ready = "/api/location/address" in routes
        if "navigator.geolocation" not in script or "_LOCATION_HELPER" not in wrapper or not route_ready:
            return "error", "Standortübernahme oder Adressroute ist nicht vollständig eingebaut."
        return "ok", "Browser-GPS, Koordinatenspeicherung und automatische Adressübernahme sind eingebaut."

    add("geolocation", "GPS / Standortübernahme", "Dienste", check_geolocation)

    def check_geocoder():
        if not GEOCODER_REVERSE_URL:
            return "error", "Kein Reverse-Geocoder konfiguriert."
        if not deep:
            if not GEOCODER_REVERSE_URL.startswith("https://"):
                return "error", "Adressdienst ist konfiguriert, aber nicht über HTTPS."
            return "ok", "Adressdienst ist konfiguriert. Der externe Live-Aufruf erfolgt im vollständigen Systemtest."
        return _geocoder_live_check()

    add("geocoder", "Adressauflösung", "Dienste", check_geocoder)

    def check_email():
        configured = bool(EMAIL_USER and EMAIL_PASSWORD and EMAIL_TO)
        if not configured:
            return "warn", "E-Mail-Benachrichtigungen sind nicht vollständig konfiguriert."
        if not deep:
            return "ok", f"E-Mail-Konfiguration vorhanden; Ziel ist {EMAIL_TO}. SMTP-Login wird nur im Volltest geprüft."
        return _smtp_login_check()

    add("email", "E-Mail-Versand", "Dienste", check_email)

    def check_service_worker():
        path = STATIC_DIR / "pwa.js"
        if not path.exists():
            return "error", "static/pwa.js fehlt."
        source = path.read_text(encoding="utf-8")
        requirements = ("showNotification", "notificationclick", "serviceWorker", "event.request.mode === 'navigate'")
        missing = [value for value in requirements if value not in source]
        if missing:
            return "error", "Service-Worker-Funktionen fehlen: " + ", ".join(missing)
        if "/pwa.js" not in routes or "/service-worker.js" not in routes:
            return "error", "Service-Worker-Routen sind nicht vollständig registriert."
        return "ok", "Offline-/Service-Worker-Logik und Push-Ereignisse sind vorhanden."

    add("service_worker", "Service Worker / Offline", "PWA", check_service_worker)

    def check_manifest_icons():
        current_180 = STATIC_DIR / "ahnsen-app-v7-180.png"
        current_192 = STATIC_DIR / "ahnsen-app-v7-192.png"
        current_512 = STATIC_DIR / "ahnsen-app-v7-512.png"
        icons_ok = current_180.exists() and current_192.exists() and current_512.exists()
        if "/manifest.webmanifest" not in routes or not icons_ok:
            return "error", "Manifest oder erforderliche App-Icons fehlen."
        return "ok", "Manifest und die freigegebenen v7-Fotoicons sind vorhanden."

    add("manifest", "Manifest & App-Icons", "PWA", check_manifest_icons)

    def check_security():
        pwa_secret = str(os.getenv("PWA_SESSION_SECRET") or "")
        dashboard_user = str(os.getenv("DASHBOARD_USER") or "")
        dashboard_password = str(os.getenv("DASHBOARD_PASSWORD") or "")
        dashboard_secret = str(os.getenv("DASHBOARD_SESSION_SECRET") or "")
        if not dashboard_user or not dashboard_password:
            return "error", "DASHBOARD_USER oder DASHBOARD_PASSWORD fehlt."
        if len(pwa_secret) < 32:
            return "error", "PWA_SESSION_SECRET fehlt oder ist zu kurz; mindestens 32 Zeichen empfohlen."
        if not dashboard_secret:
            return "warn", "Verwaltung funktioniert, verwendet aber keinen separaten DASHBOARD_SESSION_SECRET."
        if dashboard_secret == dashboard_password:
            return "warn", "DASHBOARD_SESSION_SECRET sollte nicht identisch mit dem Dashboard-Passwort sein."
        return "ok", "Separate Zugangsdaten und ausreichend lange Sitzungsschlüssel sind konfiguriert."

    add("security", "Sitzungen & Zugangsschutz", "Sicherheit & Betrieb", check_security)

    def check_cron():
        event = get_last_system_event("background_scheduler") or get_last_system_event("muell_cron")
        if not event:
            return "warn", "Noch kein protokollierter Hintergrundlauf seit dem letzten Start."
        age_seconds = max(0.0, (datetime.utcnow() - event.created_at).total_seconds())
        age_minutes = int(age_seconds // 60)
        if event.status == "error":
            return "error", f"Letzter Hintergrundlauf vor {age_minutes} Min. meldete Fehler: {event.message}"
        if age_seconds > 3 * 60 * 60:
            return "error", f"Letzter Hintergrundlauf liegt {age_minutes} Minuten zurück. Erwartet wird spätestens alle 30 Minuten."
        if event.status == "warn":
            return "warn", f"Letzter Hintergrundlauf vor {age_minutes} Min.: {event.message}"
        return "ok", f"Hintergrundaufgaben zuletzt vor {age_minutes} Min. aktiv: {event.message}"

    add("cron", "Kostenlose Hintergrundaufgaben", "Sicherheit & Betrieb", check_cron)

    def check_render():
        commit = str(os.getenv("RENDER_GIT_COMMIT") or "").strip()
        service = str(os.getenv("RENDER_SERVICE_NAME") or "").strip()
        if commit:
            return "ok", f"Render-Service {service or 'Ahnsen hilft'} läuft mit Commit {commit[:10]}."
        return "warn", "Render-Git-Metadaten sind in dieser Laufzeit nicht verfügbar; die App selbst läuft jedoch."

    add("render", "Render-Deployment", "Sicherheit & Betrieb", check_render)

    summary = {
        "ok": sum(1 for item in checks if item["status"] == "ok"),
        "warn": sum(1 for item in checks if item["status"] == "warn"),
        "error": sum(1 for item in checks if item["status"] == "error"),
        "total": len(checks),
    }
    overall = "error" if summary["error"] else "warn" if summary["warn"] else "ok"

    metrics = {
        "users": _table_count("pwa_users", tables),
        "push_devices": _table_count("pwa_push_subscriptions", tables),
        "reports": _table_count("meldungen", tables),
        "events": _table_count("veranstaltungen", tables),
        "dgh": _table_count("dgh_termine", tables),
        "waste": _table_count("muelltermine", tables),
    }

    last_full = get_last_system_event("system_full_test")
    report = {
        "overall": overall,
        "summary": summary,
        "checks": checks,
        "metrics": metrics,
        "deep": bool(deep),
        "duration_ms": int((time.perf_counter() - started) * 1000),
        "generated_at": datetime.utcnow(),
        "database_dialect": str(engine.dialect.name or "unbekannt"),
        "database_configured": bool(DATABASE_URL),
        "render_service": str(os.getenv("RENDER_SERVICE_NAME") or "Ahnsen-hilft"),
        "render_commit": str(os.getenv("RENDER_GIT_COMMIT") or ""),
        "last_full_test": last_full,
    }

    if deep:
        message = (
            f"Volltest: {summary['ok']}/{summary['total']} OK, "
            f"{summary['warn']} Warnung(en), {summary['error']} Fehler."
        )
        try:
            record_system_event(
                "system_full_test",
                overall,
                message,
                {
                    "summary": summary,
                    "duration_ms": report["duration_ms"],
                    "checks": [
                        {"key": item["key"], "status": item["status"], "detail": item["detail"]}
                        for item in checks
                    ],
                },
            )
            report["last_full_test"] = get_last_system_event("system_full_test")
        except Exception:
            pass

    return report
