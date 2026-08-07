from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f"Pattern not found in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Database model + migration-safe CRUD
# ---------------------------------------------------------------------------
replace_once(
    "pwa_models.py",
    '    push_muell = Column(Boolean, default=False, nullable=False)\n    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)',
    '''    push_muell = Column(Boolean, default=False, nullable=False)\n    push_meldungen = Column(Boolean, default=True, nullable=False)\n    push_dgh = Column(Boolean, default=True, nullable=False)\n    push_veranstaltungen = Column(Boolean, default=False, nullable=False)\n    push_aktuelles = Column(Boolean, default=False, nullable=False)\n    push_buergerinfo = Column(Boolean, default=False, nullable=False)\n    push_vereine = Column(Boolean, default=False, nullable=False)\n    push_feuerwehr = Column(Boolean, default=False, nullable=False)\n    push_verkehr = Column(Boolean, default=False, nullable=False)\n    push_warnungen = Column(Boolean, default=False, nullable=False)\n    erstellt_am = Column(DateTime, default=datetime.utcnow, nullable=False)''',
)

replace_once(
    "pwa_crud.py",
    'from sqlalchemy.exc import IntegrityError',
    '''from sqlalchemy import inspect\nfrom sqlalchemy.exc import IntegrityError''',
)

replace_once(
    "pwa_crud.py",
    'from pwa_models import PWAUser, PushDelivery, PushSubscription\n\n\ndef init_pwa_db() -> None:\n    Base.metadata.create_all(bind=engine)',
    '''from pwa_models import PWAUser, PushDelivery, PushSubscription\n\n\nPUSH_PREFERENCE_DEFAULTS = {\n    "push_meldungen": True,\n    "push_dgh": True,\n    "push_muell": False,\n    "push_veranstaltungen": False,\n    "push_aktuelles": False,\n    "push_buergerinfo": False,\n    "push_vereine": False,\n    "push_feuerwehr": False,\n    "push_verkehr": False,\n    "push_warnungen": False,\n}\n\nPUSH_PREFERENCE_FIELDS = {\n    "push_meldungen": "Status eigener Mängelmeldungen",\n    "push_dgh": "Status eigener DGH-Anfragen",\n    "push_muell": "Müllabfuhr",\n    "push_veranstaltungen": "Veranstaltungen",\n    "push_aktuelles": "Aktuelles aus Ahnsen",\n    "push_buergerinfo": "Bürgerinformationen",\n    "push_vereine": "Vereine & Dorfleben",\n    "push_feuerwehr": "Feuerwehr & Sicherheit",\n    "push_verkehr": "Verkehr & Straßensperrungen",\n    "push_warnungen": "Wichtige Warnungen",\n}\n\nPUSH_BROADCAST_CATEGORIES = {\n    key: PUSH_PREFERENCE_FIELDS[key]\n    for key in (\n        "push_veranstaltungen",\n        "push_aktuelles",\n        "push_buergerinfo",\n        "push_vereine",\n        "push_feuerwehr",\n        "push_verkehr",\n        "push_warnungen",\n        "push_muell",\n    )\n}\n\n\ndef init_pwa_db() -> None:\n    Base.metadata.create_all(bind=engine)\n\n    existing = {column["name"] for column in inspect(engine).get_columns("pwa_users")}\n    for column, default in PUSH_PREFERENCE_DEFAULTS.items():\n        if column in existing:\n            continue\n        sql_default = "TRUE" if default else "FALSE"\n        with engine.begin() as conn:\n            conn.exec_driver_sql(\n                f"ALTER TABLE pwa_users ADD COLUMN {column} BOOLEAN NOT NULL DEFAULT {sql_default}"\n            )\n        print(f"Spalte pwa_users.{column} hinzugefügt.")''',
)

