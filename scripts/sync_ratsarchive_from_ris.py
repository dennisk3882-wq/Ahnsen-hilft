from __future__ import annotations

import argparse
import asyncio
import hashlib
import io
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

from playwright.async_api import async_playwright
from pypdf import PdfReader


BASE_URL = "https://samtgemeinde-eilsen.ratsinfomanagement.net/"
ORGANIZATION = "Gemeinderat Ahnsen"
SEED_DIR = Path(__file__).resolve().parents[1] / "static" / "ratsarchive-seed"
MANIFEST_PATH = SEED_DIR / "manifest.json"

SESSION_RE = re.compile(r"Gemeinderat\s+Ahnsen,\s*(\d+)\.\s*Sitzung", re.I)
DATE_RE = re.compile(r"\b(\d{2})\.(\d{2})\.(20\d{2})\b")
TIME_RE = re.compile(r"\b(\d{2}:\d{2})\s*Uhr\b")
PUBLISHED_RE = re.compile(r"(?:exportiert|aktualisiert):\s*(\d{2}\.\d{2}\.20\d{2})", re.I)


def _pdf_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages[:150])[:700_000]
    except Exception:
        return ""


def _iso_date(text: str) -> str:
    match = DATE_RE.search(text or "")
    if not match:
        return ""
    day, month, year = match.groups()
    return f"{year}-{month}-{day}"


def _published_iso(label: str) -> str:
    match = PUBLISHED_RE.search(label or "")
    return _iso_date(match.group(1)) if match else ""


def _normalize_space(value: str) -> str:
    return " ".join(str(value or "").split())


def _extract_location(page_text: str) -> str:
    text = str(page_text or "")
    marker = re.search(r"(?:^|\n)Ort:\s*([^\n]*)", text, re.I)
    if not marker:
        return "Dorfgemeinschaftshaus Ahnsen, 31708 Ahnsen"
    first = _normalize_space(marker.group(1))
    tail = text[marker.end():].splitlines()
    parts = [first] if first else []
    for raw in tail[:6]:
        line = _normalize_space(raw)
        if not line:
            continue
        if re.match(r"^(Einladung|Niederschriften|Sitzungspaket|Tagesordnungspunkte):", line, re.I):
            break
        parts.append(line)
        if len(parts) >= 3:
            break
    compact = []
    for part in parts:
        if part and part not in compact:
            compact.append(part)
    return ", ".join(compact)[:240] or "Dorfgemeinschaftshaus Ahnsen, 31708 Ahnsen"


async def _wait_for_public_page(page) -> None:
    for _ in range(20):
        await page.wait_for_timeout(2000)
        title = await page.title()
        if "Browser-Überprüfung" not in title and "Temporarily Blocked" not in title:
            return
    raise RuntimeError("Die öffentliche Browserprüfung des Ratsinformationssystems wurde nicht abgeschlossen.")


async def _anchors(page) -> list[dict]:
    result = []
    for index in range(await page.locator("a[href]").count()):
        item = page.locator("a[href]").nth(index)
        try:
            label = _normalize_space(await item.inner_text())
            href = await item.get_attribute("href")
            if not href:
                continue
            result.append({"label": label, "url": urljoin(page.url, href)})
        except Exception:
            continue
    return result


async def _click_previous_year(page) -> None:
    selectors = (
        ".sstfc-prev-button",
        "button.sstfc-prev-button",
        "button[title*='vorher' i]",
        "button[aria-label*='vorher' i]",
        "button[title*='previous' i]",
        "button[aria-label*='previous' i]",
    )
    for selector in selectors:
        locator = page.locator(selector)
        if await locator.count():
            try:
                await locator.first.click(timeout=6000)
                await page.wait_for_timeout(1200)
                return
            except Exception:
                pass
    raise RuntimeError("Jahresnavigation des Ratsinformationssystems konnte nicht bedient werden.")


async def _collect_meeting_links(page, years: int) -> list[dict]:
    await page.goto(urljoin(BASE_URL, "termine"), wait_until="domcontentloaded", timeout=45000)
    await page.wait_for_timeout(1500)
    try:
        await page.get_by_text("Jahresliste", exact=True).first.click(timeout=7000)
        await page.wait_for_timeout(1400)
    except Exception as error:
        raise RuntimeError(f"Jahresliste konnte nicht geöffnet werden: {error}") from error

    found: dict[str, dict] = {}
    for year_index in range(max(1, years)):
        body = await page.locator("body").inner_text()
        title_match = re.search(r"\b(20\d{2})\b", (await page.locator(".sstfc-toolbar-title").first.inner_text()) if await page.locator(".sstfc-toolbar-title").count() else body)
        visible_year = int(title_match.group(1)) if title_match else datetime.now().year - year_index

        for anchor in await _anchors(page):
            label = anchor["label"]
            if ORGANIZATION.casefold() not in label.casefold():
                continue
            if "/tops/" not in anchor["url"]:
                continue
            session_match = SESSION_RE.search(label)
            date_match = DATE_RE.search(label)
            if not session_match or not date_match:
                continue
            date_iso = _iso_date(date_match.group(0))
            if not date_iso.startswith(str(visible_year)):
                continue
            time_match = TIME_RE.search(label)
            key = f"{date_iso}:{session_match.group(1)}"
            found[key] = {
                "session_number": int(session_match.group(1)),
                "date": date_iso,
                "time": time_match.group(1) if time_match else "",
                "source_page": anchor["url"],
                "list_label": label,
            }

        if year_index < years - 1:
            await _click_previous_year(page)

    return sorted(found.values(), key=lambda item: (item["date"], item["session_number"]), reverse=True)


