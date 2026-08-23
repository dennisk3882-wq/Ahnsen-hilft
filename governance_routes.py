from __future__ import annotations

import json
from datetime import datetime
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

import main as legacy
from community_crud import audit_event
from intern_ui import admin_page as _page
from community_models import CitizenMessage, CitizenPreference, Idea, IdeaComment, IdeaSupport, NeighborPost
from database import SessionLocal
from dgh_models import DGHTermin
from governance import ROLES, begin_admin_totp, case_history, confirm_admin_totp, create_restore_revision, disable_admin_totp, get_admin, list_admins, review_content_revision, save_admin, save_content_revision, set_admin_active, update_case
from admin_content import apply_content_payload, content_approval_available
from admin_access import REQUIRED_2FA_ROLES, ROLE_PERMISSIONS, requires_two_factor
from governance_models import ContentRevision
from models import Meldung
from neighborhood_models import NeighborConversation, NeighborReport
from pwa_core import _require_user
from pwa_models import PWAUser, PushDelivery, PushSubscription
from push_service import send_user_notification
from operations import create_backup, encrypt_backup, load_backup_bytes, scheduled_backup_status, validate_backup


router = APIRouter()


def _admin(request: Request):
    return legacy.check_dashboard_login(request)


@router.get("/intern/sicherung")
async def backup_center(request: Request, hinweis: str = ""):
    admin = _admin(request)
    if admin["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Nur der Superadmin darf Gesamtsicherungen verwalten.")
    notice = f"<p role=status>{escape(hinweis)}</p>" if hinweis else ""
    status = scheduled_backup_status()
    automatic = (f"Aktiv · {status['count']} Datei(en) · zuletzt {escape(status['latest'] or 'noch nicht erstellt')} · Aufbewahrung {status['retention_days']} Tage" if status["configured"] else "Noch nicht vollständig konfiguriert: BACKUP_DIRECTORY und BACKUP_ENCRYPTION_KEY müssen im Render-Dienst gesetzt werden.")
    trigger = '<form method="post" action="/intern/sicherung/automatisch-starten"><button class="admin-button" type="submit">Automatische Sicherung jetzt testen</button></form>' if status["configured"] else ''
    body = f"""<section><span class="eyebrow">Betrieb & Notfallvorsorge</span><h1>Datensicherung</h1><p>Vollständige, verschlüsselte und prüfbare Sicherung der Datenbank und dauerhaft gespeicherter Bilder.</p></section>{notice}<section class="admin-grid"><article class="admin-section"><h2>Verschlüsselte Sicherung herunterladen</h2><p>Vergib ein Kennwort mit mindestens 12 Zeichen. Es wird nicht gespeichert und wird für eine Wiederherstellung benötigt.</p><form class="admin-form" method="post" action="/intern/sicherung/download"><label>Sicherungskennwort<input type="password" name="passphrase" minlength="12" autocomplete="new-password" required></label><button class="admin-button" type="submit">Verschlüsselte Sicherung erstellen</button></form></article><article class="admin-section"><h2>Sicherung prüfen</h2><p>Entschlüsselt die Datei nur im Arbeitsspeicher und kontrolliert Format, Prüfsumme und Datensatzanzahl, ohne Daten zu verändern.</p><form class="admin-form" method="post" action="/intern/sicherung/pruefen" enctype="multipart/form-data"><label>Sicherungsdatei<input type="file" name="datei" accept=".ahnsenbak,application/octet-stream,application/json,.json" required></label><label>Kennwort<input type="password" name="passphrase" autocomplete="current-password"></label><button class="admin-button" type="submit">Sicherung prüfen</button></form></article></section><section class="admin-section"><h2>Automatische tägliche Sicherung</h2><p>{escape(automatic)}</p><p>Das Verzeichnis muss außerhalb des flüchtigen Webservice-Dateisystems liegen. Der Systemcheck warnt, wenn keine aktuelle Sicherung gefunden wird.</p>{trigger}</section><section class="admin-section"><h2>Wiederherstellung</h2><p>Eine Wiederherstellung bleibt bewusst ein kontrollierter, transaktionaler Servervorgang. Das Restore-Skript validiert zuerst Datei, Prüfsumme und Schema, sortiert Tabellen nach Abhängigkeiten und verändert ohne den Bestätigungscode <code>RESTORE-AHNSEN</code> keine Daten.</p></section>"""
    return _page("Datensicherung", "sicherung", body)


