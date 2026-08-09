from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Anchor fehlt: {label} in {path}")
    text = text.replace(old, new, 1)
    p.write_text(text, encoding="utf-8")


# --- Politik & Rat: aktuelle Ratsmitglieder ---
replace_once(
    "community_ui.py",
    "from community_crud import SUPPORTED_LANGUAGES\nfrom pwa_ui import icon, page\n",
    "from community_crud import SUPPORTED_LANGUAGES\nfrom council_members import get_current_council_members\nfrom pwa_ui import icon, page\n",
    "council import",
)

replace_once(
    "community_ui.py",
    '''    data_mode = archive_mode or auto_mode\n\n    def document_buttons(documents: list[dict]) -> str:\n''',
    '''    data_mode = archive_mode or auto_mode\n    council = get_current_council_members()\n    council_members = list(council.get("members") or [])\n    council_member_cards = []\n    for member in council_members:\n        party = str(member.get("party") or "–")\n        party_key = "spd" if party.startswith("SPD") else "cdu" if party.startswith("CDU") else "other"\n        role = str(member.get("role") or "Ratsmitglied")\n        note = str(member.get("note") or "").strip()\n        council_member_cards.append(\n            f\"\"\"<article class=\\"council-person\\">\n              <div class=\\"council-person-head\\"><span class=\\"council-party {party_key}\\">{escape(party)}</span>{f'<span class=\\"council-role\\">{escape(role)}</span>' if role != 'Ratsmitglied' else ''}</div>\n              <h3>{escape(str(member.get('name') or 'Ratsmitglied'))}</h3>\n              <div class=\\"council-person-facts\\"><span><small>Alter</small><strong>{escape(str(member.get('age') or 'nicht öffentlich verifiziert'))}</strong></span><span><small>Wohnort</small><strong>{escape(str(member.get('residence') or municipality))}</strong></span></div>\n              {f'<p class=\\"council-person-note\\">{escape(note)}</p>' if note else ''}\n            </article>\"\"\"\n        )\n    council_members_area = \"\".join(council_member_cards)\n\n    def document_buttons(documents: list[dict]) -> str:\n''',
    "council member cards",
)

replace_once(
    "community_ui.py",
    '''    .council-portal{display:grid;gap:16px}.council-source{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(240px,.65fr);gap:14px;padding:20px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,#fff,#f2f7ef);box-shadow:var(--shadow-soft)}''',
    '''    .council-portal{display:grid;gap:16px}.council-members-panel{padding:18px;border:1px solid var(--line);border-radius:24px;background:#fff;box-shadow:0 10px 28px rgba(25,64,45,.06)}.council-members-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.council-members-head h2{margin:3px 0 3px;color:var(--forest);font-size:22px}.council-members-head p{margin:0;color:var(--muted);font-size:12px;line-height:1.45}.council-members-count{flex:0 0 auto;padding:6px 9px;border-radius:999px;background:#eef4eb;color:var(--forest);font-size:11px;font-weight:900}.council-member-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:9px}.council-person{min-width:0;padding:13px;border:1px solid #e0e8dc;border-radius:17px;background:#f9fbf7}.council-person-head{display:flex;align-items:center;justify-content:space-between;gap:7px}.council-party,.council-role{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:950;letter-spacing:.04em}.council-party.spd{color:#8a2d32;background:#fae7e8}.council-party.cdu{color:#343b38;background:#e9ece9}.council-party.other{color:#345843;background:#e4efe5}.council-role{color:var(--forest);background:#e5f0e1}.council-person h3{margin:8px 0 9px;color:#284c39;font-size:17px}.council-person-facts{display:grid;grid-template-columns:1fr 1fr;gap:7px}.council-person-facts span{min-width:0;padding:7px 8px;border-radius:11px;background:#fff}.council-person-facts small,.council-person-facts strong{display:block}.council-person-facts small{color:var(--muted);font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.council-person-facts strong{margin-top:3px;color:#46574d;font-size:10px;line-height:1.3}.council-person-note{margin:8px 0 0!important;color:#68756d!important;font-size:10px!important;line-height:1.4!important}.council-members-foot{margin-top:10px;padding-top:9px;border-top:1px solid #edf1ea;color:var(--muted);font-size:10px;line-height:1.45}.council-source{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(240px,.65fr);gap:14px;padding:20px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,#fff,#f2f7ef);box-shadow:var(--shadow-soft)}''',
    "council member css",
)

