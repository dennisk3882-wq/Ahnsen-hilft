from __future__ import annotations

import json
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

import main as legacy
from community_models import CitizenMessage, CitizenPreference, Idea, IdeaComment, IdeaSupport, NeighborPost
from database import SessionLocal
from dgh_models import DGHTermin
from governance import ROLES, begin_admin_totp, case_history, confirm_admin_totp, disable_admin_totp, list_admins, save_admin, save_content_revision, update_case
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
    return HTMLResponse(f"""<!doctype html><html lang=de><meta name=viewport content='width=device-width,initial-scale=1'><title>Datensicherung</title><style>body{{font:16px system-ui;max-width:760px;margin:auto;padding:24px;background:#f7f8f4;color:#17221d}}section{{background:#fff;padding:22px;border-radius:18px;margin:16px 0}}button,a.button{{display:inline-flex;min-height:44px;align-items:center;padding:9px 14px;border:0;border-radius:10px;background:#174936;color:#fff;font-weight:750;text-decoration:none}}input{{display:block;margin:12px 0;max-width:100%}}</style><body><a href='/intern/system'>← System</a><h1>Datensicherung</h1>{notice}<section><h2>Vollständige Sicherung</h2><p>Lädt Datenbankinhalte und dauerhaft gespeicherte Bilder als prüfsichere JSON-Datei herunter. Die Datei enthält personenbezogene Daten und muss geschützt aufbewahrt werden.</p><a class=button href='/intern/sicherung/download'>Sicherung herunterladen</a></section><section><h2>Sicherung prüfen</h2><p>Die Prüffunktion verändert keine Daten. Sie kontrolliert Format, Prüfsumme und Datensatzanzahl vor einer Wiederherstellung.</p><form method=post action='/intern/sicherung/pruefen' enctype='multipart/form-data'><input type=file name=datei accept='application/json,.json' required><button>Sicherung prüfen</button></form></section></body></html>""")


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


@router.get("/intern/benutzer")
async def admin_users(request: Request, hinweis: str = ""):
    admin = _admin(request)
    if admin["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Nur der Superadmin verwaltet Zugänge.")
    rows = "".join(
        f"<tr><td><strong>{escape(item.display_name)}</strong><br><small>{escape(item.username)}</small></td><td>{escape(ROLES.get(item.role,item.role))}</td><td>{'Aktiv' if item.active else 'Gesperrt'}</td><td>{'Aktiv' if item.totp_enabled else 'Aus'}</td><td><form method=post action='/intern/benutzer/{item.username}/2fa'><button name=enabled value={'0' if item.totp_enabled else '1'}>{'2FA abschalten' if item.totp_enabled else '2FA einrichten'}</button></form></td></tr>"
        for item in list_admins()
    )
    options = "".join(f"<option value='{escape(key)}'>{escape(label)}</option>" for key,label in ROLES.items())
    return HTMLResponse(f"""<!doctype html><html lang=de><meta name=viewport content='width=device-width,initial-scale=1'><title>Verwaltungskonten</title><style>body{{font:16px system-ui;max-width:1100px;margin:auto;padding:24px;background:#f7f8f4;color:#17221d}}section{{background:white;padding:22px;border-radius:18px;margin:16px 0}}table{{width:100%;border-collapse:collapse}}td,th{{padding:10px;border-bottom:1px solid #ddd;text-align:left}}form.grid{{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}}input,select,button{{min-height:44px;padding:9px;border:1px solid #bbc9bd;border-radius:10px}}button{{background:#174936;color:white;font-weight:700}}@media(max-width:700px){{form.grid{{grid-template-columns:1fr}}table{{font-size:13px}}}}</style><body><a href='/intern/system'>← System</a><h1>Verwaltungskonten</h1><p>Mehrere persönliche Zugänge mit Rollen und kostenloser Authenticator‑2FA.</p>{f'<p role=status>{escape(hinweis)}</p>' if hinweis else ''}<section><table><thead><tr><th>Konto</th><th>Rolle</th><th>Status</th><th>2FA</th><th>Aktion</th></tr></thead><tbody>{rows}</tbody></table></section><section><h2>Konto anlegen oder ändern</h2><form class=grid method=post><label>Benutzername<input name=username required maxlength=80></label><label>Anzeigename<input name=display_name required maxlength=120></label><label>Rolle<select name=role>{options}</select></label><label>Passwort (bei neuem Konto mindestens 12 Zeichen)<input type=password name=password minlength=12></label><button type=submit>Speichern</button></form></section></body></html>""")


