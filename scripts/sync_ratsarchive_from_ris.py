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
CURRENT_TERM_START = "2021-11-01"
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
            visible = _normalize_space(await item.inner_text())
            title = _normalize_space(await item.get_attribute("title") or "")
            aria = _normalize_space(await item.get_attribute("aria-label") or "")
            label = visible or aria or title
            href = await item.get_attribute("href")
            if not href:
                continue
            result.append({"label": label, "visible": visible, "title": title, "aria": aria, "url": urljoin(page.url, href)})
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
        toolbar = page.locator(".sstfc-toolbar-title")
        toolbar_text = await toolbar.first.inner_text() if await toolbar.count() else body
        title_match = re.search(r"\b(20\d{2})\b", toolbar_text)
        visible_year = int(title_match.group(1)) if title_match else datetime.now().year - year_index

        for anchor in await _anchors(page):
            label = anchor["label"]
            if ORGANIZATION.casefold() not in label.casefold() or "/tops/" not in anchor["url"]:
                continue
            session_match = SESSION_RE.search(label)
            date_match = DATE_RE.search(label)
            if not session_match or not date_match:
                continue
            date_iso = _iso_date(date_match.group(0))
            if not date_iso.startswith(str(visible_year)):
                continue
            # The current Ahnsen council term starts in November 2021. This keeps
            # the requested sessions 1..18 while future terms continue naturally.
            if date_iso < CURRENT_TERM_START:
                continue
            time_match = TIME_RE.search(label)
            key = f"{date_iso}:{session_match.group(1)}"
            found[key] = {
                "session_number": int(session_match.group(1)),
                "date": date_iso,
                "time": time_match.group(1) if time_match else "",
                "source_page": anchor["url"],
                "list_label": label,
                "ris_status": "Niederschrift" if "status niederschrift" in label.casefold() else "Sitzung",
            }

        if year_index < years - 1:
            await _click_previous_year(page)

    return sorted(found.values(), key=lambda item: (item["date"], item["session_number"]), reverse=True)


async def _read_meeting(context, meeting: dict) -> dict:
    page = await context.new_page()
    try:
        await page.goto(meeting["source_page"], wait_until="domcontentloaded", timeout=40000)
        await page.wait_for_timeout(800)
        body = await page.locator("body").inner_text()
        if ORGANIZATION.casefold() not in body.casefold():
            raise RuntimeError("Sitzungsseite konnte nicht eindeutig dem Gemeinderat Ahnsen zugeordnet werden")

        session = int(meeting["session_number"])
        date_iso = meeting["date"]
        date_label = datetime.fromisoformat(date_iso).strftime("%d.%m.%Y")
        base_item = {
            "session_number": session,
            "date": date_iso,
            "time": meeting.get("time", ""),
            "title": f"Gemeinderat Ahnsen, {session}. Sitzung",
            "organization": ORGANIZATION,
            "location": _extract_location(body),
            "summary": (
                f"Amtliche Sitzung des Gemeinderates Ahnsen vom {date_label}. "
                "Das Ratsinformationssystem führt die Sitzung im Status Niederschrift; "
                "ein separater öffentlicher PDF-Download der Niederschrift wird dort derzeit nicht ausgegeben."
            ),
            "source_page": meeting["source_page"],
            "source_pdf": "",
            "published_on": "",
            "filename": "",
            "sha256": "",
            "size_bytes": 0,
            "minutes_status": "listed_without_public_pdf",
        }

        minutes = []
        for anchor in await _anchors(page):
            combined_label = " ".join(filter(None, (anchor.get("label"), anchor.get("visible"), anchor.get("title"), anchor.get("aria"))))
            url = anchor["url"]
            if "niederschrift" not in combined_label.casefold():
                continue
            if "/sdnetrim/" not in url or ".pdf" not in url.lower():
                continue
            minutes.append({"label": _normalize_space(combined_label), "url": url})
        if not minutes:
            return base_item

        # SD.NET may expose more than one public revision. Prefer the last entry.
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

        published_on = _published_iso(document["label"])
        base_item.update(
            {
                "title": f"Öffentliche Niederschrift der {session}. Sitzung des Gemeinderates Ahnsen",
                "summary": (
                    f"Amtliche öffentliche Niederschrift der {session}. Sitzung des Gemeinderates Ahnsen "
                    f"vom {date_label}. Original-PDF aus dem Ratsinformationssystem der Samtgemeinde Eilsen."
                    + (
                        f" Dort am {datetime.fromisoformat(published_on).strftime('%d.%m.%Y')} veröffentlicht bzw. aktualisiert."
                        if published_on
                        else ""
                    )
                ),
                "source_pdf": document["url"],
                "published_on": published_on,
                "filename": f"{date_iso}_niederschrift_gemeinderat_ahnsen_sitzung_{session}.pdf",
                "sha256": hashlib.sha256(data).hexdigest(),
                "size_bytes": len(data),
                "minutes_status": "public_pdf_archived",
                "_data": data,
            }
        )
        return base_item
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


