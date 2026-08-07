from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Pattern not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# pwa_core.py imports and startup
replace_once(
    "pwa_core.py",
    "from system_dashboard import system_dashboard_page\n",
    "from system_dashboard import system_dashboard_page\nfrom warning_dashboard import warning_dashboard_page\nfrom warning_ui import warning_page\nfrom warning_service import (\n    get_active_warnings,\n    get_recent_warnings,\n    get_warning_stats,\n    init_warning_db,\n    poll_warning_sources,\n    start_warning_monitor,\n)\n",
)
replace_once(
    "pwa_core.py",
    "    init_system_diagnostics_db()\n\n\ndef _public_data() -> dict:\n",
    "    init_system_diagnostics_db()\n    init_warning_db()\n    start_warning_monitor()\n\n\ndef _public_data() -> dict:\n",
)
replace_once(
    "pwa_core.py",
    '        "muelltermine": get_naechste_muelltermine(limit=24),\n    }\n',
    '        "muelltermine": get_naechste_muelltermine(limit=24),\n        "warnungen": get_active_warnings(limit=5),\n        "warning_stats": get_warning_stats(),\n    }\n',
)
replace_once(
    "pwa_core.py",
    '@app.get("/")\nasync def pwa_home():\n    return home_page(_public_data())\n\n\n',
    '@app.get("/")\nasync def pwa_home():\n    return home_page(_public_data())\n\n\n@app.get("/warnungen")\nasync def public_warnings():\n    return warning_page(get_active_warnings(limit=30), get_warning_stats())\n\n\n',
)
replace_once(
    "pwa_core.py",
    '        "push_feuerwehr", "push_verkehr", "push_warnungen",\n    )\n',
    '        "push_feuerwehr", "push_verkehr", "push_warnungen",\n        "push_unwetter", "push_bevoelkerungsschutz", "push_hochwasser",\n    )\n',
)
replace_once(
    "pwa_core.py",
    '    update_user_profile(\n        user.id,\n        name,\n        _trim(form.get("telefon"), 60),\n        push_preferences["push_muell"],\n        push_preferences,\n    )\n',
    '    try:\n        warn_min_level = max(1, min(int(str(form.get("warn_min_level") or "2")), 4))\n    except ValueError:\n        warn_min_level = 2\n    update_user_profile(\n        user.id,\n        name,\n        _trim(form.get("telefon"), 60),\n        push_preferences["push_muell"],\n        push_preferences,\n        warn_min_level,\n    )\n',
)
replace_once(
    "pwa_core.py",
    '@app.get("/intern/push")\nasync def admin_push_page',
    '@app.get("/intern/warnungen")\nasync def admin_warnings_page(request: Request, hinweis: str = "", fehler: str = ""):\n    legacy.check_dashboard_login(request)\n    return warning_dashboard_page(\n        get_active_warnings(limit=30),\n        get_recent_warnings(limit=80),\n        get_warning_stats(),\n        hinweis=hinweis,\n        fehler=fehler,\n    )\n\n\n@app.post("/intern/warnungen/pruefen")\nasync def admin_warnings_poll(request: Request):\n    legacy.check_dashboard_login(request)\n    result = poll_warning_sources(send_push=True)\n    failed = [name for name, state in result.get("sources", {}).items() if state.get("status") != "ok"]\n    if failed:\n        return RedirectResponse(\n            url=f"/intern/warnungen?fehler={quote(\'Warnquellen teilweise nicht erreichbar: \' + \', \'.join(failed))}",\n            status_code=303,\n        )\n    info = f"Warnquellen geprüft: {result.get(\'new\', 0)} neu, {result.get(\'changed\', 0)} aktualisiert, {result.get(\'pushed_devices\', 0)} Push-Zustellung(en)."\n    return RedirectResponse(url=f"/intern/warnungen?hinweis={quote(info)}", status_code=303)\n\n\n@app.get("/intern/push")\nasync def admin_push_page',
)
replace_once(
    "pwa_core.py",
    '@app.get("/pwa.js")\nasync def pwa_javascript():\n',
    '@app.get("/warning.css")\nasync def warning_css():\n    return FileResponse(STATIC_DIR / "warning.css", media_type="text/css; charset=utf-8", headers={"Cache-Control": "public, max-age=3600"})\n\n\n@app.get("/pwa.js")\nasync def pwa_javascript():\n',
)
replace_once(
    "pwa_core.py",
    '                {"name": "DGH anfragen", "url": "/dgh-anfrage", "icons": [{"src": "/pwa/icon-192.png", "sizes": "192x192"}]},\n                {"name": "Mein Profil", "url": "/profil", "icons": [{"src": "/pwa/icon-192.png", "sizes": "192x192"}]},\n',
    '                {"name": "DGH anfragen", "url": "/dgh-anfrage", "icons": [{"src": "/pwa/icon-192.png", "sizes": "192x192"}]},\n                {"name": "Warnungen", "url": "/warnungen", "icons": [{"src": "/pwa/icon-192.png", "sizes": "192x192"}]},\n                {"name": "Mein Profil", "url": "/profil", "icons": [{"src": "/pwa/icon-192.png", "sizes": "192x192"}]},\n',
)
replace_once(
    "pwa_core.py",
    "'/pwa-extra.css?v=1', '/pwa.js?v=1'",
    "'/pwa-extra.css?v=1', '/warning.css?v=1', '/pwa.js?v=1'",
)

