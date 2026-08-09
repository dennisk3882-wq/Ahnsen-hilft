from __future__ import annotations

from platform_runtime import get_platform_snapshot

from datetime import datetime
from html import escape

from fastapi.responses import HTMLResponse

from intern_ui import intern_nav, intern_nav_css
from warning_service import LEVEL_LABELS


def _date(value) -> str:
    return value.strftime("%d.%m.%Y %H:%M") if isinstance(value, datetime) else "–"


def _source_state(source: str, stats: dict) -> str:
    state = (stats.get("sources") or {}).get(source) or {}
    ok = state.get("status") == "ok"
    label = "Deutscher Wetterdienst" if source == "DWD" else "Bundeswarnportal / MoWaS"
    when = _date(state.get("created_at"))
    return f'''<article class="source-card {"ok" if ok else "warn"}"><span>{"✓" if ok else "!"}</span><div><strong>{escape(label)}</strong><small>{escape(state.get("detail") or "Noch keine Abfrage protokolliert.")}</small><em>Letzte Abfrage: {when}</em></div></article>'''


def warning_dashboard_page(active_warnings, recent_warnings, stats: dict, hinweis: str = "", fehler: str = "") -> HTMLResponse:
    alerts = []
    for warning in active_warnings:
        level = max(1, min(int(warning.level or 2), 4))
        alerts.append(
            f'''<article class="warn-card level-{level}"><div class="warn-head"><span>⚠</span><div><small>{escape(warning.source)}</small><h2>{escape(warning.title)}</h2></div><b>{escape(LEVEL_LABELS.get(level, "Warnung"))}</b></div><p>{escape((warning.description or "")[:700])}</p><div class="warn-meta"><span>📍 {escape(warning.area or get_platform_snapshot()["warning_area_label"])}</span><span>Push-Geräte: {int(warning.pushed_devices or 0)}</span><span>Zuletzt gesehen: {_date(warning.last_seen_at)}</span></div><a href="{escape(warning.source_url or '#')}" target="_blank" rel="noopener">Amtliche Originalmeldung öffnen →</a></article>'''
        )
    if not alerts:
        alerts.append('<div class="all-clear"><span>✓</span><div><strong>Keine aktive amtliche Warnung</strong><small>Der automatische Warnmonitor läuft weiter.</small></div></div>')

    history_rows = []
    for warning in recent_warnings:
        status = "Entwarnung" if warning.is_cancel else ("aktiv" if warning.active else "beendet")
        history_rows.append(
            f'<tr><td>{_date(warning.last_seen_at)}</td><td>{escape(warning.source)}</td><td>{escape(warning.title)}</td><td>{escape(warning.area or "")}</td><td>{escape(LEVEL_LABELS.get(int(warning.level or 2), "Warnung"))}</td><td>{escape(status)}</td><td>{int(warning.pushed_devices or 0)}</td></tr>'
        )
    history = ''.join(history_rows) or '<tr><td colspan="7">Noch keine Warnungen gespeichert.</td></tr>'

    message = ""
    if hinweis:
        message += f'<div class="message">✓ {escape(hinweis)}</div>'
    if fehler:
        message += f'<div class="message error">⚠ {escape(fehler)}</div>'

    html = f'''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#174936"><title>Warnlage · {escape(get_platform_snapshot()["platform_name"])}</title><style>{intern_nav_css()}
    .warning-actions{{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}}.warning-actions form{{margin:0}}.warning-actions a{{display:inline-flex;align-items:center;padding:10px 14px;border-radius:13px;background:#f5f8f2;border:1px solid var(--admin-line);font-weight:850;text-decoration:none}}
    .source-grid{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px}}.source-card{{display:flex;gap:13px;padding:18px;border:1px solid #ead8a8;border-radius:20px;background:#fff9e8}}.source-card.ok{{border-color:#cfe2c8;background:#f1f8ed}}.source-card>span{{width:38px;height:38px;display:grid;place-items:center;flex:0 0 38px;border-radius:13px;background:#f6dfaa;color:#805a14;font-weight:900;font-size:20px}}.source-card.ok>span{{background:#dcefd9;color:#1d603f}}.source-card strong,.source-card small,.source-card em{{display:block}}.source-card small{{margin-top:4px;color:var(--admin-muted);line-height:1.45}}.source-card em{{margin-top:7px;color:#7d867f;font-size:11px;font-style:normal}}
    .warn-list{{display:grid;gap:14px;margin-bottom:20px}}.warn-card{{padding:20px;border:1px solid #ead8a8;border-left:7px solid #d7921e;border-radius:22px;background:var(--admin-paper);box-shadow:var(--admin-shadow-soft)}}.warn-card.level-3{{border-left-color:#c34a40;background:#fff7f5}}.warn-card.level-4{{border-left-color:#743257;background:#fff5fa}}.warn-head{{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start}}.warn-head>span{{width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:#fff0c7;font-size:21px}}.warn-head small{{color:var(--admin-muted);font-weight:900}}.warn-head h2{{margin:3px 0 0!important;font-size:22px!important}}.warn-head b{{padding:6px 9px;border-radius:999px;background:#fff0c7;color:#7b5612;font-size:11px;white-space:nowrap}}.warn-card p{{color:#47534c;line-height:1.55}}.warn-meta{{display:flex;flex-wrap:wrap;gap:8px 14px;color:var(--admin-muted);font-size:12px;font-weight:800}}.warn-card a{{display:inline-flex;margin-top:12px;font-weight:850}}.all-clear{{display:flex;align-items:center;gap:13px;padding:20px;border:1px solid #cfe2c8;border-radius:20px;background:#f1f8ed}}.all-clear>span{{width:42px;height:42px;display:grid;place-items:center;border-radius:14px;background:#dcefd9;color:#1d603f;font-size:23px;font-weight:900}}.all-clear strong,.all-clear small{{display:block}}.all-clear small{{margin-top:3px;color:var(--admin-muted)}}
    .warning-note{{padding:15px 17px;border:1px solid #dfe7dc;border-radius:18px;background:#f7faf4;color:#536057;line-height:1.55;margin-bottom:20px}}.warning-note strong{{color:#174936}}.table-wrap{{overflow:auto!important}}@media(max-width:800px){{.source-grid{{grid-template-columns:1fr}}.warn-head{{grid-template-columns:auto 1fr}}.warn-head b{{grid-column:2;justify-self:start}}}}
    </style></head><body><main class="admin-page">{intern_nav("warnungen")}<section class="admin-hero"><span class="admin-eyebrow">Amtliche Warnlage</span><h1>Warnzentrale {escape(get_platform_snapshot()["municipality_name"])}</h1><p>DWD-Wetterwarnungen und Bevölkerungsschutzmeldungen werden automatisch geprüft, gespeichert und nach den persönlichen Push-Einstellungen verteilt.</p><div class="warning-actions"><form method="post" action="/intern/warnungen/pruefen" onsubmit="return confirm('Amtliche Warnquellen jetzt prüfen? Neue Warnungen werden bei passenden Opt-ins automatisch als Push versendet.')"><button type="submit">↻ Quellen jetzt prüfen</button></form><a href="/warnungen" target="_blank" rel="noopener">Bürgeransicht öffnen</a></div></section>{message}<section class="source-grid">{_source_state('DWD', stats)}{_source_state('BBK', stats)}</section><div class="warning-note"><strong>Automatik:</strong> Der Webdienst prüft die Warnquellen standardmäßig alle fünf Minuten. Der stündliche Render-Cronjob dient zusätzlich als Fallback. Doppelversand wird über eindeutige Warn- und Inhaltskennungen verhindert.</div><section class="box"><h2>Aktuelle Warnlage</h2><div class="warn-list">{''.join(alerts)}</div></section><section class="box"><h2>Warnhistorie</h2><div class="table-wrap"><table><thead><tr><th>Zuletzt</th><th>Quelle</th><th>Warnung</th><th>Gebiet</th><th>Stufe</th><th>Status</th><th>Push</th></tr></thead><tbody>{history}</tbody></table></div></section></main></body></html>'''
    return HTMLResponse(html)