replace_once(
    "pwa_crud.py",
    '            push_muell=False,\n            erstellt_am=datetime.utcnow(),',
    '''            push_muell=False,\n            push_meldungen=True,\n            push_dgh=True,\n            push_veranstaltungen=False,\n            push_aktuelles=False,\n            push_buergerinfo=False,\n            push_vereine=False,\n            push_feuerwehr=False,\n            push_verkehr=False,\n            push_warnungen=False,\n            erstellt_am=datetime.utcnow(),''',
)

old_profile = '''def update_user_profile(user_id: int, name: str, telefon: str, push_muell: bool) -> PWAUser | None:\n    db = SessionLocal()\n    try:\n        user = db.query(PWAUser).filter(PWAUser.id == user_id).first()\n        if user:\n            user.name = str(name or "").strip()[:120]\n            user.telefon = str(telefon or "").strip()[:60]\n            user.push_muell = bool(push_muell)\n            user.aktualisiert_am = datetime.utcnow()\n            db.commit()\n            db.refresh(user)\n        return user\n    finally:\n        db.close()\n'''
new_profile = '''def update_user_profile(\n    user_id: int,\n    name: str,\n    telefon: str,\n    push_muell: bool,\n    push_preferences: dict[str, bool] | None = None,\n) -> PWAUser | None:\n    db = SessionLocal()\n    try:\n        user = db.query(PWAUser).filter(PWAUser.id == user_id).first()\n        if user:\n            user.name = str(name or "").strip()[:120]\n            user.telefon = str(telefon or "").strip()[:60]\n            preferences = dict(push_preferences or {})\n            preferences["push_muell"] = bool(push_muell)\n            for field in PUSH_PREFERENCE_DEFAULTS:\n                setattr(user, field, bool(preferences.get(field, False)))\n            user.aktualisiert_am = datetime.utcnow()\n            db.commit()\n            db.refresh(user)\n        return user\n    finally:\n        db.close()\n'''
replace_once("pwa_crud.py", old_profile, new_profile)

replace_once(
    "pwa_crud.py",
    'def get_users_with_waste_push() -> list[PWAUser]:',
    '''def user_wants_push(user_id: int, category: str) -> bool:\n    if category not in PUSH_PREFERENCE_DEFAULTS:\n        return False\n    db = SessionLocal()\n    try:\n        user = (\n            db.query(PWAUser)\n            .filter(PWAUser.id == user_id)\n            .filter(PWAUser.aktiv.is_(True))\n            .first()\n        )\n        return bool(user and getattr(user, category, False))\n    finally:\n        db.close()\n\n\ndef get_users_for_push_category(category: str) -> list[PWAUser]:\n    if category not in PUSH_PREFERENCE_DEFAULTS:\n        return []\n    db = SessionLocal()\n    try:\n        column = getattr(PWAUser, category)\n        return (\n            db.query(PWAUser)\n            .filter(PWAUser.aktiv.is_(True))\n            .filter(column.is_(True))\n            .all()\n        )\n    finally:\n        db.close()\n\n\ndef get_users_with_waste_push() -> list[PWAUser]:''',
)

# ---------------------------------------------------------------------------
# Push service: category checks + broadcasts
# ---------------------------------------------------------------------------
replace_once(
    "push_service.py",
    'from pwa_crud import delete_push_subscription, get_push_subscriptions_for_user',
    '''from pwa_crud import (\n    delete_push_subscription,\n    get_push_subscriptions_for_user,\n    get_users_for_push_category,\n    user_wants_push,\n)''',
)
replace_once(
    "push_service.py",
    '    tag: str = "ahnsen-hilft",\n) -> int:\n    if not user_id or not push_configured():\n        return 0',
    '''    tag: str = "ahnsen-hilft",\n    category: str | None = None,\n) -> int:\n    if not user_id or not push_configured():\n        return 0\n    if category and not user_wants_push(user_id, category):\n        return 0''',
)

push_service = read("push_service.py")
push_service += '''\n\ndef send_category_notification(\n    category: str,\n    title: str,\n    body: str,\n    url: str = "/",\n    tag: str = "ahnsen-hilft",\n) -> int:\n    sent = 0\n    for user in get_users_for_push_category(category):\n        sent += send_user_notification(\n            user.id, title, body, url, tag, category=category\n        )\n    return sent\n'''
write("push_service.py", push_service)

