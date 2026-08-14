from __future__ import annotations

import json
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

import pwa_core as core
from community_crud import audit_event
from crud import (
    get_duplicate_children,
    get_duplicate_overview,
    get_meldung,
    mark_duplicate_suspicion,
    save_meldung,
    set_duplicate_decision,
    suche_meldungen,
)
from dashboard import dashboard_page, meldung_detail_page
from mangel_duplicates import WARNING_THRESHOLD, find_duplicate_matches
from pwa_crud import normalize_email


router = APIRouter()


REPORT_DUPLICATE_CSS = r'''
<style>
.duplicate-modal{position:fixed;inset:0;z-index:10050;display:none;align-items:flex-end;justify-content:center;padding:18px;background:rgba(9,29,19,.62);backdrop-filter:blur(4px)}
.duplicate-modal.open{display:flex}.duplicate-sheet{width:min(100%,560px);max-height:86vh;overflow:auto;padding:20px;border-radius:25px;background:#fff;box-shadow:0 24px 70px rgba(6,30,17,.28)}
.duplicate-alert-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:16px;background:#fff2cf;font-size:24px}.duplicate-sheet h2{margin:12px 0 7px;color:var(--forest);font-size:23px}.duplicate-sheet>p{margin:0 0 14px;color:var(--muted);line-height:1.55}
.duplicate-match-card{padding:14px;border:1px solid #ead9aa;border-radius:17px;background:#fffaf0}.duplicate-match-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.duplicate-match-head strong{color:#6d5015}.duplicate-score{padding:5px 9px;border-radius:999px;background:#f6df9f;color:#694b0c;font-size:11px;font-weight:900}.duplicate-match-card dl{display:grid;grid-template-columns:90px 1fr;gap:7px 10px;margin:12px 0 0}.duplicate-match-card dt{color:#8b8270;font-size:10px;font-weight:900;text-transform:uppercase}.duplicate-match-card dd{margin:0;color:#465249;font-size:12px;overflow-wrap:anywhere}.duplicate-reasons{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}.duplicate-reasons span{padding:4px 7px;border-radius:999px;background:#f4efe3;color:#786435;font-size:10px;font-weight:800}
.duplicate-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:15px}.duplicate-actions button{min-height:48px;margin:0!important}.duplicate-cancel{border:1px solid #d7ddd4!important;background:#fff!important;color:var(--forest)!important}.duplicate-confirm{background:var(--forest)!important;color:#fff!important}.duplicate-note{display:block;margin-top:10px;color:#7b857e;font-size:10px;line-height:1.45;text-align:center}
@media(max-width:420px){.duplicate-modal{padding:10px}.duplicate-sheet{padding:17px;border-radius:22px}.duplicate-actions{grid-template-columns:1fr}.duplicate-match-card dl{grid-template-columns:1fr;gap:2px}.duplicate-match-card dd{margin-bottom:6px}}
</style>
'''

ADMIN_DUPLICATE_CSS = r'''
<style>
.dup-admin-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 18px}.dup-admin-stat{padding:14px 15px;border:1px solid var(--admin-line);border-radius:18px;background:#fffef9}.dup-admin-stat small{display:block;color:var(--admin-muted);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.dup-admin-stat strong{display:block;margin-top:4px;color:var(--admin-forest);font-size:24px}.dup-badge{display:inline-flex;align-items:center;gap:4px;margin:5px 0 0 6px;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:900;vertical-align:middle}.dup-badge.suspect{background:#fff0c7;color:#7b5711}.dup-badge.merged{background:#e4eee4;color:#315b41}.dup-badge.parent{background:#e3edf5;color:#315775}.dup-badge.clear{background:#edf0ec;color:#647067}
.dup-detail-panel{margin:0 0 20px;padding:19px;border:1px solid #e5d7ad;border-radius:22px;background:#fffaf0;box-shadow:var(--admin-shadow-soft)}.dup-detail-panel h2{margin:0 0 8px;color:#63490e}.dup-detail-panel p{margin:0;color:#655f51;line-height:1.55}.dup-detail-target{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-top:13px;padding:12px;border-radius:15px;background:#fff}.dup-detail-target small{display:block;color:var(--admin-muted);font-size:10px}.dup-detail-target strong{display:block;margin-top:3px;color:var(--admin-forest)}.dup-detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:13px}.dup-detail-actions form{margin:0}.dup-detail-actions button,.dup-detail-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;margin:0!important;padding:8px 12px;border-radius:12px;font-size:11px;font-weight:900;text-decoration:none}.dup-merge{border:0;background:var(--admin-forest);color:#fff}.dup-independent{border:1px solid var(--admin-line);background:#fff;color:var(--admin-forest)}.dup-children{margin-top:13px;padding-top:12px;border-top:1px solid #eadfbe}.dup-children a{display:inline-flex;margin:4px 6px 0 0;padding:6px 9px;border-radius:10px;background:#fff;color:var(--admin-forest);font-size:10px;font-weight:850;text-decoration:none}
@media(max-width:620px){.dup-admin-summary{grid-template-columns:1fr}.dup-detail-target{grid-template-columns:1fr}.dup-detail-actions{display:grid}.dup-detail-actions button,.dup-detail-actions a{width:100%}}
</style>
'''


