from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from html import escape
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse

from current_events_patch import home_current_events
from muelltermine_crud import get_naechste_muelltermine
from platform_runtime import get_platform_snapshot
from pwa_ui import page
from veranstaltungen_crud import get_aktive_veranstaltungen
from weather_service import get_weather_snapshot


router = APIRouter()

HOME_CSS = r'''
<style id="home-weather-dashboard-style">
.home-dashboard-v2 .hero-card{min-height:255px;margin-bottom:16px;border-radius:0 0 30px 30px}
.home-dashboard-v2 .hero-image{background-position:center 48%}
.home-dashboard-v2 .hero-overlay{inset:auto 22px 20px;max-width:700px}
.home-dashboard-v2 .hero-kicker{padding:6px 10px;font-size:10px;letter-spacing:.075em}
.home-dashboard-v2 .hero-overlay h1{max-width:690px;margin:9px 0 6px;font-size:clamp(31px,6.3vw,48px);line-height:1;letter-spacing:-.04em}
.home-dashboard-v2 .hero-overlay p{max-width:690px;font-size:13px;line-height:1.4}
.hero-weather-chip{position:absolute;z-index:4;top:15px;right:15px;display:grid;grid-template-columns:35px minmax(0,1fr) 12px;gap:8px;align-items:center;min-width:150px;max-width:195px;padding:9px 10px;border:1px solid rgba(255,255,255,.38);border-radius:18px;color:#fff;background:rgba(19,63,45,.62);box-shadow:0 9px 24px rgba(12,40,28,.15);backdrop-filter:blur(13px);text-decoration:none}
.hero-weather-symbol{display:grid;place-items:center;width:35px;height:35px;border-radius:12px;background:rgba(255,255,255,.15);font-size:21px}
.hero-weather-copy{min-width:0}.hero-weather-copy strong,.hero-weather-copy small{display:block}.hero-weather-copy strong{font-size:18px;line-height:1}.hero-weather-copy small{margin-top:3px;overflow:hidden;font-size:9px;font-weight:750;white-space:nowrap;text-overflow:ellipsis;color:rgba(255,255,255,.86)}
.hero-weather-arrow{font-size:19px;font-weight:900}
.home-day-overview{display:grid;gap:11px;margin:0 0 17px}.home-greeting-compact{display:flex;align-items:end;justify-content:space-between;gap:12px}.home-greeting-compact h2{margin:3px 0 0;font-size:24px;line-height:1.05;letter-spacing:-.035em}.home-greeting-compact .eyebrow{font-size:10px}
.home-quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.home-quick-card{display:grid;grid-template-columns:39px minmax(0,1fr) 13px;gap:9px;align-items:center;min-height:84px;padding:11px;border:1px solid var(--line);border-radius:19px;background:rgba(255,255,255,.9);box-shadow:0 7px 22px rgba(28,63,45,.06);color:inherit;text-decoration:none}.home-quick-card>span:first-child{display:grid;place-items:center;width:39px;height:39px;border-radius:13px;color:var(--forest);background:var(--soft);font-size:18px}.home-quick-card>div{min-width:0}.home-quick-card small,.home-quick-card strong{display:block}.home-quick-card small{overflow:hidden;color:var(--muted);font-size:9px;font-weight:800;white-space:nowrap;text-overflow:ellipsis}.home-quick-card strong{display:-webkit-box;margin-top:4px;overflow:hidden;color:#22362c;font-size:12px;line-height:1.25;-webkit-box-orient:vertical;-webkit-line-clamp:2}.home-quick-card .home-quick-meta{margin-top:3px;color:#718078;font-size:9px;font-weight:700}.home-quick-arrow{color:var(--forest);font-size:18px;font-weight:900}
.home-dashboard-v2 .notice-card{display:none!important}
@media(max-width:560px){
  .home-dashboard-v2 .hero-card{min-height:230px;margin-bottom:14px}
  .home-dashboard-v2 .hero-overlay{inset:auto 18px 17px}
  .home-dashboard-v2 .hero-overlay h1{max-width:95%;font-size:31px;line-height:1.01}
  .home-dashboard-v2 .hero-overlay p{display:-webkit-box;overflow:hidden;font-size:11.5px;line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:2}
  .hero-weather-chip{top:12px;right:12px;min-width:139px;max-width:168px;padding:8px 9px;border-radius:16px;grid-template-columns:31px minmax(0,1fr) 10px}
  .hero-weather-symbol{width:31px;height:31px;border-radius:10px;font-size:18px}.hero-weather-copy strong{font-size:16px}.hero-weather-copy small{font-size:8.5px}
  .home-greeting-compact h2{font-size:22px}
}
@media(max-width:350px){.home-quick-grid{grid-template-columns:1fr}.hero-weather-chip{max-width:155px}}
</style>
'''