async def _read_meeting(context, meeting: dict) -> dict | None:
    page = await context.new_page()
    try:
        await page.goto(meeting["source_page"], wait_until="domcontentloaded", timeout=40000)
        await page.wait_for_timeout(800)
        body = await page.locator("body").inner_text()
        if ORGANIZATION.casefold() not in body.casefold():
            return None

        minutes = []
        for anchor in await _anchors(page):
            label = anchor["label"]
            url = anchor["url"]
            if "niederschrift" not in label.casefold():
                continue
            if "/sdnetrim/" not in url or not url.lower().endswith(".pdf"):
                continue
            if "öffentlich" not in label.casefold() and "oeffentlich" not in label.casefold():
                continue
            minutes.append(anchor)
        if not minutes:
            return None

        # SD.NET may expose more than one revision. Prefer the last public entry.
        document = minutes[-1]
        response = await context.request.get(document["url"], timeout=35000)
        if not response.ok:
            raise RuntimeError(f"PDF-Abruf HTTP {response.status}")
        data = await response.body()
        if not data.startswith(b"%PDF-"):
            raise RuntimeError("Niederschrift ist keine PDF-Datei")
        if len(data) > 25 * 1024 * 1024:
            raise RuntimeError("Niederschrift überschreitet 25 MB")

        extracted = _pdf_text(data)
        folded = extracted.casefold()
        if "ahnsen" not in folded or ("gemeinderat" not in folded and ORGANIZATION.casefold() not in body.casefold()):
            raise RuntimeError("PDF-Inhalt konnte nicht eindeutig Ahnsen zugeordnet werden")

        session = int(meeting["session_number"])
        date_iso = meeting["date"]
        canonical_filename = f"{date_iso}_niederschrift_gemeinderat_ahnsen_sitzung_{session}.pdf"
        published_on = _published_iso(document["label"])
        title = f"Öffentliche Niederschrift der {session}. Sitzung des Gemeinderates Ahnsen"
        summary = (
            f"Amtliche öffentliche Niederschrift der {session}. Sitzung des Gemeinderates Ahnsen "
            f"vom {datetime.fromisoformat(date_iso).strftime('%d.%m.%Y')}. "
            "Original-PDF aus dem Ratsinformationssystem der Samtgemeinde Eilsen."
        )
        if published_on:
            summary += f" Dort am {datetime.fromisoformat(published_on).strftime('%d.%m.%Y')} veröffentlicht bzw. aktualisiert."

        return {
            "session_number": session,
            "date": date_iso,
            "time": meeting.get("time", ""),
            "title": title,
            "organization": ORGANIZATION,
            "location": _extract_location(body),
            "summary": summary,
            "source_page": meeting["source_page"],
            "source_pdf": document["url"],
            "published_on": published_on,
            "filename": canonical_filename,
            "sha256": hashlib.sha256(data).hexdigest(),
            "size_bytes": len(data),
            "_data": data,
        }
    finally:
        await page.close()


def _load_existing_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        return {"schema_version": 1, "source": BASE_URL, "organization": ORGANIZATION, "meetings": []}
    try:
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("meetings"), list):
            return data
    except Exception:
        pass
    return {"schema_version": 1, "source": BASE_URL, "organization": ORGANIZATION, "meetings": []}


async def run(years: int) -> int:
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    existing = _load_existing_manifest()
    merged = {
        f"{item.get('date')}:{item.get('session_number')}": dict(item)
        for item in existing.get("meetings", [])
        if item.get("date") and item.get("session_number") is not None
    }

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=False, args=["--disable-dev-shm-usage"])
        context = await browser.new_context(locale="de-DE", viewport={"width": 1440, "height": 1100})
        entry = await context.new_page()
        await entry.goto(BASE_URL, wait_until="domcontentloaded", timeout=45000)
        await _wait_for_public_page(entry)

        meetings = await _collect_meeting_links(entry, years)
        if not meetings:
            raise RuntimeError("Keine Ahnsener Sitzungen gefunden; vorhandenes Archiv bleibt unverändert.")

        imported = 0
        for meeting in meetings:
            try:
                item = await _read_meeting(context, meeting)
            except Exception as error:
                print(f"WARN session {meeting.get('session_number')} {meeting.get('date')}: {error}")
                continue
            if not item:
                continue
            data = item.pop("_data")
            target = SEED_DIR / item["filename"]
            if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != item["sha256"]:
                target.write_bytes(data)
            merged[f"{item['date']}:{item['session_number']}"] = item
            imported += 1

        await browser.close()

    manifest = {
        "schema_version": 1,
        "source": BASE_URL,
        "organization": ORGANIZATION,
        "meetings": sorted(merged.values(), key=lambda item: (item.get("date", ""), int(item.get("session_number") or 0)), reverse=True),
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"RIS-Sync: {len(meetings)} Sitzungen gefunden, {imported} öffentliche Niederschriften geladen, {len(manifest['meetings'])} im Manifest.")
    print("Sitzungsnummern:", [item.get("session_number") for item in manifest["meetings"]])
    return imported


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", type=int, default=6, help="Anzahl Kalenderjahre inklusive aktuellem Jahr")
    args = parser.parse_args()
    asyncio.run(run(max(1, min(args.years, 10))))


if __name__ == "__main__":
    main()