# ---------------------------------------------------------------------------
# Profile UI with grouped opt-ins
# ---------------------------------------------------------------------------
replace_once(
    "pwa_account_ui.py",
    'def profile_page(user, reports: Iterable, dgh_requests: Iterable, push_enabled: bool, push_configured: bool, message: str = "", error: str = "") -> HTMLResponse:',
    '''def _push_toggle(user, field: str, label: str, description: str) -> str:\n    checked = " checked" if bool(getattr(user, field, False)) else ""\n    return (\n        f'<label class="consent switch-row push-pref"><input name="{escape(field)}" type="checkbox" value="ja"{checked}>'\n        f'<span><strong>{escape(label)}</strong><small>{escape(description)}</small></span></label>'\n    )\n\n\ndef profile_page(user, reports: Iterable, dgh_requests: Iterable, push_enabled: bool, push_configured: bool, message: str = "", error: str = "") -> HTMLResponse:''',
)

replace_once(
    "pwa_account_ui.py",
    '    push_buttons = \'<button class="primary-button" id="enable-push" type="button">Push aktivieren</button><button class="secondary-button" id="disable-push" type="button">Auf diesem Gerät deaktivieren</button>\' if push_configured else \'<span class="muted">Serverkonfiguration erforderlich</span>\'\n\n    content = f"""',
    '''    push_buttons = '<button class="primary-button" id="enable-push" type="button">Push aktivieren</button><button class="secondary-button" id="disable-push" type="button">Auf diesem Gerät deaktivieren</button>' if push_configured else '<span class="muted">Serverkonfiguration erforderlich</span>'\n\n    push_preferences = f"""\n      <div class="push-pref-groups">\n        <div class="push-pref-group"><h3>Meine Vorgänge</h3>\n          {_push_toggle(user, 'push_meldungen', 'Mängelmeldungen', 'Push bei Statusänderungen deiner eigenen Meldungen.')}\n          {_push_toggle(user, 'push_dgh', 'DGH-Anfragen', 'Push bei Zu-, Absage oder anderer Statusänderung deiner DGH-Anfrage.')}\n        </div>\n        <div class="push-pref-group"><h3>Dorfleben</h3>\n          {_push_toggle(user, 'push_veranstaltungen', 'Veranstaltungen', 'Neue und geänderte Termine in Ahnsen.')}\n          {_push_toggle(user, 'push_aktuelles', 'Aktuelles aus Ahnsen', 'Neuigkeiten und aktuelle Hinweise aus dem Ort.')}\n          {_push_toggle(user, 'push_vereine', 'Vereine & Dorfleben', 'Mitteilungen von Vereinen und zum Dorfleben.')}\n        </div>\n        <div class="push-pref-group"><h3>Service & Sicherheit</h3>\n          {_push_toggle(user, 'push_muell', 'Müllabfuhr', 'Erinnerung am Vortag an die nächste Abholung.')}\n          {_push_toggle(user, 'push_buergerinfo', 'Bürgerinformationen', 'Wichtige Informationen der Gemeinde.')}\n          {_push_toggle(user, 'push_verkehr', 'Verkehr & Straßensperrungen', 'Sperrungen, Baustellen und wichtige Verkehrshinweise.')}\n          {_push_toggle(user, 'push_feuerwehr', 'Feuerwehr & Sicherheit', 'Sicherheitsrelevante Hinweise und Informationen der Feuerwehr.')}\n          {_push_toggle(user, 'push_warnungen', 'Wichtige Warnungen', 'Dringende Warn- und Gefahrenhinweise für Ahnsen.')}\n        </div>\n      </div>\n    """\n\n    content = f"""''',
)