def _preserve_existing_pdf(item: dict, existing: dict | None) -> dict:
    if item.get("filename") or not existing or not existing.get("filename"):
        return item
    old_path = SEED_DIR / str(existing["filename"])
    if not old_path.exists() or not old_path.read_bytes().startswith(b"%PDF-"):
        return item
    merged = dict(item)
    for key in ("source_pdf", "published_on", "filename", "sha256", "size_bytes", "minutes_status"):
        merged[key] = existing.get(key, merged.get(key))
    merged["title"] = existing.get("title") or merged["title"]
    merged["summary"] = existing.get("summary") or merged["summary"]
    return merged


async def run(years: int) -> int:
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    existing_manifest = _load_existing_manifest()
    existing = {
        f"{item.get('date')}:{item.get('session_number')}": dict(item)
        for item in existing_manifest.get("meetings", [])
        if item.get("date") and item.get("session_number") is not None
    }
    merged = dict(existing)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=False, args=["--disable-dev-shm-usage"])
        context = await browser.new_context(locale="de-DE", viewport={"width": 1440, "height": 1100})
        entry = await context.new_page()
        await entry.goto(BASE_URL, wait_until="domcontentloaded", timeout=45000)
        await _wait_for_public_page(entry)

        meetings = await _collect_meeting_links(entry, years)
        if not meetings:
            raise RuntimeError("Keine Ahnsener Sitzungen gefunden; vorhandenes Archiv bleibt unverändert.")

        downloaded = 0
        errors = []
        for meeting in meetings:
            key = f"{meeting['date']}:{meeting['session_number']}"
            try:
                item = await _read_meeting(context, meeting)
            except Exception as error:
                print(f"WARN session {meeting.get('session_number')} {meeting.get('date')}: {error}")
                errors.append({"session": meeting.get("session_number"), "date": meeting.get("date"), "reason": str(error)[:160]})
                continue

            item = _preserve_existing_pdf(item, existing.get(key))
            data = item.pop("_data", None)
            if data is not None and item.get("filename"):
                target = SEED_DIR / str(item["filename"])
                if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != item["sha256"]:
                    target.write_bytes(data)
                downloaded += 1
            merged[key] = item

        await browser.close()

    # Current-term records are authoritative from the public annual list. Old
    # pre-November-2021 records are intentionally excluded from this PWA view.
    valid_keys = {f"{meeting['date']}:{meeting['session_number']}" for meeting in meetings}
    merged = {key: value for key, value in merged.items() if key in valid_keys}

    manifest = {
        "schema_version": 2,
        "source": BASE_URL,
        "organization": ORGANIZATION,
        "current_term_start": CURRENT_TERM_START,
        "meetings": sorted(merged.values(), key=lambda item: (item.get("date", ""), int(item.get("session_number") or 0)), reverse=True),
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    with_pdf = sum(1 for item in manifest["meetings"] if item.get("filename"))
    print(
        f"RIS-Sync: {len(meetings)} Sitzungen im aktuellen Ratszeitraum, "
        f"{with_pdf} mit lokal archiviertem öffentlichen PDF, {downloaded} PDF-Abrufe in diesem Lauf."
    )
    print("Sitzungsnummern:", [item.get("session_number") for item in manifest["meetings"]])
    if errors:
        print("Temporäre Fehler:", json.dumps(errors, ensure_ascii=False))
    return downloaded


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", type=int, default=6, help="Anzahl Kalenderjahre inklusive aktuellem Jahr")
    args = parser.parse_args()
    asyncio.run(run(max(1, min(args.years, 10))))


if __name__ == "__main__":
    main()