# Public UI: make warning center visible even when there is no active warning.
replace_once(
    "pwa_ui.py",
    '<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/pwa/icon-192.png"><link rel="icon" href="/pwa/icon-192.png"><link rel="stylesheet" href="/pwa.css?v=1"><title>',
    '<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/pwa/icon-192.png"><link rel="icon" href="/pwa/icon-192.png"><link rel="stylesheet" href="/pwa.css?v=1"><link rel="stylesheet" href="/warning.css?v=1"><title>',
)
replace_once(
    "pwa_ui.py",
    '    settings, events, waste = data.get("einstellungen", {}), data.get("veranstaltungen", []), data.get("muelltermine", [])\n',
    '    settings, events, waste = data.get("einstellungen", {}), data.get("veranstaltungen", []), data.get("muelltermine", [])\n    warnings = list(data.get("warnungen", []) or [])\n',
)
replace_once(
    "pwa_ui.py",
    '    services = [\n',
    '    if warnings:\n        highest = max(int(getattr(item, "level", 2) or 2) for item in warnings)\n        top_warning = sorted(warnings, key=lambda item: int(getattr(item, "level", 2) or 2), reverse=True)[0]\n        warn_class = " danger-warning" if highest >= 3 else " active-warning"\n        warning_card = f\'<a class="home-warning-monitor{warn_class}" href="/warnungen"><span class="warning-monitor-dot"></span><div><strong>⚠ Amtliche Warnung für Ahnsen</strong><small>{escape(getattr(top_warning, "title", "Warnlage prüfen"))}</small></div><span class="card-arrow">{icon("arrow")}</span></a>\'\n    else:\n        warning_card = f\'<a class="home-warning-monitor" href="/warnungen"><span class="warning-monitor-dot"></span><div><strong>Warnmonitor für Ahnsen aktiv</strong><small>DWD- und Bevölkerungsschutz-Warnungen werden automatisch überwacht. Push kannst du im Profil aktivieren.</small></div><span class="card-arrow">{icon("arrow")}</span></a>\'\n    services = [\n',
)
replace_once(
    "pwa_ui.py",
    '        ("people", "Vereine & Gruppen", "Gemeinschaft erleben.", "/vereine"), ("news", "Aktuelles", "Neuigkeiten aus dem Dorf.", "/aktuelles"),\n',
    '        ("people", "Vereine & Gruppen", "Gemeinschaft erleben.", "/vereine"), ("news", "Aktuelles", "Neuigkeiten aus dem Dorf.", "/aktuelles"),\n        ("shield", "Warnungen", "Amtliche Warnlage für Ahnsen.", "/warnungen"),\n',
)
replace_once(
    "pwa_ui.py",
    '<section class="greeting-row"><div><span class="eyebrow">{escape(greeting)} 👋</span><h2>Schön, dass du da bist.</h2></div><a class="today-card" href="/veranstaltungen"><span>{icon(\'calendar\')}</span><div><small>Heute in Ahnsen</small><strong>{event_hint}</strong></div>{icon(\'arrow\')}</a></section>\n<section class="service-grid" aria-label="Digitale Dienste">{cards}</section>{waste_card}\n',
    '<section class="greeting-row"><div><span class="eyebrow">{escape(greeting)} 👋</span><h2>Schön, dass du da bist.</h2></div><a class="today-card" href="/veranstaltungen"><span>{icon(\'calendar\')}</span><div><small>Heute in Ahnsen</small><strong>{event_hint}</strong></div>{icon(\'arrow\')}</a></section>\n{warning_card}\n<section class="service-grid" aria-label="Digitale Dienste">{cards}</section>{waste_card}\n',
)
replace_once(
    "pwa_ui.py",
    '    items = [("Ansprechpartner", "/ansprechpartner", "phone", "Wichtige Kontakte"), ("Feuerwehr", "/feuerwehr", "shield", "Sicherheit und Ehrenamt"),',
    '    items = [("Ansprechpartner", "/ansprechpartner", "phone", "Wichtige Kontakte"), ("Feuerwehr", "/feuerwehr", "shield", "Sicherheit und Ehrenamt"), ("Warnlage", "/warnungen", "bell", "Amtliche Wetter- und Gefahrenwarnungen"),',
)