replace_once(
    "community_ui.py",
    '''    @media(max-width:720px){.council-source{grid-template-columns:1fr;padding:17px}.council-meeting-card{grid-template-columns:1fr}.council-date-box{grid-template-columns:auto 1fr;align-items:center;text-align:left}.council-source-empty{grid-template-columns:auto 1fr}.council-source-empty .primary-button{grid-column:1/-1}.council-doc-grid{grid-template-columns:1fr}.council-section-head{align-items:flex-start}.council-search{grid-template-columns:1fr auto}}\n''',
    '''    @media(max-width:720px){.council-members-head{align-items:flex-start}.council-member-grid{display:flex;overflow-x:auto;scroll-snap-type:x proximity;padding-bottom:3px;scrollbar-width:none}.council-member-grid::-webkit-scrollbar{display:none}.council-person{flex:0 0 248px;scroll-snap-align:start}.council-source{grid-template-columns:1fr;padding:17px}.council-meeting-card{grid-template-columns:1fr}.council-date-box{grid-template-columns:auto 1fr;align-items:center;text-align:left}.council-source-empty{grid-template-columns:auto 1fr}.council-source-empty .primary-button{grid-column:1/-1}.council-doc-grid{grid-template-columns:1fr}.council-section-head{align-items:flex-start}.council-search{grid-template-columns:1fr auto}}\n''',
    "council member mobile css",
)

replace_once(
    "community_ui.py",
    '''    <div class="council-portal">\n      <section class="council-source">\n''',
    '''    <div class="council-portal">\n      <section class="council-members-panel">\n        <div class="council-members-head"><div><span class="eyebrow">Aktueller Gemeinderat</span><h2>Ratsmitglieder in Ahnsen</h2><p>Wahlperiode {escape(str(council.get('term') or '2021–2026'))} · öffentlich verifizierter Stand {escape(str(council.get('verified_at') or ''))}</p></div><span class="council-members-count">{len(council_members)} Mitglieder</span></div>\n        <div class="council-member-grid">{council_members_area}</div>\n        <div class="council-members-foot">Wohnorte werden aus Datenschutzgründen ausschließlich auf Ortsebene angezeigt. Altersangaben erscheinen nur, wenn sie aktuell öffentlich belastbar belegt sind. „Partei/Ratsliste“ bezeichnet die politische Zuordnung bzw. die Liste, über die das laufende Ratsmandat erworben wurde.</div>\n      </section>\n      <section class="council-source">\n''',
    "council members html",
)

# --- Feuerwehr von Startseite in Vereine & Gruppen ---
replace_once(
    "pwa_ui.py",
    '''        ("phone", "Ansprechpartner", "Wichtige Kontakte auf einen Blick.", "/ansprechpartner"), ("fire", "Feuerwehr", "Feuerwehr Ahnsen & Sicherheit.", "/feuerwehr"),\n''',
    '''        ("phone", "Ansprechpartner", "Wichtige Kontakte auf einen Blick.", "/ansprechpartner"),\n''',
    "remove fire home tile",
)

