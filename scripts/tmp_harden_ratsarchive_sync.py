from pathlib import Path

sync_path = Path('scripts/sync_ratsarchive_from_ris.py')
sync = sync_path.read_text(encoding='utf-8')

sync = sync.replace(
'''def _pdf_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\\n".join((page.extract_text() or "") for page in reader.pages[:150])[:700_000]
    except Exception:
        return ""
''',
'''def _pdf_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\\n".join((page.extract_text() or "") for page in reader.pages[:150])[:700_000]
    except Exception:
        return ""


def _text_sha256(text: str) -> str:
    normalized = " ".join(str(text or "").casefold().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest() if normalized else ""
''')

sync = sync.replace(
'''            "sha256": "",
            "size_bytes": 0,
            "minutes_status": "listed_without_public_pdf",
''',
'''            "sha256": "",
            "text_sha256": "",
            "size_bytes": 0,
            "minutes_status": "listed_without_public_pdf",
''')

sync = sync.replace(
'''                "sha256": hashlib.sha256(data).hexdigest(),
                "size_bytes": len(data),
                "minutes_status": "public_pdf_archived",
''',
'''                "sha256": hashlib.sha256(data).hexdigest(),
                "text_sha256": _text_sha256(extracted),
                "size_bytes": len(data),
                "minutes_status": "public_pdf_archived",
''')

needle = '''def _preserve_existing_pdf(item: dict, existing: dict | None) -> dict:
    if item.get("filename") or not existing or not existing.get("filename"):
        return item
'''
replacement = '''def _preserve_identical_official_pdf(item: dict, existing: dict | None) -> dict:
    """Ignore SD.NET binary regeneration when the extracted protocol text is unchanged."""
    if not item.get("_data") or not existing or existing.get("minutes_status") != "public_pdf_archived":
        return item
    old_filename = str(existing.get("filename") or "")
    if not old_filename:
        return item
    old_path = SEED_DIR / old_filename
    if not old_path.exists() or not old_path.read_bytes().startswith(b"%PDF-"):
        return item
    old_text_hash = str(existing.get("text_sha256") or "")
    if not old_text_hash:
        old_text_hash = _text_sha256(_pdf_text(old_path.read_bytes()))
    new_text_hash = str(item.get("text_sha256") or "")
    if not old_text_hash or old_text_hash != new_text_hash:
        return item

    stable = dict(item)
    stable.pop("_data", None)
    for key in ("filename", "sha256", "size_bytes", "source_pdf"):
        stable[key] = existing.get(key, stable.get(key))
    stable["text_sha256"] = old_text_hash
    return stable


def _preserve_existing_pdf(item: dict, existing: dict | None) -> dict:
    if item.get("filename") or not existing or not existing.get("filename"):
        return item
'''
assert needle in sync, 'preserve_existing_pdf anchor missing'
sync = sync.replace(needle, replacement)

sync = sync.replace(
'''    for key in ("source_pdf", "published_on", "filename", "sha256", "size_bytes", "minutes_status"):
        merged[key] = existing.get(key, merged.get(key))
''',
'''    for key in ("source_pdf", "published_on", "filename", "sha256", "text_sha256", "size_bytes", "minutes_status"):
        merged[key] = existing.get(key, merged.get(key))
''')

sync = sync.replace(
'''            "sha256": hashlib.sha256(data).hexdigest(),
            "size_bytes": len(data),
            "minutes_status": "legacy_local_pdf",
''',
'''            "sha256": hashlib.sha256(data).hexdigest(),
            "text_sha256": _text_sha256(_pdf_text(data)),
            "size_bytes": len(data),
            "minutes_status": "legacy_local_pdf",
''')

sync = sync.replace(
'''            item = _preserve_existing_pdf(item, existing.get(key))
            item = _attach_bundled_legacy_pdf(item)
''',
'''            item = _preserve_identical_official_pdf(item, existing.get(key))
            item = _preserve_existing_pdf(item, existing.get(key))
            item = _attach_bundled_legacy_pdf(item)
''')

assert 'def _text_sha256' in sync
assert 'def _preserve_identical_official_pdf' in sync
assert '"text_sha256": _text_sha256(extracted)' in sync
sync_path.write_text(sync, encoding='utf-8')
