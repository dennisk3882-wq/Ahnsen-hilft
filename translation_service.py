from __future__ import annotations

import hashlib
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
        cut = max(
            window.rfind(". "),
            window.rfind("! "),
            window.rfind("? "),
            window.rfind("; "),
            window.rfind(", "),
            window.rfind(" "),
        )
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
    }
    api_key = os.getenv("TRANSLATION_API_KEY", "").strip()
    if api_key:
        payload["api_key"] = api_key

    response = requests.post(
        url,
        json=payload,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "municipal-pwa-translation/1.1",
        },
        timeout=max(4, min(int(os.getenv("TRANSLATION_TIMEOUT", "14") or "14"), 30)),
    )
    response.raise_for_status()
    data = response.json()
    translated = data.get("translatedText") if isinstance(data, dict) else None
    if isinstance(translated, str):
        if len(texts) != 1:
            raise RuntimeError("Übersetzungsdienst lieferte für einen Batch nur einen Text zurück.")
        return [translated]
    if isinstance(translated, list):
        values = [str(item or "") for item in translated]
        if len(values) != len(texts):
            raise RuntimeError("Übersetzungsdienst lieferte eine unvollständige Batch-Antwort.")
        return values
    raise RuntimeError("Übersetzungsdienst lieferte keine translatedText-Antwort.")


def _provider_label(url: str) -> str:
    try:
        return urlsplit(url).netloc[:120] or "LibreTranslate"
    except Exception:
        return "LibreTranslate"


def _translation_batches(indexes: list[int], original: list[str], *, max_items: int = 18, max_chars: int = 11000):
    """Create conservative LibreTranslate batches without splitting DOM segments."""
    batch: list[int] = []
    chars = 0
    for index in indexes:
        text = original[index]
        if len(text) > 1750:
            if batch:
                yield batch
                batch = []
                chars = 0
            yield [index]
            continue
        if batch and (len(batch) >= max_items or chars + len(text) > max_chars):
            yield batch
            batch = []
            chars = 0
        batch.append(index)
        chars += len(text)
    if batch:
        yield batch


def _translate_batch_with_provider(
    url: str,
    indexes: list[int],
    original: list[str],
    source: str,
    target: str,
) -> dict[int, str]:
    """Translate one logical batch, splitting only exceptionally long segments."""
    if len(indexes) == 1 and len(original[indexes[0]]) > 1750:
        index = indexes[0]
        pieces = _split_long_text(original[index])
        translated_pieces: list[str] = []
        for piece in pieces:
            translated_pieces.extend(_post_translate(url, [piece], source, target))
        return {index: "".join(translated_pieces)}

    texts = [original[index] for index in indexes]
    translated = _post_translate(url, texts, source, target)
    return {index: translated[position] for position, index in enumerate(indexes)}


def translate_texts(texts: Iterable[object], target: str, source: str = "auto") -> dict:
    """Translate visible text segments with LibreTranslate-compatible providers.

    Results are persisted in a local cache. Missing segments are sent as real
    batches instead of one HTTP request per DOM text node. This is substantially
    faster and avoids unnecessarily exhausting public-provider rate limits.
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

    provider_used = "cache" if not missing else ""
    errors: list[str] = []
    pending = list(missing)

    # Try each configured provider only for segments that the previous provider
    # could not translate. One failing batch therefore does not discard already
    # successful translations.
    for url in _provider_urls():
        if not pending:
            break
        label = _provider_label(url)
        next_pending: list[int] = []
        for indexes in _translation_batches(pending, original):
            try:
                values = _translate_batch_with_provider(url, indexes, original, source, target)
                for index, translated in values.items():
                    result[index] = translated
                    _cache_put(source, target, original[index], translated, label)
                provider_used = label
            except Exception as error:
                next_pending.extend(indexes)
                errors.append(f"{label}: {type(error).__name__}: {str(error)[:160]}")
        pending = next_pending

    for index in pending:
        result[index] = original[index]

    return {
        "translations": [str(item if item is not None else original[i]) for i, item in enumerate(result)],
        "provider": provider_used or "nicht erreichbar",
        "degraded": bool(pending),
        "cached": cached_count,
        "failed": len(pending),
        "errors": errors[-6:],
    }


def provider_status() -> dict:
    cfg = get_platform_snapshot()
    urls = _provider_urls()
    states = []
    for url in urls:
        base = url.rsplit("/translate", 1)[0]
        try:
            response = requests.get(
                base + "/languages",
                timeout=6,
                headers={"User-Agent": "municipal-pwa-translation/1.1"},
            )
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