WEATHER_PAGE_CSS = r'''
<style>
.weather-shell{display:grid;gap:15px;min-width:0;padding:18px 0 185px}.weather-back{display:inline-flex;color:var(--forest);font-weight:900;text-decoration:none}.weather-head{display:grid;gap:5px}.weather-head .eyebrow{font-size:10px}.weather-head h1{margin:0;color:#142d22;font-size:clamp(31px,7vw,43px);line-height:1.03;letter-spacing:-.035em}.weather-head p{margin:0;color:var(--muted);font-size:13px;line-height:1.45}
.weather-current{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;padding:17px;border:1px solid #dbe5d9;border-radius:25px;background:linear-gradient(145deg,#f8fbf5,#eaf4e8);box-shadow:0 10px 28px rgba(28,72,48,.07)}.weather-current-symbol{display:grid;place-items:center;width:78px;height:78px;border-radius:24px;background:rgba(255,255,255,.72);font-size:42px}.weather-current-main{min-width:0}.weather-current-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.weather-current-temp{color:var(--forest);font-size:42px;font-weight:900;line-height:.95;letter-spacing:-.05em}.weather-current-label{display:block;margin-top:5px;color:#42564b;font-size:14px;font-weight:850}.weather-current-note{display:block;margin-top:4px;color:var(--muted);font-size:10px}.weather-stats{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.weather-stat{padding:9px 7px;border-radius:13px;background:rgba(255,255,255,.68);text-align:center}.weather-stat small,.weather-stat strong{display:block}.weather-stat small{color:var(--muted);font-size:8px;font-weight:850;text-transform:uppercase;letter-spacing:.04em}.weather-stat strong{margin-top:4px;color:#2d4739;font-size:11px}
.weather-section{display:grid;gap:9px}.weather-section-head{display:flex;align-items:end;justify-content:space-between;gap:10px}.weather-section-head h2{margin:2px 0 0;color:var(--forest);font-size:21px}.weather-section-head small{color:var(--muted);font-size:9px}.weather-hourly{display:flex;gap:7px;overflow-x:auto;padding:1px 1px 5px;scrollbar-width:none;scroll-snap-type:x proximity}.weather-hourly::-webkit-scrollbar{display:none}.weather-hour{flex:0 0 76px;display:grid;justify-items:center;gap:5px;padding:10px 7px;border:1px solid #dde6da;border-radius:17px;background:#fff;scroll-snap-align:start}.weather-hour.now{border-color:#9fbc96;background:#eff7eb;box-shadow:inset 0 0 0 1px #cfe0c8}.weather-hour time{color:#4f6056;font-size:10px;font-weight:900}.weather-hour .weather-symbol{font-size:24px}.weather-hour strong{color:#203b2d;font-size:14px}.weather-hour small{color:#78837c;font-size:9px}.weather-hour .rain{color:#456d8c;font-weight:850}
.weather-days{display:grid;gap:7px}.weather-day{display:grid;grid-template-columns:72px 42px minmax(0,1fr) auto;gap:9px;align-items:center;padding:11px 12px;border:1px solid #dde6da;border-radius:18px;background:#fff}.weather-day-date strong,.weather-day-date small{display:block}.weather-day-date strong{color:#2a4938;font-size:12px}.weather-day-date small{margin-top:2px;color:var(--muted);font-size:9px}.weather-day-symbol{font-size:25px;text-align:center}.weather-day-copy{min-width:0}.weather-day-copy strong,.weather-day-copy small{display:block}.weather-day-copy strong{overflow:hidden;color:#3b5045;font-size:11px;white-space:nowrap;text-overflow:ellipsis}.weather-day-copy small{margin-top:3px;color:#78837c;font-size:8.5px}.weather-day-temp{text-align:right}.weather-day-temp strong{display:block;color:#203b2d;font-size:13px}.weather-day-temp small{display:block;margin-top:3px;color:#456d8c;font-size:9px;font-weight:800}
.weather-loading,.weather-error{padding:18px;border:1px dashed #cdd9ca;border-radius:20px;background:#fbfcf9;color:var(--muted);font-size:12px;line-height:1.5}.weather-attribution{padding-top:2px;color:#7b867e;font-size:9px;line-height:1.4}.weather-attribution a{color:var(--forest);font-weight:850}
@media(max-width:400px){.weather-current-symbol{width:66px;height:66px;font-size:35px}.weather-current-temp{font-size:37px}.weather-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.weather-day{grid-template-columns:64px 36px minmax(0,1fr) auto;padding:10px}.weather-day-symbol{font-size:22px}}
</style>
'''

