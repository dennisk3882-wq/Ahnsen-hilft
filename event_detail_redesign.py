from __future__ import annotations

import json
from datetime import date, datetime
from html import escape

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from current_events_reminders import reminder_active
from event_time_utils import canonical_event_time, display_event_place, display_event_title
from pwa_core import _current_user
from pwa_crud import has_push_subscription
from pwa_ui import page
from veranstaltungen_crud import get_veranstaltung


router = APIRouter()


DETAIL_CSS = r'''
<style>
.ed{display:grid;gap:16px;min-width:0;max-width:100%;padding-bottom:230px;color:#10281e}
.ed *{box-sizing:border-box;min-width:0}
.ed-back{display:inline-flex;align-items:center;gap:7px;width:max-content;max-width:100%;color:var(--forest);font-weight:900;text-decoration:none;font-size:14px}
.ed-hero,.ed-card,.ed-recap,.ed-original{border:1px solid #dce5d9;border-radius:25px;background:#fff;box-shadow:0 10px 30px rgba(28,72,48,.055);overflow:hidden}
.ed-hero{position:relative;background:linear-gradient(145deg,#edf5e9,#f8faf6)}
.ed-hero img{display:block;width:100%;max-height:390px;aspect-ratio:16/9;object-fit:cover}
.ed-main{padding:21px}
.ed-kicker{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:9px}
.ed-badge{display:inline-flex;align-items:center;min-height:28px;padding:5px 10px;border-radius:999px;background:#edf4e9;color:var(--forest);font-size:10px;font-weight:950;letter-spacing:.04em}
.ed-badge.past{background:#edf0eb;color:#657169}
.ed-status{font-size:10px;font-weight:950;color:#8aa270;letter-spacing:.08em;text-transform:uppercase}
.ed h1{margin:0;color:#10281e;font-size:clamp(31px,7.2vw,48px);line-height:1.04;overflow-wrap:anywhere}
.ed-lead{margin:10px 0 0;color:#69756d;font-size:15px;line-height:1.55}
.ed-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:18px}
.ed-fact{display:grid;grid-template-columns:34px minmax(0,1fr);gap:9px;align-items:center;padding:11px 12px;border-radius:16px;background:#f4f7f1}
.ed-fact-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:#fff;color:var(--forest);font-size:17px}
.ed-fact small{display:block;color:#879189;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
.ed-fact strong{display:block;margin-top:2px;color:#304b3b;font-size:12px;line-height:1.35;overflow-wrap:anywhere}
.ed-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:17px}
.ed-actions form{margin:0}
.ed-btn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;min-height:49px;padding:10px 12px;border:1px solid #cbd8c9;border-radius:15px;background:#fff;color:var(--forest);font:inherit;font-size:12px;font-weight:950;text-decoration:none;text-align:center;cursor:pointer}
.ed-btn.primary{background:var(--forest);border-color:var(--forest);color:#fff}
.ed-notice{margin-top:13px;padding:11px 13px;border-radius:14px;background:#edf5e9;color:#40594a;font-size:11px;line-height:1.5}
.ed-push-hint{margin:10px 0 0;color:#7c877f;font-size:10.5px;line-height:1.45;text-align:center}
.ed-card,.ed-recap,.ed-original{padding:19px}
.ed-eye{display:block;color:#90a879;font-size:10px;font-weight:950;letter-spacing:.13em;text-transform:uppercase}
.ed-card h2,.ed-recap h2{margin:5px 0 10px;color:var(--forest);font-size:23px;line-height:1.15}
.ed-copy{margin:0;color:#657169;font-size:14px;line-height:1.65;white-space:pre-line;overflow-wrap:anywhere}
.ed-contact{display:flex;align-items:flex-start;gap:10px;margin-top:15px;padding:12px 13px;border-radius:15px;background:#f5f8f2;color:#465b4e}
.ed-contact span{font-size:18px}.ed-contact strong{display:block;font-size:12px}.ed-contact small{display:block;margin-top:2px;color:#7c877f;font-size:10px}
.ed-recap{background:linear-gradient(145deg,#fff,#f1f7ed)}
.ed-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:15px}
.ed-photo{display:block;padding:0;border:0;border-radius:14px;overflow:hidden;background:#edf1eb;cursor:pointer}
.ed-photo img{display:block;width:100%;aspect-ratio:1.15;object-fit:cover;transition:transform .2s ease}.ed-photo:active img{transform:scale(.985)}
.ed-empty-recap{margin:0;padding:14px;border-radius:15px;background:#f5f7f3;color:#748078;font-size:12px;line-height:1.55}
.ed-original{padding:0}
.ed-original summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:17px 19px;cursor:pointer;list-style:none;color:var(--forest);font-size:13px;font-weight:950}
.ed-original summary::-webkit-details-marker{display:none}.ed-original summary::after{content:'+';font-size:22px}.ed-original[open] summary::after{content:'−'}
.ed-original-body{padding:0 19px 19px}
.ed-lightbox{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(8,24,16,.92)}
.ed-lightbox.open{display:flex}.ed-lightbox img{display:block;max-width:100%;max-height:86vh;border-radius:16px;object-fit:contain;background:#fff}
.ed-lightbox-close{position:absolute;top:max(18px,env(safe-area-inset-top));right:18px;width:46px;height:46px;border:0;border-radius:50%;background:#fff;color:var(--forest);font-size:25px;font-weight:900;cursor:pointer}
@media(max-width:420px){.ed{padding-bottom:245px}.ed-main,.ed-card,.ed-recap{padding:16px}.ed-facts{grid-template-columns:1fr 1fr}.ed-fact{padding:10px}.ed-actions{grid-template-columns:1fr}.ed-gallery{gap:7px}}
</style>
'''

