from __future__ import annotations

from datetime import datetime, timedelta
from html import escape
from typing import Any

import requests
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

import mobility_routes as legacy
from platform_runtime import get_platform_snapshot
from pwa_ui import page


router = APIRouter()

OFFICIAL_TIMETABLES = {
    "2132": "https://www.shgmobil.de/fahrplaene/linie-bek/",
    "2133": "https://www.shgmobil.de/fahrplaene/bek-stadtverkehr-bueckeburg/",
    "2026": "https://www.shgmobil.de/fahrplaene/2026-2/",
}


def _line_number(value: Any) -> str:
    try:
        return legacy._line_number(value)
    except Exception:
        if isinstance(value, dict):
            value = value.get("name") or value.get("id") or value.get("fahrtNr") or ""
        text = str(value or "")
        for known in legacy.KNOWN_LINES:
            if known in text:
                return known
        return ""


def _parse_iso(value: Any):
    try:
        return legacy._parse_iso(value)
    except Exception:
        if not value:
            return None
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return dt.astimezone(legacy.LOCAL_TZ)
        except (TypeError, ValueError):
            return None


def _normalize_day_departure(
    raw: dict[str, Any],
    stop: dict[str, Any],
    source_stop: dict[str, Any],
) -> dict[str, Any] | None:
    line = _line_number(raw.get("line"))
    if line not in legacy.KNOWN_LINES:
        return None
    actual = _parse_iso(raw.get("when") or raw.get("plannedWhen"))
    planned = _parse_iso(raw.get("plannedWhen") or raw.get("when"))
    if not actual or not planned:
        return None
    if actual.date() != datetime.now(legacy.LOCAL_TZ).date():
        return None
    try:
        delay_seconds = (
            int(raw.get("delay"))
            if raw.get("delay") is not None
            else int((actual - planned).total_seconds())
        )
    except (TypeError, ValueError):
        delay_seconds = None
    direction = str(raw.get("direction") or raw.get("provenance") or "").strip()
    return {
        "stop_key": stop["key"],
        "stop_name": stop["name"],
        "source_stop_id": source_stop.get("id"),
        "line": line,
        "direction": direction or "Richtung laut Fahrplan",
        "when": actual.isoformat(),
        "planned_when": planned.isoformat(),
        "time": actual.strftime("%H:%M"),
        "planned_time": planned.strftime("%H:%M"),
        "delay_minutes": int(round(delay_seconds / 60)) if delay_seconds is not None else None,
        "cancelled": bool(raw.get("cancelled")),
        "realtime": raw.get("when") is not None and (
            raw.get("delay") is not None or raw.get("plannedWhen") is not None
        ),
    }


def _fetch_day_departures(stop: dict[str, Any]) -> tuple[list[dict[str, Any]], str, str]:
    source_stop = legacy._resolve_departure_stop(stop)
    if not source_stop:
        return [], "unavailable", "Die Haltestelle konnte in der digitalen Fahrplanauskunft gerade nicht gefunden werden."

    now = datetime.now(legacy.LOCAL_TZ)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    items: list[dict[str, Any]] = []
    errors = 0

    # Four smaller queries are more reliable than one 24-hour request.
    for offset_hours in (0, 6, 12, 18):
        when = day_start + timedelta(hours=offset_hours)
        try:
            response = requests.get(
                f"{legacy._departure_api_base()}/stops/{requests.utils.quote(str(source_stop['id']), safe='')}/departures",
                params={
                    "when": when.isoformat(),
                    "duration": 360,
                    "results": 100,
                    "stopovers": "false",
                    "remarks": "true",
                    "language": "de",
                },
                headers={"Accept": "application/json", "User-Agent": "Ahnsen-hilft/2.0 citizen-board"},
                timeout=7,
            )
            response.raise_for_status()
            for raw in legacy._departure_items(response.json()):
                normalized = _normalize_day_departure(raw, stop, source_stop)
                if normalized:
                    items.append(normalized)
        except Exception:
            errors += 1

    unique = {
        (item["line"], item["when"], item["direction"], item["stop_key"]): item
        for item in items
    }
    departures = sorted(unique.values(), key=lambda item: item["when"])
    if departures:
        return departures, "ok", f"{len(departures)} Abfahrten für heute gefunden."
    if errors >= 4:
        return [], "unavailable", "Die digitale Fahrplanauskunft ist gerade nicht erreichbar."
    return [], "empty", "Für diese Haltestelle wurden heute keine Fahrten geliefert."


