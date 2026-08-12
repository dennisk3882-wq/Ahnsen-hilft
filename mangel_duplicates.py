from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from difflib import SequenceMatcher

from database import SessionLocal
from models import Meldung


GPS_PATTERN = re.compile(
    r"GPS-Position:\s*(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)",
    re.IGNORECASE,
)
WORD_PATTERN = re.compile(r"[a-z0-9äöüß]+", re.IGNORECASE)
WARNING_THRESHOLD = 66
HIGH_CONFIDENCE_THRESHOLD = 82
LOOKBACK_DAYS = 180

STOPWORDS = {
    "der", "die", "das", "ein", "eine", "einer", "einem", "einen", "und", "oder",
    "ist", "sind", "war", "wurde", "bei", "an", "am", "im", "in", "auf", "vor", "von",
    "zu", "zum", "zur", "hier", "dort", "seit", "schon", "bitte", "mangel", "problem",
    "kaputt", "defekt", "beschädigt", "beschaedigt",
}

SYNONYM_GROUPS = (
    {"laterne", "straßenlaterne", "strassenlaterne", "lampe", "beleuchtung", "licht"},
    {"schlagloch", "loch", "fahrbahn", "straße", "strasse", "straßenschaden", "strassenschaden"},
    {"müll", "muell", "müllablagerung", "muellablagerung", "abfall", "unrat"},
    {"schild", "straßenschild", "strassenschild", "verkehrsschild"},
    {"spielplatz", "grünfläche", "gruenflaeche", "rasen", "park"},
)


@dataclass(frozen=True)
class DuplicateMatch:
    ticket: str
    score: int
    art: str
    ort: str
    status: str
    beschreibung: str
    distance_m: float | None
    reasons: tuple[str, ...]

    def as_dict(self) -> dict:
        return {
            "ticket": self.ticket,
            "score": self.score,
            "art": self.art,
            "ort": self.ort,
            "status": self.status,
            "beschreibung": self.beschreibung[:220],
            "distance_m": round(self.distance_m, 1) if self.distance_m is not None else None,
            "reasons": list(self.reasons),
        }


def _normalize_text(value: str | None) -> str:
    text = str(value or "").casefold()
    text = text.replace("ß", "ss")
    text = re.sub(r"gps-position:.*", " ", text, flags=re.IGNORECASE | re.DOTALL)
    words = []
    for token in WORD_PATTERN.findall(text):
        token = token.casefold().replace("ß", "ss")
        if token in STOPWORDS or len(token) <= 1:
            continue
        canonical = token
        for group in SYNONYM_GROUPS:
            normalized_group = {item.casefold().replace("ß", "ss") for item in group}
            if token in normalized_group:
                canonical = sorted(normalized_group)[0]
                break
        words.append(canonical)
    return " ".join(words)


def _token_similarity(left: str, right: str) -> float:
    a = set(_normalize_text(left).split())
    b = set(_normalize_text(right).split())
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _sequence_similarity(left: str, right: str) -> float:
    a = _normalize_text(left)
    b = _normalize_text(right)
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _combined_text_similarity(left: str, right: str) -> float:
    return max(_sequence_similarity(left, right), _token_similarity(left, right))


def _parse_coordinates(description: str | None, latitude: str | None = None, longitude: str | None = None):
    if latitude and longitude:
        try:
            return float(str(latitude).replace(",", ".")), float(str(longitude).replace(",", "."))
        except (TypeError, ValueError):
            pass
    match = GPS_PATTERN.search(str(description or ""))
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", ".")), float(match.group(2).replace(",", "."))
    except ValueError:
        return None


def _distance_m(left, right) -> float | None:
    if not left or not right:
        return None
    lat1, lon1 = map(math.radians, left)
    lat2, lon2 = map(math.radians, right)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))


def _category_score(left: str, right: str) -> tuple[int, str | None]:
    a = _normalize_text(left)
    b = _normalize_text(right)
    if a and b and a == b:
        return 28, "gleiche Kategorie"
    sim = _combined_text_similarity(left, right)
    if sim >= 0.68:
        return 16, "ähnliche Kategorie"
    return 0, None