replace_once(
    "pwa_ui.py",
    '''    title, eyebrow, key, raw = config.get(kind, config["buergerinformationen"]); entries = _entries(raw)\n    cards = "".join(f'<article class="info-card"><span class="info-icon">{icon(key)}</span><h2>{escape(t)}</h2><p>{escape(d or "Weitere Informationen folgen.")}</p></article>' for t, d in entries)\n    if not cards: cards = f'<article class="info-card wide"><span class="info-icon">{icon(key)}</span><h2>{escape(title)}</h2><p>{escape(str(raw or "Dieser Bereich wird gerade gepflegt."))}</p></article>'\n''',
    '''    title, eyebrow, key, raw = config.get(kind, config["buergerinformationen"]); entries = _entries(raw)\n    card_rows = []\n    if kind == "vereine":\n        card_rows.append(f'<a class="info-card" href="/feuerwehr" style="text-decoration:none;color:inherit"><span class="info-icon">{icon("fire")}</span><h2>Freiwillige Feuerwehr Ahnsen</h2><p>Brandschutz, Einsatzdienst und Ehrenamt – Informationen zur Ortsfeuerwehr.</p><span class="community-chip" style="margin-top:10px">Feuerwehr ansehen ›</span></a>')\n    card_rows.extend(f'<article class="info-card"><span class="info-icon">{icon(key)}</span><h2>{escape(t)}</h2><p>{escape(d or "Weitere Informationen folgen.")}</p></article>' for t, d in entries)\n    cards = "".join(card_rows)\n    if not cards: cards = f'<article class="info-card wide"><span class="info-icon">{icon(key)}</span><h2>{escape(title)}</h2><p>{escape(str(raw or "Dieser Bereich wird gerade gepflegt."))}</p></article>'\n''',
    "fire in clubs",
)

# --- Systemstatus & Automationen ---
replace_once(
    "system_dashboard.py",
    '''def system_dashboard_page(\n    report: dict[str, Any],\n    push_targets: list[dict[str, Any]],\n    hinweis: str = "",\n    fehler: str = "",\n) -> HTMLResponse:\n''',
    '''def system_dashboard_page(\n    report: dict[str, Any],\n    push_targets: list[dict[str, Any]],\n    automations: list[dict[str, Any]] | None = None,\n    hinweis: str = "",\n    fehler: str = "",\n) -> HTMLResponse:\n''',
    "system dashboard signature",
)

replace_once(
    "system_dashboard.py",
    '''    metrics = report.get("metrics") or {}\n\n    groups = []\n''',
    '''    metrics = report.get("metrics") or {}\n    automation_cards = []\n    for automation in automations or []:\n        automation_status = str(automation.get("status") or "warn")\n        automation_symbol, automation_label, _ = STATUS_META.get(automation_status, STATUS_META["warn"])\n        run_url = str(automation.get("run_url") or "").strip()\n        external_link = f'<a class="automation-log-link" href="{escape(run_url)}" target="_blank" rel="noopener">Technisches Laufprotokoll ↗</a>' if run_url else ""\n        if automation.get("manual_enabled"):\n            manual_action = '<form method="post" action="/intern/system/automation/ratsarchive/start" onsubmit="return confirm(\\'Ratsarchiv jetzt zusätzlich synchronisieren?\\')"><button type="submit">↻ Jetzt synchronisieren</button></form>'\n        else:\n            manual_action = '<button type="button" disabled title="Für einen manuellen GitHub-Start ist serverseitig GITHUB_ACTIONS_TOKEN erforderlich.">↻ Manueller Start nicht konfiguriert</button>'\n        automation_cards.append(\n            f\"\"\"<article class=\\"automation-card {escape(automation_status)}\\">\n              <div class=\\"automation-card-head\\"><div><span class=\\"automation-icon\\">{escape(automation_symbol)}</span><div><small>Automation</small><h3>{escape(str(automation.get('name') or 'Automatischer Dienst'))}</h3></div></div><span class=\\"system-status {escape(automation_status)}\\">{escape(automation_label)}</span></div>\n              <p>{escape(str(automation.get('detail') or ''))}</p>\n              <div class=\\"automation-metrics\\">\n                <span><small>Letzter Lauf</small><strong>{escape(str(automation.get('last_run') or '–'))}</strong></span>\n                <span><small>Letzter Erfolg</small><strong>{escape(str(automation.get('last_success') or '–'))}</strong></span>\n                <span><small>Nächster Lauf</small><strong>{escape(str(automation.get('next_run') or '–'))}</strong></span>\n                <span><small>Sitzungen / PDFs</small><strong>{int(automation.get('meeting_count') or 0)} / {int(automation.get('pdf_count') or 0)}</strong></span>\n              </div>\n              <div class=\\"automation-footer\\"><div><small>{escape(str(automation.get('schedule') or ''))} · neueste Sitzung {escape(str(automation.get('latest_meeting') or '–'))}</small>{external_link}</div>{manual_action}</div>\n            </article>\"\"\"\n        )\n    automation_area = \"\".join(automation_cards) or '<div class="system-safe-note">Noch keine überwachten Automationen registriert.</div>'\n\n    groups = []\n''',
    "automation card build",
)