LIGHTBOX_JS = r'''
<script>
(function(){
  const box=document.getElementById('event-photo-lightbox');
  const image=document.getElementById('event-photo-lightbox-image');
  if(!box||!image)return;
  function close(){box.classList.remove('open');image.removeAttribute('src');document.body.style.overflow='';}
  document.querySelectorAll('[data-event-photo]').forEach((button)=>{
    button.addEventListener('click',()=>{image.src=button.dataset.eventPhoto||'';box.classList.add('open');document.body.style.overflow='hidden';});
  });
  box.addEventListener('click',(event)=>{if(event.target===box)close();});
  const closer=box.querySelector('.ed-lightbox-close'); if(closer) closer.addEventListener('click',close);
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape')close();});
})();
</script>
'''


def _event_date(event) -> date | None:
    try:
        return datetime.strptime(str(getattr(event, "datum", "") or "").strip(), "%d.%m.%Y").date()
    except (TypeError, ValueError):
        return None


def _gallery(event) -> list[tuple[str, str]]:
    raw = getattr(event, "rueckblick_bilder_json", None)
    if not raw:
        return []
    try:
        values = json.loads(raw)
    except Exception:
        return []
    result: list[tuple[str, str]] = []
    for item in values if isinstance(values, list) else []:
        if not isinstance(item, dict):
            continue
        mime = str(item.get("mime") or "image/jpeg").lower()
        data = str(item.get("data") or "")
        if mime in {"image/jpeg", "image/png", "image/webp"} and data:
            result.append((mime, data))
    return result[:12]


def _status_text(event_day: date | None, past: bool) -> str:
    if past:
        return "Vergangene Veranstaltung"
    if not event_day:
        return "Termin"
    delta = (event_day - date.today()).days
    if delta == 0:
        return "Heute"
    if delta == 1:
        return "Morgen"
    if 1 < delta <= 14:
        return f"In {delta} Tagen"
    return "Bevorstehend"


def _fact(icon: str, label: str, value: str) -> str:
    if not value:
        return ""
    return f'''<div class="ed-fact"><span class="ed-fact-icon">{icon}</span><div><small>{escape(label)}</small><strong>{escape(value)}</strong></div></div>'''


def _image_html(event) -> str:
    data = str(getattr(event, "bild_base64", "") or "")
    if not data:
        return ""
    title = display_event_title(getattr(event, "titel", ""))
    return f'<img src="data:image/jpeg;base64,{data}" alt="{escape(title)}">'


def _gallery_html(event, title: str) -> str:
    buttons = []
    for index, (mime, data) in enumerate(_gallery(event), start=1):
        src = f"data:{mime};base64,{data}"
        buttons.append(
            f'<button class="ed-photo" type="button" data-event-photo="{escape(src, quote=True)}" aria-label="Foto {index} von {escape(title)} vergrößern"><img src="{escape(src, quote=True)}" alt="Impression {index} von {escape(title)}" loading="lazy"></button>'
        )
    return ''.join(buttons)