HOME_WEATHER_JS = r'''
<script>
(() => {
  const temp = document.getElementById('home-weather-temp');
  const label = document.getElementById('home-weather-label');
  const symbol = document.getElementById('home-weather-symbol');
  if (!temp || !label || !symbol) return;
  fetch('/api/wetter', {cache:'no-store'})
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      if (!data.available || !data.current) throw new Error('unavailable');
      temp.textContent = `${data.current.temperature ?? '–'}°`;
      label.textContent = data.current.label || 'Wetter ansehen';
      symbol.textContent = data.current.symbol || '🌤️';
    })
    .catch(() => {
      temp.textContent = 'Wetter';
      label.textContent = 'Derzeit nicht verfügbar';
      symbol.textContent = '🌤️';
    });
})();
</script>
'''

WEATHER_PAGE_JS = r'''
<script>
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => value === null || value === undefined ? '–' : value;
  const time = value => String(value || '').slice(11,16) || '–';
  const dateLabel = value => {
    try { return new Intl.DateTimeFormat('de-DE',{weekday:'short'}).format(new Date(`${value}T12:00:00`)); }
    catch (_) { return value; }
  };
  const shortDate = value => {
    try { return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(new Date(`${value}T12:00:00`)); }
    catch (_) { return value; }
  };

  function render(data){
    if (!data.available || !data.current) throw new Error(data.error || 'Wetterdaten nicht verfügbar');
    const current = data.current;
    const today = String(current.time || '').slice(0,10) || (data.daily?.[0]?.date || '');
    const todayDaily = (data.daily || []).find(d => d.date === today) || (data.daily || [])[0] || {};
    $('weather-current-symbol').textContent = current.symbol || '🌤️';
    $('weather-current-temp').textContent = `${number(current.temperature)}°`;
    $('weather-current-label').textContent = current.label || 'Aktuelles Wetter';
    $('weather-current-note').textContent = `${data.municipality || 'Ahnsen'}${data.stale ? ' · zuletzt geladene Werte' : ' · aktuell'}`;
    $('weather-feels').textContent = `${number(current.feels_like)}°`;
    $('weather-humidity').textContent = `${number(current.humidity)} %`;
    $('weather-wind').textContent = `${number(current.wind)} km/h`;
    $('weather-rain-now').textContent = `${number(current.precipitation)} mm`;
    if (todayDaily.temperature_max !== undefined) {
      $('weather-today-range').textContent = `${number(todayDaily.temperature_max)}° / ${number(todayDaily.temperature_min)}°`;
    }

    const currentHour = String(current.time || '').slice(0,13);
    const todayHours = (data.hourly || []).filter(item => String(item.time || '').startsWith(today));
    const hourly = $('weather-hourly');
    hourly.innerHTML = todayHours.map(item => {
      const now = String(item.time || '').slice(0,13) === currentHour;
      return `<article class="weather-hour${now?' now':''}"${now?' id="weather-current-hour"':''}><time>${esc(time(item.time))}</time><span class="weather-symbol">${esc(item.symbol || '🌤️')}</span><strong>${esc(number(item.temperature))}°</strong><small>${esc(item.label || '')}</small><small class="rain">💧 ${esc(number(item.precipitation_probability))}%</small></article>`;
    }).join('') || '<div class="weather-loading">Für heute sind gerade keine Stundenwerte verfügbar.</div>';
    setTimeout(() => $('weather-current-hour')?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}), 80);

    const nextDays = (data.daily || []).filter(item => item.date && item.date !== today).slice(0,5);
    $('weather-days').innerHTML = nextDays.map(item => `<article class="weather-day"><div class="weather-day-date"><strong>${esc(dateLabel(item.date))}</strong><small>${esc(shortDate(item.date))}</small></div><div class="weather-day-symbol">${esc(item.symbol || '🌤️')}</div><div class="weather-day-copy"><strong>${esc(item.label || 'Wetter')}</strong><small>☀ ${esc(time(item.sunrise))} · 🌙 ${esc(time(item.sunset))}</small></div><div class="weather-day-temp"><strong>${esc(number(item.temperature_max))}° / ${esc(number(item.temperature_min))}°</strong><small>💧 ${esc(number(item.precipitation_probability_max))}%</small></div></article>`).join('') || '<div class="weather-loading">Die 5-Tage-Vorschau ist gerade nicht verfügbar.</div>';

    $('weather-loading').hidden = true;
    $('weather-content').hidden = false;
    if (data.error) {
      $('weather-data-note').textContent = data.error;
      $('weather-data-note').hidden = false;
    }
    const source = $('weather-provider');
    if (source && data.provider) {
      source.textContent = data.provider;
      source.href = String(data.provider_url || 'https://open-meteo.com/');
    }
  }

  fetch('/api/wetter', {cache:'no-store'})
    .then(r => r.ok ? r.json() : Promise.reject(new Error('Wetterdienst antwortet nicht.')))
    .then(render)
    .catch(() => {
      $('weather-loading').hidden = true;
      const box = $('weather-error');
      box.hidden = false;
      box.textContent = 'Die Wetterdaten können gerade nicht geladen werden. Bitte versuche es später erneut.';
    });
})();
</script>
'''


