from __future__ import annotations

from datetime import datetime
from html import escape
from typing import Any

from fastapi.responses import HTMLResponse

from intern_ui import intern_nav, intern_nav_css


STATUS_META = {
    "ok": ("✓", "OK", "Alles in Ordnung"),
    "warn": ("!", "Hinweis", "Prüfen empfohlen"),
    "error": ("×", "Fehler", "Handlungsbedarf"),
}


def _fmt_time(value) -> str:
    if not value:
        return "Noch nie"
    if isinstance(value, datetime):
        return value.strftime("%d.%m.%Y %H:%M:%S")
    return escape(str(value))


def _metric(value) -> str:
    return "–" if value is None else str(value)


def _check_card(item: dict[str, Any]) -> str:
    status = str(item.get("status") or "warn")
    symbol, label, _ = STATUS_META.get(status, STATUS_META["warn"])
    return f"""
    <article class="system-check {escape(status)}">
      <span class="system-check-icon" aria-hidden="true">{escape(symbol)}</span>
      <div class="system-check-copy">
        <div class="system-check-head">
          <h3>{escape(str(item.get('label') or 'Systemprüfung'))}</h3>
          <span class="system-status {escape(status)}">{escape(label)}</span>
        </div>
        <p>{escape(str(item.get('detail') or ''))}</p>
        <small>{int(item.get('duration_ms') or 0)} ms</small>
      </div>
    </article>
    """