# Profile UI: dedicated warning subscriptions and threshold.
replace_once(
    "pwa_account_ui.py",
    '    push_preferences = f"""\n',
    '    warn_min_level = max(1, min(int(getattr(user, "warn_min_level", 2) or 2), 4))\n    warn_level_options = "".join(\n        f\'<option value="{level}"{" selected" if warn_min_level == level else ""}>{label}</option>\'\n        for level, label in ((1, "Alle Warnstufen"), (2, "Ab Stufe 2 · wichtige Warnungen"), (3, "Ab Stufe 3 · Unwetter / ernste Gefahr"), (4, "Nur Stufe 4 · extreme Gefahr"))\n    )\n\n    push_preferences = f"""\n',
)
replace_once(
    "pwa_account_ui.py",
    '        <div class="push-pref-group"><h3>Service & Sicherheit</h3>\n',
    '        <div class="push-pref-group"><h3>Amtliche Warnungen</h3>\n          {_push_toggle(user, \'push_unwetter\', \'Wetter & Unwetter (DWD)\', \'Gewitter, Starkregen, Sturm, Hagel, Glätte und weitere amtliche Wetterwarnungen.\')}\n          {_push_toggle(user, \'push_bevoelkerungsschutz\', \'Bevölkerungsschutz\', \'Amtliche Gefahrenmeldungen z. B. zu Großbränden, Rauch, Gefahrstoffen oder Infrastruktur.\')}\n          {_push_toggle(user, \'push_hochwasser\', \'Hochwasser & Überflutung\', \'Passende amtliche Hochwasser- und Überflutungswarnungen aus den angebundenen Quellen.\')}\n          <label class="field"><span>Mindest-Warnstufe</span><select name="warn_min_level">{warn_level_options}</select><small>Standard ist Stufe 2. Entwarnungen werden unabhängig davon zugestellt, wenn die Kategorie aktiviert ist.</small></label>\n          <a class="secondary-button" href="/warnungen">Aktuelle Warnlage ansehen</a>\n        </div>\n        <div class="push-pref-group"><h3>Service & Sicherheit</h3>\n',
)
replace_once(
    "pwa_account_ui.py",
    "          {_push_toggle(user, 'push_warnungen', 'Wichtige Warnungen', 'Dringende Warn- und Gefahrenhinweise für Ahnsen.')}\n",
    "          {_push_toggle(user, 'push_warnungen', 'Wichtige Hinweise der Verwaltung', 'Manuelle dringende Hinweise, die die Verwaltung über Ahnsen hilft versendet.')}\n",
)

# Administration navigation.
replace_once(
    "intern_ui.py",
    '    "push": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>""",\n',
    '    "warnungen": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg>""",\n    "push": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>""",\n',
)
replace_once(
    "intern_ui.py",
    '        ("gemeindeseite", "/intern/gemeindeseite", "Inhalte"),\n        ("push", "/intern/push", "Push"),\n',
    '        ("gemeindeseite", "/intern/gemeindeseite", "Inhalte"),\n        ("warnungen", "/intern/warnungen", "Warnlage"),\n        ("push", "/intern/push", "Push"),\n',
)
replace_once("intern_ui.py", "grid-template-columns:repeat(7, minmax(0,1fr));", "grid-template-columns:repeat(8, minmax(0,1fr));")

