from __future__ import annotations

import re
from html import unescape
from urllib.parse import quote

from ahnsen_history import history_content
from community_crud import get_civic_items, get_ideas, get_neighbor_posts
from gemeinde_crud import get_gemeinde_einstellungen
from veranstaltungen_crud import get_aktive_veranstaltungen
from platform_runtime import apply_static_branding, get_platform_snapshot
from ratsinfo_service import get_ratsinfo_snapshot


SERVICE_INDEX = [
    ("Mängel melden", "Straßenlaterne, Schlagloch, Müll, Spielplatz oder andere Schäden melden", "/mangel-melden", "service"),
    ("Mängelkarte", "Öffentliche Karte gemeldeter Schäden und Bearbeitungsstände", "/karte", "service"),
    ("DGH-Kalender", "Dorfgemeinschaftshaus freie Termine und Mietanfrage", "/dgh-mieten", "service"),
    ("Müllabfuhr", "Abfalltermine, Tonnen und Kalenderexport", "/muelltermine-info", "service"),
    ("Veranstaltungen", "Termine, Feste und Veranstaltungen in Ahnsen", "/veranstaltungen", "service"),
    ("Warnlage", "Amtliche Wetter- und Gefahrenwarnungen", "/warnungen", "service"),
    ("Bürgerinformationen", "Hinweise und Informationen der Gemeinde", "/buergerinformationen", "service"),
    ("Ansprechpartner", "Kontakte und Zuständigkeiten", "/ansprechpartner", "service"),
    ("Feuerwehr", "Feuerwehr Ahnsen, Sicherheit und Ehrenamt", "/feuerwehr", "service"),
    ("Vereine & Gruppen", "Vereine, Gemeinschaft und Dorfleben", "/vereine", "service"),
    ("Über Ahnsen", "Geschichte Ahnsens von den Anfängen bis heute", "/ueber-ahnsen", "service"),
    ("Politik & Rat", "Gemeinderat, Sitzungen, Beschlüsse und Bekanntmachungen", "/politik-rat", "service"),
    ("Ideen für Ahnsen", "Ideen einreichen, unterstützen und kommentieren", "/ideen", "service"),
    ("Nachbarschaftshilfe", "Hilfe suchen oder anbieten, Alltag und Gemeinschaft", "/nachbarschaft", "service"),
    ("Mein Ahnsen", "Persönliches Bürgerkonto, Meldungen, DGH und Einstellungen", "/profil", "service"),
    ("Nachrichten", "Persönlicher digitaler Briefkasten", "/nachrichten", "service"),
]


