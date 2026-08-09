from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime
from typing import Iterable
from urllib.parse import urlsplit

import requests
from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint

from database import Base, SessionLocal, engine
from platform_runtime import get_platform_snapshot


class TranslationCache(Base):
    __tablename__ = "translation_cache"
    __table_args__ = (UniqueConstraint("source", "target", "text_hash", name="uq_translation_cache_segment"),)

    id = Column(Integer, primary_key=True)
    source = Column(String(12), nullable=False, index=True)
    target = Column(String(12), nullable=False, index=True)
    text_hash = Column(String(64), nullable=False, index=True)
    source_text = Column(Text, nullable=False)
    translated_text = Column(Text, nullable=False)
    provider = Column(String(120), default="libretranslate", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


def init_translation_db() -> None:
    Base.metadata.create_all(bind=engine)


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()


def _clean_segment(value: object, limit: int = 12000) -> str:
    text = str(value or "").replace("\x00", "")
    return text[:limit]


def _provider_urls() -> list[str]:
    cfg = get_platform_snapshot()
    urls = []
    for value in (
        os.getenv("TRANSLATION_API_URL", "").strip(),
        cfg.get("translation_api_url", ""),
        os.getenv("TRANSLATION_FALLBACK_URL", "").strip(),
        cfg.get("translation_fallback_url", ""),
    ):
        value = str(value or "").strip()
        if value.startswith("https://") and value not in urls:
            urls.append(value)
    return urls


def _split_long_text(text: str, maximum: int = 1750) -> list[str]:
    if len(text) <= maximum:
        return [text]
    chunks: list[str] = []
    remaining = text
    while len(remaining) > maximum:
        window = remaining[:maximum]
        cut = max(window.rfind(". "), window.rfind("! "), window.rfind("? "), window.rfind("; "), window.rfind(", "), window.rfind(" "))
        if cut < maximum // 3:
            cut = maximum
        else:
            cut += 1
        chunks.append(remaining[:cut])
        remaining = remaining[cut:]
    if remaining:
        chunks.append(remaining)
    return chunks


def _cache_get(source: str, target: str, text: str) -> str | None:
    digest = _hash(text)
    db = SessionLocal()
    try:
        row = (
            db.query(TranslationCache)
            .filter(TranslationCache.source == source)
            .filter(TranslationCache.target == target)
            .filter(TranslationCache.text_hash == digest)
            .first()
        )
        return row.translated_text if row else None
    finally:
        db.close()


def _cache_put(source: str, target: str, text: str, translated: str, provider: str) -> None:
    digest = _hash(text)
    db = SessionLocal()
    try:
        row = (
            db.query(TranslationCache)
            .filter(TranslationCache.source == source)
            .filter(TranslationCache.target == target)
            .filter(TranslationCache.text_hash == digest)
            .first()
        )
        if row:
            row.translated_text = translated
            row.provider = provider[:120]
            row.updated_at = datetime.utcnow()
        else:
            db.add(
                TranslationCache(
                    source=source[:12],
                    target=target[:12],
                    text_hash=digest,
                    source_text=text,
                    translated_text=translated,
                    provider=provider[:120],
                )
            )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _post_translate(url: str, texts: list[str], source: str, target: str) -> list[str]:
    payload = {
        "q": texts if len(texts) > 1 else texts[0],
        "source": source,
        "target": target,
        "format": "text",
        "alternatives": 0,
        "api_key": "",
    }
    response = requests.post(
        url,
        json=payload,
        headers={"Accept": "application/json", "User-Agent": "municipal-pwa-translation/1.0"},
        timeout=max(4, min(int(os.getenv("TRANSLATION_TIMEOUT", "14") or "14"), 30)),
    )
    response.raise_for_status()
    data = response.json()
    translated = data.get("translatedText") if isinstance(data, dict) else None
    if isinstance(translated, str):
        return [translated]
    if isinstance(translated, list):
        return [str(item or "") for item in translated]
    raise RuntimeError("Übersetzungsdienst lieferte keine translatedText-Antwort.")


def _provider_label(url: str) -> str:
    try:
        return urlsplit(url).netloc[:120] or "LibreTranslate"
    except Exception:
        return "LibreTranslate"


def translate_texts(texts: Iterable[object], target: str, source: str = "auto") -> dict:
    """Translate visible text segments with a free LibreTranslate-compatible API.

    Results are persisted in a local cache. If all external providers are
    temporarily unavailable, the original text is returned with degraded=True
    instead of breaking the citizen app.
    """
    init_translation_db()
    cfg = get_platform_snapshot()
    target = str(target or "").strip().casefold()
    source = str(source or "auto").strip().casefold() or "auto"
    supported = set(cfg.get("languages") or [])
    if target == "de":
        original = [_clean_segment(item) for item in texts]
        return {"translations": original, "provider": "original", "degraded": False, "cached": len(original)}
    if target not in supported:
        raise ValueError("Zielsprache ist für diese Plattform nicht freigeschaltet.")
    if not cfg.get("translation_enabled", True):
        raise RuntimeError("Automatische Übersetzung ist deaktiviert.")

    original = [_clean_segment(item) for item in texts]
    if len(original) > 80:
        raise ValueError("Zu viele Textsegmente in einer Anfrage.")
    if sum(len(item) for item in original) > 42000:
        raise ValueError("Übersetzungsanfrage ist zu groß.")

    result: list[str | None] = [None] * len(original)
    cached_count = 0
    missing: list[int] = []
    for index, text in enumerate(original):
        if not text.strip() or re.fullmatch(r"[\W\d_]+", text, flags=re.UNICODE):
            result[index] = text
            continue
        cached = _cache_get(source, target, text)
        if cached is not None:
            result[index] = cached
            cached_count += 1
        else:
            missing.append(index)

    provider_used = "cache" if missing == [] else ""
    degraded = False
    errors: list[str] = []

    for index in missing:
        text = original[index]
        pieces = _split_long_text(text)
        translated_pieces: list[str] = []
        success = False
        for url in _provider_urls():
            try:
                translated_pieces = []
                # Public free instances frequently impose conservative character
                # limits, therefore long DOM text is translated in safe chunks.
                for piece in pieces:
                    translated_pieces.extend(_post_translate(url, [piece], source, target))
                translated = "".join(translated_pieces)
                result[index] = translated
                provider_used = _provider_label(url)
                _cache_put(source, target, text, translated, provider_used)
                success = True
                break
            except Exception as error:
                errors.append(f"{_provider_label(url)}: {type(error).__name__}: {str(error)[:160]}")
        if not success:
            result[index] = text
            degraded = True

    return {
        "translations": [str(item if item is not None else original[i]) for i, item in enumerate(result)],
        "provider": provider_used or "nicht erreichbar",
        "degraded": degraded,
        "cached": cached_count,
        "errors": errors[-4:],
    }


def provider_status() -> dict:
    cfg = get_platform_snapshot()
    urls = _provider_urls()
    states = []
    for url in urls:
        base = url.rsplit("/translate", 1)[0]
        try:
            response = requests.get(base + "/languages", timeout=6, headers={"User-Agent": "municipal-pwa-translation/1.0"})
            response.raise_for_status()
            data = response.json()
            codes = [str(item.get("code") or "") for item in data if isinstance(item, dict)] if isinstance(data, list) else []
            states.append({"provider": _provider_label(url), "url": url, "status": "ok", "languages": codes})
        except Exception as error:
            states.append({"provider": _provider_label(url), "url": url, "status": "error", "detail": f"{type(error).__name__}: {str(error)[:180]}"})
    return {
        "enabled": bool(cfg.get("translation_enabled", True)),
        "configured_languages": cfg.get("languages") or [],
        "providers": states,
    }