replace_once(
    "system_dashboard.py",
    '''        <title>System & Diagnose · Ahnsen hilft</title>\n''',
    '''        <title>Systemstatus & Automationen · Ahnsen hilft</title>\n''',
    "system title",
)

replace_once(
    "system_dashboard.py",
    '''        .system-last-test{{margin-top:13px;padding:14px;border:1px solid var(--admin-line);border-radius:16px;background:#fffefa}}\n        .system-last-test strong{{display:block;margin-bottom:4px}}.system-last-test p{{margin:0;color:var(--admin-muted);line-height:1.45}}\n''',
    '''        .system-last-test{{margin-top:13px;padding:14px;border:1px solid var(--admin-line);border-radius:16px;background:#fffefa}}\n        .system-last-test strong{{display:block;margin-bottom:4px}}.system-last-test p{{margin:0;color:var(--admin-muted);line-height:1.45}}\n        .automation-section{{margin-bottom:20px}}.automation-grid{{display:grid;gap:12px}}.automation-card{{padding:17px;border:1px solid var(--admin-line);border-radius:19px;background:#fffefa}}.automation-card.ok{{border-color:#d4e7d7}}.automation-card.warn{{border-color:#ead9a7;background:#fffdf5}}.automation-card.error{{border-color:#efc8c3;background:#fff8f7}}.automation-card-head{{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}}.automation-card-head>div{{display:flex;align-items:center;gap:10px}}.automation-icon{{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:var(--admin-sage-soft);color:var(--admin-forest);font-weight:950}}.automation-card h3{{margin:2px 0 0;font-size:17px!important}}.automation-card-head small,.automation-metrics small,.automation-footer small{{color:var(--admin-muted);font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}}.automation-card>p{{margin:11px 0;color:#5d6a62;line-height:1.45}}.automation-metrics{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}}.automation-metrics span{{padding:10px;border-radius:13px;background:#f4f7f1}}.automation-metrics small,.automation-metrics strong{{display:block}}.automation-metrics strong{{margin-top:4px;color:var(--admin-forest);font-size:12px;line-height:1.35}}.automation-footer{{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:11px;padding-top:11px;border-top:1px solid #e8ede5}}.automation-footer>div{{display:grid;gap:4px}}.automation-footer form{{margin:0}}.automation-footer button{{min-height:39px;margin:0;padding:8px 12px;font-size:11px}}.automation-log-link{{font-size:10px;font-weight:850}}\n''',
    "automation css",
)