@router.post("/intern/benutzer")
async def admin_user_save(request: Request):
    admin = _admin(request)
    if admin["role"] != "superadmin": raise HTTPException(status_code=403)
    form = await request.form()
    try:
        save_admin(str(form.get("username") or "").strip(), str(form.get("display_name") or "").strip(), str(form.get("role") or "read_only"), str(form.get("password") or ""))
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
        return RedirectResponse("/intern/benutzer?hinweis=" + quote("2FA wurde abgeschaltet; bestehende Sitzungen wurden beendet."), status_code=303)
    secret = begin_admin_totp(username)
    if enabled:
        return HTMLResponse(f"<!doctype html><html lang=de><meta name=viewport content='width=device-width,initial-scale=1'><body style='font:16px system-ui;max-width:680px;margin:auto;padding:28px'><h1>2FA bestätigen</h1><p>Trage diesen Schlüssel in einer kostenlosen Authenticator-App ein:</p><p style='padding:18px;background:#eef5eb;border-radius:12px;font:700 20px monospace;overflow-wrap:anywhere'>{escape(secret)}</p><p>2FA wird erst aktiv, nachdem der erste Code erfolgreich geprüft wurde.</p><form method=post action='/intern/benutzer/{escape(username)}/2fa-bestaetigen'><label>Sechsstelliger Code <input name=code inputmode=numeric pattern='[0-9]{{6}}' required></label><button>Prüfen und aktivieren</button></form><p><a href='/intern/benutzer'>Abbrechen</a></p></body></html>")


@router.post("/intern/benutzer/{username}/2fa-bestaetigen")
async def admin_user_totp_confirm(request: Request, username: str):
    admin = _admin(request)
    if admin["role"] != "superadmin": raise HTTPException(status_code=403)
    form = await request.form(); codes = confirm_admin_totp(username, str(form.get("code") or ""))
    if not codes:
        return RedirectResponse("/intern/benutzer?hinweis=" + quote("Der Authenticator-Code war ungültig; 2FA wurde nicht aktiviert."), status_code=303)
    code_html = "".join(f"<li><code>{escape(value)}</code></li>" for value in codes)
    return HTMLResponse(f"<!doctype html><html lang=de><meta name=viewport content='width=device-width,initial-scale=1'><body style='font:16px system-ui;max-width:680px;margin:auto;padding:28px'><h1>2FA ist aktiv</h1><p>Speichere diese einmalig angezeigten Wiederherstellungscodes sicher. Jeder Code funktioniert nur einmal.</p><ul style='font:700 18px monospace;line-height:1.8'>{code_html}</ul><p><a href='/intern/benutzer'>Ich habe die Codes gesichert</a></p></body></html>")


@router.get("/intern/inhalte/versionen")
async def content_versions(request: Request):
    _admin(request); db=SessionLocal()
    try: items=db.query(ContentRevision).order_by(ContentRevision.created_at.desc()).limit(100).all()
    finally: db.close()
    cards="".join(f"<article><small>{escape(x.area)} · {escape(x.object_id)} · Version {x.version}</small><h3>{escape(x.title or 'Ohne Titel')}</h3><b>{escape(x.state)}</b><span>{x.created_at:%d.%m.%Y %H:%M} · {escape(x.actor)}</span></article>" for x in items)
    return HTMLResponse(f"<!doctype html><html lang=de><meta name=viewport content='width=device-width,initial-scale=1'><style>body{{font:16px system-ui;max-width:900px;margin:auto;padding:24px}}article{{display:grid;gap:6px;padding:16px;margin:10px 0;border:1px solid #d7e0d4;border-radius:14px}}</style><body><a href='/intern/gemeindeseite'>← Inhalte</a><h1>Inhaltsversionen</h1><p>Entwurf, Prüfung, Freigabe und Archiv bleiben nachvollziehbar.</p>{cards or '<p>Noch keine Versionen gespeichert.</p>'}<h2>Version dokumentieren</h2><form method=post><p><input name=area placeholder=Bereich required></p><p><input name=object_id placeholder=Kennung required></p><p><input name=title placeholder=Titel required></p><p><select name=state><option>Entwurf</option><option>Prüfung</option><option>Freigegeben</option><option>Archiviert</option></select></p><p><textarea name=content placeholder=Inhalt></textarea></p><button>Version speichern</button></form></body></html>")


@router.post("/intern/inhalte/versionen")
async def content_version_save(request: Request):
    admin=_admin(request); form=await request.form(); save_content_revision(str(form.get("area") or ""),str(form.get("object_id") or ""),str(form.get("state") or "Entwurf"),str(form.get("title") or ""),{"content":str(form.get("content") or "")},admin["display_name"]); return RedirectResponse("/intern/inhalte/versionen",status_code=303)


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
