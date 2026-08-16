from pathlib import Path

root = Path('BuergermeisterPWA')
app_path = root / 'app.js'
css_path = root / 'styles.css'
sw_path = root / 'sw.js'

app = app_path.read_text(encoding='utf-8')

old_city = '''          <div class="panel">
            <h2>STADTBILD · ${esc(g.status())}</h2>
            <div class="city-scene city-stage-${g.visualStage()}">
              <img class="city-scene-image" src="${sceneImageFor(g)}" alt="Stadtbild von ${esc(g.cityName)} im Status ${esc(g.status())}">
              <div class="city-scene-shade"></div>
              <div class="city-label">${esc(g.cityName)} · Infrastruktur ${g.infrastructureScore()} / 100</div>
              <div class="city-hotspot-layer">${cityHotspots(g)}</div>
            </div>
            <div class="hint city-help">Tipp: Auch Gebäude im Stadtbild können für Informationen angetippt werden.</div>
          </div>'''

new_city = '''          <div class="panel city-panel">
            <h2>STADTBILD · ${esc(g.status())}</h2>
            <div class="city-scene-head">
              <div class="city-scene-copy">
                <b>${esc(g.cityName)}</b>
                <span>${esc(g.status())} · Stadtansicht</span>
              </div>
              <div class="city-scene-infra">
                <div class="city-scene-infra-top"><span>Infrastruktur</span><b>${g.infrastructureScore()} / 100</b></div>
                <div class="city-scene-meter"><i style="width:${g.infrastructureScore()}%"></i></div>
              </div>
            </div>
            <div class="city-scene city-stage-${g.visualStage()}">
              <img class="city-scene-image" src="${sceneImageFor(g)}" alt="Stadtbild von ${esc(g.cityName)} im Status ${esc(g.status())}">
              <div class="city-scene-shade"></div>
              <div class="city-hotspot-layer">${cityHotspots(g)}</div>
            </div>
            <div class="hint city-help">Tipp: Gebäude im Stadtbild können für Informationen angetippt werden.</div>
          </div>'''

if old_city not in app:
    raise SystemExit('Could not locate current city scene block')
app = app.replace(old_city, new_city, 1)

icon_start = app.find('  const MARKET_ICONS = {')
icon_end = app.find('  function marketIcon(key) {', icon_start)
if icon_start < 0 or icon_end < 0:
    raise SystemExit('Could not locate market icon block')

new_icons = '''  const MARKET_ICONS = {
    land: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M12 41 32 30l20 11-20 11-20-11Z"/><path d="M32 11v22"/><path d="M24 20c0-5 4-9 8-9s8 4 8 9c-2 3-5 5-8 5s-6-2-8-5Z"/><path d="M16 44h32"/></svg>',
    houses: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M12 30 32 14l20 16v20H12V30Z"/><path d="M20 49V34h24v15"/><path d="M26 49V39h12v10"/><path d="M16 29h32"/></svg>',
    towers: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M20 10h24v42H20V10Z"/><path d="M27 18h4v4h-4Zm6 0h4v4h-4Zm-6 10h4v4h-4Zm6 0h4v4h-4Zm-6 10h4v4h-4Zm6 0h4v4h-4Z"/><path d="M28 52V44h8v8"/></svg>',
    schools: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M10 28 32 15l22 13-22 12-22-12Z"/><path d="M16 35v15h32V35"/><path d="M32 40v10"/><path d="M48 29v13"/></svg>',
    universities: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M8 23 32 11l24 12H8Z"/><path d="M14 27h36"/><path d="M18 27v21m10-21v21m10-21v21m10-21v21"/><path d="M11 50h42"/></svg>',
    shops: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M14 23h36l-4-11H18l-4 11Z"/><path d="M14 23v26h36V23"/><path d="M24 49V35h16v14"/><path d="M14 23c3 6 8 6 11 0 3 6 8 6 11 0 3 6 8 6 11 0 3 6 8 6 11 0"/></svg>',
    supermarkets: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M11 18h8l5 21h22l5-16H22"/><circle class="accent" cx="28" cy="47" r="4"/><circle class="accent" cx="45" cy="47" r="4"/><path d="M29 24v10m8-10v10m8-10v10"/></svg>',
    food: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M14 26h36l-4 23H18l-4-23Z"/><path d="M22 26c2-8 6-12 10-12s8 4 10 12"/><path d="M23 34h18M21 41h22"/></svg>'
  };

'''
app = app[:icon_start] + new_icons + app[icon_end:]

old_icon_fn = '''  function marketIcon(key) {
    return `<span class="market-icon market-icon-${key}">${MARKET_ICONS[key] || ''}</span>`;
  }'''
new_icon_fn = '''  function marketIcon(key) {
    return `<span class="market-icon market-icon-${key}"><span class="market-icon-frame">${MARKET_ICONS[key] || ''}</span></span>`;
  }'''
if old_icon_fn not in app:
    raise SystemExit('Could not locate marketIcon function')
