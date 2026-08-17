from pathlib import Path
import re

root = Path('BuergermeisterPWA')
app_path = root / 'app.js'
css_path = root / 'styles.css'
sw_path = root / 'sw.js'

app = app_path.read_text(encoding='utf-8')

if "let activeGameTab = 'actions';" not in app:
    anchor = "  let deferredInstallPrompt = null;\n"
    if anchor in app:
        app = app.replace(anchor, anchor + "  let activeGameTab = 'actions';\n", 1)
    else:
        anchor = "  const choice = arr => arr[Math.floor(Math.random() * arr.length)];\n"
        if anchor not in app:
            raise SystemExit('Could not locate UI state anchor')
        app = app.replace(anchor, anchor + "\n  let activeGameTab = 'actions';\n", 1)

start = app.find("  function renderGame(g, showSummary=false) {")
end = app.find("  function recommendationFor(g, key) {", start)
if start < 0 or end < 0:
    raise SystemExit('Could not locate renderGame block')

replacement = r'''  function renderCompactMarket(g) {
    return Object.entries(ITEMS).map(([key,item]) => {
      const signal = marketPriceSignal(g,key);
      const qty = item.tradeQty || 1;
      const maintenance = item.maintenance ? ` · ${money(item.maintenance)}/Mon.` : '';
      const free = key === 'land' ? ` · frei ${g.landFree()}` : '';
      return `<div class="market-row compact-market-row">
        <button class="market-icon-button" data-info="${key}" aria-label="Information zu ${item.name}" title="Info zu ${item.name}">
          ${marketIcon(key)}<span class="market-info-dot">i</span>
        </button>
        <div class="market-copy market-click" data-info="${key}">
          <div class="market-title-line"><b>${item.name}</b><span class="market-effect">${marketEffect(key)}</span></div>
          <div class="market-meta">Bestand <strong>${fmt.format(g.inventory[key])}</strong>${free}${maintenance}</div>
        </div>
        <div class="market-price-block">
          <small>${item.tradeQty?`${qty} Stk.`:'Preis'}</small>
          <strong>${money(marketTradeCost(g,key))}</strong>
          <span class="market-trend ${signal.cls}">${signal.label}</span>
        </div>
        <div class="market-actions compact-actions">
          <button class="market-action buy" data-buy="${key}" ${g.canBuy(key)?'':'disabled'} title="${item.name} kaufen"><b>+${qty}</b><span>Kaufen</span></button>
          <button class="market-action sell" data-sell="${key}" ${g.canSell(key)?'':'disabled'} title="${item.name} verkaufen"><b>−${qty}</b><span>Verkaufen</span></button>
        </div>
      </div>`;
    }).join('');
  }

  function activateGameTab(name) {
    const allowed = ['actions','city','finance','reports'];
    activeGameTab = allowed.includes(name) ? name : 'actions';
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-game-tab]').forEach(btn => {
      const active = btn.dataset.gameTab === activeGameTab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-tab-panel]').forEach(panel => {
      const active = panel.dataset.tabPanel === activeGameTab;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  }

  function renderGame(g, showSummary=false) {
    const attract = g.calculateAttractiveness();
    const jobRatio = Math.round(g.employmentCoverage()*100);
    const housingRatio = Math.round(g.housingCapacity()/Math.max(1,g.population)*100);
    const eduRatio = Math.round(g.educationCoverage()*100);
    const util = Math.round(g.commerceUtilization()*100);
    const foodMonths = g.inventory.food / Math.max(1, g.monthlyFoodNeed());
    const f = g.forecast();
    const advice = g.advisory();
    const planClass = f.sustainableBalance < 0 ? 'bad' : 'good';

    app.innerHTML = `<section class="crt game-shell"><div class="screen game-screen">
      <header class="compact-game-header">
        <div class="compact-city-identity">
          <div><b>${esc(g.cityName)}</b><span>${esc(g.mayorName)} · ${esc(g.status())}</span></div>
          <div class="compact-score">${fmt.format(g.score)} P.</div>
        </div>
        <div class="compact-metrics">
          <div class="compact-metric"><b>${String(g.month).padStart(2,'0')}/${g.year}</b><span>Datum</span></div>
          <div class="compact-metric"><b class="${g.cash<0?'bad':''}">${money(g.cash)}</b><span>Kasse</span></div>
          <div class="compact-metric"><b>${fmt.format(g.population)}</b><span>Einwohner</span></div>
          <div class="compact-metric"><b class="${g.approval<30?'bad':g.approval>70?'good':''}">${g.approval}%</b><span>Zustimmung</span></div>
        </div>
      </header>

      <div class="panel city-panel compact-city-panel">
        <div class="city-panel-top">
          <div class="city-panel-title"><h2>STADTBILD</h2><span>${esc(g.status())}</span></div>
          <div class="city-scene-infra compact-infra">
            <div class="city-scene-infra-top"><span>Infrastruktur</span><b>${g.infrastructureScore()} / 100</b></div>
            <div class="city-scene-meter"><i style="width:${g.infrastructureScore()}%"></i></div>
          </div>
        </div>
        <div class="city-scene city-stage-${g.visualStage()}">
          <img class="city-scene-image" src="${sceneImageFor(g)}" alt="Stadtbild von ${esc(g.cityName)} im Status ${esc(g.status())}">
          <div class="city-scene-shade"></div>
          <div class="city-hotspot-layer">${cityHotspots(g)}</div>
        </div>
        <div class="city-quick-strip">
          <div><span>Land</span><b>${fmt.format(g.landFree())}</b></div>
          <div><span>Nahrung</span><b class="${foodMonths<1?'bad':foodMonths<2?'warn':''}">${foodMonths.toFixed(1)} Mon.</b></div>
          <div><span>Jobs</span><b class="${healthClass(jobRatio,95,75)}">${jobRatio}%</b></div>
          <div><span>Plan</span><b class="${planClass}">${money(f.sustainableBalance)}</b></div>
        </div>
        <div class="city-tap-hint">Gebäude antippen = Detailinfo</div>
      </div>

      <nav class="game-tabs" role="tablist" aria-label="Spielbereiche">
        <button class="game-tab" data-game-tab="actions" role="tab">AKTIONEN</button>
        <button class="game-tab" data-game-tab="city" role="tab">STADT</button>
        <button class="game-tab" data-game-tab="finance" role="tab">FINANZEN</button>
        <button class="game-tab" data-game-tab="reports" role="tab">BERICHTE</button>
      </nav>

      <main class="game-workspace">
        <section class="game-tab-panel" data-tab-panel="actions" role="tabpanel">
          <div class="workspace-head"><div><h2>KAUFEN / VERKAUFEN</h2><p>Antippen für Details · Preise reagieren auf Angebot und Nachfrage.</p></div><span>MARKT ${String(g.month).padStart(2,'0')}/${g.year}</span></div>
          <div class="market compact-market">${renderCompactMarket(g)}</div>
        </section>

        <section class="game-tab-panel" data-tab-panel="city" role="tabpanel" hidden>
          <div class="workspace-head"><div><h2>STADTENTWICKLUNG</h2><p>Die wichtigsten Kapazitäten auf einen Blick.</p></div></div>
          <div class="metric-card-grid">
            <div class="metric-card"><span>Wohnplätze</span><b class="${healthClass(housingRatio,105,95)}">${fmt.format(g.housingCapacity())}</b><small>${housingRatio}% Auslastung</small></div>
            <div class="metric-card"><span>Arbeitsplätze</span><b class="${healthClass(jobRatio,95,75)}">${fmt.format(g.jobsCapacity())}</b><small>${jobRatio}% Deckung</small></div>
            <div class="metric-card"><span>Bildungsplätze</span><b class="${healthClass(eduRatio,90,65)}">${fmt.format(g.schoolCapacity())}</b><small>${eduRatio}% Deckung</small></div>
            <div class="metric-card"><span>Nahrung</span><b class="${foodMonths<1?'bad':foodMonths<2?'warn':''}">${fmt.format(g.inventory.food)}</b><small>${foodMonths.toFixed(1)} Monatsreserven</small></div>
            <div class="metric-card"><span>Freies Land</span><b>${fmt.format(g.landFree())}</b><small>von ${fmt.format(g.inventory.land)}</small></div>
            <div class="metric-card"><span>Attraktivität</span><b>${attract}/100</b><small>für Zuzug</small></div>
            <div class="metric-card"><span>Gewerbe</span><b class="${healthClass(util,75,45)}">${util}%</b><small>Auslastung</small></div>
            <div class="metric-card"><span>Produktivität</span><b>${Math.round(g.productivityFactor()*100)}%</b><small>Steuerbasis</small></div>
          </div>
          <details class="compact-details">
            <summary>Politische Kennzahlen</summary>
            <div class="details-body">
              <div class="mini-progress-row"><span>Zustimmung</span><b>${g.approval}%</b></div><div class="status-meter"><i style="width:${g.approval}%"></i></div>
              <div class="resource"><span>Wohnraumauslastung</span><b>${housingRatio}%</b></div>
              <div class="resource"><span>Arbeitsplatzdeckung</span><b>${jobRatio}%</b></div>
              <div class="resource"><span>Bildungsdeckung</span><b>${eduRatio}%</b></div>
            </div>
          </details>
          <div class="goal-chip">Ziel: ${winText(g.winCondition)}</div>
        </section>

        <section class="game-tab-panel" data-tab-panel="finance" role="tabpanel" hidden>
          <div class="workspace-head"><div><h2>HAUSHALT</h2><p>Entscheidend ist der Saldo nach der Versorgung.</p></div></div>
          <div class="finance-summary-grid">
            <div class="finance-card income"><span>Einnahmen</span><b>+${money(f.total)}</b></div>
            <div class="finance-card cost"><span>Fixkosten</span><b>−${money(f.expenses)}</b></div>
            <div class="finance-card cost"><span>Nahrung</span><b>−${money(f.foodProvision)}</b></div>
            <div class="finance-card ${f.sustainableBalance<0?'negative':'positive'}"><span>Realer Plan</span><b>${money(f.sustainableBalance)}</b></div>
          </div>
          <details class="compact-details">
            <summary>Haushalt im Detail</summary>
            <div class="details-body">
              <div class="resource"><span>Einwohnersteuern</span><b class="good">+${money(f.residents)}</b></div>
              <div class="resource"><span>Gewerbeeinnahmen</span><b class="good">+${money(f.commerce)}</b></div>
              <div class="resource"><span>Gebäudeunterhalt</span><b class="bad">−${money(f.building)}</b></div>
              <div class="resource"><span>Städtische Dienste</span><b class="bad">−${money(f.services)}</b></div>
              ${f.interest?`<div class="resource"><span>Schuldzinsen</span><b class="bad">−${money(f.interest)}</b></div>`:''}
              <div class="resource"><span>Nahrung · Wiederbeschaffung</span><b class="bad">−${money(f.foodProvision)}</b></div>
              <div class="resource strong"><span>Saldo nach Versorgung</span><b class="${planClass}">${money(f.sustainableBalance)}</b></div>
            </div>
          </details>
          <div class="finance-note">Der Planwert berücksichtigt die Wiederbeschaffung der in einem normalen Monat verbrauchten Nahrung.</div>
        </section>

        <section class="game-tab-panel" data-tab-panel="reports" role="tabpanel" hidden>
          <div class="workspace-head"><div><h2>BERICHTE</h2><p>Nur Hinweise, die aktuell für deine Entscheidungen relevant sind.</p></div></div>
          <div class="compact-advisor">
            ${advice.map(n=>`<div class="advisor-line ${n.type}">● ${esc(n.text)}</div>`).join('')}
          </div>
          <details class="compact-details">
            <summary>Rathaus-Protokoll (${g.logs.length})</summary>
            <div class="details-body event-log compact-log">${g.logs.map(l=>`<div class="log-line ${l.type}"><span class="hint">${l.stamp}</span> ${esc(l.text)}</div>`).join('') || '<div class="hint">Noch keine Meldungen.</div>'}</div>
          </details>
          <details class="compact-details">
            <summary>Spielstatus</summary>
            <div class="details-body">
              <div class="resource"><span>Stadtstatus</span><b>${esc(g.status())}</b></div>
              <div class="resource"><span>Infrastruktur</span><b>${g.infrastructureScore()}/100</b></div>
              <div class="resource"><span>Punktestand</span><b>${fmt.format(g.score)}</b></div>
              <div class="resource"><span>Siegziel</span><b>${winText(g.winCondition)}</b></div>
            </div>
          </details>
        </section>
      </main>

      <div class="game-sticky-bar">
        <button class="sticky-menu-btn" id="menuBtn" aria-label="Menü">MENÜ</button>
        <div class="sticky-plan"><span>Monatsplan</span><b class="${planClass}">${money(f.sustainableBalance)}</b></div>
        <button class="sticky-month-btn" id="monthBtn">MONAT ABSCHLIESSEN</button>
      </div>
    </div></section>`;

    app.querySelectorAll('[data-buy]').forEach(b => b.onclick=()=>g.buy(b.dataset.buy));
    app.querySelectorAll('[data-sell]').forEach(b => b.onclick=()=>g.sell(b.dataset.sell));
    app.querySelectorAll('[data-info]').forEach(el => el.onclick=(ev)=>{ ev.stopPropagation(); openItemInfo(g, el.dataset.info); });
    app.querySelectorAll('[data-game-tab]').forEach(btn => btn.onclick=()=>activateGameTab(btn.dataset.gameTab));
    document.getElementById('menuBtn').onclick = () => { saveGame(g); renderHome(); };
    document.getElementById('monthBtn').onclick = () => openMonthModal(g);
    activateGameTab(activeGameTab);

    if (showSummary && g.lastSummary) openSummary(g, () => maybeShowQueuedOverlays(g));
    else maybeShowQueuedOverlays(g);
  }

'''

