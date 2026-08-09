from __future__ import annotations

import calendar
from datetime import date, datetime
from html import escape

from fastapi import APIRouter, Request

from dgh_crud import get_alle_dgh_termine, get_dgh_termine_fuer_benutzer
from gemeinde_crud import get_gemeinde_einstellungen
from pwa_core import _current_user
from pwa_ui import icon, page


router = APIRouter()

MONTH_NAMES = (
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
)


def _parse_date(value: str):
    try:
        return datetime.strptime(str(value or "").strip(), "%d.%m.%Y").date()
    except (TypeError, ValueError):
        return None


def _months(start: date, count: int = 12):
    year, month = start.year, start.month
    for index in range(count):
        yield index, year, month
        month += 1
        if month > 12:
            month = 1
            year += 1


def _status_class(status: str) -> str:
    status = str(status or "").casefold()
    if status == "bestätigt":
        return "confirmed"
    if status == "abgelehnt":
        return "rejected"
    return "pending"


def _latest_request_card(user) -> str:
    if not user:
        return ""
    requests = get_dgh_termine_fuer_benutzer(user.id)
    if not requests:
        return ""
    item = requests[0]
    status = getattr(item, "status", "Anfrage") or "Anfrage"
    return f"""
    <section class="dgh-my-request">
      <div class="dgh-my-icon">{icon('building')}</div>
      <div class="dgh-my-copy">
        <span class="eyebrow">Meine aktuelle DGH-Anfrage</span>
        <h2>{escape(getattr(item, 'anlass', '') or 'Mietanfrage')}</h2>
        <p>DGH-{item.id:06d} · {escape(getattr(item, 'datum', '') or 'Datum offen')} · {escape(getattr(item, 'uhrzeit', '') or 'Zeit nach Vereinbarung')}</p>
      </div>
      <span class="dgh-my-status {_status_class(status)}">{escape(status)}</span>
      <a href="/profil#meine-dgh">Im Profil ansehen <b>→</b></a>
    </section>"""


def _rules(settings: dict) -> str:
    items = [line.strip() for line in str(settings.get("dgh_regeln") or "").splitlines() if line.strip()]
    if not items:
        items = [
            "Bitte stelle deine Anfrage möglichst frühzeitig.",
            "Eine Buchung ist erst nach Bestätigung durch das Gemeindeteam verbindlich.",
            "Für Rückfragen bitte Kontaktdaten vollständig angeben.",
        ]
    return "".join(f'<li><span>✓</span><div>{escape(item)}</div></li>' for item in items)


def _calendar_panels(terms) -> tuple[str, str]:
    today = date.today()
    availability: dict[date, str] = {}
    for item in terms:
        if getattr(item, "aktiv", "Ja") != "Ja":
            continue
        item_date = _parse_date(getattr(item, "datum", ""))
        if not item_date or item_date < today:
            continue
        status = getattr(item, "status", "") or ""
        if status == "Bestätigt":
            availability[item_date] = "booked"
        elif status == "Anfrage" and availability.get(item_date) != "booked":
            availability[item_date] = "request"

    engine = calendar.Calendar(firstweekday=0)
    panels = []
    for index, year, month in _months(today, 12):
        cells = []
        for week in engine.monthdayscalendar(year, month):
            for day_number in week:
                if not day_number:
                    cells.append('<span class="dgh-day empty" aria-hidden="true"></span>')
                    continue
                current = date(year, month, day_number)
                state = availability.get(current, "free")
                today_class = " is-today" if current == today else ""
                number = f'<span class="dgh-day-number">{day_number}</span>'
                if current < today:
                    cells.append(f'<span class="dgh-day past">{number}</span>')
                    continue
                if state == "booked":
                    cells.append(
                        f'<span class="dgh-day booked{today_class}" aria-label="{day_number}. {MONTH_NAMES[month - 1]} {year}: belegt">'
                        f'{number}<i class="dgh-state-dot" aria-hidden="true"></i></span>'
                    )
                    continue
                label = "Anfrage läuft, weitere Anfrage möglich" if state == "request" else "frei, Termin anfragen"
                cells.append(
                    f'<a class="dgh-day {state}{today_class}" href="/dgh-anfrage?datum={current.isoformat()}" '
                    f'aria-label="{day_number}. {MONTH_NAMES[month - 1]} {year}: {label}">'
                    f'{number}<i class="dgh-state-dot" aria-hidden="true"></i></a>'
                )

        month_label = f"{MONTH_NAMES[month - 1]} {year}"
        hidden = "" if index == 0 else " hidden"
        panels.append(
            f'<section class="dgh-month-panel" data-dgh-month="{index}" data-label="{month_label}"{hidden}>'
            f'<div class="dgh-month-heading"><h3>{month_label}</h3><span>Verfügbarkeit</span></div>'
            '<div class="dgh-weekdays"><span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span></div>'
            f'<div class="dgh-month-grid">{"".join(cells)}</div></section>'
        )
    return "".join(panels), f"{MONTH_NAMES[today.month - 1]} {today.year}"


