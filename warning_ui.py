from __future__ import annotations

from datetime import datetime
from html import escape

from fastapi.responses import HTMLResponse

from platform_runtime import get_platform_snapshot
from pwa_ui import icon, page
from warning_service import LEVEL_LABELS


def _date(value) -> str:
    if isinstance(value, datetime):
        return value.strftime("%d.%m.%Y · %H:%M Uhr")
    return ""


def _source_label(source: str) -> str:
    return "Deutscher Wetterdienst" if source == "DWD" else "Bundeswarnportal / BBK"


def warning_page(warnings, stats: dict) -> HTMLResponse:
    cards = []
    for warning in warnings:
        level = max(1, min(int(getattr(warning, "level", 2) or 2), 4))
        description = str(getattr(warning, "description", "") or "")
        instruction = str(getattr(warning, "instruction", "") or "")
        validity = ""
        if getattr(warning, "starts_at", None) or getattr(warning, "ends_at", None):
            pieces = []
            if getattr(warning, "starts_at", None):
                pieces.append("ab " + _date(warning.starts_at))
            if getattr(warning, "ends_at", None):
                pieces.append("bis " + _date(warning.ends_at))
            validity = f'<div class="warning-validity"><strong>Gültigkeit</strong><span>{escape(" · ".join(pieces))}</span></div>'
        instruction_html = f'<div class="warning-instruction"><strong>Was ist zu beachten?</strong><p>{escape(instruction)}</p></div>' if instruction else ""
        cards.append(
            f'''<article class="official-warning level-{level}" id="{warning.id}">
              <div class="warning-card-head"><span class="warning-level-mark">⚠</span><div><small>{escape(_source_label(warning.source))}</small><h2>{escape(warning.title)}</h2></div><b>{escape(LEVEL_LABELS.get(level, "Amtliche Warnung"))}</b></div>
              <div class="warning-meta"><span>📍 {escape(warning.area or get_platform_snapshot()["warning_area_label"])}</span>{f'<span>🕒 {_date(warning.sent_at)}</span>' if warning.sent_at else ''}</div>
              {f'<p>{escape(description)}</p>' if description else ''}
              {instruction_html}{validity}
              <a class="warning-source-link" href="{escape(warning.source_url or ('https://www.dwd.de/warnungen' if warning.source == 'DWD' else 'https://warnung.bund.de'))}" target="_blank" rel="noopener">Originalmeldung bei der amtlichen Quelle öffnen →</a>
            </article>'''
        )

    if not cards:
        cards.append(
            '''<section class="warning-clear"><span class="warning-clear-icon">✓</span><div><span class="eyebrow">Aktuelle Warnlage</span><h2>Keine aktive amtliche Warnung bekannt</h2><p>Der Warnmonitor prüft automatisch die angebundenen amtlichen Quellen. Sobald eine passende Warnung erkannt wird, erscheint sie hier und kann – je nach Profileinstellung – als Push-Nachricht zugestellt werden.</p></div></section>'''
        )

    source_items = []
    for key, label in (("DWD", "DWD · Wetter & Unwetter"), ("BBK", "Bundeswarnportal · Bevölkerungsschutz")):
        state = (stats.get("sources") or {}).get(key) or {}
        ok = state.get("status") == "ok"
        source_items.append(
            f'<div class="warning-source-state {"ok" if ok else "waiting"}"><span>{"✓" if ok else "•"}</span><div><strong>{escape(label)}</strong><small>{escape(state.get("detail") or "Noch keine Live-Abfrage protokolliert.")}</small></div></div>'
        )

    content = f'''
<link rel="stylesheet" href="/warning.css?v=1">
<section class="page-heading warning-heading"><a class="back-link" href="/">← Start</a><span class="eyebrow">Amtliche Warnlage</span><h1>Warnungen für {escape(get_platform_snapshot()["municipality_name"])}</h1><p>Wetter- und Gefahrenmeldungen aus amtlichen Quellen – kompakt für {escape(get_platform_snapshot()["warning_area_label"])}.</p></section>
<section class="warning-monitor-card"><span class="warning-monitor-pulse" aria-hidden="true"></span><div><strong>Warnmonitor aktiv</strong><small>Automatische Prüfung von DWD und Bundeswarnportal. Push-Einstellungen findest du in deinem Profil.</small></div><a href="/profil">Push einstellen</a></section>
<div class="warning-list">{''.join(cards)}</div>
<section class="content-card warning-sources"><div class="section-title"><span class="eyebrow">Quellenstatus</span><h2>Amtliche Datenquellen</h2></div>{''.join(source_items)}</section>
<section class="trust-strip warning-disclaimer"><span>{icon('shield')}</span><div><strong>Zusätzlicher Informationskanal</strong><small>„Ahnsen hilft“ gibt amtliche Warninformationen weiter, ist aber selbst keine warnende Behörde. Verbindlich bleiben die Originalmeldungen von DWD, BBK/Bundeswarnportal, Cell Broadcast, Sirenen und Rundfunk.</small></div></section>
'''
    return page("Warnungen", content, active="more", description=f"Amtliche Warnungen und Unwetterinformationen für {get_platform_snapshot()['municipality_name']}")