@router.get("/aktuelles-termine/{event_id}")
async def redesigned_event_detail(request: Request, event_id: int, hinweis: str = ""):
    event = get_veranstaltung(event_id)
    if not event or getattr(event, "aktiv", "") != "Ja":
        return RedirectResponse("/aktuelles-termine", status_code=303)

    event_day = _event_date(event)
    past = bool(event_day and event_day < date.today())
    title = display_event_title(getattr(event, "titel", ""))
    category = str(getattr(event, "kategorie", "") or "Veranstaltung").strip() or "Veranstaltung"
    description = str(getattr(event, "beschreibung", "") or "Weitere Informationen folgen.").strip()
    when = canonical_event_time(getattr(event, "uhrzeit", ""))
    place = display_event_place(getattr(event, "ort", ""))
    contact = str(getattr(event, "ansprechpartner", "") or "").strip()
    recap = str(getattr(event, "rueckblick_text", "") or "").strip()
    gallery = _gallery(event)

    user = _current_user(request)
    reminder_is_active = bool(user and reminder_active(user.id, event.id))
    push_ready = bool(user and has_push_subscription(user.id))

    facts = []
    if event_day:
        facts.append(_fact("📅", "Datum", event_day.strftime("%d.%m.%Y")))
    if when:
        facts.append(_fact("🕒", "Uhrzeit", when))
    if place:
        facts.append(_fact("📍", "Ort", place))

    status = _status_text(event_day, past)
    badge = "Rückblick" if past else category
    hero_image = _image_html(event)
    hero_class = "ed-hero" if hero_image else "ed-hero ed-hero-no-image"

    actions = ""
    push_hint = ""
    if not past:
        reminder_label = "✓ Erinnerung aktiv" if reminder_is_active else "🔔 Erinnern"
        actions = f'''<div class="ed-actions"><form method="post" action="/aktuelles-termine/{event.id}/erinnern"><button class="ed-btn primary" type="submit">{reminder_label}</button></form><a class="ed-btn" href="/aktuelles-termine/{event.id}.ics">📅 Zum Kalender</a></div>'''
        if reminder_is_active and user and not push_ready:
            push_hint = '<p class="ed-push-hint">Die Erinnerung ist gespeichert. Aktiviere Push im Profil, damit sie zugestellt werden kann.</p>'

    notice = f'<div class="ed-notice">{escape(hinweis)}</div>' if hinweis else ""
    contact_html = ""
    if contact and not past:
        contact_html = f'''<div class="ed-contact"><span>👥</span><div><strong>Ansprechpartner</strong><small>{escape(contact)}</small></div></div>'''

    if past:
        recap_body = f'<p class="ed-copy">{escape(recap)}</p>' if recap else '<p class="ed-empty-recap">Zu dieser Veranstaltung wurde noch kein Nachbericht ergänzt.</p>'
        photos = _gallery_html(event, title)
        gallery_html = f'<div class="ed-gallery">{photos}</div>' if photos else ""
        recap_section = f'''<section class="ed-recap"><span class="ed-eye">Dorfchronik</span><h2>{'So war es' if recap or gallery else 'Rückblick'}</h2>{recap_body}{gallery_html}</section>'''
        original = f'''<details class="ed-original"><summary>Ursprüngliche Veranstaltungsinfo</summary><div class="ed-original-body"><p class="ed-copy">{escape(description)}</p>{f'<div class="ed-contact"><span>👥</span><div><strong>Ansprechpartner</strong><small>{escape(contact)}</small></div></div>' if contact else ''}</div></details>'''
        lower = recap_section + original
    else:
        lower = f'''<section class="ed-card"><span class="ed-eye">Informationen</span><h2>Über die Veranstaltung</h2><p class="ed-copy">{escape(description)}</p>{contact_html}</section>'''

    hero = f'''<section class="{hero_class}">{hero_image}<div class="ed-main"><div class="ed-kicker"><span class="ed-badge{' past' if past else ''}">{escape(badge)}</span><span class="ed-status">{escape(status)}</span></div><h1>{escape(title)}</h1><p class="ed-lead">{'Fotos und Nachbericht zur vergangenen Veranstaltung.' if past else 'Alle wichtigen Informationen zum Termin auf einen Blick.'}</p><div class="ed-facts">{''.join(facts)}</div>{notice}{actions}{push_hint}</div></section>'''

    lightbox = ""
    if past and gallery:
        lightbox = '<div class="ed-lightbox" id="event-photo-lightbox" role="dialog" aria-modal="true" aria-label="Fotoansicht"><button class="ed-lightbox-close" type="button" aria-label="Fotoansicht schließen">×</button><img id="event-photo-lightbox-image" alt="Vergrößerte Veranstaltungsaufnahme"></div>' + LIGHTBOX_JS

    back_href = "/aktuelles-termine?ansicht=archiv" if past else "/aktuelles-termine"
    back_label = "Zurück zum Archiv" if past else "Zurück zu Aktuelles & Termine"
    body = f'''{DETAIL_CSS}<section class="ed"><a class="ed-back" href="{back_href}">← {back_label}</a>{hero}{lower}</section>{lightbox}'''
    return page(title, body, active="calendar", body_class="current-events-detail")