# Push dashboard explains automated warning source.
replace_once(
    "push_dashboard.py",
    '            <article><h3>Müllabfuhr</h3><p>Die Erinnerung läuft weiterhin automatisch am Vortag um 18 Uhr.</p></article>\n',
    '            <article><h3>Müllabfuhr</h3><p>Die Erinnerung läuft weiterhin automatisch am Vortag um 18 Uhr.</p></article>\n            <article><h3>Amtliche Warnungen</h3><p>DWD und Bundeswarnportal werden automatisch überwacht. Verwaltung und Bürger sehen die Warnlage in einer eigenen Zentrale.</p><p><a href="/intern/warnungen">Warnzentrale öffnen →</a></p></article>\n',
)

# Hourly cron fallback for warnings.
replace_once(
    "pwa_push_job.py",
    "from veranstaltungen_crud import init_veranstaltungen_db\n",
    "from veranstaltungen_crud import init_veranstaltungen_db\nfrom warning_service import init_warning_db, poll_warning_sources\n",
)
replace_once(
    "pwa_push_job.py",
    "    init_system_diagnostics_db()\n\n    try:\n",
    "    init_system_diagnostics_db()\n    init_warning_db()\n\n    try:\n        warning_result = poll_warning_sources(send_push=True)\n        print(\n            f\"Amtliche Warnquellen geprüft: {warning_result.get('new', 0)} neu, \"\n            f\"{warning_result.get('pushed_devices', 0)} Push-Zustellung(en).\"\n        )\n",
)

# System diagnostics: schema, routes, source health.
replace_once(
    "system_diagnostics.py",
    "from push_service import VAPID_SUBJECT, push_configured\n",
    "from push_service import VAPID_SUBJECT, push_configured\nfrom warning_service import get_warning_stats, init_warning_db, probe_warning_sources\n",
)
replace_once(
    "system_diagnostics.py",
    "    init_system_diagnostics_db()\n    started = time.perf_counter()\n",
    "    init_system_diagnostics_db()\n    init_warning_db()\n    started = time.perf_counter()\n",
)
replace_once(
    "system_diagnostics.py",
    '        required = {"/", "/health", "/verwaltung", "/intern/maengel", "/intern/push"}\n',
    '        required = {"/", "/health", "/verwaltung", "/intern/maengel", "/intern/push", "/warnungen", "/intern/warnungen"}\n',
)
replace_once(
    "system_diagnostics.py",
    '            "push_vereine", "push_feuerwehr", "push_verkehr", "push_warnungen",\n        }\n',
    '            "push_vereine", "push_feuerwehr", "push_verkehr", "push_warnungen",\n            "push_unwetter", "push_bevoelkerungsschutz", "push_hochwasser", "warn_min_level",\n        }\n',
)
marker = '    add("push", "Browser-Push", "Dienste", check_push)\n'
addition = '''    add("push", "Browser-Push", "Dienste", check_push)\n\n    def check_warning_monitor():\n        stats = get_warning_stats()\n        sources = stats.get("sources") or {}\n        states = [sources.get(name, {}).get("status", "unknown") for name in ("DWD", "BBK")]\n        if states.count("error") == 2:\n            return "error", "DWD und Bundeswarnportal waren bei der letzten Warnabfrage nicht erreichbar."\n        if "error" in states:\n            return "warn", "Eine amtliche Warnquelle war bei der letzten Abfrage nicht erreichbar; die andere Quelle läuft weiter."\n        if "unknown" in states:\n            return "warn", "Warnmonitor ist eingerichtet; nach dem ersten automatischen Lauf werden beide Quellen bewertet."\n        return "ok", f"Amtlicher Warnmonitor aktiv; {stats.get('active', 0)} aktive Warnung(en), {stats.get('total', 0)} insgesamt gespeichert."\n\n    add("warning_monitor", "Amtlicher Warnmonitor", "Dienste", check_warning_monitor)\n\n    if deep:\n        probes = probe_warning_sources()\n        for source, label in (("DWD", "DWD Warnquelle"), ("BBK", "Bundeswarnportal / BBK")):\n            probe = probes.get(source) or {}\n            checks.append(\n                _result(\n                    f"warning_source_{source.lower()}",\n                    label,\n                    "Dienste",\n                    probe.get("status", "error"),\n                    probe.get("detail", "Keine Antwort"),\n                    int(probe.get("duration_ms", 0) or 0),\n                )\n            )\n'''
replace_once("system_diagnostics.py", marker, addition)

print("Warning center integration applied.")