def _plain(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _score(query: str, title: str, text: str) -> int:
    words = [word for word in re.split(r"\W+", query.casefold()) if len(word) >= 2]
    hay_title = title.casefold()
    hay_text = text.casefold()
    score = 0
    for word in words:
        if word in hay_title:
            score += 8
        if word in hay_text:
            score += 3
    if query.casefold() in hay_title:
        score += 15
    if query.casefold() in hay_text:
        score += 6
    return score


def _snippet(text: str, query: str, length: int = 180) -> str:
    clean = _plain(text)
    lower = clean.casefold()
    terms = [part for part in re.split(r"\W+", query.casefold()) if part]
    positions = [lower.find(term) for term in terms if lower.find(term) >= 0]
    start = max(0, (min(positions) if positions else 0) - 55)
    snippet = clean[start : start + length]
    if start:
        snippet = "…" + snippet
    if start + length < len(clean):
        snippet += "…"
    return snippet


def intelligent_search(query: str, limit: int = 30) -> list[dict]:
    query = str(query or "").strip()[:120]
    if len(query) < 2:
        return []

    cfg = get_platform_snapshot()
    candidates: list[dict] = []
    for title, text, url, kind in SERVICE_INDEX:
        if url == "/ueber-ahnsen":
            url = "/ueber-gemeinde"
        candidates.append({"title": apply_static_branding(title, cfg), "text": apply_static_branding(text, cfg), "url": url, "kind": kind})

    settings = get_gemeinde_einstellungen()
    for key, title, url in (
        ("buergerinfo_text", "Bürgerinformationen", "/buergerinformationen"),
        ("ansprechpartner", "Ansprechpartner", "/ansprechpartner"),
        ("feuerwehr_text", "Feuerwehr Ahnsen", "/feuerwehr"),
        ("vereine", "Vereine & Gruppen", "/vereine"),
        ("aktuelles", "Aktuelles aus Ahnsen", "/aktuelles"),
    ):
        value = str(settings.get(key, "") or "")
        if value:
            candidates.append({"title": title, "text": value, "url": url, "kind": "information"})

    for event in get_aktive_veranstaltungen():
        title = str(getattr(event, "titel", "Veranstaltung") or "Veranstaltung")
        text = " ".join(str(getattr(event, field, "") or "") for field in ("beschreibung", "ort", "datum", "uhrzeit"))
        candidates.append({"title": title, "text": text, "url": "/veranstaltungen", "kind": "veranstaltung"})

    for item in get_civic_items(limit=100):
        candidates.append({
            "title": item.title,
            "text": f"{item.kind} {item.date_text} {item.location} {item.body}",
            "url": "/politik-rat",
            "kind": "politik",
        })

    ratsinfo = get_ratsinfo_snapshot(query=query)
    for meeting in ratsinfo.get("meetings") or []:
        agenda_text = " ".join(
            " ".join(
                [
                    str(point.get("number") or ""),
                    str(point.get("name") or ""),
                    str(point.get("result") or ""),
                    str(point.get("resolution_text") or ""),
                ]
            )
            for point in meeting.get("agenda") or []
        )
        document_text = " ".join(
            f"{document.get('kind', '')} {document.get('name', '')}"
            for document in meeting.get("documents") or []
        )
        candidates.append({
            "title": str(meeting.get("name") or "Ratssitzung"),
            "text": " ".join(
                [
                    str(meeting.get("organization") or ""),
                    str(meeting.get("date_label") or ""),
                    str(meeting.get("location") or ""),
                    document_text,
                    agenda_text,
                ]
            ),
            "url": f"/politik-rat?q={quote(query)}",
            "kind": "ratssitzung",
            "fixed_score": 12,
        })

    for row in get_ideas(limit=100):
        idea = row["idea"]
        candidates.append({
            "title": idea.title,
            "text": f"{idea.category} {idea.status} {idea.description}",
            "url": f"/ideen/{idea.id}",
            "kind": "idee",
        })

    for post, _user in get_neighbor_posts(limit=100):
        candidates.append({
            "title": post.title,
            "text": f"{post.kind} {post.category} {post.description}",
            "url": "/nachbarschaft",
            "kind": "nachbarschaft",
        })

    if cfg.get("history_mode") == "ahnsen" and cfg["municipality_name"].casefold() == "ahnsen":
        history = _plain(history_content())
        history_title = f"Geschichte {cfg['municipality_name']}s"
        history_score = _score(query, history_title, history)
        if history_score:
            candidates.append({
                "title": history_title,
                "text": _snippet(history, query, 300),
                "url": "/ueber-gemeinde",
                "kind": "geschichte",
                "fixed_score": history_score,
            })
    else:
        about = str(settings.get("ueber_ahnsen_text") or settings.get("ueber_ahnsen_seite_text") or "")
        if about:
            candidates.append({"title": f"Über {cfg['municipality_name']}", "text": about, "url": "/ueber-gemeinde", "kind": "information"})

    results = []
    for candidate in candidates:
        score = candidate.get("fixed_score") or _score(query, candidate["title"], candidate["text"])
        if score <= 0:
            continue
        results.append({
            "title": candidate["title"],
            "snippet": _snippet(candidate["text"], query),
            "url": candidate["url"],
            "kind": candidate["kind"],
            "score": score,
        })

    results.sort(key=lambda item: (-item["score"], item["title"].casefold()))
    seen = set()
    unique = []
    for item in results:
        marker = (item["title"], item["url"])
        if marker in seen:
            continue
        seen.add(marker)
        unique.append(item)
        if len(unique) >= limit:
            break
    return unique