DGH_CENTER_CSS = """
<style>
.dgh-center{display:grid;gap:20px;max-width:100%;padding-bottom:150px}.dgh-center *{min-width:0}.dgh-hero{position:relative;overflow:hidden;padding:26px;border:1px solid #cbdacb;border-radius:30px;background:linear-gradient(145deg,#f9fcf7 0%,#edf5e9 100%);box-shadow:var(--soft-shadow)}.dgh-hero:after{content:"";position:absolute;right:-70px;top:-90px;width:230px;height:230px;border-radius:50%;background:rgba(111,157,112,.12)}.dgh-hero-inner{position:relative;z-index:1;max-width:650px}.dgh-hero-icon{width:62px;height:62px;display:grid;place-items:center;margin-bottom:18px;border-radius:20px;background:#fff;color:var(--forest);box-shadow:0 8px 22px rgba(30,67,46,.09)}.dgh-hero-icon svg{width:31px;height:31px}.dgh-hero h1{margin:7px 0 10px;color:#102c21;font-size:clamp(34px,8vw,52px);line-height:1.02;letter-spacing:-.045em}.dgh-hero p{max-width:590px;margin:0;color:#55645b;font-size:15px;line-height:1.55}.dgh-hero-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.dgh-hero-actions a{min-height:46px;display:inline-flex;align-items:center;justify-content:center;padding:11px 16px;border-radius:15px;text-decoration:none;font-size:13px;font-weight:900}.dgh-hero-actions .primary{color:#fff;background:var(--forest)}.dgh-hero-actions .secondary{border:1px solid #bfd1bd;color:var(--forest);background:rgba(255,255,255,.82)}
.dgh-quick-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.dgh-quick{display:flex;align-items:center;gap:11px;padding:15px;border:1px solid var(--line);border-radius:20px;background:#fff;box-shadow:0 6px 18px rgba(28,63,45,.05)}.dgh-quick-icon{width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;border-radius:14px;color:var(--forest);background:var(--soft);font-size:20px}.dgh-quick strong,.dgh-quick small{display:block}.dgh-quick strong{color:#294536;font-size:13px}.dgh-quick small{margin-top:3px;color:var(--muted);font-size:10px;line-height:1.35}
.dgh-my-request{display:grid;grid-template-columns:48px 1fr auto;gap:12px;align-items:center;padding:17px;border:1px solid #c7d8c7;border-radius:23px;background:linear-gradient(135deg,#fff,#f3f8f0)}.dgh-my-icon{width:48px;height:48px;display:grid;place-items:center;border-radius:15px;color:var(--forest);background:#e9f3e6}.dgh-my-copy h2{margin:4px 0 3px;color:var(--forest);font-size:18px}.dgh-my-copy p{margin:0;color:var(--muted);font-size:11px}.dgh-my-status{padding:7px 10px;border-radius:999px;font-size:10px;font-weight:900}.dgh-my-status.pending{color:#735717;background:#fff1c7}.dgh-my-status.confirmed{color:#245238;background:#def1df}.dgh-my-status.rejected{color:#87382f;background:#fde1dd}.dgh-my-request>a{grid-column:2/4;color:var(--forest);font-size:11px;font-weight:850;text-decoration:none}
.dgh-section-heading{display:flex;justify-content:space-between;align-items:end;gap:14px}.dgh-section-heading h2{margin:5px 0 0;color:var(--forest);font-size:26px;letter-spacing:-.03em}.dgh-section-heading p{max-width:360px;margin:0;color:var(--muted);font-size:12px;line-height:1.45}.dgh-calendar-card{overflow:hidden;padding:0;border:1px solid var(--line);border-radius:28px;background:#fff;box-shadow:var(--soft-shadow)}.dgh-calendar-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:19px 20px 15px;border-bottom:1px solid var(--line);background:linear-gradient(135deg,#fff,#f6f9f3)}.dgh-calendar-title h3{margin:5px 0 0;color:var(--forest);font-size:25px}.dgh-calendar-title p{margin:6px 0 0;color:var(--muted);font-size:12px}.dgh-calendar-nav{display:flex;align-items:center;gap:7px}.dgh-calendar-nav button{min-width:40px;height:40px;padding:0 11px;border:1px solid var(--line);border-radius:13px;color:var(--forest);background:#fff;font-weight:900;cursor:pointer}.dgh-calendar-nav button:disabled{opacity:.35}.dgh-today{font-size:11px}.dgh-calendar-legend{display:flex;flex-wrap:wrap;gap:8px;padding:12px 20px;border-bottom:1px solid var(--line)}.dgh-calendar-legend span{display:inline-flex;align-items:center;gap:7px;color:#5c685f;font-size:10px;font-weight:850}.dgh-calendar-legend i,.dgh-state-dot{width:9px;height:9px;border-radius:50%}.dgh-calendar-legend .free,.dgh-day.free .dgh-state-dot{background:#72ae7d}.dgh-calendar-legend .request,.dgh-day.request .dgh-state-dot{background:#e1aa31}.dgh-calendar-legend .booked,.dgh-day.booked .dgh-state-dot{background:#cc6459}.dgh-calendar-legend .today{background:#fff;border:2px solid var(--forest)}.dgh-calendar-body{padding:17px 20px 20px}.dgh-month-panel[hidden]{display:none!important}.dgh-month-heading{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:12px}.dgh-month-heading h3{margin:0;color:#294536;font-size:22px}.dgh-month-heading span{color:var(--muted);font-size:10px;font-weight:800}.dgh-weekdays,.dgh-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.dgh-weekdays{margin-bottom:6px}.dgh-weekdays span{padding:4px 0;color:#879088;font-size:9px;font-weight:900;text-align:center;text-transform:uppercase}.dgh-day{min-height:58px;position:relative;display:flex;align-items:flex-start;justify-content:flex-end;padding:7px;border:1px solid #e6eae4;border-radius:14px;color:#3d4a42;background:#fbfcfa;text-decoration:none;font-weight:900;transition:.15s}.dgh-day.free{border-color:#d9e8d9;background:#f7fbf6}.dgh-day.request{border-color:#eddfb7;background:#fffaf0;color:#795b19}.dgh-day.booked{border-color:#efd4d0;background:#fff7f6;color:#8a423b}.dgh-day.past{color:#b1b5b2;background:#f5f5f3}.dgh-day.empty{border-color:transparent;background:transparent}.dgh-day.is-today{box-shadow:inset 0 0 0 2px var(--forest)}.dgh-day:not(.empty):not(.past):hover{transform:translateY(-1px);box-shadow:0 7px 15px rgba(25,64,45,.08)}.dgh-day-number{font-size:14px}.dgh-state-dot{position:absolute;left:8px;bottom:8px}.dgh-calendar-note{display:flex;gap:9px;margin-top:13px;padding:11px 12px;border-radius:14px;color:#5c675f;background:#f5f8f3;font-size:10px;line-height:1.45}.dgh-calendar-note strong{color:var(--forest)}
.dgh-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.dgh-step{position:relative;padding:18px;border:1px solid var(--line);border-radius:21px;background:#fff}.dgh-step-number{width:32px;height:32px;display:grid;place-items:center;margin-bottom:12px;border-radius:11px;color:#fff;background:var(--forest);font-size:12px;font-weight:900}.dgh-step h3{margin:0 0 6px;color:#294536;font-size:15px}.dgh-step p{margin:0;color:var(--muted);font-size:11px;line-height:1.45}.dgh-step:not(:last-child):after{content:"→";position:absolute;right:-12px;top:27px;z-index:2;width:24px;height:24px;display:grid;place-items:center;border-radius:50%;color:var(--forest);background:#f5f8f2;font-weight:900}
.dgh-info{display:grid;grid-template-columns:1.05fr .95fr;gap:12px}.dgh-info-card{padding:20px;border:1px solid var(--line);border-radius:24px;background:#fff}.dgh-info-card h2{margin:5px 0 13px;color:var(--forest);font-size:22px}.dgh-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.dgh-fact{padding:13px;border-radius:16px;background:#f6f8f3}.dgh-fact strong,.dgh-fact span{display:block}.dgh-fact strong{color:#294536;font-size:12px}.dgh-fact span{margin-top:3px;color:var(--muted);font-size:10px;line-height:1.35}.dgh-rules{display:grid;gap:9px;margin:0;padding:0;list-style:none}.dgh-rules li{display:flex;gap:9px;align-items:flex-start;color:#59665d;font-size:11px;line-height:1.45}.dgh-rules li>span{width:21px;height:21px;flex:0 0 21px;display:grid;place-items:center;border-radius:50%;color:var(--forest);background:#eaf3e7;font-size:10px;font-weight:900}.dgh-bottom-cta{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:22px 24px;border-radius:26px;color:#fff;background:linear-gradient(135deg,#174936,#0e3929)}.dgh-bottom-cta h2{margin:5px 0 5px;font-size:23px}.dgh-bottom-cta p{margin:0;color:rgba(255,255,255,.76);font-size:12px;line-height:1.45}.dgh-bottom-cta a{flex:0 0 auto;min-height:46px;display:inline-flex;align-items:center;justify-content:center;padding:11px 16px;border-radius:14px;color:var(--forest);background:#fff;text-decoration:none;font-weight:900}
@media(max-width:720px){.dgh-center{gap:17px}.dgh-hero{padding:22px 20px}.dgh-hero-actions{display:grid;grid-template-columns:1fr 1fr}.dgh-quick-grid{grid-template-columns:1fr 1fr 1fr}.dgh-quick{padding:12px 9px;gap:8px}.dgh-quick-icon{width:36px;height:36px;flex-basis:36px}.dgh-calendar-top{align-items:flex-start;flex-direction:column}.dgh-calendar-nav{width:100%;justify-content:space-between}.dgh-calendar-nav .dgh-today{flex:1}.dgh-calendar-body{padding:14px 11px 17px}.dgh-calendar-legend{padding-left:12px;padding-right:12px}.dgh-weekdays,.dgh-month-grid{gap:4px}.dgh-day{min-height:49px;padding:6px;border-radius:11px}.dgh-state-dot{left:6px;bottom:6px;width:7px;height:7px}.dgh-day-number{font-size:12px}.dgh-steps{grid-template-columns:1fr}.dgh-step{display:grid;grid-template-columns:38px 1fr;column-gap:11px;padding:14px}.dgh-step-number{grid-row:1/3;margin:0}.dgh-step h3{align-self:end}.dgh-step:not(:last-child):after{display:none}.dgh-info{grid-template-columns:1fr}.dgh-bottom-cta{align-items:stretch;flex-direction:column}.dgh-bottom-cta a{width:100%}.dgh-my-request{grid-template-columns:44px 1fr}.dgh-my-status{grid-column:2}.dgh-my-request>a{grid-column:2}}
@media(max-width:480px){.dgh-quick strong{font-size:11px}.dgh-quick small{font-size:9px}.dgh-quick-icon{display:none}.dgh-facts{grid-template-columns:1fr 1fr}.dgh-section-heading{align-items:flex-start;flex-direction:column}.dgh-section-heading p{max-width:none}.dgh-hero-actions{grid-template-columns:1fr}.dgh-calendar-title h3{font-size:22px}}
</style>
"""

