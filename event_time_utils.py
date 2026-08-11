from __future__ import annotations

import re


_TIME_VALUE = re.compile(r"^(?P<hour>\d{1,2})(?::?(?P<minute>\d{2}))?$")
_GERMAN_POSSESSIVE = re.compile(r"\b([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]*)'s\b")


def canonical_event_time(value: str | None) -> str:
    """Return a consistent German display/storage value such as ``18:30 Uhr``.

    Legacy values like ``18``, ``18Uhr``, ``18 Uhr``, ``18.30`` and ``1830``
    are accepted. Unknown text is kept unchanged instead of guessing.
    """
    original = str(value or "").strip()
    if not original:
        return ""

    compact = re.sub(r"\s+", "", original).lower()
    compact = compact.replace("uhr", "").replace(".", ":")

    # Plain one/two-digit hour.
    if compact.isdigit() and len(compact) <= 2:
        hour = int(compact)
        if 0 <= hour <= 23:
            return f"{hour:02d}:00 Uhr"

    # Four digits without separator, e.g. 1830.
    if compact.isdigit() and len(compact) == 4:
        hour = int(compact[:2])
        minute = int(compact[2:])
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return f"{hour:02d}:{minute:02d} Uhr"

    if ":" in compact:
        parts = compact.split(":", 1)
        if len(parts) == 2 and all(part.isdigit() for part in parts):
            hour, minute = int(parts[0]), int(parts[1])
            if 0 <= hour <= 23 and 0 <= minute <= 59:
                return f"{hour:02d}:{minute:02d} Uhr"

    return original


def time_input_value(value: str | None) -> str:
    """Convert any supported event time to the HTML ``type=time`` value."""
    canonical = canonical_event_time(value)
    match = re.fullmatch(r"(\d{2}):(\d{2}) Uhr", canonical)
    if not match:
        return ""
    return f"{match.group(1)}:{match.group(2)}"


def display_event_title(value: str | None) -> str:
    """Light display-only typography cleanup for German event titles."""
    text = str(value or "Veranstaltung").strip() or "Veranstaltung"
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    # German possessive normally has no apostrophe: "Liam's" -> "Liams".
    return _GERMAN_POSSESSIVE.sub(r"\1s", text)


def display_event_place(value: str | None) -> str:
    """Normalize only unambiguous, common DGH spellings/legacy typo."""
    text = str(value or "").strip()
    if text.casefold() in {"dgh", "dfh"}:
        return "DGH"
    return text