def _local_now() -> datetime:
    cfg = get_platform_snapshot()
    try:
        zone = ZoneInfo(str(cfg.get("timezone") or "Europe/Berlin"))
    except Exception:
        zone = ZoneInfo("Europe/Berlin")
    return datetime.now(zone)


def _event_date(value) -> date | None:
    try:
        return datetime.strptime(str(getattr(value, "datum", "") or "").strip(), "%d.%m.%Y").date()
    except (TypeError, ValueError):
        return None


def _display_title(value: str | None, fallback: str = "Termin") -> str:
    text = str(value or fallback).strip() or fallback
    return text[0].upper() + text[1:] if text and text[0].islower() else text


def _relative_day(value: date | None, today: date) -> str:
    if not isinstance(value, date):
        return "Termin folgt"
    days = (value - today).days
    if days == 0:
        return "heute"
    if days == 1:
        return "morgen"
    if days > 1:
        return f"in {days} Tagen"
    return value.strftime("%d.%m.%Y")


def _quick_overview() -> str:
    now = _local_now()
    today = now.date()
    greeting = "Guten Morgen" if now.hour < 11 else "Guten Tag" if now.hour < 18 else "Guten Abend"

    events = list(get_aktive_veranstaltungen())
    event = events[0] if events else None
    event_day = _event_date(event) if event else None
    if event and event_day:
        if event_day == today:
            event_label = "Heute in Ahnsen"
        elif event_day == today + timedelta(days=1):
            event_label = "Morgen in Ahnsen"
        else:
            event_label = "Nächster Termin"
        event_title = _display_title(getattr(event, "titel", ""), "Termin")
        event_meta = event_day.strftime("%d.%m.%Y")
        event_href = f"/aktuelles-termine/{event.id}"
    else:
        event_label = "Aktuelles & Termine"
        event_title = "Keine kommenden Termine"
        event_meta = "Kalender ansehen"
        event_href = "/aktuelles-termine"

    waste = list(get_naechste_muelltermine(limit=1))
    item = waste[0] if waste else None
    waste_day = getattr(item, "datum", None) if item else None
    if item:
        waste_label = f"Müllabfuhr · {_relative_day(waste_day, today)}"
        waste_title = str(getattr(item, "abfuhrarten", "") or "Müllabfuhr")
        waste_meta = waste_day.strftime("%d.%m.%Y") if isinstance(waste_day, date) else "Termin ansehen"
    else:
        waste_label = "Nächste Müllabfuhr"
        waste_title = "Noch kein Termin verfügbar"
        waste_meta = "Abfallkalender ansehen"

    return f'''
<section class="home-day-overview">
  <div class="home-greeting-compact"><div><span class="eyebrow">{escape(greeting)} 👋</span><h2>Schön, dass du da bist.</h2></div></div>
  <div class="home-quick-grid">
    <a class="home-quick-card" href="{escape(event_href)}"><span>▣</span><div><small>{escape(event_label)}</small><strong>{escape(event_title)}</strong><span class="home-quick-meta">{escape(event_meta)}</span></div><span class="home-quick-arrow">›</span></a>
    <a class="home-quick-card" href="/muelltermine-info"><span>♻</span><div><small>{escape(waste_label)}</small><strong>{escape(waste_title)}</strong><span class="home-quick-meta">{escape(waste_meta)}</span></div><span class="home-quick-arrow">›</span></a>
  </div>
</section>
'''