replace_once(
    "pwa_account_ui.py",
    '      <label class="consent switch-row"><input name="push_muell" type="checkbox" value="ja"{\' checked\' if user.push_muell else \'\'}><span>Müllabfuhr-Erinnerung am Vortag per Push erhalten</span></label>\n      <button class="primary-button" type="submit">Profil speichern</button>',
    '''      <div class="section-title push-settings-title"><span class="eyebrow">Push-Einstellungen</span><h2>Welche Nachrichten möchtest du?</h2><p>Du entscheidest für jede Kategorie einzeln. Zusätzlich muss Browser-Push auf diesem Gerät aktiviert sein.</p></div>\n      {push_preferences}\n      <button class="primary-button" type="submit">Profil & Push-Auswahl speichern</button>''',
)

replace_once(
    "pwa_account_ui.py",
    '{_extra_css()}\n<section class="profile-hero">',
    '''{_extra_css()}\n<style>\n.push-settings-title{margin-top:22px}.push-settings-title p{margin:6px 0 0;color:#66736a;line-height:1.5}.push-pref-groups{display:grid;gap:14px}.push-pref-group{padding:15px;border:1px solid #dfe7dc;border-radius:18px;background:#f8faf5}.push-pref-group h3{margin:0 0 10px;font-size:16px}.push-pref{align-items:flex-start!important;margin:7px 0!important;padding:10px!important;border-radius:13px;background:#fff}.push-pref>span{display:grid;gap:3px}.push-pref strong{font-size:14px}.push-pref small{color:#6e786f;line-height:1.35}.push-pref input{margin-top:3px}.profile-settings form{display:grid;gap:12px}\n</style>\n<section class="profile-hero">''',
)

# ---------------------------------------------------------------------------
# pwa_core: save all opt-ins, respect personal categories, manual sender
# ---------------------------------------------------------------------------
replace_once(
    "pwa_core.py",
    '    upsert_push_subscription,\n    verify_password,\n)',
    '''    upsert_push_subscription,\n    verify_password,\n    PUSH_BROADCAST_CATEGORIES,\n)''',
)
replace_once(
    "pwa_core.py",
    'from push_service import public_key, push_configured, send_user_notification',
    'from push_service import public_key, push_configured, send_category_notification, send_user_notification',
)
replace_once(
    "pwa_core.py",
    'from veranstaltungen_crud import get_aktive_veranstaltungen, init_veranstaltungen_db',
    'from veranstaltungen_crud import get_aktive_veranstaltungen, init_veranstaltungen_db\nfrom push_dashboard import push_dashboard_page',
)

old_update_call = '''    update_user_profile(\n        user.id,\n        name,\n        _trim(form.get("telefon"), 60),\n        _trim(form.get("push_muell"), 10) == "ja",\n    )'''
new_update_call = '''    push_fields = (\n        "push_meldungen", "push_dgh", "push_muell", "push_veranstaltungen",\n        "push_aktuelles", "push_buergerinfo", "push_vereine",\n        "push_feuerwehr", "push_verkehr", "push_warnungen",\n    )\n    push_preferences = {\n        field: _trim(form.get(field), 10) == "ja" for field in push_fields\n    }\n    update_user_profile(\n        user.id,\n        name,\n        _trim(form.get("telefon"), 60),\n        push_preferences["push_muell"],\n        push_preferences,\n    )'''
replace_once("pwa_core.py", old_update_call, new_update_call)

replace_once(
    "pwa_core.py",
    '            f"meldung-{ticket}",\n        )',
    '''            f"meldung-{ticket}",\n            "push_meldungen",\n        )''',
)
replace_once(
    "pwa_core.py",
    '            f"dgh-{item.id}",\n        )',
    '''            f"dgh-{item.id}",\n            "push_dgh",\n        )''',
)