app = app.replace(old_icon_fn, new_icon_fn, 1)
app_path.write_text(app, encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
marker = '/* Bürgermeister UI refinement v2 */'
if marker not in css:
    css += r'''

/* Bürgermeister UI refinement v2 */
.city-panel { background:linear-gradient(180deg,#11234d,#0d1d42); }
.city-label { display:none !important; }
.city-scene-head {
  display:grid; grid-template-columns:minmax(0,1fr) minmax(210px,270px); gap:10px; align-items:center;
  margin-bottom:10px; padding:10px; border:2px solid #6b89cb;
  background:linear-gradient(180deg,#12265a,#0d1e49); box-shadow:inset 0 0 0 2px rgba(6,12,32,.4);
}
.city-scene-copy { min-width:0; display:grid; gap:2px; }
.city-scene-copy b { color:#fff2b6; font-size:1rem; }
.city-scene-copy span { color:#a7bee8; font-size:.72rem; }
.city-scene-infra { display:grid; gap:6px; }
.city-scene-infra-top { display:flex; justify-content:space-between; gap:10px; color:#a9c2f2; font-size:.68rem; }
.city-scene-infra-top b { color:#ffe37d; font-size:.78rem; }
.city-scene-meter {
  height:14px; border:2px solid #7998dd; background:#09152f; overflow:hidden; position:relative;
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.05);
}
.city-scene-meter i {
  display:block; height:100%; background:linear-gradient(90deg,#5a7ed3,#7ca7f2 45%,#c8df9a 100%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.15);
}
.city-scene { box-shadow:inset 0 0 0 2px rgba(159,190,244,.12),0 3px 0 rgba(4,9,26,.38); }
.city-scene-shade {
  background:linear-gradient(to bottom,rgba(7,15,40,.08),rgba(7,15,40,.01) 22%,rgba(7,15,40,.10) 100%),radial-gradient(circle at 50% 48%,transparent 58%,rgba(5,10,28,.16) 100%) !important;
  box-shadow:inset 0 0 0 3px rgba(159,190,244,.10),inset 0 -12px 24px rgba(4,9,24,.10);
}
.city-help { padding:7px 2px 1px; }

.market-row {
  grid-template-columns:32px 54px minmax(0,1fr) 104px 122px !important; gap:8px !important; padding:7px !important;
  background:linear-gradient(180deg,#142a58,#102249) !important;
  box-shadow:inset 0 0 0 1px rgba(7,15,38,.55),0 2px 0 rgba(3,8,24,.35) !important;
}
.market-info {
  min-height:30px !important; width:30px !important; border-radius:3px !important; padding:0 !important;
  font-weight:bold; color:#ffe189 !important; background:linear-gradient(180deg,#1b315f,#102044) !important;
  border:2px solid #7d91c6 !important; box-shadow:inset 0 0 0 1px rgba(255,225,137,.14),2px 2px 0 #07102b !important;
}
.market-info::after { content:'INFO'; display:block; font-size:.38rem; line-height:.8; color:#9fb6e5; margin-top:-2px; }
.market-info:hover,.market-info:focus-visible { background:#2b4d86 !important; border-color:#f0cf6a !important; outline:none !important; color:#fff3b5 !important; }
.market-icon { width:54px !important; height:54px !important; display:grid; place-items:center; }
.market-icon-frame {
  width:100%; height:100%; display:grid; place-items:center; position:relative;
  background:linear-gradient(180deg,#10214f,#0a1637); border:2px solid #5c7fc4;
  box-shadow:inset 0 0 0 2px rgba(140,174,238,.08),3px 3px 0 rgba(6,12,33,.55);
}
.market-icon-frame::before { content:''; position:absolute; inset:4px; border:1px solid rgba(158,193,255,.2); pointer-events:none; }
.market-icon svg { width:38px !important; height:38px !important; fill:none; stroke:currentColor; stroke-width:3.1; stroke-linejoin:miter; stroke-linecap:square; }
.market-icon svg .accent { fill:currentColor; stroke:currentColor; }
.market-icon-land { color:#f4d66c !important; }
.market-icon-houses,.market-icon-shops { color:#ffc778 !important; }
.market-icon-towers,.market-icon-universities { color:#a9cbff !important; }
.market-icon-schools { color:#f0e19e !important; }
.market-icon-supermarkets { color:#79d8d2 !important; }
.market-icon-food { color:#e8bb76 !important; }
.market-action { min-height:38px !important; padding:3px 5px !important; }
.market-action b { font-size:.88rem !important; }
.market-action span { margin-top:2px !important; font-size:.52rem !important; }

@media(max-width:760px){
  .city-scene-head{grid-template-columns:1fr;gap:7px;padding:8px}.city-scene-infra{gap:4px}
  .market-row{grid-template-columns:44px minmax(0,1fr) 86px !important;grid-template-areas:'icon copy price' 'info actions actions' !important;gap:5px 7px !important;padding:7px !important}
  .market-info{grid-area:info;width:44px !important;min-height:28px !important;font-size:.78rem}.market-info::after{display:inline;margin-left:3px;font-size:.42rem}
  .market-icon{grid-area:icon;width:44px !important;height:44px !important}.market-icon svg{width:30px !important;height:30px !important}
  .market-copy{grid-area:copy}.market-price-block{grid-area:price}.market-actions{grid-area:actions;justify-self:end;width:min(100%,190px);margin-top:0}.market-action{min-height:35px !important}
}
@media(max-width:390px){
  .market-row{grid-template-columns:40px minmax(0,1fr) 80px !important;gap:4px 6px !important;padding:6px 5px !important}
  .market-icon{width:40px !important;height:40px !important}.market-icon svg{width:27px !important;height:27px !important}.market-info{width:40px !important}
}
'''
css_path.write_text(css, encoding='utf-8')

sw = sw_path.read_text(encoding='utf-8')
if 'buergermeister-1992-plus-v6' not in sw:
    raise SystemExit('Expected service-worker cache v6')
sw = sw.replace('buergermeister-1992-plus-v6', 'buergermeister-1992-plus-v7', 1)
sw_path.write_text(sw, encoding='utf-8')
