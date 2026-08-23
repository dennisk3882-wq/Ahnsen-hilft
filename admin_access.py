from __future__ import annotations

from contextvars import ContextVar


ROLES = {
    "superadmin": "Vollzugriff",
    "municipality": "Gemeindeverwaltung",
    "mayor": "Bürgermeister",
    "public_works": "Bauhof",
    "fire_service": "Feuerwehr",
    "event_editor": "Veranstaltungsredaktion",
    "club_editor": "Vereins- und Veranstaltungsredaktion",
    "read_only": "Nur lesen",
}

ROLE_PERMISSIONS = {
    "superadmin": {"*"},
    "municipality": {"cases", "content", "dgh", "waste", "events", "warnings", "push", "messages", "moderation", "politics", "reports", "audit", "compliance", "system", "read"},
    "mayor": {"cases", "content", "messages", "moderation", "politics", "reports", "audit", "compliance", "read"},
    "public_works": {"cases", "read"},
    "fire_service": {"warnings", "read"},
    "event_editor": {"events", "read"},
    "club_editor": {"events", "read"},
    "read_only": {"read_all", "read"},
}

# A read-only account may inspect operational content, but never security,
# access management, backups or actions which could disclose secrets.
READ_ONLY_PERMISSIONS = {
    "cases", "content", "dgh", "waste", "events", "warnings", "push",
    "messages", "moderation", "politics", "reports", "compliance", "read",
}

REQUIRED_2FA_ROLES = {"superadmin", "municipality", "mayor"}

ROUTE_PERMISSIONS = (
    ("/intern/benutzer", "admin"),
    ("/intern/sicherung", "backup"),
    ("/intern/system", "system"),
    ("/intern/freigabe", "compliance"),
    ("/intern/audit", "audit"),
    ("/intern/berichte", "reports"),
    ("/intern/politik", "politics"),
    ("/intern/ideen", "moderation"),
    ("/intern/cockpit", "read"),
    ("/intern/suche", "read"),
    ("/intern/maengel", "cases"),
    ("/status", "cases"),
    ("/notiz", "cases"),
    ("/intern/meldung", "cases"),
    ("/intern/veranstaltungen", "events"),
    ("/veranstaltungen/", "events"),
    ("/intern/dgh", "dgh"),
    ("/dgh/", "dgh"),
    ("/intern/muelltermine", "waste"),
    ("/muelltermine/", "waste"),
    ("/intern/nachbarschaft", "moderation"),
    ("/intern/warnungen", "warnings"),
    ("/intern/push", "push"),
    ("/intern/nachrichten", "messages"),
    ("/intern/gemeindeseite", "content"),
    ("/gemeindeseite", "content"),
    ("/intern/inhalte", "content"),
    ("/intern/plattform", "content"),
)

NAVIGATION = (
    ("cockpit", "cockpit", "/intern/cockpit", "Cockpit", "read"),
    ("maengel", "maengel", "/intern/maengel", "Mängel", "cases"),
    ("veranstaltungen", "veranstaltungen", "/intern/veranstaltungen", "Termine", "events"),
    ("dgh", "dgh", "/intern/dgh", "DGH", "dgh"),
    ("muell", "muell", "/intern/muelltermine", "Müllabfuhr", "waste"),
    ("gemeindeseite", "gemeindeseite", "/intern/gemeindeseite", "Inhalte", "content"),
    ("warnungen", "warnungen", "/intern/warnungen", "Warnlage", "warnings"),
    ("push", "push", "/intern/push", "Push", "push"),
    ("nachrichten", "nachrichten", "/intern/nachrichten", "Nachrichten", "messages"),
    ("ideen", "ideen", "/intern/ideen", "Beteiligung", "moderation"),
    ("nachbarschaft", "ideen", "/intern/nachbarschaft", "Nachbarschaft", "moderation"),
    ("politik", "gemeindeseite", "/intern/politik", "Politik & Rat", "politics"),
    ("berichte", "berichte", "/intern/berichte", "Berichte", "reports"),
    ("audit", "berichte", "/intern/audit", "Audit", "audit"),
    ("versionen", "gemeindeseite", "/intern/inhalte/versionen", "Versionen", "content"),
    ("benutzer", "system", "/intern/benutzer", "Zugänge", "admin"),
    ("sicherung", "system", "/intern/sicherung", "Sicherung", "backup"),
    ("plattform", "system", "/intern/plattform", "Plattform", "content"),
    ("compliance", "system", "/intern/freigabe", "Freigabe", "compliance"),
    ("system", "system", "/intern/system", "System", "system"),
)


_CURRENT_ADMIN: ContextVar[dict | None] = ContextVar("current_admin", default=None)


def set_current_admin(admin: dict | None) -> None:
    _CURRENT_ADMIN.set(admin)


def current_admin() -> dict:
    return _CURRENT_ADMIN.get() or {"username": "", "display_name": "", "role": "superadmin"}


def required_permission(path: str) -> str:
    for prefix, permission in ROUTE_PERMISSIONS:
        if str(path or "").startswith(prefix):
            return permission
    return "read"


def can_access(role: str, permission: str, *, method: str = "GET") -> bool:
    permissions = ROLE_PERMISSIONS.get(str(role or ""), set())
    if "*" in permissions or permission in permissions:
        return True
    return method.upper() in {"GET", "HEAD"} and "read_all" in permissions and permission in READ_ONLY_PERMISSIONS


def visible_navigation(role: str) -> list[tuple[str, str, str, str, str]]:
    return [item for item in NAVIGATION if can_access(role, item[4], method="GET")]


def requires_two_factor(role: str) -> bool:
    return str(role or "") in REQUIRED_2FA_ROLES