replace_once(
    "system_dashboard.py",
    '''        @media(max-width:950px){{.system-check-grid,.system-tools{{grid-template-columns:1fr}}.system-summary{{grid-template-columns:repeat(2,minmax(0,1fr))}}.system-operating{{grid-template-columns:1fr 1fr}}}}\n        @media(max-width:620px){{.system-hero-grid{{grid-template-columns:1fr}}.system-overall{{width:108px;height:108px;justify-self:start}}.system-summary{{grid-template-columns:1fr 1fr}}.system-operating{{grid-template-columns:1fr}}.system-check{{grid-template-columns:36px minmax(0,1fr);padding:13px}}.system-check-icon{{width:36px;height:36px;border-radius:12px}}}}\n''',
    '''        @media(max-width:950px){{.system-check-grid,.system-tools{{grid-template-columns:1fr}}.system-summary{{grid-template-columns:repeat(2,minmax(0,1fr))}}.system-operating{{grid-template-columns:1fr 1fr}}.automation-metrics{{grid-template-columns:1fr 1fr}}}}\n        @media(max-width:620px){{.system-hero-grid{{grid-template-columns:1fr}}.system-overall{{width:108px;height:108px;justify-self:start}}.system-summary{{grid-template-columns:1fr 1fr}}.system-operating{{grid-template-columns:1fr}}.system-check{{grid-template-columns:36px minmax(0,1fr);padding:13px}}.system-check-icon{{width:36px;height:36px;border-radius:12px}}.automation-footer{{align-items:stretch;flex-direction:column}}.automation-footer button{{width:100%}}}}\n''',
    "automation responsive css",
)

replace_once(
    "system_dashboard.py",
    '''              <h1>System & Diagnose</h1>\n              <p>Prüft die tatsächlich laufende Ahnsen-hilft-Installation, Datenbank, PWA-Funktionen und externe Dienste – ohne Testmeldungen oder Testbuchungen in Bürgerdaten anzulegen.</p>\n''',
    '''              <h1>Systemstatus & Automationen</h1>\n              <p>Überwacht die laufende Ahnsen-hilft-Installation, Datenbank, PWA-Funktionen, externe Dienste und automatische Hintergrundprozesse.</p>\n''',
    "system heading",
)

replace_once(
    "system_dashboard.py",
    '''        <div class="system-mode"><span class="system-mode-icon">{escape(symbol)}</span><div><strong>{escape(mode_text)} · {escape(status_description)}</strong><p>{escape(mode_help)} Laufzeit: {int(report.get('duration_ms') or 0)} ms.</p></div></div>\n        {''.join(groups)}\n''',
    '''        <div class="system-mode"><span class="system-mode-icon">{escape(symbol)}</span><div><strong>{escape(mode_text)} · {escape(status_description)}</strong><p>{escape(mode_help)} Laufzeit: {int(report.get('duration_ms') or 0)} ms.</p></div></div>\n        <section class="box automation-section"><div class="system-section-heading"><div><span class="admin-eyebrow">Hintergrundprozesse</span><h2>Automationen</h2></div><span class="system-group-count">{len(automations or [])} überwacht</span></div><div class="automation-grid">{automation_area}</div></section>\n        {''.join(groups)}\n''',
    "automation html",
)

# --- pwa_core: Status laden und optional manuell starten ---
replace_once(
    "pwa_core.py",
    '''from system_dashboard import system_dashboard_page\n''',
    '''from system_dashboard import system_dashboard_page\nfrom automation_status import get_automation_status, trigger_ratsarchive_sync\n''',
    "automation imports",
)

replace_once(
    "pwa_core.py",
    '''    return system_dashboard_page(\n        report,\n        get_push_test_targets(),\n        hinweis=hinweis,\n        fehler=fehler,\n    )\n\n\n@app.post("/intern/system/test-push")\n''',
    '''    return system_dashboard_page(\n        report,\n        get_push_test_targets(),\n        get_automation_status(force=bool(voll)),\n        hinweis=hinweis,\n        fehler=fehler,\n    )\n\n\n@app.post("/intern/system/automation/ratsarchive/start")\nasync def admin_ratsarchive_sync_start(request: Request):\n    legacy.check_dashboard_login(request)\n    ok, message = trigger_ratsarchive_sync()\n    try:\n        record_system_event("ratsarchive_manual_sync", "ok" if ok else "warn", message)\n    except Exception:\n        pass\n    parameter = "hinweis" if ok else "fehler"\n    return RedirectResponse(url=f"/intern/system?{parameter}={quote(message)}", status_code=303)\n\n\n@app.post("/intern/system/test-push")\n''',
    "automation route",
)

print("Patch erfolgreich angewendet.")
