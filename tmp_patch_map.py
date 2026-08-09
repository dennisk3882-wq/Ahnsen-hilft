from pathlib import Path

routes_path = Path("community_routes.py")
routes = routes_path.read_text(encoding="utf-8")
start = routes.index("def _public_report_points()")
end = routes.index('@router.get("/suche")', start)
new_routes = r'''def _public_report_points() -> list[dict]:
    gps_pattern = re.compile(r"GPS-Position:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)")
    email_pattern = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
    phone_pattern = re.compile(r"(?<!\w)(?:\+49|0)[\d\s()/.\-]{6,}\d")

    def public_description(value) -> str:
        text = str(value or "")
        text = gps_pattern.sub(" ", text)
        text = email_pattern.sub("[Kontakt entfernt]", text)
        text = phone_pattern.sub("[Kontakt entfernt]", text)
        text = re.sub(r"\s+", " ", text).strip(" -–—,;")
        return text[:260]

    points = []
    for item in suche_meldungen()[:300]:
        description = str(getattr(item, "beschreibung", "") or "")
        match = gps_pattern.search(description)
        if not match:
            continue
        try:
            lat = round(float(match.group(1)), 3)
            lon = round(float(match.group(2)), 3)
        except ValueError:
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue

        location = re.sub(r"\b\d+[a-zA-Z]?\b", "", str(getattr(item, "ort", "") or "")).strip(" ,-")
        created = getattr(item, "erstellt_am", None)
        category = str(getattr(item, "art", "Meldung") or "Meldung")[:100]
        points.append({
            "id": int(getattr(item, "id", 0) or 0),
            "lat": lat,
            "lon": lon,
            "art": category,
            "category": category,
            "ort": location[:100] or get_platform_snapshot()["municipality_name"],
            "status": str(getattr(item, "status", "Offen") or "Offen")[:40],
            "description": public_description(description),
            "date": created.isoformat() if created else "",
            "date_label": created.strftime("%d.%m.%Y") if created else "",
        })
    return points


'''
routes_path.write_text(routes[:start] + new_routes + routes[end:], encoding="utf-8")