app = app[:start] + replacement + app[end:]
app_path.write_text(app, encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
marker = '/* Bürgermeister compact mobile workspace v1 */'
if marker not in css:
    css += r'''

/* Bürgermeister compact mobile workspace v1 */
.game-screen { padding-bottom:calc(82px + env(safe-area-inset-bottom)); }
.compact-game-header { display:grid; gap:6px; margin-bottom:8px; }
.compact-city-identity { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border:2px solid #5d7fc4; background:linear-gradient(180deg,#132653,#0f1d43); }
.compact-city-identity > div:first-child { min-width:0; display:grid; gap:1px; }
.compact-city-identity b { color:#fff2c0; font-size:1.02rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.compact-city-identity span { color:#9fb5df; font-size:.68rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.compact-score { color:#7895cf; font-size:.62rem; white-space:nowrap; }
.compact-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:5px; }
.compact-metric { min-width:0; padding:6px 5px; border:1px solid #4c6bad; background:#0f2049; text-align:center; box-shadow:inset 0 0 0 1px rgba(8,15,36,.55); }
.compact-metric b { display:block; color:#fff2c0; font-size:.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.compact-metric span { display:block; margin-top:2px; color:#819bc9; font-size:.53rem; text-transform:uppercase; letter-spacing:.04em; }
.compact-city-panel { padding:8px !important; }
.city-panel-top { display:grid; grid-template-columns:auto minmax(170px,1fr); align-items:center; gap:12px; margin-bottom:7px; }
.city-panel-title { min-width:0; }
.city-panel-title h2 { margin:0 !important; font-size:.95rem !important; }
.city-panel-title span { display:block; color:#9fb7e4; font-size:.64rem; margin-top:2px; white-space:nowrap; }
.compact-infra { gap:4px !important; }
.compact-infra .city-scene-infra-top { font-size:.61rem !important; }
.compact-infra .city-scene-infra-top b { font-size:.7rem !important; }
.compact-infra .city-scene-meter { height:10px !important; border-width:1px !important; }
.compact-city-panel .city-scene { aspect-ratio:4 / 3 !important; border-width:2px; box-shadow:0 4px 0 rgba(5,10,28,.5); }
.compact-city-panel .city-scene-shade { background:linear-gradient(to bottom,rgba(5,11,28,.08),transparent 25%,rgba(5,11,28,.10)); }
.city-quick-strip { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; margin-top:7px; }
.city-quick-strip > div { min-width:0; padding:5px 4px; background:#0c193b; border:1px solid #3d5d99; text-align:center; }
.city-quick-strip span { display:block; color:#7897cd; font-size:.50rem; text-transform:uppercase; }
.city-quick-strip b { display:block; margin-top:1px; font-size:.72rem; color:#fff0ba; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.city-tap-hint { margin-top:5px; text-align:center; color:#778fbf; font-size:.56rem; }
.game-tabs { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; margin:8px 0; padding:4px; border:2px solid #516fae; background:#09142f; }
.game-tab { min-width:0; min-height:38px; padding:5px 3px; border:1px solid #4868aa; background:#132653; color:#9eb5e1; font:inherit; font-size:.62rem; font-weight:bold; letter-spacing:.02em; cursor:pointer; }
.game-tab.active { color:#fff0ad; background:#285494; border-color:#8aa9e7; box-shadow:inset 0 -3px 0 #e5c762; }
.game-tab:focus-visible { outline:2px solid var(--warn); outline-offset:1px; }
.game-workspace { min-height:260px; }
.game-tab-panel { display:none; padding:9px; border:2px solid #5575b8; background:linear-gradient(180deg,#101f48,#0c193b); }
.game-tab-panel.active { display:block; }
.workspace-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:8px; padding-bottom:7px; border-bottom:1px solid #365489; }
.workspace-head h2 { margin:0; color:#fff1bc; font-size:1rem; }
.workspace-head p { margin:2px 0 0; color:#819aca; font-size:.62rem; line-height:1.3; }
.workspace-head > span { color:#7d9cd2; font-size:.57rem; white-space:nowrap; }
.compact-market { gap:5px !important; }
.compact-market-row { display:grid !important; grid-template-columns:44px minmax(0,1fr) 78px 72px !important; grid-template-areas:'icon copy price actions' !important; align-items:center !important; gap:6px !important; padding:5px !important; min-height:60px; background:linear-gradient(180deg,#142a58,#102248) !important; }
.market-icon-button { grid-area:icon; position:relative; width:44px; height:44px; padding:0; border:0; background:transparent; cursor:pointer; }
.market-icon-button .market-icon { width:44px !important; height:44px !important; }
.market-icon-button .market-icon svg { width:29px !important; height:29px !important; }
.market-info-dot { position:absolute; right:-2px; bottom:-2px; width:16px; height:16px; display:grid; place-items:center; border:1px solid #a9c5f4; background:#214d8c; color:#fff1a8; font-size:.55rem; font-weight:bold; box-shadow:1px 1px 0 #050b1d; }
.compact-market-row .market-copy { grid-area:copy; min-width:0; }
.compact-market-row .market-title-line { display:block !important; }
.compact-market-row .market-title-line b { display:block; font-size:.82rem !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.compact-market-row .market-effect { display:block; margin-top:1px; color:#91afe0 !important; font-size:.55rem !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.compact-market-row .market-meta { margin-top:2px !important; display:block !important; color:#8fa6d1 !important; font-size:.54rem !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.compact-market-row .market-price-block { grid-area:price; text-align:right; }
.compact-market-row .market-price-block small { font-size:.49rem !important; }
.compact-market-row .market-price-block > strong { font-size:.76rem !important; margin:1px 0 !important; }
.compact-market-row .market-trend { font-size:.48rem !important; padding:1px 3px !important; }
.compact-market-row .market-actions { grid-area:actions; display:grid !important; grid-template-columns:1fr !important; gap:3px !important; width:100% !important; }
.compact-market-row .market-action { min-height:26px !important; padding:2px !important; box-shadow:1px 1px 0 #07102b !important; border-width:1px !important; }
.compact-market-row .market-action b { font-size:.72rem !important; }
.compact-market-row .market-action span { display:none !important; }
.metric-card-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
.metric-card { min-width:0; padding:9px; border:1px solid #4868a8; background:#10234c; }
.metric-card span { display:block; color:#8fa7d3; font-size:.61rem; }
.metric-card b { display:block; margin:3px 0 1px; color:#fff0b6; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.metric-card small { display:block; color:#6f89b9; font-size:.52rem; }
.goal-chip { margin-top:8px; padding:6px 8px; border:1px solid #4f6da8; background:#0b1938; color:#9eb5de; font-size:.61rem; }
.finance-summary-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
.finance-card { padding:10px; border:1px solid #496aa9; background:#10234b; }
.finance-card span { display:block; color:#8fa6d3; font-size:.6rem; }
.finance-card b { display:block; margin-top:4px; color:#fff0bd; font-size:.96rem; }
.finance-card.income b,.finance-card.positive b { color:var(--good); }
.finance-card.cost b,.finance-card.negative b { color:var(--bad); }
.finance-card.positive { border-color:#5e8b65; background:#122b2c; }
.finance-card.negative { border-color:#9b5b59; background:#301e2b; }
.finance-note { margin-top:8px; color:#788fbc; font-size:.56rem; line-height:1.35; }
.compact-details { margin-top:8px; border:1px solid #4969a7; background:#0b1938; }
.compact-details summary { padding:8px 9px; cursor:pointer; color:#d9e4ff; font-size:.67rem; font-weight:bold; list-style:none; }
.compact-details summary::-webkit-details-marker { display:none; }
.compact-details summary::before { content:'▸'; display:inline-block; margin-right:7px; color:#e2c45f; transition:transform .12s ease; }
.compact-details[open] summary::before { transform:rotate(90deg); }
.details-body { padding:0 9px 9px; border-top:1px solid #314e82; }
.mini-progress-row { display:flex; justify-content:space-between; gap:10px; padding:8px 0 4px; color:#a4b9e1; font-size:.66rem; }
.compact-advisor { display:grid; gap:5px; }
.compact-advisor .advisor-line { padding:7px 8px !important; font-size:.64rem !important; line-height:1.35; }
.compact-log { max-height:240px; overflow:auto; padding-right:3px; }
.compact-log .log-line { font-size:.62rem; line-height:1.4; }
.game-sticky-bar { position:fixed; left:50%; bottom:0; transform:translateX(-50%); z-index:50; width:min(calc(100% - 12px),1048px); display:grid; grid-template-columns:70px minmax(72px,.45fr) minmax(150px,1fr); gap:5px; padding:7px 8px calc(7px + env(safe-area-inset-bottom)); border:2px solid #6c8bd0; border-bottom:0; background:rgba(7,15,35,.96); box-shadow:0 -4px 14px rgba(0,0,0,.45); backdrop-filter:blur(6px); }
.sticky-menu-btn,.sticky-month-btn { min-height:44px; border:2px solid #7797db; color:#fff0bd; font:inherit; font-weight:bold; cursor:pointer; }
.sticky-menu-btn { background:#1a376c; font-size:.62rem; }
.sticky-month-btn { background:#35633c; border-color:#9ccb8a; font-size:.67rem; }
.sticky-plan { min-width:0; display:grid; place-content:center; text-align:center; border:1px solid #3e5d98; background:#0c1938; }
.sticky-plan span { color:#7893c4; font-size:.48rem; text-transform:uppercase; }
.sticky-plan b { margin-top:1px; font-size:.67rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
@media (min-width:761px) {
  .game-workspace { min-height:350px; }
  .compact-market-row { grid-template-columns:52px minmax(0,1fr) 105px 150px !important; }
  .market-icon-button { width:50px; height:50px; }
  .market-icon-button .market-icon { width:50px !important; height:50px !important; }
  .compact-market-row .market-actions { grid-template-columns:1fr 1fr !important; }
  .compact-market-row .market-action span { display:block !important; font-size:.5rem !important; }
  .metric-card-grid { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .finance-summary-grid { grid-template-columns:repeat(4,minmax(0,1fr)); }
}
@media (max-width:520px) {
  .app-shell { padding:4px !important; }
  .game-screen { padding:7px 7px calc(78px + env(safe-area-inset-bottom)) !important; }
  .compact-city-identity { padding:6px 7px; }
  .compact-city-identity b { font-size:.91rem; }
  .compact-city-identity span { font-size:.57rem; }
  .compact-metric { padding:5px 2px; }
  .compact-metric b { font-size:.72rem; }
  .compact-metric span { font-size:.44rem; }
  .city-panel-top { grid-template-columns:95px minmax(0,1fr); gap:8px; }
  .compact-city-panel { padding:6px !important; }
  .city-tap-hint { display:none; }
  .game-tabs { margin:6px 0; gap:2px; padding:3px; }
  .game-tab { min-height:35px; font-size:.54rem; padding:4px 1px; }
  .game-tab-panel { padding:7px; }
  .workspace-head { margin-bottom:6px; padding-bottom:6px; }
  .workspace-head h2 { font-size:.88rem; }
  .workspace-head p { font-size:.54rem; }
  .workspace-head > span { display:none; }
  .compact-market-row { grid-template-columns:40px minmax(0,1fr) 69px 61px !important; gap:4px !important; padding:4px !important; min-height:55px; }
  .market-icon-button { width:40px; height:40px; }
  .market-icon-button .market-icon { width:40px !important; height:40px !important; }
  .market-icon-button .market-icon svg { width:26px !important; height:26px !important; }
  .compact-market-row .market-effect { display:none !important; }
  .compact-market-row .market-meta { font-size:.49rem !important; }
  .compact-market-row .market-price-block > strong { font-size:.68rem !important; }
  .compact-market-row .market-trend { font-size:.43rem !important; }
  .compact-market-row .market-actions { gap:2px !important; }
  .compact-market-row .market-action { min-height:23px !important; }
  .compact-market-row .market-action b { font-size:.64rem !important; }
  .metric-card,.finance-card { padding:7px; }
  .metric-card b,.finance-card b { font-size:.84rem; }
  .game-sticky-bar { width:calc(100% - 8px); grid-template-columns:58px 72px minmax(135px,1fr); padding:5px 5px calc(5px + env(safe-area-inset-bottom)); }
  .sticky-menu-btn,.sticky-month-btn { min-height:40px; }
  .sticky-month-btn { font-size:.57rem; }
  .sticky-plan b { font-size:.58rem; }
}
'''

css_path.write_text(css, encoding='utf-8')

sw = sw_path.read_text(encoding='utf-8')
if 'buergermeister-1992-plus-v8' not in sw:
    sw, count = re.subn(r"buergermeister-1992-plus-v\d+", 'buergermeister-1992-plus-v8', sw, count=1)
    if count != 1:
        raise SystemExit('Could not locate service worker cache version')
sw_path.write_text(sw, encoding='utf-8')