def _board_payload(stop_key: str) -> dict[str, Any]:
    stops = legacy._get_osm_stops()
    stop = next((item for item in stops if item.get("key") == stop_key), None) or stops[0]
    departures, status, message = _fetch_day_departures(stop)
    exact = legacy._vehicle_snapshot()
    return {
        "stop": stop,
        "stops": stops,
        "departures": departures,
        "status": status,
        "message": message,
        "lines": [
            {
                "line": line,
                "title": meta["title"],
                "note": meta["note"],
                "timetable_url": OFFICIAL_TIMETABLES.get(line, ""),
            }
            for line, meta in legacy.KNOWN_LINES.items()
        ],
        "vehicles": exact.get("vehicles") or [],
        "generated_at": datetime.now(legacy.LOCAL_TZ).isoformat(),
    }


@router.get("/api/mobilitaet/board")
async def citizen_board_api(stop: str = Query("schule", max_length=80)):
    return JSONResponse(_board_payload(stop), headers={"Cache-Control": "no-store"})


def _line_cards() -> str:
    cards = []
    for line, meta in legacy.KNOWN_LINES.items():
        url = OFFICIAL_TIMETABLES.get(line, "")
        cards.append(
            f'''<article class="cit-line">
                <span class="cit-line-no">{escape(line)}</span>
                <div><strong>{escape(meta["title"])}</strong><small>{escape(meta["note"])}</small></div>
                <a href="{escape(url)}" target="_blank" rel="noopener">Fahrplan</a>
            </article>'''
        )
    return "".join(cards)