insert_before_css = '''\n\n@app.get("/intern/push")\nasync def admin_push_page(request: Request, hinweis: str = "", fehler: str = ""):\n    legacy.check_dashboard_login(request)\n    return push_dashboard_page(PUSH_BROADCAST_CATEGORIES, hinweis=hinweis, fehler=fehler)\n\n\n@app.post("/intern/push/senden")\nasync def admin_push_send(request: Request, background_tasks: BackgroundTasks):\n    legacy.check_dashboard_login(request)\n    form = await request.form()\n    category = _trim(form.get("category"), 80)\n    title = _trim(form.get("title"), 120)\n    body = _trim(form.get("body"), 500)\n    url = _safe_next(form.get("url"), "/")\n    if category not in PUSH_BROADCAST_CATEGORIES:\n        return RedirectResponse(url="/intern/push?fehler=Ungültige%20Push-Kategorie.", status_code=303)\n    if not title or not body:\n        return RedirectResponse(url="/intern/push?fehler=Titel%20und%20Nachricht%20sind%20erforderlich.", status_code=303)\n    if not push_configured():\n        return RedirectResponse(url="/intern/push?fehler=Push%20ist%20auf%20dem%20Server%20nicht%20konfiguriert.", status_code=303)\n    background_tasks.add_task(\n        send_category_notification,\n        category,\n        title,\n        body,\n        url,\n        f"admin-{category}",\n    )\n    return RedirectResponse(\n        url=f"/intern/push?hinweis={quote('Push-Versand wurde gestartet. Es erhalten ihn nur Nutzer, die diese Kategorie aktiviert haben.')} ".strip(),\n        status_code=303,\n    )\n'''
replace_once("pwa_core.py", '\n\n@app.get("/pwa.css")', insert_before_css + '\n\n@app.get("/pwa.css")')

# fix accidental space risk in redirect expression with direct simpler replacement
text = read("pwa_core.py")
text = text.replace('url=f"/intern/push?hinweis={quote(\'Push-Versand wurde gestartet. Es erhalten ihn nur Nutzer, die diese Kategorie aktiviert haben.\')} ".strip(),', 'url=f"/intern/push?hinweis={quote(\'Push-Versand wurde gestartet. Es erhalten ihn nur Nutzer, die diese Kategorie aktiviert haben.\')}",')
write("pwa_core.py", text)

# ---------------------------------------------------------------------------
# Event pushes from legacy admin routes
# ---------------------------------------------------------------------------
replace_once(
    "main.py",
    'from fastapi import FastAPI, Request, Depends, HTTPException, Form, UploadFile, File',
    'from fastapi import FastAPI, Request, Depends, HTTPException, Form, UploadFile, File, BackgroundTasks',
)
replace_once(
    "main.py",
    'from veranstaltungen_crud import get_veranstaltung\n',
    'from veranstaltungen_crud import get_veranstaltung\nfrom push_service import send_category_notification\n',
)
replace_once(
    "main.py",
    'async def neue_veranstaltung(\n    titel: str = Form(...),',
    'async def neue_veranstaltung(\n    background_tasks: BackgroundTasks,\n    titel: str = Form(...),',
)
replace_once(
    "main.py",
    '    save_veranstaltung(\n        titel=titel,',
    '    event = save_veranstaltung(\n        titel=titel,',
)
replace_once(
    "main.py",
    '        bild_bytes=bild_bytes,\n    )\n\n    return RedirectResponse(url="/intern/veranstaltungen", status_code=303)',
    '''        bild_bytes=bild_bytes,\n    )\n    if event and event.aktiv == "Ja":\n        background_tasks.add_task(\n            send_category_notification,\n            "push_veranstaltungen",\n            f"Neue Veranstaltung: {event.titel}",\n            f"{event.datum or 'Termin folgt'} · {event.uhrzeit or 'Uhrzeit folgt'} · {event.ort or 'Ahnsen'}",\n            "/veranstaltungen",\n            f"veranstaltung-{event.id}",\n        )\n\n    return RedirectResponse(url="/intern/veranstaltungen", status_code=303)''',
)
replace_once(
    "main.py",
    'async def veranstaltung_bearbeiten(\n    veranstaltung_id: int,\n    titel: str = Form(...),',
    'async def veranstaltung_bearbeiten(\n    veranstaltung_id: int,\n    background_tasks: BackgroundTasks,\n    titel: str = Form(...),',
)
replace_once(
    "main.py",
    '    update_veranstaltung(\n        veranstaltung_id=veranstaltung_id,',
    '    event = update_veranstaltung(\n        veranstaltung_id=veranstaltung_id,',
)
replace_once(
    "main.py",
    '        bild_bytes=bild_bytes,\n    )\n\n    return RedirectResponse(url="/intern/veranstaltungen", status_code=303)\n\n\n@app.get("/veranstaltungen/aktiv/{veranstaltung_id}/{aktiv}")',
    '''        bild_bytes=bild_bytes,\n    )\n    if event and event.aktiv == "Ja":\n        background_tasks.add_task(\n            send_category_notification,\n            "push_veranstaltungen",\n            f"Veranstaltung aktualisiert: {event.titel}",\n            f"{event.datum or 'Termin folgt'} · {event.uhrzeit or 'Uhrzeit folgt'} · {event.ort or 'Ahnsen'}",\n            "/veranstaltungen",\n            f"veranstaltung-update-{event.id}",\n        )\n\n    return RedirectResponse(url="/intern/veranstaltungen", status_code=303)\n\n\n@app.get("/veranstaltungen/aktiv/{veranstaltung_id}/{aktiv}")''',
)