def _location_score(new_ort: str, old_ort: str, distance: float | None) -> tuple[int, str | None]:
    if distance is not None:
        if distance <= 30:
            return 38, f"nur {int(round(distance))} m entfernt"
        if distance <= 75:
            return 31, f"nur {int(round(distance))} m entfernt"
        if distance <= 150:
            return 23, f"{int(round(distance))} m entfernt"
        if distance <= 300:
            return 10, f"{int(round(distance))} m entfernt"
        return 0, None

    similarity = _combined_text_similarity(new_ort, old_ort)
    if similarity >= 0.9:
        return 30, "gleicher Ort"
    if similarity >= 0.72:
        return 23, "sehr ähnlicher Ort"
    if similarity >= 0.52:
        return 13, "ähnlicher Ort"
    return 0, None


def _description_score(left: str, right: str) -> tuple[int, str | None]:
    similarity = _combined_text_similarity(left, right)
    if similarity >= 0.82:
        return 30, "sehr ähnliche Beschreibung"
    if similarity >= 0.62:
        return 24, "ähnliche Beschreibung"
    if similarity >= 0.42:
        return 15, "inhaltliche Überschneidung"
    if similarity >= 0.28:
        return 7, "teilweise ähnliche Beschreibung"
    return 0, None


def score_candidate(*, art: str, ort: str, beschreibung: str, latitude: str = "", longitude: str = "", candidate: Meldung) -> DuplicateMatch:
    score = 0
    reasons: list[str] = []

    category_points, category_reason = _category_score(art, candidate.art or "")
    score += category_points
    if category_reason:
        reasons.append(category_reason)

    new_coords = _parse_coordinates(beschreibung, latitude, longitude)
    old_coords = _parse_coordinates(candidate.beschreibung)
    distance = _distance_m(new_coords, old_coords)
    location_points, location_reason = _location_score(ort, candidate.ort or "", distance)
    score += location_points
    if location_reason:
        reasons.append(location_reason)

    description_points, description_reason = _description_score(beschreibung, candidate.beschreibung or "")
    score += description_points
    if description_reason:
        reasons.append(description_reason)

    if candidate.status == "In Bearbeitung":
        score += 3
        reasons.append("bereits in Bearbeitung")

    age_days = max(0, (datetime.utcnow() - (candidate.erstellt_am or datetime.utcnow())).days)
    if age_days <= 14:
        score += 4
    elif age_days > 90:
        score -= 5

    # False-positive guard: category alone or vague text alone must never trigger.
    if location_points < 10 and description_points < 15:
        score = min(score, 55)
    if category_points == 0 and location_points < 23:
        score = min(score, 60)

    return DuplicateMatch(
        ticket=candidate.ticket,
        score=max(0, min(int(round(score)), 100)),
        art=candidate.art or "",
        ort=candidate.ort or "",
        status=candidate.status or "Offen",
        beschreibung=candidate.beschreibung or "",
        distance_m=distance,
        reasons=tuple(reasons),
    )


def find_duplicate_matches(*, art: str, ort: str, beschreibung: str, latitude: str = "", longitude: str = "", exclude_ticket: str = "", limit: int = 3) -> list[DuplicateMatch]:
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(days=LOOKBACK_DAYS)
        query = (
            db.query(Meldung)
            .filter(Meldung.status != "Erledigt")
            .filter(Meldung.erstellt_am >= cutoff)
        )
        if exclude_ticket:
            query = query.filter(Meldung.ticket != exclude_ticket)
        candidates = query.order_by(Meldung.erstellt_am.desc()).limit(250).all()
        matches = [
            score_candidate(
                art=art,
                ort=ort,
                beschreibung=beschreibung,
                latitude=latitude,
                longitude=longitude,
                candidate=candidate,
            )
            for candidate in candidates
        ]
        matches = [match for match in matches if match.score >= 45]
        matches.sort(key=lambda item: item.score, reverse=True)
        return matches[: max(1, min(limit, 10))]
    finally:
        db.close()