def _weather_chip() -> str:
    return '''<a class="hero-weather-chip" href="/wetter" aria-label="Aktuelles Wetter und Vorhersage öffnen"><span class="hero-weather-symbol" id="home-weather-symbol">🌤️</span><span class="hero-weather-copy"><strong id="home-weather-temp">–°</strong><small id="home-weather-label">Wetter wird geladen …</small></span><span class="hero-weather-arrow">›</span></a>'''


def _inject_home_dashboard(response: HTMLResponse) -> HTMLResponse:
    html = response.body.decode("utf-8")
    html = html.replace("<body class=\"home-view\"", "<body class=\"home-view home-dashboard-v2\"", 1)
    html = html.replace("</head>", HOME_CSS + "</head>", 1)

    hero_match = re.search(r'(<section class="hero-card">.*?)(</section>)', html, flags=re.S)
    if hero_match:
        hero = hero_match.group(1) + _weather_chip() + hero_match.group(2)
        html = html[:hero_match.start()] + hero + html[hero_match.end():]

    html = re.sub(
        r'<section class="greeting-row">.*?</section>',
        _quick_overview(),
        html,
        count=1,
        flags=re.S,
    )
    html = re.sub(
        r'<section class="notice-card(?: empty-notice)?">.*?</section>',
        "",
        html,
        count=1,
        flags=re.S,
    )
    html = html.replace("</body>", HOME_WEATHER_JS + "</body>", 1)
    headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower() not in {"content-length", "content-type"}
    }
    return HTMLResponse(html, status_code=response.status_code, headers=headers)


@router.get("/")
async def compact_home_with_weather():
    response = await home_current_events()
    return _inject_home_dashboard(response)


@router.get("/api/wetter")
def weather_api():
    return JSONResponse(
        get_weather_snapshot(),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache"},
    )


@router.get("/wetter")
async def weather_page():
    cfg = get_platform_snapshot()
    municipality = str(cfg.get("municipality_name") or "Ahnsen")
    content = f'''
{WEATHER_PAGE_CSS}
<section class="weather-shell">
  <a class="weather-back" href="/">← Start</a>
  <header class="weather-head"><span class="eyebrow">Wetter vor Ort</span><h1>Wetter in {escape(municipality)}</h1><p>Aktuell, der komplette Tagesverlauf von heute und die nächsten fünf Tage.</p></header>
  <div class="weather-loading" id="weather-loading">Wetterdaten werden geladen …</div>
  <div class="weather-error" id="weather-error" hidden></div>
  <div id="weather-content" hidden>
    <section class="weather-current">
      <div class="weather-current-symbol" id="weather-current-symbol">🌤️</div>
      <div class="weather-current-main"><div class="weather-current-top"><div><strong class="weather-current-temp" id="weather-current-temp">–°</strong><span class="weather-current-label" id="weather-current-label">Aktuelles Wetter</span><small class="weather-current-note" id="weather-current-note">{escape(municipality)}</small></div><strong id="weather-today-range" style="color:var(--forest);font-size:12px">–° / –°</strong></div></div>
      <div class="weather-stats">
        <div class="weather-stat"><small>Gefühlt</small><strong id="weather-feels">–</strong></div>
        <div class="weather-stat"><small>Feuchte</small><strong id="weather-humidity">–</strong></div>
        <div class="weather-stat"><small>Wind</small><strong id="weather-wind">–</strong></div>
        <div class="weather-stat"><small>Niederschlag</small><strong id="weather-rain-now">–</strong></div>
      </div>
    </section>
    <p class="weather-loading" id="weather-data-note" hidden></p>
    <section class="weather-section"><div class="weather-section-head"><div><span class="eyebrow">Heute</span><h2>Tagesverlauf</h2></div><small>00–23 Uhr · aktuelle Stunde markiert</small></div><div class="weather-hourly" id="weather-hourly"></div></section>
    <section class="weather-section"><div class="weather-section-head"><div><span class="eyebrow">Vorschau</span><h2>Die nächsten 5 Tage</h2></div></div><div class="weather-days" id="weather-days"></div></section>
  </div>
  <p class="weather-attribution">Wetterdaten: <a id="weather-provider" href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>. Prognosen können sich ändern; amtliche Gefahrenwarnungen findest du weiterhin separat unter Warnlage.</p>
</section>
{WEATHER_PAGE_JS}
'''
    return page(
        f"Wetter in {municipality}",
        content,
        active="home",
        description=f"Aktuelles Wetter, Stundenverlauf und 5-Tage-Vorhersage für {municipality}.",
        body_class="weather-view",
    )