@router.post("/intern/sicherung/automatisch-starten")
async def backup_run_now(request: Request):
    admin = _admin(request)
    if admin["role"] != "superadmin":
        raise HTTPException(status_code=403)
    from operations import run_scheduled_backup
    result = run_scheduled_backup(force=True)
    audit_event(admin["username"], "Automatische Sicherung manuell getestet", "backup", str(result.get("status") or ""), json.dumps(result, ensure_ascii=False))
    if result.get("status") != "created":
        message = "Automatische Sicherung konnte nicht erstellt werden. Bitte Speicherort und Schlüssel prüfen."
    else:
        message = f"Automatische Sicherung wurde erfolgreich erstellt und geprüft: {result.get('filename', '')}."
    return RedirectResponse("/intern/sicherung?hinweis=" + quote(message), status_code=303)


@router.post("/intern/sicherung/download")
async def backup_download(request: Request):
    admin = _admin(request)
    if admin["role"] != "superadmin":
        raise HTTPException(status_code=403)
    form = await request.form()
    passphrase = str(form.get("passphrase") or "")
    payload = create_backup()
    try:
        raw = encrypt_backup(payload, passphrase)
    except ValueError as error:
        return RedirectResponse("/intern/sicherung?hinweis=" + quote(str(error)), status_code=303)
    filename = f"ahnsen-hilft-sicherung-{payload['created_at'][:10]}.ahnsenbak"
    audit_event(admin["username"], "Gesamtsicherung heruntergeladen", "backup", payload["created_at"], json.dumps({"tables": len(payload["tables"])}, ensure_ascii=False))
    return Response(content=raw, media_type="application/octet-stream", headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


@router.post("/intern/sicherung/pruefen")
async def backup_validate(request: Request):
    admin = _admin(request)
    if admin["role"] != "superadmin":
        raise HTTPException(status_code=403)
    form = await request.form(); upload = form.get("datei")
    try:
        raw = await upload.read()
        if len(raw) > 100 * 1024 * 1024:
            raise ValueError("Die Sicherungsdatei ist größer als 100 MB.")
        payload, encrypted = load_backup_bytes(raw, str(form.get("passphrase") or ""))
        result = validate_backup(payload)
        result["encrypted"] = encrypted
    except Exception as error:
        result = {"valid": False, "error": str(error)[:300], "tables": 0, "rows": 0, "checksum": False}
    audit_event(admin["username"], "Sicherungsdatei geprüft", "backup", "gültig" if result.get("valid") else "ungültig", json.dumps(result, ensure_ascii=False))
    message = (f"Sicherung gültig und {'verschlüsselt' if result.get('encrypted') else 'unverschlüsselt'}: {result['tables']} Tabellen mit {result['rows']} Datensätzen; Prüfsumme stimmt." if result.get("valid") else f"Sicherung ungültig: {result.get('error') or 'Format, Kennwort oder Prüfsumme stimmt nicht.'}")
    return RedirectResponse("/intern/sicherung?hinweis=" + quote(message), status_code=303)


@router.post("/intern/meldung/{ticket}/workflow")
async def save_case_workflow(request: Request, ticket: str, background_tasks: BackgroundTasks):
    admin = _admin(request)
    form = await request.form()
    status = str(form.get("status") or "Offen")
    if status not in {"Offen", "In Bearbeitung", "Warten auf Rückmeldung", "Erledigt", "Abgelehnt"}:
        status = "Offen"
    priority = str(form.get("priority") or "Normal")
    if priority not in {"Niedrig", "Normal", "Hoch", "Dringend"}:
        priority = "Normal"
    item = update_case(ticket, {
        "status": status,
        "assigned_to": str(form.get("assigned_to") or "").strip()[:120],
        "responsibility": str(form.get("responsibility") or "").strip()[:120],
        "priority": priority,
        "due_at": str(form.get("due_at") or "").strip(),
        "public_note": str(form.get("public_note") or "").strip()[:2000],
    }, actor=admin["display_name"])
    if not item:
        raise HTTPException(status_code=404, detail="Vorgang nicht gefunden")
    if item.pwa_user_id:
        background_tasks.add_task(send_user_notification, item.pwa_user_id, f"Vorgang {item.ticket} aktualisiert", f"Neuer Status: {item.status}", f"/meldestatus?ticket={quote(item.ticket)}", f"case-{item.ticket}-{item.updated_at}", None)
    return RedirectResponse(f"/intern/meldung/{quote(ticket)}", status_code=303)


@router.post("/intern/meldung/{ticket}/foto-loeschen")
async def delete_case_photo(request: Request, ticket: str):
    admin = _admin(request)
    db = SessionLocal()
    try:
        item = db.query(Meldung).filter(Meldung.ticket == ticket).first()
        if not item:
            raise HTTPException(status_code=404, detail="Vorgang nicht gefunden")
        item.foto_base64 = None
        item.foto_vorhanden = "Nein"
        item.updated_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()
    audit_event(admin["username"], "Mängelfoto gelöscht", "meldung", ticket)
    return RedirectResponse(f"/intern/meldung/{quote(ticket)}", status_code=303)


@router.get("/intern/benutzer")
async def admin_users(request: Request, hinweis: str = ""):
    admin = _admin(request)
    if admin["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Nur der Superadmin verwaltet Zugänge.")
    row_items = []
    for item in list_admins():
        two_factor = "Aktiv" if item.totp_enabled else ("Beim nächsten Login erforderlich" if item.role in REQUIRED_2FA_ROLES else "Optional")
        reset = ""
        if item.totp_enabled:
            reset = f"<form method='post' action='/intern/benutzer/{escape(item.username)}/2fa' onsubmit=\"return confirm('2FA wirklich zurücksetzen? Das Konto muss sie beim nächsten Login neu einrichten.')\"><button class='admin-button secondary' name='enabled' value='0'>2FA zurücksetzen</button></form>"
        active_label = "Sperren" if item.active else "Reaktivieren"
        active_value = "0" if item.active else "1"
        active_class = "secondary" if item.active else ""
        last_login = item.last_login_at.strftime("%d.%m.%Y %H:%M") if getattr(item, "last_login_at", None) else "Noch nie"
        row_items.append(f"<tr><td><strong>{escape(item.display_name)}</strong><br><small>{escape(item.username)}</small></td><td>{escape(ROLES.get(item.role,item.role))}</td><td><span class='status-chip'>{'Aktiv' if item.active else 'Gesperrt'}</span></td><td>{escape(two_factor)}</td><td>{escape(last_login)}</td><td><div style='display:flex;flex-wrap:wrap;gap:6px'>{reset}<form method='post' action='/intern/benutzer/{escape(item.username)}/aktiv' onsubmit=\"return confirm('Zugang wirklich {active_label.casefold()}?')\"><button class='admin-button {active_class}' name='active' value='{active_value}'>{active_label}</button></form></div></td></tr>")
    rows = "".join(row_items)
    options = "".join(f"<option value='{escape(key)}'>{escape(label)}</option>" for key,label in ROLES.items())
    permission_labels = {
        "*": "alle Bereiche", "cases": "Mängel", "content": "Inhalte", "dgh": "DGH",
        "waste": "Müll", "events": "Termine", "warnings": "Warnungen", "push": "Push",
        "messages": "Nachrichten", "moderation": "Beteiligung", "politics": "Politik",
        "reports": "Berichte", "audit": "Audit", "compliance": "Freigabe", "system": "System",
        "read": "Cockpit", "read_all": "alle fachlichen Bereiche nur lesen",
    }
    role_cards = []
    for key, label in ROLES.items():
        rights = sorted(ROLE_PERMISSIONS.get(key, set()))
        readable = ", ".join(permission_labels.get(value, value) for value in rights)
        requirement = "2FA verpflichtend" if key in REQUIRED_2FA_ROLES else "2FA optional"
        role_cards.append(f'<article class="admin-card"><h3>{escape(label)}</h3><p>{escape(readable)}</p><small>{escape(requirement)}</small></article>')
    notice = f'<div class="admin-row" role="status">{escape(hinweis)}</div>' if hinweis else ''
    body = f"""<section><span class="eyebrow">Sicherer Verwaltungszugang</span><h1>Verwaltungskonten</h1><p>Jede Person erhält einen eigenen Zugang mit passender Rolle. Vollzugriff, Gemeindeverwaltung und Bürgermeister müssen 2FA beim eigenen nächsten Login einrichten; der geheime Schlüssel wird keinem anderen Konto angezeigt.</p></section>{notice}<section class="admin-section"><div class="table-wrap"><table class="admin-table"><thead><tr><th>Konto</th><th>Rolle</th><th>Status</th><th>2FA</th><th>Letzte Anmeldung</th><th>Aktionen</th></tr></thead><tbody>{rows}</tbody></table></div></section><section class="admin-section"><h2>Konto anlegen oder ändern</h2><form class="admin-form" method="post"><div class="admin-grid"><label>Benutzername<input name="username" required maxlength="80"></label><label>Anzeigename<input name="display_name" required maxlength="120"></label><label>Rolle<select name="role">{options}</select></label><label>Passwort <input type="password" name="password" minlength="12"><small>Bei einem neuen Konto mindestens 12 Zeichen; bei Änderungen leer lassen.</small></label></div><button class="admin-button" type="submit">Konto speichern</button></form></section><section class="admin-section"><h2>Rollen- und Rechteübersicht</h2><p>Die Navigation und jeder Serverzugriff verwenden dieselbe zentrale Rechtequelle. „Nur lesen“ kann fachliche Inhalte ansehen, aber weder ändern noch Zugänge, Sicherungen, Audit oder Systemdaten öffnen.</p><div class="admin-grid">{''.join(role_cards)}</div></section>"""
    return _page("Verwaltungskonten", "benutzer", body)


@router.post("/intern/benutzer/{username}/aktiv")
async def admin_user_active(request: Request, username: str):
    admin = _admin(request)
    if admin["role"] != "superadmin":
        raise HTTPException(status_code=403)
    form = await request.form()
    active = str(form.get("active") or "") == "1"
    try:
        item = set_admin_active(username, active, actor_username=admin["username"])
        if not item:
            message = "Verwaltungskonto wurde nicht gefunden."
        else:
            message = "Verwaltungskonto wurde reaktiviert." if active else "Verwaltungskonto wurde gesperrt; bestehende Sitzungen sind beendet."
            audit_event(admin["username"], "Verwaltungskonto reaktiviert" if active else "Verwaltungskonto gesperrt", "admin_user", username)
    except ValueError as error:
        message = str(error)
    return RedirectResponse("/intern/benutzer?hinweis=" + quote(message), status_code=303)


@router.post("/intern/benutzer")
async def admin_user_save(request: Request):
    admin = _admin(request)
    if admin["role"] != "superadmin": raise HTTPException(status_code=403)
    form = await request.form()
    try:
        target = str(form.get("username") or "").strip()
        save_admin(target, str(form.get("display_name") or "").strip(), str(form.get("role") or "read_only"), str(form.get("password") or ""))
        audit_event(admin["username"], "Verwaltungskonto gespeichert", "admin_user", target)
        message = "Verwaltungskonto wurde gespeichert."
    except ValueError as error:
        message = str(error)
    return RedirectResponse("/intern/benutzer?hinweis=" + quote(message), status_code=303)


@router.post("/intern/benutzer/{username}/2fa")
async def admin_user_totp(request: Request, username: str):
    admin = _admin(request)
    if admin["role"] != "superadmin": raise HTTPException(status_code=403)
    form = await request.form(); enabled = str(form.get("enabled") or "") == "1"
    if not enabled:
        disable_admin_totp(username)
        audit_event(admin["username"], "Zwei-Faktor-Anmeldung abgeschaltet", "admin_user", username)
        return RedirectResponse("/intern/benutzer?hinweis=" + quote("2FA wurde abgeschaltet; bestehende Sitzungen wurden beendet."), status_code=303)
    return RedirectResponse("/intern/benutzer?hinweis=" + quote("2FA richtet jedes Konto aus Sicherheitsgründen selbst ein."), status_code=303)


@router.get("/intern/2fa/einrichten")
async def own_totp_setup(request: Request):
    admin = _admin(request)
    account = get_admin(admin["username"])
    if not account or not requires_two_factor(account.role):
        return RedirectResponse("/intern/cockpit", status_code=303)
    if account.totp_enabled:
        return RedirectResponse("/intern/cockpit", status_code=303)
    secret = begin_admin_totp(account.username)
    body = f"""<section><span class='eyebrow'>Verpflichtende Kontosicherheit</span><h1>2FA jetzt einrichten</h1><p>Dieses Konto besitzt erweiterte Rechte. Hinterlege den Schlüssel in einer kostenlosen Authenticator-App. Der Schlüssel wird nur in deiner eigenen Sitzung angezeigt.</p></section><section class='admin-section'><p style='padding:18px;background:#eef5eb;border-radius:12px;font:700 20px monospace;overflow-wrap:anywhere'>{escape(secret)}</p><ol><li>Authenticator-App öffnen.</li><li>Konto manuell hinzufügen.</li><li>Den Schlüssel eintragen und den sechsstelligen Code bestätigen.</li></ol><form class='admin-form' method='post' action='/intern/2fa/bestaetigen'><label>Sechsstelliger Code<input name='code' inputmode='numeric' autocomplete='one-time-code' pattern='[0-9]{{6}}' required autofocus></label><button class='admin-button'>2FA aktivieren</button></form><p><a href='/logout'>Abmelden</a></p></section>"""
    return _page("2FA einrichten", "benutzer", body)


@router.post("/intern/2fa/bestaetigen")
async def own_totp_confirm(request: Request):
    admin = _admin(request)
    form = await request.form()
    codes = confirm_admin_totp(admin["username"], str(form.get("code") or ""))
    if not codes:
        return RedirectResponse("/intern/2fa/einrichten", status_code=303)
    account = get_admin(admin["username"])
    audit_event(admin["username"], "Zwei-Faktor-Anmeldung selbst aktiviert", "admin_user", admin["username"])
    code_html = "".join(f"<li><code>{escape(value)}</code></li>" for value in codes)
    body = f"""<section><span class='eyebrow'>Kontosicherheit</span><h1>2FA ist aktiv</h1><p>Speichere diese einmalig angezeigten Wiederherstellungscodes sicher. Jeder Code funktioniert nur einmal.</p></section><section class='admin-section'><ul style='font:700 18px monospace;line-height:1.8'>{code_html}</ul><form method='post' action='/intern/2fa/abschliessen'><button class='admin-button' type='submit'>Codes sind sicher gespeichert</button></form></section>"""
    response = _page("2FA ist aktiv", "benutzer", body)
    response.set_cookie(key=legacy.SESSION_COOKIE, value=legacy._neue_session(account.username, account.role, int(account.session_version or 1)), max_age=legacy.SESSION_MAX_AGE, httponly=True, secure=True, samesite="lax")
    return response


@router.post("/intern/2fa/abschliessen")
async def own_totp_finish(request: Request):
    _admin(request)
    return RedirectResponse("/intern/cockpit", status_code=303)


@router.get("/intern/inhalte/versionen")
async def content_versions(request: Request, hinweis: str = ""):
    admin = _admin(request); db=SessionLocal()
    try: items=db.query(ContentRevision).order_by(ContentRevision.created_at.desc()).limit(100).all()
    finally: db.close()
    previous_payloads = {}
    card_items = []
    for item in reversed(items):
        try: payload = json.loads(item.payload_json or "{}")
        except Exception: payload = {}
        prior = previous_payloads.get((item.area, item.object_id), {})
        changes = []
        for key in sorted(set(prior) | set(payload)):
            if str(prior.get(key, "")) != str(payload.get(key, "")):
                changes.append(f"<li><strong>{escape(str(key))}</strong>: {escape(str(prior.get(key, ''))[:120])} → {escape(str(payload.get(key, ''))[:120])}</li>")
        previous_payloads[(item.area, item.object_id)] = payload
        actions = []
        if item.state == "Prüfung" and item.actor != admin["username"]:
            actions.append(f"<form method='post' action='/intern/inhalte/versionen/{item.id}/entscheiden'><button class='admin-button' name='decision' value='approve'>Prüfen und freigeben</button><button class='admin-button secondary' name='decision' value='reject'>Ablehnen</button></form>")
        if item.state == "Freigegeben" and item.area in {"gemeindeseite", "plattform"}:
            actions.append(f"<form method='post' action='/intern/inhalte/versionen/{item.id}/wiederherstellen' onsubmit=\"return confirm('Diese frühere Version wirklich zur Wiederherstellung vormerken?')\"><button class='admin-button secondary'>Version wiederherstellen</button></form>")
        review = f" · geprüft von {escape(item.reviewed_by)}" if item.reviewed_by else ""
        detail = "".join(changes) or "<li>Erste gespeicherte Version oder keine Feldänderung.</li>"
        card_items.append(f"<article class='admin-row'><small>{escape(item.area)} · {escape(item.object_id)} · Version {item.version}</small><h3>{escape(item.title or 'Ohne Titel')}</h3><span class='status-chip'>{escape(item.state)}</span><p>{item.created_at:%d.%m.%Y %H:%M} · erstellt von {escape(item.actor)}{review}</p><details><summary>Änderungen anzeigen</summary><ul>{detail}</ul></details>{''.join(actions)}</article>")
    cards = "".join(reversed(card_items))
    mode = "Vier-Augen-Freigabe aktiv" if content_approval_available(admin["username"]) else "Einzelbetrieb: Veröffentlichungen werden direkt freigegeben, bis ein zweites berechtigtes Konto vorhanden ist."
    notice = f'<div class="admin-row" role="status">{escape(hinweis)}</div>' if hinweis else ''
    body=f"""<section><span class="eyebrow">Redaktion</span><h1>Inhaltsversionen</h1><p>Änderungen werden verglichen, geprüft und kontrolliert wiederhergestellt. <strong>{escape(mode)}</strong></p></section>{notice}<section class="admin-section"><div class="admin-list">{cards or '<div class="admin-row">Noch keine Versionen gespeichert.</div>'}</div></section><section class="admin-section"><h2>Redaktionellen Entwurf anlegen</h2><form class="admin-form" method="post"><div class="admin-grid"><label>Bereich<select name="area"><option value="gemeindeseite">Gemeindeseite</option><option value="plattform">Plattform</option></select></label><label>Kennung<input name="object_id" value="standard" required maxlength="120"></label><label>Titel<input name="title" required maxlength="200"></label><label>Status<select name="state"><option>Entwurf</option><option>Prüfung</option></select></label></div><label>Inhalt als JSON-Objekt<textarea name="content" maxlength="20000" placeholder='{{"schluessel":"Wert"}}'></textarea></label><button class="admin-button" type="submit">Version speichern</button></form></section>"""
    return _page("Inhaltsversionen", "versionen", body)


@router.post("/intern/inhalte/versionen")
async def content_version_save(request: Request):
    admin = _admin(request); form = await request.form()
    area = str(form.get("area") or "")
    if area not in {"gemeindeseite", "plattform"}:
        return RedirectResponse("/intern/inhalte/versionen?hinweis=" + quote("Unbekannter Inhaltsbereich."), status_code=303)
    try:
        payload = json.loads(str(form.get("content") or "{}"))
        if not isinstance(payload, dict): raise ValueError
    except Exception:
        return RedirectResponse("/intern/inhalte/versionen?hinweis=" + quote("Inhalt muss ein gültiges JSON-Objekt sein."), status_code=303)
    state = "Prüfung" if str(form.get("state") or "") == "Prüfung" else "Entwurf"
    revision=save_content_revision(area,str(form.get("object_id") or ""),state,str(form.get("title") or ""),payload,admin["username"])
    audit_event(admin["username"], "Inhaltsversion gespeichert", "content_revision", str(getattr(revision, "id", "")), str(form.get("title") or ""))
    return RedirectResponse("/intern/inhalte/versionen",status_code=303)


@router.post("/intern/inhalte/versionen/{revision_id}/entscheiden")
async def content_version_decide(request: Request, revision_id: int):
    admin = _admin(request); form = await request.form()
    approve = str(form.get("decision") or "") == "approve"
    try:
        item = review_content_revision(revision_id, admin["username"], approve=approve)
        audit_event(admin["username"], "Inhaltsversion freigegeben" if approve else "Inhaltsversion abgelehnt", "content_revision", str(item.id), item.title)
        message = "Version wurde veröffentlicht." if approve else "Version wurde abgelehnt und archiviert."
    except ValueError as error:
        message = str(error)
    return RedirectResponse("/intern/inhalte/versionen?hinweis=" + quote(message), status_code=303)


@router.post("/intern/inhalte/versionen/{revision_id}/wiederherstellen")
async def content_version_restore(request: Request, revision_id: int):
    admin = _admin(request)
    try:
        item = create_restore_revision(revision_id, admin["username"])
        if not content_approval_available(admin["username"]):
            payload = json.loads(item.payload_json or "{}")
            apply_content_payload(item.area, payload)
            db = SessionLocal()
            try:
                stored = db.query(ContentRevision).filter(ContentRevision.id == item.id).first()
                stored.state = "Freigegeben"; stored.reviewed_by = admin["username"]; stored.reviewed_at = datetime.utcnow(); stored.applied_at = datetime.utcnow(); db.commit()
            finally: db.close()
            message = "Version wurde im Einzelbetrieb wiederhergestellt."
        else:
            message = "Wiederherstellung wartet auf Freigabe durch ein zweites Konto."
        audit_event(admin["username"], "Wiederherstellung angefordert", "content_revision", str(item.id), f"Quelle {revision_id}")
    except ValueError as error:
        message = str(error)
    return RedirectResponse("/intern/inhalte/versionen?hinweis=" + quote(message), status_code=303)


@router.get("/profil/datenexport")
async def citizen_export(request: Request):
    user=_require_user(request); db=SessionLocal()
    try:
        payload={"profil":{"email":user.email,"name":user.name,"telefon":user.telefon,"erstellt_am":user.erstellt_am.isoformat()},"maengel":[{"ticket":x.ticket,"status":x.status,"art":x.art,"ort":x.ort,"beschreibung":x.beschreibung,"erstellt_am":x.erstellt_am.isoformat()} for x in db.query(Meldung).filter(Meldung.pwa_user_id==user.id).all()],"dgh":[{"id":x.id,"status":x.status,"datum":x.datum,"anlass":x.anlass} for x in db.query(DGHTermin).filter(DGHTermin.pwa_user_id==user.id).all()],"ideen":[{"id":x.id,"title":x.title,"status":x.status} for x in db.query(Idea).filter(Idea.user_id==user.id).all()],"nachbarschaft":[{"id":x.id,"title":x.title,"status":x.status} for x in db.query(NeighborPost).filter(NeighborPost.user_id==user.id).all()]}
    finally: db.close()
    return JSONResponse(payload,headers={"Content-Disposition":'attachment; filename="ahnsen-hilft-datenexport.json"'})


@router.post("/profil/konto-loeschen")
async def citizen_delete(request: Request):
    user=_require_user(request); form=await request.form()
    if str(form.get("confirmation") or "").strip().upper() != "LÖSCHEN": return RedirectResponse("/profil?fehler="+quote("Bitte LÖSCHEN zur Bestätigung eingeben."),status_code=303)
    db=SessionLocal()
    try:
        db.query(PushSubscription).filter(PushSubscription.user_id==user.id).delete(); db.query(PushDelivery).filter(PushDelivery.user_id==user.id).delete(); db.query(CitizenMessage).filter(CitizenMessage.user_id==user.id).delete(); db.query(CitizenPreference).filter(CitizenPreference.user_id==user.id).delete(); db.query(IdeaSupport).filter(IdeaSupport.user_id==user.id).delete(); db.query(IdeaComment).filter(IdeaComment.user_id==user.id).delete(); db.query(NeighborReport).filter(NeighborReport.reporter_user_id==user.id).delete();
        current=db.query(PWAUser).filter(PWAUser.id==user.id).first(); current.email=f"deleted-{user.id}@invalid.local"; current.name="Gelöschtes Konto"; current.telefon=""; current.password_hash="deleted"; current.aktiv=False; db.commit()
    finally: db.close()
    response=RedirectResponse("/",status_code=303); response.delete_cookie("ahnsen_user_session"); return response