ui_path = Path("community_ui.py")
ui = ui_path.read_text(encoding="utf-8")
start = ui.index("def public_map_page(points: list[dict])")
end = ui.index("def language_panel", start)
new_ui = r'''_PUBLIC_MAP_TEMPLATE = r"""
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIINfQ3ynMZqKOLMZIFmbxuQfDVT4I48HcI=" crossorigin="">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
<style>
.defect-map-view{display:grid;gap:16px}.defect-overview{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);gap:16px;padding:20px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,#fff,#f5f8f1);box-shadow:var(--shadow-soft)}.defect-overview h2{margin:6px 0 7px;color:var(--forest);font-size:clamp(22px,5vw,32px)}.defect-overview p{margin:0;color:var(--muted);line-height:1.55}.defect-total{display:inline-flex;align-items:center;gap:7px;margin-top:13px;padding:7px 10px;border-radius:999px;background:#edf4e9;color:var(--forest);font-size:12px;font-weight:850}.defect-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.defect-stat{appearance:none;border:1px solid var(--line);border-radius:17px;background:#fff;padding:13px 9px;text-align:left;color:inherit;box-shadow:0 7px 20px rgba(25,64,45,.05)}.defect-stat span{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px;font-weight:800}.defect-stat strong{display:block;margin-top:5px;font-size:27px;color:var(--forest)}.defect-stat i{width:9px;height:9px;border-radius:50%;display:inline-block}.defect-stat[data-stat="open"] i{background:#b64a42}.defect-stat[data-stat="progress"] i{background:#d49324}.defect-stat[data-stat="done"] i{background:#287052}.defect-stat.active{outline:2px solid var(--forest);outline-offset:1px}
.defect-filter-card{padding:14px;border:1px solid var(--line);border-radius:20px;background:#fff;box-shadow:0 8px 24px rgba(25,64,45,.05)}.defect-filter-row{display:flex;align-items:center;gap:8px;overflow-x:auto;scrollbar-width:none;padding:1px}.defect-filter-row+.defect-filter-row{margin-top:9px;padding-top:10px;border-top:1px solid #edf0e9}.defect-filter-row::-webkit-scrollbar{display:none}.defect-filter-label{flex:0 0 auto;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;margin-right:2px}.defect-filter{flex:0 0 auto;border:1px solid #dce4d8;border-radius:999px;background:#f8faf6;color:#4a5e52;padding:8px 11px;font-size:12px;font-weight:850}.defect-filter.active{border-color:var(--forest);background:var(--forest);color:#fff}
.defect-map-card{overflow:hidden;border:1px solid var(--line);border-radius:24px;background:#fff;box-shadow:0 13px 34px rgba(25,64,45,.08)}.defect-map-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border-bottom:1px solid var(--line)}.defect-map-toolbar strong{display:block;color:var(--forest)}.defect-map-toolbar small{display:block;margin-top:2px;color:var(--muted)}.defect-map-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.defect-map-action{border:1px solid #d8e2d4;border-radius:12px;background:#f7faf5;color:var(--forest);padding:8px 10px;font-size:12px;font-weight:850}.defect-map-stage{position:relative}.defect-map-stage #public-map{height:min(62vh,560px);min-height:430px;background:linear-gradient(135deg,#edf2e9,#e5ece2)}.defect-map-legend{position:absolute;z-index:500;left:11px;top:11px;display:flex;gap:5px;flex-wrap:wrap;max-width:calc(100% - 90px);pointer-events:none}.defect-map-legend span{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid rgba(255,255,255,.75);border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 3px 12px rgba(0,0,0,.09);font-size:10px;font-weight:850;color:#425248}.defect-map-legend i{width:8px;height:8px;border-radius:50%}.defect-map-note{padding:11px 14px;border-top:1px solid var(--line);background:#fbfcf9;color:var(--muted);font-size:11px;line-height:1.45}
.defect-pin{position:relative;width:38px;height:38px;border-radius:50% 50% 50% 12px;transform:rotate(-45deg);display:grid;place-items:center;border:3px solid #fff;background:var(--pin);box-shadow:0 5px 15px rgba(20,42,30,.28)}.defect-pin>span{transform:rotate(45deg);font-size:16px;line-height:1}.defect-marker-wrap{background:transparent!important;border:0!important}.defect-cluster{width:42px;height:42px;display:grid;place-items:center;border:3px solid #fff;border-radius:50%;background:var(--forest);color:#fff;font-size:13px;font-weight:950;box-shadow:0 6px 18px rgba(20,42,30,.28)}
.defect-detail{position:absolute;z-index:650;left:12px;right:12px;bottom:12px;padding:15px 16px;border:1px solid rgba(34,72,52,.14);border-radius:20px;background:rgba(255,255,255,.97);box-shadow:0 14px 36px rgba(19,48,32,.22);backdrop-filter:blur(10px)}.defect-detail[hidden]{display:none!important}.defect-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.defect-detail h3{margin:3px 0 0;color:var(--forest);font-size:18px}.defect-detail-close{width:34px;height:34px;border:0;border-radius:11px;background:#edf2e9;color:var(--forest);font-size:19px}.defect-detail-meta{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.defect-detail p{margin:0;color:#526159;line-height:1.48;font-size:13px}.defect-status-chip,.defect-meta-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900}.defect-status-chip.open{background:#f8e5e2;color:#8d332e}.defect-status-chip.progress{background:#fff0d2;color:#855c12}.defect-status-chip.done{background:#dff1e4;color:#226640}.defect-meta-chip{background:#eef3eb;color:#53655a}
.defect-list-card{padding:16px;border:1px solid var(--line);border-radius:22px;background:#fff;box-shadow:0 10px 28px rgba(25,64,45,.06)}.defect-list-head{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:10px}.defect-list-head h2{margin:0;color:var(--forest);font-size:19px}.defect-list-head small{color:var(--muted)}.defect-list{display:grid;gap:8px}.defect-list-item{width:100%;display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;padding:11px 12px;border:1px solid #e4e9e1;border-radius:15px;background:#fbfcfa;text-align:left;color:inherit}.defect-list-icon{width:39px;height:39px;display:grid;place-items:center;border-radius:13px;background:#edf3e9;font-size:18px}.defect-list-copy{min-width:0}.defect-list-copy strong{display:block;color:#294c39;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.defect-list-copy span{display:block;margin-top:2px;color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.defect-list-side{display:grid;justify-items:end;gap:5px}.defect-empty{padding:20px;border:1px dashed #d7dfd3;border-radius:16px;background:#fafbf8;text-align:center;color:var(--muted)}
@media(max-width:760px){.defect-overview{grid-template-columns:1fr;padding:16px}.defect-map-toolbar{align-items:flex-start;flex-direction:column}.defect-map-actions{justify-content:flex-start;width:100%}.defect-map-action{flex:1}.defect-map-stage #public-map{min-height:410px;height:56vh}.defect-detail{left:8px;right:8px;bottom:8px}.defect-list-item{grid-template-columns:auto 1fr}.defect-list-side{grid-column:2;justify-items:start;grid-auto-flow:column;justify-content:start}.defect-stats{gap:6px}.defect-stat{padding:11px 8px}.defect-stat strong{font-size:23px}}
</style>
<section class="page-heading compact"><a class="back-link" href="/">← Zurück</a><span class="eyebrow">Bürger-Service</span><h1>Öffentliche Mängelkarte</h1><p>Anonymisierte Meldungen aus __MUNICIPALITY__ im Überblick. Positionen sind bewusst nur ungefähr dargestellt.</p></section>
<div class="defect-map-view">
  <section class="defect-overview">
    <div><span class="eyebrow">Aktueller Überblick</span><h2>Was ist gerade gemeldet?</h2><p>Filtere nach Bearbeitungsstand oder Kategorie und tippe eine Meldung auf der Karte oder in der Liste an.</p><span class="defect-total"><span id="defect-total">0</span> Meldungen mit Kartenposition</span></div>
    <div class="defect-stats" aria-label="Meldungen nach Status">
      <button class="defect-stat" type="button" data-stat="open"><span><i></i>Offen</span><strong id="stat-open">0</strong></button>
      <button class="defect-stat" type="button" data-stat="progress"><span><i></i>In Bearbeitung</span><strong id="stat-progress">0</strong></button>
      <button class="defect-stat" type="button" data-stat="done"><span><i></i>Erledigt</span><strong id="stat-done">0</strong></button>
    </div>
  </section>
  <section class="defect-filter-card" aria-label="Mängelkarte filtern">
    <div class="defect-filter-row"><span class="defect-filter-label">Status</span><button class="defect-filter active" type="button" data-status-filter="all">Alle</button><button class="defect-filter" type="button" data-status-filter="open">Offen</button><button class="defect-filter" type="button" data-status-filter="progress">In Bearbeitung</button><button class="defect-filter" type="button" data-status-filter="done">Erledigt</button></div>
    <div class="defect-filter-row" id="defect-category-filters"><span class="defect-filter-label">Kategorie</span></div>
  </section>
  <section class="defect-map-card">
    <div class="defect-map-toolbar"><div><strong>Karte __MUNICIPALITY__</strong><small id="defect-map-state">Öffentliche, gerundete Positionen</small></div><div class="defect-map-actions"><button class="defect-map-action" id="map-center" type="button">◎ Zentrieren</button><button class="defect-map-action" id="map-locate" type="button">⌖ Mein Standort</button><button class="defect-map-action" id="map-reload" type="button">↻ Neu laden</button></div></div>
    <div class="defect-map-stage"><div id="public-map" aria-label="Öffentliche Mängelkarte von __MUNICIPALITY__"></div><div class="defect-map-legend"><span><i style="background:#b64a42"></i>Offen</span><span><i style="background:#d49324"></i>In Bearbeitung</span><span><i style="background:#287052"></i>Erledigt</span></div><aside class="defect-detail" id="defect-detail" hidden aria-live="polite"><div class="defect-detail-head"><div><span class="eyebrow" id="detail-category">Meldung</span><h3 id="detail-title">Meldung</h3></div><button class="defect-detail-close" id="detail-close" type="button" aria-label="Detail schließen">×</button></div><div class="defect-detail-meta"><span class="defect-status-chip" id="detail-status"></span><span class="defect-meta-chip" id="detail-location"></span><span class="defect-meta-chip" id="detail-date"></span></div><p id="detail-description"></p></aside></div>
    <div class="defect-map-note">Datenschutz: GPS-Positionen werden vor der Veröffentlichung gerundet. Hausnummern, Namen, Kontaktdaten, interne Notizen und private Fotos werden nicht veröffentlicht. Der Marker zeigt daher keinen exakten Standort.</div>
  </section>
  <section class="defect-list-card"><div class="defect-list-head"><div><span class="eyebrow">Kartenausschnitt</span><h2>Sichtbare Meldungen</h2></div><small id="defect-visible-count">0 sichtbar</small></div><div class="defect-list" id="defect-list"><div class="defect-empty">Meldungen werden geladen …</div></div></section>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
(() => {
  const points = __POINTS__.map((point,index)=>({...point,_key:String(point.id || `p-${index}`)}));
  const center = [__CENTER_LAT__, __CENTER_LON__];
  const defaultZoom = __CENTER_ZOOM__;
  const map = L.map('public-map',{zoomControl:true}).setView(center,defaultZoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap-Mitwirkende'}).addTo(map);
  const state = {status:'all',category:'all'};
  const markerByKey = new Map();
  let userLayer = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const normal = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const statusKey = value => { const v=normal(value); if(v.includes('erledigt')||v.includes('geschlossen')||v.includes('behoben')) return 'done'; if(v.includes('bearbeit')||v.includes('pruf')||v.includes('weitergeleitet')) return 'progress'; return 'open'; };
  const statusLabel = key => key==='done'?'Erledigt':key==='progress'?'In Bearbeitung':'Offen';
  const statusColor = key => key==='done'?'#287052':key==='progress'?'#d49324':'#b64a42';
  const glyph = category => { const v=normal(category); if(v.includes('licht')||v.includes('laterne')||v.includes('beleucht')) return '💡'; if(v.includes('mull')||v.includes('abfall')) return '♻'; if(v.includes('strasse')||v.includes('straße')||v.includes('schlagloch')||v.includes('gehweg')) return '◆'; if(v.includes('schild')||v.includes('verkehr')) return '△'; if(v.includes('grun')||v.includes('baum')||v.includes('hecke')) return '❧'; return '!'; };
  const cluster = typeof L.markerClusterGroup === 'function' ? L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:46,spiderfyOnMaxZoom:true,iconCreateFunction:c=>L.divIcon({className:'',html:`<span class="defect-cluster">${c.getChildCount()}</span>`,iconSize:[42,42],iconAnchor:[21,21]})}) : L.layerGroup();
  cluster.addTo(map);
  const filtered = () => points.filter(p => (state.status==='all'||statusKey(p.status)===state.status) && (state.category==='all'||p.category===state.category));
  const pointDate = p => { const time=Date.parse(p.date||''); return Number.isFinite(time)?time:0; };
  const makeMarker = p => { const sk=statusKey(p.status); const html=`<span class="defect-pin" style="--pin:${statusColor(sk)}"><span>${glyph(p.category)}</span></span>`; const marker=L.marker([p.lat,p.lon],{icon:L.divIcon({className:'defect-marker-wrap',html,iconSize:[38,44],iconAnchor:[19,40]}),title:p.category||'Meldung'}); marker.on('click',()=>showDetail(p)); markerByKey.set(p._key,marker); return marker; };
  const showDetail = p => { const sk=statusKey(p.status); document.getElementById('detail-category').textContent=p.category||'Meldung'; document.getElementById('detail-title').textContent=p.category||'Meldung'; const status=document.getElementById('detail-status'); status.className=`defect-status-chip ${sk}`; status.textContent=statusLabel(sk); document.getElementById('detail-location').textContent=`📍 ${p.ort||'__MUNICIPALITY__'}`; document.getElementById('detail-date').textContent=p.date_label?`📅 ${p.date_label}`:'📅 Datum nicht verfügbar'; document.getElementById('detail-description').textContent=p.description||'Für diese öffentliche Meldung liegt keine weitere Beschreibung vor.'; document.getElementById('defect-detail').hidden=false; };
  const hideDetail = () => { document.getElementById('defect-detail').hidden=true; };
  const renderMarkers = (fit=false) => { cluster.clearLayers(); markerByKey.clear(); const items=filtered(); items.forEach(p=>cluster.addLayer(makeMarker(p))); document.getElementById('defect-map-state').textContent=`${items.length} Meldung${items.length===1?'':'en'} im aktuellen Filter · Positionen gerundet`; if(fit && items.length){ const bounds=L.latLngBounds(items.map(p=>[p.lat,p.lon])); if(bounds.isValid()) map.fitBounds(bounds.pad(.18),{maxZoom:15}); } renderVisibleList(); hideDetail(); };
  const renderVisibleList = () => { const bounds=map.getBounds(); const items=filtered().filter(p=>bounds.contains([p.lat,p.lon])).sort((a,b)=>pointDate(b)-pointDate(a)); const list=document.getElementById('defect-list'); document.getElementById('defect-visible-count').textContent=`${items.length} sichtbar`; if(!items.length){ list.innerHTML='<div class="defect-empty"><strong>Keine Meldung im aktuellen Kartenausschnitt.</strong><br>Zoome heraus oder ändere den Filter.</div>'; return; } list.innerHTML=items.map(p=>{ const sk=statusKey(p.status); const description=(p.description||'').slice(0,105); return `<button class="defect-list-item" type="button" data-point-key="${esc(p._key)}"><span class="defect-list-icon">${glyph(p.category)}</span><span class="defect-list-copy"><strong>${esc(p.category||'Meldung')}</strong><span>${esc(p.ort||'__MUNICIPALITY__')}${description?' · '+esc(description):''}</span></span><span class="defect-list-side"><span class="defect-status-chip ${sk}">${statusLabel(sk)}</span><span class="defect-meta-chip">${esc(p.date_label||'ohne Datum')}</span></span></button>`; }).join(''); list.querySelectorAll('[data-point-key]').forEach(button=>button.addEventListener('click',()=>focusPoint(button.dataset.pointKey))); };
  const focusPoint = key => { const p=points.find(item=>item._key===key); const marker=markerByKey.get(key); if(!p||!marker) return; const reveal=()=>{map.flyTo([p.lat,p.lon],Math.max(map.getZoom(),16),{duration:.45}); showDetail(p);}; if(typeof cluster.zoomToShowLayer==='function') cluster.zoomToShowLayer(marker,reveal); else reveal(); };
  const setStatus = key => { state.status=key; document.querySelectorAll('[data-status-filter]').forEach(b=>b.classList.toggle('active',b.dataset.statusFilter===key)); document.querySelectorAll('[data-stat]').forEach(b=>b.classList.toggle('active',key!=='all'&&b.dataset.stat===key)); renderMarkers(true); };
  const setCategory = category => { state.category=category; document.querySelectorAll('[data-category-filter]').forEach(b=>b.classList.toggle('active',b.dataset.categoryFilter===category)); renderMarkers(true); };
  const counts={open:0,progress:0,done:0}; points.forEach(p=>counts[statusKey(p.status)]++); document.getElementById('stat-open').textContent=counts.open; document.getElementById('stat-progress').textContent=counts.progress; document.getElementById('stat-done').textContent=counts.done; document.getElementById('defect-total').textContent=points.length;
  document.querySelectorAll('[data-status-filter]').forEach(button=>button.addEventListener('click',()=>setStatus(button.dataset.statusFilter))); document.querySelectorAll('[data-stat]').forEach(button=>button.addEventListener('click',()=>setStatus(state.status===button.dataset.stat?'all':button.dataset.stat)));
  const categoryWrap=document.getElementById('defect-category-filters'); const allCategory=document.createElement('button'); allCategory.className='defect-filter active'; allCategory.type='button'; allCategory.dataset.categoryFilter='all'; allCategory.textContent='Alle'; categoryWrap.appendChild(allCategory); [...new Set(points.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de')).forEach(category=>{ const button=document.createElement('button'); button.className='defect-filter'; button.type='button'; button.dataset.categoryFilter=category; button.textContent=category; categoryWrap.appendChild(button); }); categoryWrap.querySelectorAll('[data-category-filter]').forEach(button=>button.addEventListener('click',()=>setCategory(button.dataset.categoryFilter)));
  document.getElementById('detail-close').addEventListener('click',hideDetail); document.getElementById('map-center').addEventListener('click',()=>{map.setView(center,defaultZoom);hideDetail();}); document.getElementById('map-reload').addEventListener('click',()=>window.location.reload()); document.getElementById('map-locate').addEventListener('click',()=>{ const button=document.getElementById('map-locate'); if(!navigator.geolocation){button.textContent='Standort nicht verfügbar';return;} button.disabled=true;button.textContent='⌖ Standort wird ermittelt …'; navigator.geolocation.getCurrentPosition(position=>{ if(userLayer) map.removeLayer(userLayer); const lat=position.coords.latitude,lon=position.coords.longitude; userLayer=L.layerGroup([L.circle([lat,lon],{radius:Math.min(Math.max(position.coords.accuracy||30,20),400),color:'#2767a6',weight:1,fillOpacity:.08}),L.circleMarker([lat,lon],{radius:7,color:'#fff',weight:3,fillColor:'#2767a6',fillOpacity:1}).bindTooltip('Dein Standort')]).addTo(map); map.setView([lat,lon],16); button.disabled=false;button.textContent='⌖ Mein Standort'; },()=>{button.disabled=false;button.textContent='⌖ Standort nicht verfügbar';setTimeout(()=>button.textContent='⌖ Mein Standort',2200);},{enableHighAccuracy:false,timeout:10000,maximumAge:60000}); });
  map.on('moveend',renderVisibleList); map.on('click',hideDetail); renderMarkers(points.length>0);
})();
</script>
"""


def public_map_page(points: list[dict]) -> HTMLResponse:
    cfg = get_platform_snapshot()
    safe_points = json.dumps(points, ensure_ascii=False).replace("</", "<\\/")
    try:
        center_lat = float(cfg.get("map_lat") or 52.258)
        center_lon = float(cfg.get("map_lon") or 9.099)
        center_zoom = int(cfg.get("map_zoom") or 15)
    except (TypeError, ValueError):
        center_lat, center_lon, center_zoom = 52.258, 9.099, 15
    municipality = escape(cfg.get("municipality_name") or "Ahnsen")
    html = (
        _PUBLIC_MAP_TEMPLATE
        .replace("__POINTS__", safe_points)
        .replace("__MUNICIPALITY__", municipality)
        .replace("__CENTER_LAT__", f"{center_lat:.6f}")
        .replace("__CENTER_LON__", f"{center_lon:.6f}")
        .replace("__CENTER_ZOOM__", str(center_zoom))
    )
    return page("Mängelkarte", COMMUNITY_CSS + html, active="home", body_class="community-view")


'''
ui_path.write_text(ui[:start] + new_ui + ui[end:], encoding="utf-8")
