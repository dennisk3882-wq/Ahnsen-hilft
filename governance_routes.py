from __future__ import annotations

import json
from datetime import datetime
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

import main as legacy
from community_crud import audit_event
from community_dashboard import _page
from community_models import CitizenMessage, CitizenPreference, Idea, IdeaComment, IdeaSupport, NeighborPost
from database import SessionLocal
from dgh_models import DGHTermin
from governance import ROLES, begin_admin_totp, case_history, confirm_admin_totp, disable_admin_totp, list_admins, save_admin, save_content_revision, set_admin_active, update_case
from governance_models import ContentRevision
from models import Meldung
from neighborhood_models import NeighborConversation, NeighborReport
from pwa_core import _require_user
from pwa_models import PWAUser, PushDelivery, PushSubscription
from push_service import send_user_notification
from operations import create_backup, validate_backup


router = APIRouter()


def _admin(request: Request):
    return legacy.check_dashboard_login(request)


@router.get("/intern/sicherung")
async def backup_center(request: Request, hinweis: str = ""):
    admin = _admin(request)
    if admin["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Nur der Superadmin darf Gesamtsicherungen verwalten.")
    notice = f"<p role=status>{escape(hinweis)}</p>" if hinweis else ""
    body = f"""<section><span class="eyebrow">Betrieb & Notfallvorsorge</span><h1>Datensicherung</h1><p>Vollständige, prüfbare Sicherung der Datenbank und dauerhaft gespeicherter Bilder.</p></section>{notice}<section class="admin-grid"><article class="admin-section"><h2>Sicherung herunterladen</h2><p>Die Datei enthält personenbezogene Daten und muss verschlüsselt oder in einem geschützten Speicher aufbewahrt werden.</p><a class="admin-button" href="/intern/sicherung/download">Sicherung herunterladen</a></article><article class="admin-section"><h2>Sicherung prüfen</h2><p>Kontrolliert Format, Prüfsumme und Datensatzanzahl, ohne Daten zu verändern.</p><form class="admin-form" method="post" action="/intern/sicherung/pruefen" enctype="multipart/form-data"><label>Sicherungsdatei<input type="file" name="datei" accept="application/json,.json" required></label><button class="admin-button" type="submit">Sicherung prüfen</button></form></article></section><section class="admin-section"><h2>Wiederherstellung</h2><p>Eine Wiederherstellung bleibt bewusst ein kontrollierter Servervorgang. Vorher immer eine aktuelle Sicherung erstellen und die neue Datei prüfen.</p></section>"""
    return _page("Datensicherung", "sicherung", body)