def _response_with_html(response, html: str) -> HTMLResponse:
    return HTMLResponse(content=html, status_code=getattr(response, "status_code", 200))


def _public_match(match) -> dict:
    data = match.as_dict()
    data.pop("beschreibung", None)
    return data


def _inject_report_intelligence(response, forced_match=None) -> HTMLResponse:
    html = response.body.decode("utf-8")
    forced_json = json.dumps(_public_match(forced_match) if forced_match else None, ensure_ascii=False)
    modal = f'''
{REPORT_DUPLICATE_CSS}
<div class="duplicate-modal" id="duplicate-modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-title">
  <section class="duplicate-sheet">
    <span class="duplicate-alert-icon">⚠️</span>
    <h2 id="duplicate-title">Ähnliche Meldung bereits vorhanden</h2>
    <p>Unser System hat einen bestehenden Vorgang gefunden, der wahrscheinlich denselben Mangel betrifft. Prüfe ihn kurz, bevor du eine weitere Meldung sendest.</p>
    <div class="duplicate-match-card" id="duplicate-match-card"></div>
    <div class="duplicate-actions">
      <button class="duplicate-cancel" type="button" id="duplicate-cancel">Zur Meldung zurück</button>
      <button class="duplicate-confirm" type="button" id="duplicate-confirm">Trotzdem absenden</button>
    </div>
    <small class="duplicate-note">Die Erkennung ist nur eine Hilfestellung. Wenn es sich um einen anderen Mangel handelt, kannst du deine Meldung trotzdem senden.</small>
  </section>
</div>
<script>
(function(){{
  const form=document.querySelector('form.report-form');
  if(!form)return;
  let hidden=form.querySelector('input[name="duplicate_confirm"]');
  if(!hidden){{hidden=document.createElement('input');hidden.type='hidden';hidden.name='duplicate_confirm';hidden.value='';form.appendChild(hidden);}}
  let consentProof=form.querySelector('input[name="datenschutz_confirm"]');
  if(!consentProof){{consentProof=document.createElement('input');consentProof.type='hidden';consentProof.name='datenschutz_confirm';consentProof.value='';form.appendChild(consentProof);}}
  const consent=form.querySelector('input[name="datenschutz"]');
  const modal=document.getElementById('duplicate-modal');
  const card=document.getElementById('duplicate-match-card');
  const cancel=document.getElementById('duplicate-cancel');
  const confirm=document.getElementById('duplicate-confirm');
  let current=null;
  let checking=false;
  function esc(value){{return String(value??'').replace(/[&<>"']/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));}}
  function show(match){{
    current=match;
    const reasons=(match.reasons||[]).map(x=>'<span>'+esc(x)+'</span>').join('');
    card.innerHTML='<div class="duplicate-match-head"><strong>Bestehende Meldung</strong><span class="duplicate-score">'+esc(match.score)+' % ähnlich</span></div>'+
      '<dl><dt>Kategorie</dt><dd>'+esc(match.art||'–')+'</dd><dt>Ort</dt><dd>'+esc(match.ort||'–')+'</dd><dt>Status</dt><dd>'+esc(match.status||'Offen')+'</dd><dt>Vorgang</dt><dd>'+esc(match.ticket||'')+'</dd></dl>'+
      (reasons?'<div class="duplicate-reasons">'+reasons+'</div>':'');
    modal.classList.add('open');
    document.body.style.overflow='hidden';
  }}
  function close(){{modal.classList.remove('open');document.body.style.overflow='';current=null;}}
  cancel.addEventListener('click',close);
  modal.addEventListener('click',e=>{{if(e.target===modal)close();}});
  confirm.addEventListener('click',()=>{{
    if(!consent||!consent.checked){{close();consent?.focus();form.requestSubmit();return;}}
    hidden.value='ja';
    consentProof.value='ja';
    modal.classList.remove('open');
    document.body.style.overflow='';
    form.requestSubmit();
  }});
  form.addEventListener('submit',async(event)=>{{
    if(hidden.value==='ja'||checking)return;
    if(!form.checkValidity()){{event.preventDefault();form.reportValidity();return;}}
    event.preventDefault();checking=true;
    try{{
      const fd=new FormData(form);
      const payload={{art:fd.get('art')||'',ort:fd.get('ort')||'',beschreibung:fd.get('beschreibung')||'',latitude:fd.get('latitude')||'',longitude:fd.get('longitude')||''}};
      const res=await fetch('/api/maengel/duplikat-pruefung',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(payload)}});
      if(res.ok){{
        const data=await res.json();
        if(data.matches&&data.matches.length){{show(data.matches[0]);checking=false;return;}}
      }}
      hidden.value='keine';HTMLFormElement.prototype.submit.call(form);
    }}catch(error){{hidden.value='keine';HTMLFormElement.prototype.submit.call(form);}}
    finally{{checking=false;}}
  }});
  const forced={forced_json};
  if(forced)window.setTimeout(()=>show(forced),100);
}})();
</script>
'''
    html = html.replace("</body>", modal + "</body>", 1)
    return _response_with_html(response, html)