# ---------------------------------------------------------------------------
# Dashboard navigation and push warnings
# ---------------------------------------------------------------------------
replace_once(
    "intern_ui.py",
    '    "gemeindeseite": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h2m4 0h10M4 18h7m4 0h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/></svg>""",',
    '''    "gemeindeseite": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h2m4 0h10M4 18h7m4 0h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/></svg>""",\n    "push": """<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>""",''',
)
replace_once(
    "intern_ui.py",
    '        ("gemeindeseite", "/intern/gemeindeseite", "Inhalte"),\n    ]',
    '        ("gemeindeseite", "/intern/gemeindeseite", "Inhalte"),\n        ("push", "/intern/push", "Push"),\n    ]',
)
replace_once(
    "intern_ui.py",
    'grid-template-columns:repeat(5, minmax(0,1fr));',
    'grid-template-columns:repeat(6, minmax(0,1fr));',
)

replace_once(
    "dashboard.py",
    '<form class="admin-status-form" method="get" action="/status">',
    '''<form class="admin-status-form" method="get" action="/status" onsubmit="return confirm('Status wirklich ändern? Wenn der Bürger Push für eigene Mängel aktiviert hat, erhält er direkt eine Benachrichtigung.')">''',
)
replace_once(
    "dashboard.py",
    '        <button type="submit">Speichern</button>\n    </form>',
    '''        <button type="submit">Speichern</button>\n        <small class="admin-push-hint">🔔 Push bei Statusänderung</small>\n    </form>''',
)
replace_once(
    "dashboard.py",
    '.admin-status-form {{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px; align-items:center; }}',
    '.admin-status-form {{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px; align-items:center; }}\n            .admin-push-hint {{ grid-column:1/-1; color:#8a6115; font-size:10px; font-weight:850; }}',
)

replace_once(
    "dgh_dashboard.py",
    '<form class="dgh-status-form" method="post" action="/dgh/status/{term.id}">',
    '''<form class="dgh-status-form" method="post" action="/dgh/status/{term.id}" onsubmit="return confirm('Status wirklich ändern? Wenn der Bürger Push für DGH-Anfragen aktiviert hat, erhält er direkt eine Benachrichtigung.')">''',
)
replace_once(
    "dgh_dashboard.py",
    '        <button type="submit">Speichern</button>\n    </form>',
    '''        <button type="submit">Speichern</button>\n        <small class="dgh-push-hint">🔔 Push bei Statusänderung</small>\n    </form>''',
)
replace_once(
    "dgh_dashboard.py",
    '.dgh-form {{ display:grid; gap:11px; }}',
    '.dgh-form {{ display:grid; gap:11px; }}\n            .dgh-push-hint {{ grid-column:1/-1; color:#8a6115; font-size:10px; font-weight:850; }}',
)