DGH_CENTER_SCRIPT = """
<script>
(() => {
  const root = document.querySelector('[data-dgh-calendar]');
  if (!root) return;
  const panels = [...root.querySelectorAll('[data-dgh-month]')];
  const label = root.querySelector('[data-dgh-month-label]');
  const previous = root.querySelector('[data-dgh-prev]');
  const next = root.querySelector('[data-dgh-next]');
  const today = root.querySelector('[data-dgh-today]');
  let index = 0;
  const show = value => {
    index = Math.max(0, Math.min(value, panels.length - 1));
    panels.forEach((panel, position) => { panel.hidden = position !== index; });
    if (label) label.textContent = panels[index]?.dataset.label || '';
    if (previous) previous.disabled = index === 0;
    if (next) next.disabled = index === panels.length - 1;
  };
  previous?.addEventListener('click', () => show(index - 1));
  next?.addEventListener('click', () => show(index + 1));
  today?.addEventListener('click', () => show(0));
  show(0);
})();
</script>
"""


def render_dgh_center(request: Request):
    user = _current_user(request)
    settings = get_gemeinde_einstellungen()
    terms = get_alle_dgh_termine()
    panels, first_label = _calendar_panels(terms)
    intro = str(settings.get("dgh_seite_text") or "").strip() or (
        "Das Dorfgemeinschaftshaus ist ein zentraler Treffpunkt in Ahnsen. "
        "Prüfe freie Termine und starte deine Mietanfrage digital."
    )
    login_note = (
        "Deine Anfrage wird automatisch deinem Bürgerkonto zugeordnet und kann dort verfolgt werden."
        if user else
        "Eine Anfrage ist auch ohne Bürgerkonto möglich. Mit Konto kannst du den Status später im Profil verfolgen."
    )

    content = f"""
    <link rel="stylesheet" href="/pwa-extra.css?v=1">
    {DGH_CENTER_CSS}
    <div class="dgh-center">
      <section class="dgh-hero">
        <div class="dgh-hero-inner">
          <a class="back-link" href="/">← Start</a>
          <div class="dgh-hero-icon">{icon('building')}</div>
          <span class="eyebrow">Dorfgemeinschaftshaus Ahnsen</span>
          <h1>Raum für Gemeinschaft.</h1>
          <p>{escape(intro)}</p>
          <div class="dgh-hero-actions">
            <a class="primary" href="#dgh-kalender">Verfügbarkeit prüfen</a>
            <a class="secondary" href="/dgh-anfrage">Mietanfrage stellen</a>
          </div>
        </div>
      </section>

      <section class="dgh-quick-grid" aria-label="DGH Ablauf im Überblick">
        <div class="dgh-quick"><span class="dgh-quick-icon">◷</span><div><strong>Verfügbarkeit</strong><small>12 Monate online einsehbar</small></div></div>
        <div class="dgh-quick"><span class="dgh-quick-icon">✎</span><div><strong>Anfrage</strong><small>Direkt digital übermitteln</small></div></div>
        <div class="dgh-quick"><span class="dgh-quick-icon">✓</span><div><strong>Bestätigung</strong><small>Durch das Gemeindeteam</small></div></div>
      </section>

      {_latest_request_card(user)}

      <section class="dgh-section-heading" id="dgh-kalender">
        <div><span class="eyebrow">Belegungskalender</span><h2>Wunschtermin finden</h2></div>
        <p>Grün ist frei, Gelb zeigt eine laufende Anfrage und Rot einen bestätigten beziehungsweise blockierten Termin.</p>
      </section>

      <section class="dgh-calendar-card" data-dgh-calendar>
        <div class="dgh-calendar-top">
          <div class="dgh-calendar-title"><span class="eyebrow">Monatsansicht</span><h3 data-dgh-month-label aria-live="polite">{first_label}</h3><p>Freie und gelbe Tage kannst du direkt antippen.</p></div>
          <div class="dgh-calendar-nav"><button type="button" data-dgh-prev aria-label="Vorheriger Monat">‹</button><button class="dgh-today" type="button" data-dgh-today>Heute</button><button type="button" data-dgh-next aria-label="Nächster Monat">›</button></div>
        </div>
        <div class="dgh-calendar-legend"><span><i class="free"></i>Frei</span><span><i class="request"></i>Anfrage läuft</span><span><i class="booked"></i>Belegt</span><span><i class="today"></i>Heute</span></div>
        <div class="dgh-calendar-body">{panels}<div class="dgh-calendar-note"><span>ℹ️</span><div><strong>Datenschutz:</strong> Öffentlich werden ausschließlich Verfügbarkeiten gezeigt. Namen, Anlässe und Kontaktdaten bestehender Buchungen bleiben verborgen.</div></div></div>
      </section>

      <section class="dgh-section-heading"><div><span class="eyebrow">Einfach digital</span><h2>So funktioniert die Anfrage</h2></div></section>
      <section class="dgh-steps">
        <article class="dgh-step"><span class="dgh-step-number">1</span><h3>Termin auswählen</h3><p>Tippe im Kalender auf einen freien oder gelben Tag. Das Datum wird direkt in die Anfrage übernommen.</p></article>
        <article class="dgh-step"><span class="dgh-step-number">2</span><h3>Anfrage senden</h3><p>Trage Anlass, gewünschte Uhrzeit und deine Kontaktdaten ein und sende die Anfrage digital ab.</p></article>
        <article class="dgh-step"><span class="dgh-step-number">3</span><h3>Bestätigung erhalten</h3><p>Die Gemeinde prüft den Termin. Erst nach der ausdrücklichen Bestätigung ist die Buchung verbindlich.</p></article>
      </section>

      <section class="dgh-info">
        <article class="dgh-info-card">
          <span class="eyebrow">DGH auf einen Blick</span><h2>Wichtig vor der Anfrage</h2>
          <div class="dgh-facts">
            <div class="dgh-fact"><strong>Kalender</strong><span>Verfügbarkeit direkt online prüfen.</span></div>
            <div class="dgh-fact"><strong>Anfrage</strong><span>Digital und ohne Medienbruch senden.</span></div>
            <div class="dgh-fact"><strong>Buchung</strong><span>Erst nach Bestätigung verbindlich.</span></div>
            <div class="dgh-fact"><strong>Privatsphäre</strong><span>Keine Buchungsnamen im öffentlichen Kalender.</span></div>
          </div>
        </article>
        <article class="dgh-info-card">
          <span class="eyebrow">Hinweise der Gemeinde</span><h2>Bitte beachten</h2>
          <ul class="dgh-rules">{_rules(settings)}</ul>
        </article>
      </section>

      <section class="dgh-bottom-cta"><div><span class="eyebrow">Direkt online</span><h2>Wunschtermin gefunden?</h2><p>{escape(login_note)}</p></div><a href="/dgh-anfrage">Mietanfrage starten</a></section>
    </div>
    {DGH_CENTER_SCRIPT}
    """
    return page(
        "Dorfgemeinschaftshaus Ahnsen",
        content,
        active="dgh",
        description="Belegungskalender und digitale Mietanfrage für das Dorfgemeinschaftshaus Ahnsen.",
    )


@router.get("/dgh-mieten", name="dgh_center_page")
async def dgh_center_page(request: Request):
    return render_dgh_center(request)