@router.get("/intern/sicherung/download")
async def backup_download(request: Request):
    admin = _admin(request)
    if admin["role"] != "superadmin":
        raise HTTPException(status_code=403)
    payload = create_backup()
    filename = f"ahnsen-hilft-sicherung-{payload['created_at'][:10]}.json"
    audit_event(admin["username"], "Gesamtsicherung heruntergeladen", "backup", payload["created_at"], json.dumps({"tables": len(payload["tables"])}, ensure_ascii=False))
    return Response(content=json.dumps(payload, ensure_ascii=False, indent=2), media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


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
        result = validate_backup(json.loads(raw.decode("utf-8")))
    except Exception as error:
        result = {"valid": False, "error": str(error)[:300], "tables": 0, "rows": 0, "checksum": False}
    audit_event(admin["username"], "Sicherungsdatei geprüft", "backup", "gültig" if result.get("valid") else "ungültig", json.dumps(result, ensure_ascii=False))
    message = (f"Sicherung gültig: {result['tables']} Tabellen mit {result['rows']} Datensätzen; Prüfsumme stimmt." if result.get("valid") else f"Sicherung ungültig: {result.get('error') or 'Format oder Prüfsumme stimmt nicht.'}")
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
    rows = "".join(
        f"<tr><td><strong>{escape(item.display_name)}</strong><br><small>{escape(item.username)}</small></td><td>{escape(ROLES.get(item.role,item.role))}</td><td><span class='status-chip'>{'Aktiv' if item.active else 'Gesperrt'}</span></td><td>{'Aktiv' if item.totp_enabled else 'Noch nicht eingerichtet'}</td><td>{item.last_login_at.strftime('%d.%m.%Y %H:%M') if getattr(item, 'last_login_at', None) else 'Noch nie'}</td><td><div style='display:flex;flex-wrap:wrap;gap:6px'><form method=post action='/intern/benutzer/{item.username}/2fa'><button class='admin-button secondary' name=enabled value={'0' if item.totp_enabled else '1'}>{'2FA abschalten' if item.totp_enabled else '2FA einrichten'}</button></form><form method=post action='/intern/benutzer/{item.username}/aktiv' onsubmit=\"return confirm('Zugang wirklich {'sperren' if item.active else 'reaktivieren'}?')\"><button class='admin-button {'secondary' if item.active else ''}' name=active value={'0' if item.active else '1'}>{'Sperren' if item.active else 'Reaktivieren'}</button></form></div></td></tr>"
        for item in list_admins()
    )
    options = "".join(f"<option value='{escape(key)}'>{escape(label)}</option>" for key,label in ROLES.items())
    notice = f'<div class="admin-row" role="status">{escape(hinweis)}</div>' if hinweis else ''
    body = f"""<section><span class="eyebrow">Sicherer Verwaltungszugang</span><h1>Verwaltungskonten</h1><p>Jede Person erhält einen eigenen Zugang mit passender Rolle. Für Vollzugriff und Gemeindeverwaltung wird 2FA dringend empfohlen.</p></section>{notice}<section class="admin-section"><div class="table-wrap"><table class="admin-table"><thead><tr><th>Konto</th><th>Rolle</th><th>Status</th><th>2FA</th><th>Letzte Anmeldung</th><th>Aktionen</th></tr></thead><tbody>{rows}</tbody></table></div></section><section class="admin-section"><h2>Konto anlegen oder ändern</h2><form class="admin-form" method="post"><div class="admin-grid"><label>Benutzername<input name="username" required maxlength="80"></label><label>Anzeigename<input name="display_name" required maxlength="120"></label><label>Rolle<select name="role">{options}</select></label><label>Passwort <input type="password" name="password" minlength="12"><small>Bei einem neuen Konto mindestens 12 Zeichen; bei Änderungen leer lassen.</small></label></div><button class="admin-button" type="submit">Konto speichern</button></form></section>"""
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
    secret = begin_admin_totp(username)
    if enabled:
        body = f"""<section><span class='eyebrow'>Kontosicherheit</span><h1>2FA bestätigen</h1><p>Trage den folgenden Schlüssel in einer kostenlosen Authenticator-App ein.</p></section><section class='admin-section'><p style='padding:18px;background:#eef5eb;border-radius:12px;font:700 20px monospace;overflow-wrap:anywhere'>{escape(secret)}</p><p>2FA wird erst aktiv, nachdem der erste Code erfolgreich geprüft wurde.</p><form class='admin-form' method='post' action='/intern/benutzer/{escape(username)}/2fa-bestaetigen'><label>Sechsstelliger Code<input name='code' inputmode='numeric' autocomplete='one-time-code' pattern='[0-9]{{6}}' required></label><button class='admin-button'>Prüfen und aktivieren</button></form><p><a href='/intern/benutzer'>Abbrechen</a></p></section>"""
        return _page("2FA bestätigen", "benutzer", body)


@router.post("/intern/benutzer/{username}/2fa-bestaetigen")
async def admin_user_totp_confirm(request: Request, username: str):
    admin = _admin(request)
    if admin["role"] != "superadmin": raise HTTPException(status_code=403)
    form = await request.form(); codes = confirm_admin_totp(username, str(form.get("code") or ""))
    if not codes:
        return RedirectResponse("/intern/benutzer?hinweis=" + quote("Der Authenticator-Code war ungültig; 2FA wurde nicht aktiviert."), status_code=303)
    audit_event(admin["username"], "Zwei-Faktor-Anmeldung aktiviert", "admin_user", username)
    code_html = "".join(f"<li><code>{escape(value)}</code></li>" for value in codes)
    body = f"""<section><span class='eyebrow'>Kontosicherheit</span><h1>2FA ist aktiv</h1><p>Speichere diese einmalig angezeigten Wiederherstellungscodes sicher. Jeder Code funktioniert nur einmal.</p></section><section class='admin-section'><ul style='font:700 18px monospace;line-height:1.8'>{code_html}</ul><p><a class='admin-button' href='/intern/benutzer'>Ich habe die Codes gesichert</a></p></section>"""
    return _page("2FA ist aktiv", "benutzer", body)


@router.get("/intern/inhalte/versionen")
async def content_versions(request: Request):
    _admin(request); db=SessionLocal()
    try: items=db.query(ContentRevision).order_by(ContentRevision.created_at.desc()).limit(100).all()
    finally: db.close()
    cards="".join(f"<article class='admin-row'><small>{escape(x.area)} · {escape(x.object_id)} · Version {x.version}</small><h3>{escape(x.title or 'Ohne Titel')}</h3><span class='status-chip'>{escape(x.state)}</span><p>{x.created_at:%d.%m.%Y %H:%M} · {escape(x.actor)}</p></article>" for x in items)
    body=f"""<section><span class="eyebrow">Redaktion</span><h1>Inhaltsversionen</h1><p>Entwurf, Prüfung, Freigabe und Archivierung bleiben nachvollziehbar.</p></section><section class="admin-section"><div class="admin-list">{cards or '<div class="admin-row">Noch keine Versionen gespeichert.</div>'}</div></section><section class="admin-section"><h2>Version dokumentieren</h2><form class="admin-form" method="post"><div class="admin-grid"><label>Bereich<input name="area" required maxlength="80"></label><label>Kennung<input name="object_id" required maxlength="120"></label><label>Titel<input name="title" required maxlength="200"></label><label>Status<select name="state"><option>Entwurf</option><option>Prüfung</option><option>Freigegeben</option><option>Archiviert</option></select></label></div><label>Inhalt<textarea name="content" maxlength="20000"></textarea></label><button class="admin-button" type="submit">Version speichern</button></form></section>"""
    return _page("Inhaltsversionen", "versionen", body)


@router.post("/intern/inhalte/versionen")
async def content_version_save(request: Request):
    admin=_admin(request); form=await request.form(); revision=save_content_revision(str(form.get("area") or ""),str(form.get("object_id") or ""),str(form.get("state") or "Entwurf"),str(form.get("title") or ""),{"content":str(form.get("content") or "")},admin["display_name"]); audit_event(admin["username"], "Inhaltsversion gespeichert", "content_revision", str(getattr(revision, "id", "")), str(form.get("title") or "")); return RedirectResponse("/intern/inhalte/versionen",status_code=303)


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