replace_once(
    "veranstaltungen_dashboard.py",
    '<form class="event-form" method="post" action="{form_action}" enctype="multipart/form-data">',
    '''<form class="event-form" method="post" action="{form_action}" enctype="multipart/form-data" onsubmit="return confirm('Veranstaltung speichern? Nutzer mit aktivierter Kategorie Veranstaltungen erhalten anschließend eine Push-Nachricht.')">''',
)
replace_once(
    "veranstaltungen_dashboard.py",
    '<p class="event-card-intro">Alle Angaben können später jederzeit angepasst werden.</p>\n                    <form class="event-form"',
    '''<p class="event-card-intro">Alle Angaben können später jederzeit angepasst werden.</p>\n                    <div class="event-push-warning"><strong>🔔 Push-Hinweis</strong><span>Beim Öffnen von „Bearbeiten“ wird noch nichts versendet. Erst beim Speichern erhalten Nutzer mit aktivierter Veranstaltungs-Kategorie eine Push-Nachricht.</span></div>\n                    <form class="event-form"''',
)
replace_once(
    "veranstaltungen_dashboard.py",
    '.event-form {{ display:grid; gap:12px; }}',
    '.event-form {{ display:grid; gap:12px; }}\n            .event-push-warning {{ display:grid; gap:4px; margin:0 0 13px; padding:12px 13px; border:1px solid #efd99b; border-radius:14px; color:#79530e; background:#fff7dd; font-size:12px; line-height:1.45; }}',
)

# Waste job now also enforces the category inside push_service.
replace_once(
    "pwa_push_job.py",
    '            f"muell-{tomorrow.isoformat()}",\n        )',
    '''            f"muell-{tomorrow.isoformat()}",\n            "push_muell",\n        )''',
)