@router.get("/mangel-melden")
async def intelligent_report_page(request: Request):
    user = core._current_user(request)
    values = {"name": user.name, "email": user.email} if user else None
    return _inject_report_intelligence(core.report_page(values=values))


@router.post("/api/maengel/duplikat-pruefung")
async def duplicate_preflight(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Ungültige Prüfanfrage")
    art = core._trim(payload.get("art"), 120)
    ort = core._trim(payload.get("ort"), 180)
    beschreibung = core._trim(payload.get("beschreibung"), 1500)
    if not art or not ort or len(beschreibung) < 4:
        return JSONResponse({"matches": [], "threshold": WARNING_THRESHOLD})
    matches = find_duplicate_matches(
        art=art,
        ort=ort,
        beschreibung=beschreibung,
        latitude=core._trim(payload.get("latitude"), 30),
        longitude=core._trim(payload.get("longitude"), 30),
    )
    public = [_public_match(item) for item in matches if item.score >= WARNING_THRESHOLD]
    return JSONResponse({"matches": public, "threshold": WARNING_THRESHOLD})


@router.post("/api/maengel")
async def intelligent_submit_report(request: Request, background_tasks: BackgroundTasks):
    core._rate_limit(core.REPORT_RATE_LIMIT, request, core.RATE_MAX_REPORTS)
    form = await request.form()
    if core._trim(form.get("website"), 200):
        return RedirectResponse(url="/", status_code=303)

    user = core._current_user(request)
    art = core._trim(form.get("art"), 120)
    ort = core._trim(form.get("ort"), 180)
    beschreibung = core._trim(form.get("beschreibung"), 1500)
    name = core._trim(form.get("name"), 120)
    email = normalize_email(form.get("email"))
    latitude = core._trim(form.get("latitude"), 30)
    longitude = core._trim(form.get("longitude"), 30)
    privacy_accepted = (
        core._trim(form.get("datenschutz"), 10) == "ja"
        or core._trim(form.get("datenschutz_confirm"), 10) == "ja"
    )
    values = {
        "art": art,
        "ort": ort,
        "beschreibung": beschreibung,
        "name": name,
        "email": email,
        "latitude": latitude,
        "longitude": longitude,
        "datenschutz": "ja" if privacy_accepted else "",
    }

    if not art:
        validation_message = "Bitte wähle eine Kategorie aus."
    elif not ort:
        validation_message = "Bitte gib den Ort des Mangels an."
    elif len(beschreibung) < 10:
        validation_message = "Bitte beschreibe den Mangel mit mindestens 10 Zeichen."
    elif not privacy_accepted:
        validation_message = "Bitte bestätige die Datenschutzhinweise."
    else:
        validation_message = ""
    if validation_message:
        return _inject_report_intelligence(core.report_page(validation_message, values))
    if email and not core._valid_email(email):
        return _inject_report_intelligence(core.report_page("Bitte gib eine gültige E-Mail-Adresse ein.", values))

    matches = find_duplicate_matches(
        art=art,
        ort=ort,
        beschreibung=beschreibung,
        latitude=latitude,
        longitude=longitude,
    )
    top = matches[0] if matches and matches[0].score >= WARNING_THRESHOLD else None
    confirmed = core._trim(form.get("duplicate_confirm"), 10) == "ja"
    if top and not confirmed:
        warning = "Es gibt bereits eine sehr ähnliche offene Meldung. Bitte prüfe den Hinweis und bestätige ausdrücklich, wenn du trotzdem senden möchtest."
        return _inject_report_intelligence(core.report_page(warning, values), forced_match=top)

    photo_bytes = None
    photo = form.get("foto")
    if getattr(photo, "filename", ""):
        if (getattr(photo, "content_type", "") or "") not in core.ALLOWED_IMAGE_TYPES:
            return _inject_report_intelligence(core.report_page("Bitte lade nur ein JPG-, PNG- oder WEBP-Bild hoch.", values))
        photo_bytes = await photo.read()
        if len(photo_bytes) > core.MAX_IMAGE_BYTES:
            return _inject_report_intelligence(core.report_page("Das Foto darf höchstens 8 MB groß sein.", values))

    location_note = f"\n\nGPS-Position: {latitude}, {longitude}" if latitude and longitude else ""
    data = {"art": art, "ort": ort, "beschreibung": beschreibung + location_note, "foto_bytes": photo_bytes}
    contact = "PWA"
    if name:
        contact += f" | Name: {name}"
    if email:
        contact += f" | E-Mail: {email}"

    ticket = core._new_ticket()
    save_meldung(ticket, data, contact, pwa_user_id=user.id if user else None)
    if top:
        mark_duplicate_suspicion(ticket, top.ticket, top.score)
        audit_event("Bürger-PWA", "Dublettenverdacht erkannt", "meldung", ticket, f"{top.ticket} · {top.score}%")
    background_tasks.add_task(core._send_email_safely, ticket, data, contact)
    return RedirectResponse(url=f"/meldung-erfolgreich/{ticket}", status_code=303)


def _badge_for(report, child_count=0) -> str:
    state = str(getattr(report, "duplicate_state", "") or "")
    if state == "Verdacht":
        return f'<span class="dup-badge suspect">⚠ Dublettenverdacht {int(getattr(report, "duplicate_score", 0) or 0)}%</span>'
    if state == "Zusammengeführt":
        return f'<span class="dup-badge merged">↳ gebündelt mit {escape(str(getattr(report, "duplicate_of_ticket", "") or "Hauptvorgang"))}</span>'
    if child_count:
        return f'<span class="dup-badge parent">{child_count + 1} Meldungen gebündelt</span>'
    if state == "Eigenständig":
        return '<span class="dup-badge clear">✓ Dublette geprüft</span>'
    return ""


def _inject_admin_dashboard(response, reports) -> HTMLResponse:
    html = response.body.decode("utf-8")
    overview = get_duplicate_overview()
    summary = f'''{ADMIN_DUPLICATE_CSS}<section class="dup-admin-summary" aria-label="Dublettenübersicht"><article class="dup-admin-stat"><small>Zu prüfen</small><strong>{overview['suspected']}</strong></article><article class="dup-admin-stat"><small>Zusammengeführt</small><strong>{overview['merged']}</strong></article><article class="dup-admin-stat"><small>Als eigenständig geprüft</small><strong>{overview['reviewed']}</strong></article></section>'''
    marker = '<section class="box admin-controls">'
    html = html.replace(marker, summary + marker, 1)
    for report in reports:
        children = get_duplicate_children(report.ticket)
        badge = _badge_for(report, len(children))
        if not badge:
            continue
        ticket_html = f'>{escape(report.ticket)}</a>'
        html = html.replace(ticket_html, f'>{escape(report.ticket)}</a>{badge}', 2)
    return _response_with_html(response, html)


@router.get("/intern/maengel")
async def intelligent_admin_dashboard(request: Request, suche: str = "", status_filter: str = "", zeitraum: str = ""):
    core.legacy.check_dashboard_login(request)
    reports = suche_meldungen(suche, status_filter, zeitraum)
    return _inject_admin_dashboard(dashboard_page(suche, status_filter, zeitraum), reports)


def _duplicate_detail_panel(report) -> str:
    state = str(getattr(report, "duplicate_state", "") or "")
    candidate_ticket = str(getattr(report, "duplicate_candidate_ticket", "") or "")
    primary_ticket = str(getattr(report, "duplicate_of_ticket", "") or "")
    candidate = get_meldung(primary_ticket or candidate_ticket) if (primary_ticket or candidate_ticket) else None
    children = get_duplicate_children(report.ticket)
    if not state and not children:
        return ""

    if state == "Verdacht" and candidate:
        heading = f"⚠ Dublettenverdacht · {int(getattr(report, 'duplicate_score', 0) or 0)} %"
        text = "Die automatische Prüfung hält diesen Vorgang für wahrscheinlich identisch mit einer bereits offenen Meldung."
        target = f'''<div class="dup-detail-target"><div><small>Möglicher Hauptvorgang</small><strong>{escape(candidate.ticket)} · {escape(candidate.art or 'Meldung')}</strong><small>{escape(candidate.ort or '')} · Status: {escape(candidate.status or 'Offen')}</small></div><a class="dup-independent" href="/intern/meldung/{quote(candidate.ticket)}">Öffnen</a></div>'''
        actions = f'''<div class="dup-detail-actions"><form method="post" action="/intern/meldung/{quote(report.ticket)}/duplikat"><input type="hidden" name="action" value="merge"><input type="hidden" name="primary_ticket" value="{escape(candidate.ticket)}"><button class="dup-merge" type="submit">Mit {escape(candidate.ticket)} zusammenführen</button></form><form method="post" action="/intern/meldung/{quote(report.ticket)}/duplikat"><input type="hidden" name="action" value="independent"><button class="dup-independent" type="submit">Als eigenständig markieren</button></form></div>'''
    elif state == "Zusammengeführt" and candidate:
        heading = "✓ Mit Hauptvorgang gebündelt"
        text = "Diese Meldung bleibt aus Nachvollziehbarkeitsgründen erhalten. Ihr Bearbeitungsstatus folgt dem Hauptvorgang."
        target = f'''<div class="dup-detail-target"><div><small>Hauptvorgang</small><strong>{escape(candidate.ticket)} · {escape(candidate.art or 'Meldung')}</strong><small>{escape(candidate.ort or '')} · Status: {escape(candidate.status or 'Offen')}</small></div><a class="dup-independent" href="/intern/meldung/{quote(candidate.ticket)}">Hauptvorgang öffnen</a></div>'''
        actions = f'''<div class="dup-detail-actions"><form method="post" action="/intern/meldung/{quote(report.ticket)}/duplikat"><input type="hidden" name="action" value="reset"><button class="dup-independent" type="submit">Verknüpfung lösen</button></form></div>'''
    elif state == "Eigenständig":
        heading = "✓ Dublettenprüfung abgeschlossen"
        text = "Dieser Vorgang wurde geprüft und als eigenständige Meldung bestätigt."
        target = ""
        actions = f'''<div class="dup-detail-actions"><form method="post" action="/intern/meldung/{quote(report.ticket)}/duplikat"><input type="hidden" name="action" value="reset"><button class="dup-independent" type="submit">Prüfstatus zurücksetzen</button></form></div>'''
    else:
        heading = "Gebündelte Meldungen"
        text = "Zu diesem Hauptvorgang wurden weitere Meldungen desselben Mangels zusammengeführt."
        target = ""
        actions = ""

    children_html = ""
    if children:
        links = "".join(f'<a href="/intern/meldung/{quote(child.ticket)}">{escape(child.ticket)}</a>' for child in children)
        children_html = f'<div class="dup-children"><strong>Gebündelte Meldungen ({len(children)})</strong><div>{links}</div></div>'
    return f'''{ADMIN_DUPLICATE_CSS}<section class="dup-detail-panel"><h2>{heading}</h2><p>{text}</p>{target}{actions}{children_html}</section>'''


@router.get("/intern/meldung/{ticket}")
async def intelligent_admin_report_detail(request: Request, ticket: str):
    core.legacy.check_dashboard_login(request)
    report = get_meldung(ticket)
    response = meldung_detail_page(ticket)
    if not report:
        return response
    panel = _duplicate_detail_panel(report)
    if not panel:
        return response
    html = response.body.decode("utf-8")
    marker = '<div class="admin-detail-grid">'
    html = html.replace(marker, panel + marker, 1)
    return _response_with_html(response, html)


@router.post("/intern/meldung/{ticket}/duplikat")
async def duplicate_admin_action(request: Request, ticket: str):
    core.legacy.check_dashboard_login(request)
    form = await request.form()
    action = core._trim(form.get("action"), 30)
    primary_ticket = core._trim(form.get("primary_ticket"), 100)
    before = get_meldung(ticket)
    result = set_duplicate_decision(ticket, action, primary_ticket)
    if not result:
        raise HTTPException(status_code=400, detail="Dublettenentscheidung konnte nicht gespeichert werden")
    audit_event("Verwaltung", "Dublettenentscheidung", "meldung", ticket, f"{action} · {primary_ticket or '-'}")
    if action == "merge" and before and before.pwa_user_id:
        # Status remains visible under the original ticket; no extra citizen
        # message is sent merely because administration bundled the case.
        pass
    return RedirectResponse(url=f"/intern/meldung/{quote(ticket)}", status_code=303)