_TEMPLATE = r'''
<style>
.mobility-citizen .app-main{padding-bottom:150px}
.cit-head{display:grid;gap:8px;margin:0 0 18px}.cit-head h1{margin:0;color:var(--forest);font-size:clamp(1.85rem,7vw,2.5rem);letter-spacing:-.04em}.cit-head p{margin:0;color:#647168;line-height:1.5}
.cit-board{background:#fff;border:1px solid rgba(47,79,61,.13);border-radius:26px;box-shadow:0 14px 38px rgba(45,70,56,.08);overflow:hidden}
.cit-board-top{padding:18px 18px 12px;background:linear-gradient(145deg,#f6fbf4,#eef6ea)}.cit-kicker{color:#7d9d6c;font-size:.76rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.cit-board-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:5px}.cit-board-title h2{margin:0;color:var(--forest);font-size:1.45rem}.cit-star{width:42px;height:42px;border:0;border-radius:14px;background:#fff;color:var(--forest);font-size:1.45rem;box-shadow:0 4px 14px rgba(31,91,65,.08)}
.cit-stop-tabs{display:flex;gap:8px;overflow-x:auto;padding:12px 18px 14px;scroll-snap-type:x proximity;scrollbar-width:none}.cit-stop-tabs::-webkit-scrollbar{display:none}.cit-stop-tab{scroll-snap-align:start;white-space:nowrap;border:1px solid rgba(47,79,61,.14);background:#f8f9f4;color:#496052;border-radius:999px;padding:9px 13px;font-weight:780;font-size:.82rem}.cit-stop-tab.active{background:var(--forest);color:#fff;border-color:var(--forest)}
.cit-next{display:grid;gap:9px;padding:2px 18px 16px}.cit-row{display:grid;grid-template-columns:62px 1fr auto;gap:11px;align-items:center;padding:12px;border-radius:17px;background:#fbfbf7;border:1px solid rgba(47,79,61,.09)}.cit-line-no{display:grid;place-items:center;min-width:58px;height:42px;padding:0 8px;border-radius:13px;background:var(--forest);color:#fff;font-weight:900;font-size:.92rem}.cit-main{min-width:0;display:grid;gap:3px}.cit-main strong{color:#294d3b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cit-main small{color:#7a847e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cit-time{text-align:right;display:grid;gap:2px}.cit-time strong{font-size:1.08rem;color:#173e2d}.cit-time small{font-size:.73rem;color:#65726b}.cit-delay{font-size:.68rem;font-weight:850;color:#8f4d20}.cit-empty{margin:0 18px 16px;padding:16px;border-radius:16px;background:#f7f5ed;color:#68746d;line-height:1.5}.cit-empty a{color:var(--forest);font-weight:800}
.cit-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:0 18px 18px}.cit-action{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:15px;border:1px solid rgba(31,91,65,.17);font-weight:850;text-decoration:none;background:#fff;color:var(--forest)}.cit-action.primary{background:var(--forest);color:#fff}
.cit-day[hidden]{display:none!important}.cit-day{margin-top:16px;background:#fff;border:1px solid rgba(47,79,61,.12);border-radius:24px;padding:18px;box-shadow:0 12px 34px rgba(45,70,56,.06)}.cit-day-head{display:flex;justify-content:space-between;align-items:end;gap:12px}.cit-day-head h2{margin:0;color:var(--forest);font-size:1.3rem}.cit-day-head button{border:0;background:transparent;color:var(--forest);font-weight:850}.cit-filters{display:flex;gap:7px;overflow:auto;padding:13px 0 8px;scrollbar-width:none}.cit-filter{white-space:nowrap;border:1px solid rgba(47,79,61,.13);border-radius:999px;padding:8px 11px;background:#f7f8f3;color:#52645a;font-weight:760}.cit-filter.active{background:#e9f3e5;color:var(--forest);border-color:#b9cfb2}.cit-day-list{display:grid;gap:7px;max-height:60vh;overflow:auto;padding-right:2px}.cit-day-row{display:grid;grid-template-columns:52px 1fr auto;gap:10px;align-items:center;padding:10px;border-radius:14px;background:#fafbf7}.cit-day-row .cit-line-no{min-width:48px;height:36px;font-size:.8rem}.cit-day-row time{font-weight:900;color:#214a37}
.cit-map-wrap{margin-top:16px}.cit-map-wrap summary{list-style:none;cursor:pointer;background:#fff;border:1px solid rgba(47,79,61,.12);border-radius:20px;padding:16px 18px;font-weight:880;color:var(--forest);box-shadow:0 10px 28px rgba(45,70,56,.05)}.cit-map-wrap summary::-webkit-details-marker{display:none}.cit-map-card{margin-top:10px;overflow:hidden;border-radius:20px;background:#fff;border:1px solid rgba(47,79,61,.12)}#cit-map{height:min(48vh,380px);min-height:300px;background:#edf2e8}.cit-map-note{padding:10px 14px;color:#738078;font-size:.76rem;line-height:1.4}
.cit-lines{margin-top:20px}.cit-lines h2{margin:0 0 10px;color:var(--forest);font-size:1.22rem}.cit-line{display:grid;grid-template-columns:58px 1fr auto;gap:11px;align-items:center;padding:12px 13px;background:#fff;border:1px solid rgba(47,79,61,.11);border-radius:16px;margin-bottom:8px}.cit-line div{display:grid;gap:2px;min-width:0}.cit-line strong{color:#294d3b}.cit-line small{color:#77827b}.cit-line a{color:var(--forest);font-weight:820;text-decoration:none;font-size:.78rem}
.cit-note{margin-top:16px;padding:14px 16px;border-radius:18px;background:#f5f7ef;color:#657168;line-height:1.48;font-size:.86rem}.cit-note strong{color:var(--forest)}
@media(max-width:520px){.cit-actions{grid-template-columns:1fr}.cit-board-top{padding:16px 15px 11px}.cit-stop-tabs{padding-left:15px;padding-right:15px}.cit-next{padding-left:15px;padding-right:15px}.cit-actions{padding-left:15px;padding-right:15px}.cit-row{grid-template-columns:54px 1fr auto;padding:10px;gap:9px}.cit-line-no{min-width:50px;height:39px;font-size:.82rem}.cit-main strong{font-size:.9rem}.cit-main small{font-size:.76rem}.cit-time strong{font-size:1rem}.cit-line{grid-template-columns:52px 1fr auto}.cit-line a{font-size:.72rem}}
</style>
<section class="page-heading compact cit-head">
  <a class="back-link" href="/">← Start</a>
  <span class="eyebrow">Unterwegs in __MUNICIPALITY__</span>
  <h1>Bus &amp; Mobilität</h1>
  <p>Wann fährt der nächste Bus? Haltestelle auswählen und Abfahrten direkt sehen.</p>
</section>

<section class="cit-board" aria-label="Abfahrtstafel">
  <div class="cit-board-top">
    <span class="cit-kicker">Nächste Abfahrten</span>
    <div class="cit-board-title">
      <h2 id="cit-stop-name">Ahnsen, Schule</h2>
      <button class="cit-star" id="cit-favorite" type="button" title="Haltestelle als Favorit speichern">☆</button>
    </div>
  </div>
  <div class="cit-stop-tabs" id="cit-stop-tabs"></div>
  <div class="cit-next" id="cit-next"><div class="cit-empty">Abfahrten werden geladen …</div></div>
  <div class="cit-actions">
    <button class="cit-action primary" id="cit-show-day" type="button">Alle Abfahrten heute</button>
    <a class="cit-action" href="https://www.shgmobil.de/fahrplaene/" target="_blank" rel="noopener">Offizielle Fahrpläne</a>
  </div>
</section>

<section class="cit-day" id="cit-day" hidden>
  <div class="cit-day-head"><div><span class="cit-kicker">Tagesfahrplan</span><h2>Alle Abfahrten heute</h2></div><button id="cit-close-day" type="button">Schließen</button></div>
  <div class="cit-filters" id="cit-filters"></div>
  <div class="cit-day-list" id="cit-day-list"></div>
</section>

<details class="cit-map-wrap" id="cit-map-details">
  <summary>🗺 Busse &amp; Haltestellen auf Karte anzeigen</summary>
  <div class="cit-map-card"><div id="cit-map"></div><div class="cit-map-note" id="cit-map-note">Die Karte zeigt Haltestellen. Echte Fahrzeugpositionen werden zusätzlich eingeblendet, sofern sie verfügbar sind.</div></div>
</details>

<section class="cit-lines">
  <span class="cit-kicker">Linien in Ahnsen</span>
  <h2>Direkt zum Fahrplan</h2>
  __LINES__
</section>

<div class="cit-note"><strong>Hinweis:</strong> Bei einer Störung der digitalen Abfahrtsauskunft bleibt der offizielle Linienfahrplan erreichbar.</div>

<script>
(() => {
const S={stops:[],departures:[],vehicles:[],selected:localStorage.getItem('ahnsen-mobility-stop')||'schule',filter:'all',map:null,mapReady:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=s=>({schule:'Schule','theodor-heuss':'Theodor-Heuss-Str.','haus-eix':'Haus Eix',dorfgemeinschaftshaus:'DGH',klinikum:'Klinikum',schmiede:'Schmiede',wilhelmshoehe:'Wilhelmshöhe'}[s.key]||s.name.replace('Ahnsen, ',''));
const official={2132:'https://www.shgmobil.de/fahrplaene/linie-bek/',2133:'https://www.shgmobil.de/fahrplaene/bek-stadtverkehr-bueckeburg/',2026:'https://www.shgmobil.de/fahrplaene/2026-2/'};
function favorite(){return localStorage.getItem('ahnsen-mobility-favorite')||''}
function updateStar(){document.getElementById('cit-favorite').textContent=favorite()===S.selected?'★':'☆'}
document.getElementById('cit-favorite').onclick=()=>{const next=favorite()===S.selected?'':S.selected;localStorage.setItem('ahnsen-mobility-favorite',next);updateStar()};
function renderTabs(){const e=document.getElementById('cit-stop-tabs');e.innerHTML=S.stops.map(s=>`<button class="cit-stop-tab ${s.key===S.selected?'active':''}" data-stop="${esc(s.key)}">${esc(short(s))}</button>`).join('');e.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>{S.selected=b.dataset.stop;localStorage.setItem('ahnsen-mobility-stop',S.selected);S.filter='all';renderTabs();load()});e.querySelector('.active')?.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'})}
const statusText=x=>x.cancelled?'fällt aus':(x.delay_minutes>1?`+${x.delay_minutes} Min.`:(x.realtime?'aktuell':'Fahrplan'));
function row(x,day=false){const when=new Date(x.when),now=new Date(),mins=Math.max(0,Math.ceil((when-now)/60000)),sub=day?statusText(x):(x.cancelled?'fällt aus':`${statusText(x)}${x.realtime&&x.planned_time?' · Plan '+x.planned_time:''}`);return `<article class="${day?'cit-day-row':'cit-row'}"><span class="cit-line-no">${esc(x.line)}</span><div class="cit-main"><strong>${esc(x.direction||'Richtung laut Fahrplan')}</strong><small>${esc(sub)}</small></div>${day?`<time>${esc(x.time)}</time>`:`<div class="cit-time"><strong>${esc(x.time)}</strong><small>${mins<=0?'jetzt':'in '+mins+' Min.'}</small>${x.delay_minutes>1?`<span class="cit-delay">+${x.delay_minutes} Min.</span>`:''}</div>`}</article>`}
function renderNext(status,message){const el=document.getElementById('cit-next'),now=Date.now(),items=S.departures.filter(x=>new Date(x.when).getTime()>=now-120000).slice(0,4);if(items.length){el.innerHTML=items.map(x=>row(x)).join('');return}const lines=[...new Set((S.stops.find(s=>s.key===S.selected)?.lines||[]))];const links=lines.map(l=>official[l]?`<a href="${official[l]}" target="_blank" rel="noopener">Linie ${l}</a>`:'').filter(Boolean).join(' · ');el.innerHTML=`<div class="cit-empty">${status==='unavailable'?'Aktuelle digitale Abfahrtszeiten sind gerade nicht verfügbar.':esc(message||'Heute sind keine weiteren Abfahrten vorhanden.')} ${links?'<br>'+links:''}</div>`}
function renderFilters(){const lines=[...new Set(S.departures.map(x=>x.line))];const directions=[...new Set(S.departures.map(x=>x.direction).filter(Boolean))].slice(0,5);const items=[['all','Alle'],...lines.map(x=>['line:'+x,'Linie '+x]),...directions.map(x=>['dir:'+x,x])];document.getElementById('cit-filters').innerHTML=items.map(([k,l])=>`<button class="cit-filter ${S.filter===k?'active':''}" data-filter="${esc(k)}">${esc(l)}</button>`).join('');document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{S.filter=b.dataset.filter;renderFilters();renderDay()})}
function renderDay(){let items=[...S.departures];if(S.filter.startsWith('line:'))items=items.filter(x=>x.line===S.filter.slice(5));if(S.filter.startsWith('dir:'))items=items.filter(x=>x.direction===S.filter.slice(4));document.getElementById('cit-day-list').innerHTML=items.length?items.map(x=>row(x,true)).join(''):'<div class="cit-empty">Für diesen Filter gibt es heute keine Abfahrten.</div>'}
document.getElementById('cit-show-day').onclick=()=>{document.getElementById('cit-day').hidden=false;renderFilters();renderDay();document.getElementById('cit-day').scrollIntoView({behavior:'smooth',block:'start'})};
document.getElementById('cit-close-day').onclick=()=>{document.getElementById('cit-day').hidden=true};
async function leaflet(){if(window.L)return;if(!document.querySelector('link[data-cit-leaflet]')){const l=document.createElement('link');l.rel='stylesheet';l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';l.dataset.citLeaflet='1';document.head.appendChild(l)}await new Promise((ok,no)=>{const old=document.querySelector('script[data-cit-leaflet]');if(old){if(window.L)return ok();old.addEventListener('load',ok,{once:true});old.addEventListener('error',no,{once:true});return}const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.dataset.citLeaflet='1';s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
async function drawMap(){if(S.mapReady)return;S.mapReady=true;try{await leaflet();const withCoords=S.stops.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon));const center=withCoords.length?[withCoords[0].lat,withCoords[0].lon]:[52.258,9.099];S.map=L.map('cit-map').setView(center,14);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(S.map);withCoords.forEach(s=>L.circleMarker([s.lat,s.lon],{radius:7,weight:3,color:'#1f5b41',fillColor:'#fff',fillOpacity:1}).addTo(S.map).bindPopup(`<strong>${esc(s.name)}</strong><br>Linien ${(s.lines||[]).join(', ')}`));S.vehicles.filter(v=>Number.isFinite(v.lat)&&Number.isFinite(v.lon)).forEach(v=>L.marker([v.lat,v.lon]).addTo(S.map).bindPopup(`<strong>Bus ${esc(v.line)}</strong><br>${esc(v.direction||'Live-Position')}`));if(S.vehicles.length)document.getElementById('cit-map-note').textContent=`${S.vehicles.length} echte Fahrzeugposition${S.vehicles.length===1?'':'en'} verfügbar.`}catch(_){document.getElementById('cit-map').innerHTML='<div class="cit-empty">Karte konnte gerade nicht geladen werden.</div>'}}
document.getElementById('cit-map-details').addEventListener('toggle',e=>{if(e.currentTarget.open)drawMap()});
async function load(){const stopName=document.getElementById('cit-stop-name');stopName.textContent='Abfahrten werden geladen …';try{const r=await fetch('/api/mobilitaet/board?stop='+encodeURIComponent(S.selected),{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();S.stops=d.stops||[];S.departures=d.departures||[];S.vehicles=d.vehicles||[];S.selected=d.stop?.key||S.selected;stopName.textContent=d.stop?.name||'Haltestelle';renderTabs();renderNext(d.status,d.message);updateStar();if(!document.getElementById('cit-day').hidden){renderFilters();renderDay()}}catch(_){stopName.textContent='Haltestelle';document.getElementById('cit-next').innerHTML='<div class="cit-empty">Die Abfahrtsauskunft ist gerade nicht erreichbar. Bitte den offiziellen Fahrplan verwenden.</div>'}}
(async()=>{const fav=favorite();if(fav)S.selected=fav;await load();setInterval(load,60000)})();
})();
</script>
'''


def _content() -> str:
    cfg = get_platform_snapshot()
    municipality = escape(cfg.get("municipality_name") or "Ahnsen")
    return _TEMPLATE.replace("__MUNICIPALITY__", municipality).replace("__LINES__", _line_cards())


@router.get("/mobilitaet")
async def mobility_citizen_page():
    return page(
        "Bus & Mobilität",
        _content(),
        active="mobility",
        description="Nächste Busabfahrten, Tagesfahrplan und Haltestellen für Ahnsen.",
        body_class="mobility-citizen",
    )