# ---------------------------------------------------------------------------
# New manual Push dashboard
# ---------------------------------------------------------------------------
push_dashboard = r'''from html import escape

from fastapi.responses import HTMLResponse

from intern_ui import intern_nav, intern_nav_css
from pwa_crud import get_users_for_push_category


DEFAULT_URLS = {
    "push_veranstaltungen": "/veranstaltungen",
    "push_aktuelles": "/aktuelles",
    "push_buergerinfo": "/buergerinformationen",
    "push_vereine": "/vereine",
    "push_feuerwehr": "/feuerwehr",
    "push_verkehr": "/aktuelles",
    "push_warnungen": "/",
    "push_muell": "/muelltermine-info",
}


def push_dashboard_page(categories: dict[str, str], hinweis: str = "", fehler: str = "") -> HTMLResponse:
    options = []
    cards = []
    for key, label in categories.items():
        count = len(get_users_for_push_category(key))
        options.append(f'<option value="{escape(key)}" data-url="{escape(DEFAULT_URLS.get(key, "/"))}">{escape(label)}</option>')
        cards.append(
            f'<article class="push-stat"><span>{escape(label)}</span><strong>{count}</strong><small>Opt-in Konten</small></article>'
        )

    message = ""
    if hinweis:
        message += f'<div class="message">✓ {escape(hinweis)}</div>'
    if fehler:
        message += f'<div class="message error">⚠ {escape(fehler)}</div>'

    html = f"""
    <!doctype html>
    <html lang="de">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="theme-color" content="#174936">
      <title>Push-Nachrichten · Ahnsen hilft</title>
      <style>
        {intern_nav_css()}
        .push-stats{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}}
        .push-stat{{padding:17px;border:1px solid var(--admin-line);border-radius:20px;background:var(--admin-paper);box-shadow:var(--admin-shadow-soft)}}
        .push-stat span{{display:block;color:var(--admin-muted);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}}
        .push-stat strong{{display:block;margin:6px 0;color:var(--admin-forest);font-family:Georgia,serif;font-size:34px}}
        .push-stat small{{color:var(--admin-muted)}}
        .push-layout{{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:20px;align-items:start}}
        .push-form{{display:grid;gap:13px}}
        .push-field{{display:grid;gap:6px}}.push-field span{{font-size:12px;font-weight:900;color:#465349}}
        .push-warning{{padding:14px;border:1px solid #efd99b;border-radius:16px;color:#79530e;background:#fff7dd;line-height:1.5}}
        .push-warning strong{{display:block;margin-bottom:4px}}
        .push-help{{display:grid;gap:10px}}.push-help article{{padding:14px;border-radius:16px;background:#f5f8f2}}
        .push-help h3{{margin:0 0 5px;font-size:16px!important}}.push-help p{{margin:0;color:var(--admin-muted);line-height:1.45}}
        @media(max-width:950px){{.push-layout{{grid-template-columns:1fr}}.push-stats{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}
        @media(max-width:520px){{.push-stats{{grid-template-columns:1fr 1fr}}}}
      </style>
    </head>
    <body>
      <main class="admin-page">
        {intern_nav("push")}
        <section class="admin-hero">
          <span class="admin-eyebrow">Benachrichtigungszentrale</span>
          <h1>Push-Nachrichten</h1>
          <p>Sende gezielte Informationen nur an Bürger, die die jeweilige Kategorie in ihrem Profil ausdrücklich aktiviert haben.</p>
        </section>
        {message}
        <section class="push-stats">{''.join(cards)}</section>
        <div class="push-layout">
          <section class="box">
            <h2>Nachricht senden</h2>
            <div class="push-warning"><strong>🔔 Wird sofort als Push versendet</strong>Beim Absenden erhalten alle aktuell registrierten Geräte der Opt-in-Nutzer dieser Kategorie die Nachricht.</div>
            <form class="push-form" method="post" action="/intern/push/senden" onsubmit="return confirm('Push-Nachricht jetzt wirklich an alle Opt-in-Nutzer dieser Kategorie senden?')">
              <label class="push-field"><span>Kategorie *</span><select id="push-category" name="category" required>{''.join(options)}</select></label>
              <label class="push-field"><span>Titel *</span><input name="title" maxlength="120" required placeholder="z. B. Straßensperrung in der Flöte"></label>
              <label class="push-field"><span>Nachricht *</span><textarea name="body" maxlength="500" required placeholder="Kurze, klare Information für die Bürger"></textarea></label>
              <label class="push-field"><span>Zielseite in der PWA</span><input id="push-url" name="url" value="/veranstaltungen" maxlength="500"></label>
              <button type="submit">🔔 Push jetzt senden</button>
            </form>
          </section>
          <aside class="box push-help">
            <h2>Automatische Pushs</h2>
            <article><h3>Mängelmeldungen</h3><p>Bei einer Statusänderung erhält nur der betreffende Bürger eine Nachricht, sofern aktiviert.</p></article>
            <article><h3>DGH-Anfragen</h3><p>Zu- und Absagen sowie Statusänderungen gehen nur an den Antragsteller, sofern aktiviert.</p></article>
            <article><h3>Veranstaltungen</h3><p>Neue und bearbeitete aktive Veranstaltungen werden automatisch an Veranstaltungs-Abonnenten gesendet.</p></article>
            <article><h3>Müllabfuhr</h3><p>Die Erinnerung läuft weiterhin automatisch am Vortag um 18 Uhr.</p></article>
          </aside>
        </div>
      </main>
      <script>
        const category=document.getElementById('push-category');
        const url=document.getElementById('push-url');
        category?.addEventListener('change',()=>{const option=category.options[category.selectedIndex];if(option?.dataset.url)url.value=option.dataset.url;});
      </script>
    </body>
    </html>
    """
    return HTMLResponse(html)
'''
write("push_dashboard.py", push_dashboard)

print("Push preferences, broadcasts and dashboard warnings applied.")