def system_dashboard_page(
    report: dict[str, Any],
    push_targets: list[dict[str, Any]],
    automations: list[dict[str, Any]] | None = None,
    hinweis: str = "",
    fehler: str = "",
) -> HTMLResponse:
    summary = report.get("summary") or {}
    total = int(summary.get("total") or 0)
    ok_count = int(summary.get("ok") or 0)
    warn_count = int(summary.get("warn") or 0)
    error_count = int(summary.get("error") or 0)
    overall = str(report.get("overall") or "warn")
    symbol, status_label, status_description = STATUS_META.get(overall, STATUS_META["warn"])
    metrics = report.get("metrics") or {}
    automation_cards = []
    for automation in automations or []:
        automation_status = str(automation.get("status") or "warn")
        automation_symbol, automation_label, _ = STATUS_META.get(automation_status, STATUS_META["warn"])
        run_url = str(automation.get("run_url") or "").strip()
        external_link = f'<a class="automation-log-link" href="{escape(run_url)}" target="_blank" rel="noopener">Technisches Laufprotokoll ↗</a>' if run_url else ""
        if automation.get("manual_enabled"):
            manual_action = '<form method="post" action="/intern/system/automation/ratsarchive/start" onsubmit="return confirm(\'Ratsarchiv jetzt zusätzlich synchronisieren?\')"><button type="submit">↻ Jetzt synchronisieren</button></form>'
        else:
            manual_action = '<button type="button" disabled title="Für einen manuellen GitHub-Start ist serverseitig GITHUB_ACTIONS_TOKEN erforderlich.">↻ Manueller Start nicht konfiguriert</button>'
        automation_cards.append(
            f"""<article class=\"automation-card {escape(automation_status)}\">
              <div class=\"automation-card-head\"><div><span class=\"automation-icon\">{escape(automation_symbol)}</span><div><small>Automation</small><h3>{escape(str(automation.get('name') or 'Automatischer Dienst'))}</h3></div></div><span class=\"system-status {escape(automation_status)}\">{escape(automation_label)}</span></div>
              <p>{escape(str(automation.get('detail') or ''))}</p>
              <div class=\"automation-metrics\">
                <span><small>Letzter Lauf</small><strong>{escape(str(automation.get('last_run') or '–'))}</strong></span>
                <span><small>Letzter Erfolg</small><strong>{escape(str(automation.get('last_success') or '–'))}</strong></span>
                <span><small>Nächster Lauf</small><strong>{escape(str(automation.get('next_run') or '–'))}</strong></span>
                <span><small>Sitzungen / PDFs</small><strong>{int(automation.get('meeting_count') or 0)} / {int(automation.get('pdf_count') or 0)}</strong></span>
              </div>
              <div class=\"automation-footer\"><div><small>{escape(str(automation.get('schedule') or ''))} · neueste Sitzung {escape(str(automation.get('latest_meeting') or '–'))}</small>{external_link}</div>{manual_action}</div>
            </article>"""
        )
    automation_area = "".join(automation_cards) or '<div class="system-safe-note">Noch keine überwachten Automationen registriert.</div>'

    groups = []
    for group_name in ("Kernsystem", "Funktionen", "Dienste", "PWA", "Sicherheit & Betrieb"):
        cards = [_check_card(item) for item in report.get("checks", []) if item.get("group") == group_name]
        if cards:
            groups.append(
                f"""
                <section class="system-group box">
                  <div class="system-section-heading">
                    <div><span class="admin-eyebrow">Diagnose</span><h2>{escape(group_name)}</h2></div>
                    <span class="system-group-count">{len(cards)} Prüfungen</span>
                  </div>
                  <div class="system-check-grid">{''.join(cards)}</div>
                </section>
                """
            )

    push_options = []
    for target in push_targets:
        name = str(target.get("name") or "Ohne Name")
        email = str(target.get("email") or "")
        devices = int(target.get("device_count") or 0)
        push_options.append(
            f'<option value="{int(target.get("id") or 0)}">{escape(name)} · {escape(email)} · {devices} Gerät(e)</option>'
        )
    if not push_options:
        push_options.append('<option value="">Kein registriertes Push-Gerät vorhanden</option>')

    last_full = report.get("last_full_test")
    last_full_text = _fmt_time(getattr(last_full, "created_at", None))
    last_full_status = str(getattr(last_full, "status", "") or "")
    last_full_message = str(getattr(last_full, "message", "") or "Noch kein vollständiger Systemtest protokolliert.")

    message_html = ""
    if hinweis:
        message_html += f'<div class="message">✓ {escape(hinweis)}</div>'
    if fehler:
        message_html += f'<div class="message error">⚠ {escape(fehler)}</div>'

    mode_text = "Vollständiger Systemtest" if report.get("deep") else "Automatischer Schnellcheck"
    mode_help = (
        "Externe Adressauflösung und SMTP-Anmeldung wurden live mitgeprüft. Es wurden keine Bürger-Pushs oder E-Mails versendet."
        if report.get("deep")
        else "Dieser Check läuft automatisch beim Öffnen. Externe Dienste werden erst mit dem Volltest aktiv angesprochen."
    )

    commit = str(report.get("render_commit") or "")
    commit_text = commit[:12] if commit else "nicht gemeldet"

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="theme-color" content="#174936">
      <title>Systemstatus & Automationen · Ahnsen hilft</title>
      <style>
        {intern_nav_css()}
        .system-hero-grid{{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center}}
        .system-overall{{width:132px;height:132px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.22);border-radius:50%;background:rgba(255,255,255,.11);box-shadow:inset 0 0 0 8px rgba(255,255,255,.06)}}
        .system-overall-inner{{text-align:center}}.system-overall strong{{display:block;color:white!important;font-family:Georgia,serif;font-size:38px;line-height:1}}
        .system-overall span{{display:block;margin-top:6px;color:rgba(255,255,255,.86);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}}
        .system-actions{{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}}.system-actions form{{margin:0}}
        .system-actions .secondary-action{{color:var(--admin-forest)!important;background:#fffefa!important}}
        .system-summary{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 20px}}
        .system-summary-card{{padding:18px;border:1px solid var(--admin-line);border-radius:21px;background:var(--admin-paper);box-shadow:var(--admin-shadow-soft)}}
        .system-summary-card span{{display:block;color:var(--admin-muted);font-size:11px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}}
        .system-summary-card strong{{display:block;margin-top:7px;color:var(--admin-forest);font-family:Georgia,serif;font-size:34px}}
        .system-summary-card.ok strong{{color:#287052}}.system-summary-card.warn strong{{color:#a56c0d}}.system-summary-card.error strong{{color:#a6403a}}
        .system-mode{{display:flex;align-items:flex-start;gap:12px;margin-bottom:20px;padding:16px 18px;border:1px solid var(--admin-line);border-radius:18px;background:#f7faf4}}
        .system-mode-icon{{width:36px;height:36px;display:grid;place-items:center;flex:0 0 auto;border-radius:12px;color:var(--admin-forest);background:var(--admin-sage-soft);font-weight:950}}
        .system-mode strong{{display:block;margin-bottom:3px}}.system-mode p{{margin:0;color:var(--admin-muted);line-height:1.45}}
        .system-section-heading{{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}}
        .system-section-heading h2{{margin:3px 0 0}}.system-group-count{{color:var(--admin-muted);font-size:12px;font-weight:850}}
        .system-check-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}}
        .system-check{{display:grid;grid-template-columns:42px minmax(0,1fr);gap:12px;padding:15px;border:1px solid var(--admin-line);border-radius:18px;background:#fffefa}}
        .system-check.ok{{border-color:#d4e7d7}}.system-check.warn{{border-color:#ead9a7;background:#fffdf5}}.system-check.error{{border-color:#efc8c3;background:#fff8f7}}
        .system-check-icon{{width:42px;height:42px;display:grid;place-items:center;border-radius:14px;font-size:22px;font-weight:950}}
        .system-check.ok .system-check-icon{{color:#236145;background:#e4f3e7}}.system-check.warn .system-check-icon{{color:#8a5e0c;background:#fff0c7}}.system-check.error .system-check-icon{{color:#943c36;background:#fae3e0}}
        .system-check-head{{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}}.system-check h3{{margin:1px 0 0;font-size:16px!important}}
        .system-check p{{margin:7px 0;color:#5f6b63;line-height:1.45}}.system-check small{{color:#8a948c;font-size:10px;font-weight:800}}
        .system-status{{display:inline-flex;align-items:center;min-height:27px;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap}}
        .system-status.ok{{color:#236145;background:#e4f3e7}}.system-status.warn{{color:#8a5e0c;background:#fff0c7}}.system-status.error{{color:#943c36;background:#fae3e0}}
        .system-tools{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:20px}}
        .system-tool-card h2{{margin-top:0}}.system-tool-card p{{color:var(--admin-muted);line-height:1.5}}
        .system-tool-form{{display:grid;gap:10px}}.system-tool-form label{{display:grid;gap:6px;color:#465349;font-size:12px;font-weight:900}}
        .system-safe-note{{margin-top:12px;padding:12px 14px;border-radius:15px;color:#526057;background:#f5f8f2;font-size:12px;line-height:1.45}}
        .system-operating{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}}
        .system-operating article{{padding:15px;border-radius:17px;background:#f7faf4}}
        .system-operating span{{display:block;color:var(--admin-muted);font-size:10px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}}
        .system-operating strong{{display:block;margin-top:6px;color:var(--admin-forest);font-size:14px;overflow-wrap:anywhere}}
        .system-last-test{{margin-top:13px;padding:14px;border:1px solid var(--admin-line);border-radius:16px;background:#fffefa}}
        .system-last-test strong{{display:block;margin-bottom:4px}}.system-last-test p{{margin:0;color:var(--admin-muted);line-height:1.45}}
        .automation-section{{margin-bottom:20px}}.automation-grid{{display:grid;gap:12px}}.automation-card{{padding:17px;border:1px solid var(--admin-line);border-radius:19px;background:#fffefa}}.automation-card.ok{{border-color:#d4e7d7}}.automation-card.warn{{border-color:#ead9a7;background:#fffdf5}}.automation-card.error{{border-color:#efc8c3;background:#fff8f7}}.automation-card-head{{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}}.automation-card-head>div{{display:flex;align-items:center;gap:10px}}.automation-icon{{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:var(--admin-sage-soft);color:var(--admin-forest);font-weight:950}}.automation-card h3{{margin:2px 0 0;font-size:17px!important}}.automation-card-head small,.automation-metrics small,.automation-footer small{{color:var(--admin-muted);font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}}.automation-card>p{{margin:11px 0;color:#5d6a62;line-height:1.45}}.automation-metrics{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}}.automation-metrics span{{padding:10px;border-radius:13px;background:#f4f7f1}}.automation-metrics small,.automation-metrics strong{{display:block}}.automation-metrics strong{{margin-top:4px;color:var(--admin-forest);font-size:12px;line-height:1.35}}.automation-footer{{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:11px;padding-top:11px;border-top:1px solid #e8ede5}}.automation-footer>div{{display:grid;gap:4px}}.automation-footer form{{margin:0}}.automation-footer button{{min-height:39px;margin:0;padding:8px 12px;font-size:11px}}.automation-log-link{{font-size:10px;font-weight:850}}
        @media(max-width:950px){{.system-check-grid,.system-tools{{grid-template-columns:1fr}}.system-summary{{grid-template-columns:repeat(2,minmax(0,1fr))}}.system-operating{{grid-template-columns:1fr 1fr}}.automation-metrics{{grid-template-columns:1fr 1fr}}}}
        @media(max-width:620px){{.system-hero-grid{{grid-template-columns:1fr}}.system-overall{{width:108px;height:108px;justify-self:start}}.system-summary{{grid-template-columns:1fr 1fr}}.system-operating{{grid-template-columns:1fr}}.system-check{{grid-template-columns:36px minmax(0,1fr);padding:13px}}.system-check-icon{{width:36px;height:36px;border-radius:12px}}.automation-footer{{align-items:stretch;flex-direction:column}}.automation-footer button{{width:100%}}}}
      </style>
    </head>
    <body>
      <main class="admin-page">
        {intern_nav("system")}
        <section class="admin-hero">
          <div class="system-hero-grid">
            <div>
              <span class="admin-eyebrow">System & Diagnose · Betriebsüberwachung</span>
              <h1>Systemstatus & Automationen</h1>
              <p>Überwacht die laufende Ahnsen-hilft-Installation, Datenbank, PWA-Funktionen, externe Dienste und automatische Hintergrundprozesse.</p>
              <div class="system-actions">
                <form method="get" action="/intern/system"><button class="secondary-action" type="submit">↻ Schnellcheck aktualisieren</button></form>
                <form method="get" action="/intern/system"><input type="hidden" name="voll" value="1"><button type="submit">✓ Vollständigen Systemtest starten</button></form>
              </div>
            </div>
            <div class="system-overall {escape(overall)}"><div class="system-overall-inner"><strong>{escape(symbol)} {ok_count}/{total}</strong><span>{escape(status_label)}</span></div></div>
          </div>
        </section>
        {message_html}
        <section class="system-summary">
          <article class="system-summary-card"><span>Prüfungen</span><strong>{total}</strong></article>
          <article class="system-summary-card ok"><span>Erfolgreich</span><strong>{ok_count}</strong></article>
          <article class="system-summary-card warn"><span>Hinweise</span><strong>{warn_count}</strong></article>
          <article class="system-summary-card error"><span>Fehler</span><strong>{error_count}</strong></article>
        </section>
        <div class="system-mode"><span class="system-mode-icon">{escape(symbol)}</span><div><strong>{escape(mode_text)} · {escape(status_description)}</strong><p>{escape(mode_help)} Laufzeit: {int(report.get('duration_ms') or 0)} ms.</p></div></div>
        <section class="box automation-section"><div class="system-section-heading"><div><span class="admin-eyebrow">Hintergrundprozesse</span><h2>Automationen</h2></div><span class="system-group-count">{len(automations or [])} überwacht</span></div><div class="automation-grid">{automation_area}</div></section>
        {''.join(groups)}
        <section class="box">
          <div class="system-section-heading"><div><span class="admin-eyebrow">Live-Daten</span><h2>Betriebsinformationen</h2></div><span class="system-group-count">Stand {_fmt_time(report.get('generated_at'))}</span></div>
          <div class="system-operating">
            <article><span>Bürgerkonten</span><strong>{_metric(metrics.get('users'))}</strong></article>
            <article><span>Push-Geräte</span><strong>{_metric(metrics.get('push_devices'))}</strong></article>
            <article><span>Mängelmeldungen</span><strong>{_metric(metrics.get('reports'))}</strong></article>
            <article><span>Veranstaltungen</span><strong>{_metric(metrics.get('events'))}</strong></article>
            <article><span>DGH-Datensätze</span><strong>{_metric(metrics.get('dgh'))}</strong></article>
            <article><span>Mülltermine</span><strong>{_metric(metrics.get('waste'))}</strong></article>
            <article><span>Datenbank</span><strong>{escape(str(report.get('database_dialect') or 'unbekannt'))}</strong></article>
            <article><span>Render-Service</span><strong>{escape(str(report.get('render_service') or 'Ahnsen-hilft'))}</strong></article>
            <article><span>Live-Commit</span><strong>{escape(commit_text)}</strong></article>
          </div>
          <div class="system-last-test"><strong>Letzter vollständiger Systemtest · {escape(last_full_text)}</strong><p>{escape(last_full_message)}{(' · Status: ' + escape(last_full_status)) if last_full_status else ''}</p></div>
        </section>
        <section class="system-tools">
          <article class="box system-tool-card">
            <span class="admin-eyebrow">Gezielter Funktionstest</span>
            <h2>Test-Push senden</h2>
            <p>Sendet genau eine Diagnose-Nachricht nur an das ausgewählte Bürgerkonto. Andere Bürger erhalten nichts.</p>
            <form class="system-tool-form" method="post" action="/intern/system/test-push" onsubmit="return confirm('Test-Push wirklich an das ausgewählte Konto senden?')">
              <label><span>Zielkonto</span><select name="user_id" required {'disabled' if not push_targets else ''}>{''.join(push_options)}</select></label>
              <button type="submit" {'disabled' if not push_targets else ''}>🔔 Test-Push senden</button>
            </form>
            <div class="system-safe-note">Der normale Schnell- und Volltest versendet niemals Push-Nachrichten. Nur dieser ausdrücklich betätigte Button löst einen echten Push aus.</div>
          </article>
          <article class="box system-tool-card">
            <span class="admin-eyebrow">Gezielter Funktionstest</span>
            <h2>Test-E-Mail senden</h2>
            <p>Sendet eine neutrale Systemtest-Mail ausschließlich an die in Render konfigurierte Verwaltungsadresse <strong>EMAIL_TO</strong>.</p>
            <form class="system-tool-form" method="post" action="/intern/system/test-email" onsubmit="return confirm('Jetzt eine Test-E-Mail an die konfigurierte Verwaltungsadresse senden?')"><button type="submit">✉ Test-E-Mail senden</button></form>
            <div class="system-safe-note">Im vollständigen Systemtest wird nur die SMTP-Anmeldung geprüft. Eine echte E-Mail wird ausschließlich über diesen Button versendet.</div>
          </article>
        </section>
      </main>
    </body>
    </html>
    """
    return HTMLResponse(html)
