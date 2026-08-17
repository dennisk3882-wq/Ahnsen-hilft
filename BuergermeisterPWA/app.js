(() => {
  'use strict';

  const SAVE_KEY = 'buergermeister1992plus.save.v1';
  const SCORE_KEY = 'buergermeister1992plus.scores.v1';
  const BACKUP_KEY = 'buergermeister1992plus.backups.v1';
  const app = document.getElementById('app');
  const fmt = new Intl.NumberFormat('de-DE');
  const money = n => `${n < 0 ? '-' : ''}${fmt.format(Math.abs(Math.round(n)))} $`;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const choice = arr => arr[Math.floor(Math.random() * arr.length)];


  let deferredInstallPrompt = null;
  let activeGameTab = 'actions';

  function isPwaStandalone() {
    return typeof window !== 'undefined' && (
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator && window.navigator.standalone === true)
    );
  }

  function syncInstallButton() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('installBtn');
    const note = document.getElementById('installNote');
    if (!btn) return;

    if (isPwaStandalone()) {
      btn.hidden = true;
      if (note) {
        note.textContent = 'Die Bürgermeister-App ist bereits auf diesem Gerät installiert.';
        note.classList.add('installed');
      }
      return;
    }

    btn.hidden = false;
    btn.disabled = false;
    btn.classList.toggle('ready', !!deferredInstallPrompt);
    const label = btn.querySelector('.install-label');
    if (label) label.textContent = deferredInstallPrompt ? 'APP INSTALLIEREN' : 'AUF HANDY INSTALLIEREN';
    if (note) {
      note.classList.remove('installed');
      note.textContent = deferredInstallPrompt
        ? 'Bereit zur Installation – ein Tipp öffnet den Systemdialog.'
        : 'Wie eine normale App starten – direkt vom Startbildschirm.';
    }
  }

  async function installPwa() {
    if (isPwaStandalone()) return;
    if (deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } catch (_) {}
      syncInstallButton();
      return;
    }
    openInstallHelp();
  }

  function openInstallHelp() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const isiOS = /iphone|ipad|ipod/i.test(ua);
    const isAndroid = /android/i.test(ua);
    const steps = isiOS
      ? ['Öffne diese Seite in Safari.', 'Tippe auf Teilen.', 'Wähle „Zum Home-Bildschirm“ und bestätige „Hinzufügen“.']
      : isAndroid
        ? ['Öffne das Browser-Menü oben rechts (⋮).', 'Tippe auf „App installieren“ oder „Zum Startbildschirm hinzufügen“.', 'Bestätige anschließend die Installation.']
        : ['Öffne das Menü deines Browsers.', 'Suche nach „App installieren“ oder „Zum Startbildschirm hinzufügen“.', 'Bestätige die Installation.'];

    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.innerHTML = `<div class="modal install-help-modal">
      <div class="info-title-row"><div><div class="hint">PWA INSTALLIEREN</div><h2>Bürgermeister aufs Gerät</h2></div><button class="icon-close" aria-label="Schließen">×</button></div>
      <div class="install-help-icon">⇩</div>
      <p>Nach der Installation erscheint Bürgermeister wie eine App auf deinem Startbildschirm und öffnet ohne normale Browser-Leiste.</p>
      <ol class="install-steps">${steps.map(step => `<li>${step}</li>`).join('')}</ol>
      <button class="btn primary center" id="installHelpClose" style="width:100%">VERSTANDEN</button>
    </div>`;
    document.body.appendChild(overlay); enhanceDialog(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.icon-close').onclick = close;
    overlay.querySelector('#installHelpClose').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
  }

  const { Game, ITEMS, CITY_LEVELS, CITY_STAGE_ORDER, CITY_STAGE_IMAGES, CITY_PROMOTIONS, CITY_HOTSPOTS, EVENTS } = globalThis.BGM_ENGINE;

  function newGame(data) {
    const g = new Game({
      cityName: data.cityName.trim() || 'Neustadt',
      mayorName: data.mayorName.trim() || 'Bürgermeister',
      winCondition: data.winCondition
    });
    g.log(`${g.mayorName} übernimmt das Rathaus von ${g.cityName}.`, 'good');
    g.log('Startkapital: 1.000 $. Plane jeden Ausbau – Unterhalt läuft jeden Monat.');
    saveGame(g); renderGame(g);
  }

  function getBackups() {
    try { const data=JSON.parse(localStorage.getItem(BACKUP_KEY)||'[]'); return Array.isArray(data)?data:[]; }
    catch { return []; }
  }

  function saveGame(g) {
    const raw = JSON.stringify(g);
    localStorage.setItem(SAVE_KEY, raw);
    const backups = getBackups();
    if (!backups.length || backups[0].monthsPlayed !== g.monthsPlayed) {
      backups.unshift({ monthsPlayed:g.monthsPlayed, stamp:new Date().toISOString(), data:raw });
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0,14)));
    }
  }

  function loadGame() {
    try { const raw=localStorage.getItem(SAVE_KEY); return raw ? new Game(JSON.parse(raw)) : null; }
    catch { return null; }
  }

  function exportSave() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const g = loadGame();
    const blob = new Blob([raw], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=`buergermeister-${(g?.cityName||'spielstand').replace(/[^a-z0-9_-]+/gi,'-').toLowerCase()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function importSave() {
    const input=document.createElement('input'); input.type='file'; input.accept='.json,application/json';
    input.onchange=async()=>{
      const file=input.files?.[0]; if(!file)return;
      try { const parsed=JSON.parse(await file.text()); const g=new Game(parsed); saveGame(g); renderGame(g); }
      catch { alert('Der Spielstand konnte nicht gelesen werden.'); }
    };
    input.click();
  }

  function restoreBackup(monthsAgo) {
    const current=loadGame(); if(!current)return;
    const target=Math.max(0,current.monthsPlayed-monthsAgo);
    const backups=getBackups();
    const hit=backups.find(b=>b.monthsPlayed===target) || backups.find(b=>b.monthsPlayed<=target);
    if(!hit)return;
    try { const g=new Game(JSON.parse(hit.data)); localStorage.setItem(SAVE_KEY, JSON.stringify(g)); renderGame(g); }
    catch { alert('Die Sicherung ist beschädigt.'); }
  }

  function addScore(g) {
    const scores = getScores();
    scores.push({ city:g.cityName, mayor:g.mayorName, score:g.score, pop:g.population, cash:g.cash, win:!!g.ending?.win, date:new Date().toISOString() });
    scores.sort((a,b) => b.score-a.score);
    localStorage.setItem(SCORE_KEY, JSON.stringify(scores.slice(0,10)));
  }

  function getScores() { try { return JSON.parse(localStorage.getItem(SCORE_KEY) || '[]'); } catch { return []; } }
  globalThis.BGM_HOOKS = { save:saveGame, render:renderGame, score:addScore };
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function enhanceDialog(backdrop) {
    if (!backdrop || backdrop.dataset.a11yReady) return;
    backdrop.dataset.a11yReady='1';
    const dialog=backdrop.querySelector('.modal'); if(!dialog)return;
    dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('tabindex','-1');
    const focusables=()=>[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')];
    const previous=document.activeElement;
    setTimeout(()=>{ const list=focusables(); (list[0]||dialog).focus(); },0);
    backdrop.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        const close=backdrop.querySelector('.icon-close,#cancelMonth,#infoClose,#closeSummary,#promoOk,#endHome,#installHelpClose');
        if(close){e.preventDefault();close.click();}
      }
      if(e.key==='Tab'){
        const list=focusables(); if(!list.length)return;
        const first=list[0],last=list[list.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    const observer=new MutationObserver(()=>{if(!document.body.contains(backdrop)){observer.disconnect(); if(previous?.focus) previous.focus();}});
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function renderHome() {
    const hasSave = !!loadGame();
    app.innerHTML = `
      <section class="title-card crt"><div class="screen title-wrap">
        <div class="hint">EINE KLEINE KOMMUNAL-SIMULATION</div>
        <h1 class="logo-title">BÜRGERMEISTER</h1>
        <div class="subtitle">1992<span class="warn">+</span> &nbsp; • &nbsp; einfach wie früher, klüger im Hintergrund</div>
        <div class="pixel-rule"></div>
        <div class="menu">
          <button class="btn primary center" id="newBtn">1 &nbsp; NEUES SPIEL</button>
          <button class="btn center" id="continueBtn" ${hasSave?'':'disabled'}>2 &nbsp; SPIEL FORTSETZEN</button>
          <button class="btn center" id="scoresBtn">3 &nbsp; BESTENLISTE</button>
          <button class="btn center" id="rulesBtn">4 &nbsp; SPIELREGELN</button>
          <button class="btn center" id="saveManagerBtn">5 &nbsp; SPIELSTÄNDE / BACKUP</button>
        </div>
        <div class="install-card" id="installCard">
          <div class="install-card-copy">
            <b>Als App auf dem Handy</b>
            <span id="installNote">Wie eine normale App starten – direkt vom Startbildschirm.</span>
          </div>
          <button class="btn install-btn center" id="installBtn"><span class="install-symbol">⇩</span><span class="install-label">AUF HANDY INSTALLIEREN</span></button>
        </div>
        <p class="footer-note">Eigenständige Neuinterpretation – keine Original-ROMs oder Originalgrafiken.</p>
      </div></section>`;
    document.getElementById('newBtn').onclick = renderSetup;
    document.getElementById('continueBtn').onclick = () => { const g=loadGame(); if(g) renderGame(g); };
    document.getElementById('scoresBtn').onclick = renderScores;
    document.getElementById('rulesBtn').onclick = renderRules;
    document.getElementById('saveManagerBtn').onclick = renderSaveManager;
    document.getElementById('installBtn').onclick = installPwa;
    syncInstallButton();
  }


  function renderSaveManager() {
    const g=loadGame();
    const backups=getBackups();
    const available = n => g && backups.some(b=>b.monthsPlayed===Math.max(0,g.monthsPlayed-n));
    app.innerHTML=`<section class="crt form-card"><div class="screen"><div class="hint">SPIELSTÄNDE</div><h1>Sichern & wiederherstellen</h1>
      <p class="hint">Automatische Monatssicherungen bleiben lokal auf diesem Gerät. Zusätzlich kannst du einen Spielstand als JSON-Datei exportieren.</p>
      <div class="save-tools">
        <button class="btn primary center" id="exportSave" ${g?'':'disabled'}>SPIELSTAND EXPORTIEREN</button>
        <button class="btn center" id="importSave">SPIELSTAND IMPORTIEREN</button>
      </div>
      <h2>Automatische Sicherungen</h2>
      <div class="backup-grid">
        <button class="btn center" data-restore="1" ${available(1)?'':'disabled'}>VOR 1 MONAT</button>
        <button class="btn center" data-restore="3" ${available(3)?'':'disabled'}>VOR 3 MONATEN</button>
        <button class="btn center" data-restore="12" ${available(12)?'':'disabled'}>VOR 12 MONATEN</button>
      </div>
      <p class="hint">Gespeicherte Monatspunkte: ${backups.length}</p>
      <button class="btn" id="saveBack" style="width:100%;margin-top:12px">ZURÜCK</button>
    </div></section>`;
    document.getElementById('exportSave').onclick=exportSave;
    document.getElementById('importSave').onclick=importSave;
    document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>restoreBackup(Number(b.dataset.restore)));
    document.getElementById('saveBack').onclick=renderHome;
  }

  function renderSetup() {
    app.innerHTML = `<section class="crt form-card"><div class="screen">
      <div class="hint">NEUES SPIEL</div><h1>Rathaus übernehmen</h1>
      <div class="field"><label for="cityName">Name der Stadt</label><input id="cityName" maxlength="24" value="Neustadt"></div>
      <div class="field"><label for="mayorName">Dein Name</label><input id="mayorName" maxlength="24" value="Bürgermeister"></div>
      <div class="field"><label for="winCondition">Siegbedingung</label><select id="winCondition">
        <option value="modern">Moderne Stadt aufbauen</option>
        <option value="cash">200.000 $ Stadtkasse</option>
        <option value="population">10.000 Einwohner</option>
        <option value="fouryears">4 Jahre Amtszeit / Wiederwahl</option>
      </select></div>
      <div class="two-col"><button class="btn" id="backBtn">ZURÜCK</button><button class="btn primary" id="startBtn">SPIEL STARTEN</button></div>
      <p class="hint">Du beginnst bewusst klein: 1.000 $, drei Häuser, ein Geschäft und 125 Einwohner.</p>
    </div></section>`;
    document.getElementById('backBtn').onclick = renderHome;
    document.getElementById('startBtn').onclick = () => newGame({
      cityName:document.getElementById('cityName').value,
      mayorName:document.getElementById('mayorName').value,
      winCondition:document.getElementById('winCondition').value
    });
  }

  function sceneImageFor(g) {
    return CITY_STAGE_IMAGES[g.visualStage()];
  }

  function cityHotspots(g) {
    const stage = g.visualStage();
    const defs = CITY_HOTSPOTS[stage] || [];
    return defs.map(spot => `<button class="city-hotspot" data-info="${spot.key}" title="Info: ${ITEMS[spot.key].name}" aria-label="Info zu ${ITEMS[spot.key].name}" style="left:${spot.left}%;top:${spot.top}%;width:${spot.width}%;height:${spot.height}%"><span>${ITEMS[spot.key].name}</span></button>`).join('');
  }

  const MARKET_ICONS = {
    land: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M12 41 32 30l20 11-20 11-20-11Z"/><path d="M32 11v22"/><path d="M24 20c0-5 4-9 8-9s8 4 8 9c-2 3-5 5-8 5s-6-2-8-5Z"/><path d="M16 44h32"/></svg>',
    houses: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M12 30 32 14l20 16v20H12V30Z"/><path d="M20 49V34h24v15"/><path d="M26 49V39h12v10"/><path d="M16 29h32"/></svg>',
    towers: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M20 10h24v42H20V10Z"/><path d="M27 18h4v4h-4Zm6 0h4v4h-4Zm-6 10h4v4h-4Zm6 0h4v4h-4Zm-6 10h4v4h-4Zm6 0h4v4h-4Z"/><path d="M28 52V44h8v8"/></svg>',
    schools: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M10 28 32 15l22 13-22 12-22-12Z"/><path d="M16 35v15h32V35"/><path d="M32 40v10"/><path d="M48 29v13"/></svg>',
    universities: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M8 23 32 11l24 12H8Z"/><path d="M14 27h36"/><path d="M18 27v21m10-21v21m10-21v21m10-21v21"/><path d="M11 50h42"/></svg>',
    shops: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M14 23h36l-4-11H18l-4 11Z"/><path d="M14 23v26h36V23"/><path d="M24 49V35h16v14"/><path d="M14 23c3 6 8 6 11 0 3 6 8 6 11 0 3 6 8 6 11 0 3 6 8 6 11 0"/></svg>',
    supermarkets: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M11 18h8l5 21h22l5-16H22"/><circle class="accent" cx="28" cy="47" r="4"/><circle class="accent" cx="45" cy="47" r="4"/><path d="M29 24v10m8-10v10m8-10v10"/></svg>',
    food: '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="accent" d="M14 26h36l-4 23H18l-4-23Z"/><path d="M22 26c2-8 6-12 10-12s8 4 10 12"/><path d="M23 34h18M21 41h22"/></svg>'
  };

  function marketIcon(key) {
    return `<span class="market-icon market-icon-${key}"><span class="market-icon-frame">${MARKET_ICONS[key] || ''}</span></span>`;
  }

  function marketEffect(key) {
    const labels = {
      land: 'Baufläche für weitere Entwicklung',
      houses: '+55 Wohnplätze',
      towers: '+420 Wohnplätze · wenig Fläche',
      schools: '+320 Bildungsplätze',
      universities: '+2.200 Bildung · Produktivität',
      shops: 'bis 36 Jobs · Gewerbesteuer',
      supermarkets: 'bis 145 Jobs · bessere Versorgung',
      food: 'Versorgung · Handel in 100er-Paketen'
    };
    return labels[key] || '';
  }

  function marketPriceSignal(g, key) {
    const ratio = g.market[key] / ITEMS[key].base;
    if (ratio >= 1.22) return { cls:'expensive', label:'▲ teuer' };
    if (ratio >= 1.08) return { cls:'rising', label:'↗ erhöht' };
    if (ratio <= .78) return { cls:'cheap', label:'▼ günstig' };
    if (ratio <= .92) return { cls:'cheap', label:'↘ günstig' };
    return { cls:'normal', label:'● normal' };
  }

  function marketTradeCost(g, key) {
    return g.market[key] * (ITEMS[key].tradeQty || 1);
  }

  function healthClass(value, goodAt=100, warnAt=80) {
    return value >= goodAt ? 'good' : value < warnAt ? 'bad' : 'warn';
  }

  function renderCompactMarket(g) {
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
          <button class="market-action sell" data-sell="${key}" ${g.canSell(key)?'':'disabled'} title="${key==='food'?'Nahrung sofort an Großhandel verkaufen':item.name+' verkaufen'}"><b>−${qty}</b><span>${key==='food'?'Großhandel':'Verkaufen'}</span></button>
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
    const housingCapacity = g.housingCapacity();
    const housingRatio = Math.round(housingCapacity/Math.max(1,g.population)*100);
    const housingFree = Math.max(0, housingCapacity - g.population);
    const housingDeficit = Math.max(0, g.population - housingCapacity);
    const housingCoverage = Math.min(100, housingRatio);
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
          <div><span>Wohnen</span><b class="${housingDeficit>0?'bad':housingFree<15?'warn':'good'}">${housingDeficit>0?`${fmt.format(housingDeficit)} fehlen`:`${fmt.format(housingFree)} frei`}</b></div>
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
            <div class="metric-card"><span>Wohnraum</span><b class="${housingDeficit>0?'bad':housingFree<15?'warn':'good'}">${fmt.format(housingCapacity)} Plätze</b><small>${housingDeficit>0?`${fmt.format(housingDeficit)} fehlen · ${housingCoverage}% Bedarf gedeckt`:`${fmt.format(g.population)} belegt · ${fmt.format(housingFree)} frei`}</small></div>
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
              <div class="resource"><span>Wohnraumdeckung</span><b class="${housingCoverage<100?'bad':'good'}">${housingCoverage}%</b></div>
              <div class="resource"><span>Freie Wohnplätze</span><b class="${housingDeficit>0?'bad':housingFree<15?'warn':'good'}">${housingDeficit>0?`${fmt.format(housingDeficit)} fehlen`:fmt.format(housingFree)}</b></div>
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

  function recommendationFor(g, key) {
    if (key === 'land') return g.landFree() <= 2 ? 'Sinnvoll: Deine freie Baufläche wird knapp.' : 'Nur kaufen, wenn du in Kürze bauen willst. Land bindet Kapital.';
    if (key === 'food') {
      const months = g.inventory.food / Math.max(1,g.monthlyFoodNeed());
      return months < 1.5 ? 'Dringend: Die Nahrungsreserve ist knapp.' : months > 4 ? 'Der Vorrat ist bereits groß. Beachte schwankende Marktpreise.' : 'Reserve ist derzeit vernünftig.';
    }
    if (key === 'houses') return g.housingCapacity() < g.population * 1.12 ? 'Sinnvoll: Mehr Wohnraum schafft Platz für Zuzug.' : 'Aktuell besteht bereits deutliche Wohnraumreserve.';
    if (key === 'towers') return g.population < 1000 ? 'Für die aktuelle Stadtgröße teuer. Häuser sind meist wirtschaftlicher.' : g.landFree() < 5 ? 'Kann sinnvoll sein, weil Hochhäuser viel Wohnraum pro Land schaffen.' : 'Vor allem bei starkem Wachstum oder knapper Baufläche sinnvoll.';
    if (key === 'schools') return g.educationCoverage() < .8 ? 'Sinnvoll: Deine Bildungsdeckung ist niedrig.' : 'Aktuell besteht ausreichende Bildungsreserve.';
    if (key === 'universities') return g.population < 3500 ? 'Sehr hoher Unterhalt für eine kleine Stadt. Frühbau ist riskant.' : g.educationCoverage() < .9 ? 'Kann Versorgung und Produktivität stark verbessern.' : 'Vor allem für weiteres Großstadtwachstum interessant.';
    if (key === 'shops') {
      const after = Math.round(g.commerceUtilization('shops')*100);
      return after < 50 ? `Eher nicht: Nach dem Bau läge die Gewerbe-Auslastung nur bei etwa ${after}%.` : `Vertretbar: Erwartete Gewerbe-Auslastung nach dem Bau etwa ${after}%.`;
    }
    if (key === 'supermarkets') {
      const after = Math.round(g.commerceUtilization('supermarkets')*100);
      return g.population < 650 ? `Für ${fmt.format(g.population)} Einwohner noch sehr groß. Erwartete Auslastung etwa ${after}%.` : `Erwartete Gewerbe-Auslastung nach dem Bau etwa ${after}%.`;
    }
    return '';
  }

  function infoRows(g, key) {
    const item = ITEMS[key];
    const rows = [];
    const qty = item.tradeQty || 1;
    rows.push(['Aktueller Kaufpreis', money(g.market[key] * qty)]);
    rows.push(['Verkauf heute', money(Math.round(g.market[key] * item.sell * qty))]);
    if (item.maintenance) rows.push(['Unterhalt / Monat', money(item.maintenance)]);
    if (item.footprint) rows.push(['Benötigtes Land', `${item.footprint}`]);
    if (item.capacity) rows.push(['Zusätzliche Wohnplätze', `+${fmt.format(item.capacity)}`]);
    if (item.service) rows.push(['Zusätzliche Bildungsplätze', `+${fmt.format(item.service)}`]);
    if (item.jobs) rows.push(['Arbeitsplätze maximal', `bis zu +${fmt.format(item.jobs)}`]);
    if (item.commerceTax) rows.push(['Gewerbeeinnahmen maximal', `bis zu +${money(item.commerceTax)}/Monat`]);
    if (key === 'food') { rows.push(['Kaufmenge', '+100 Einheiten']); rows.push(['Sofortverkauf / Großhandel', '45% des aktuellen Marktwerts']); }
    if (key === 'supermarkets') {
      rows.push(['Nahrungsbedarf', '-4% je Supermarkt, max. -20%']);
      rows.push(['Regionaler Nahrungsverkauf', `bis zu ${fmt.format(g.foodExportCapacity())} Einheiten/Monat aktuell`]);
      rows.push(['Verkaufspreis', '165% des aktuellen Nahrungspreises (+65% Handelsaufschlag)']);
    }
    if (key === 'universities') rows.push(['Produktivität', '+3% je Universität, max. +18% Uni-Bonus']);
    return rows;
  }

  function itemExplanation(g, key) {
    const texts = {
      land: 'Land selbst erzeugt keine Einnahmen. Es wird aber von fast allen Gebäuden benötigt. Verkaufe niemals so viel, dass bestehende Gebäude keinen Platz mehr hätten.',
      houses: 'Häuser sind der günstige Standard für Wachstum. Ohne freie Wohnplätze können fast keine neuen Einwohner aufgenommen werden. Zu viel Leerstand kostet jedoch weiter Unterhalt.',
      towers: 'Hochhäuser sind flächeneffizient: 420 Wohnplätze auf zwei Land. Dafür ist der monatliche Unterhalt deutlich höher als bei normalen Häusern.',
      schools: 'Schulen decken den Bildungsbedarf der Bevölkerung. Gute Bildungsdeckung verbessert Zustimmung, Attraktivität und über die Produktivität auch die Einnahmen.',
      universities: 'Universitäten sind teuer, aber mächtig. Neben 2.200 Bildungsplätzen erhöhen sie die städtische Produktivität um 3 Prozentpunkte je Universität, bis maximal 18% Bonus.',
      shops: 'Geschäfte schaffen bis zu 36 Arbeitsplätze und bis zu 55 $ Gewerbeeinnahmen pro Monat. Diese Werte werden aber mit der Gewerbe-Auslastung multipliziert. Zu viele Geschäfte bei zu wenigen Einwohnern sind deshalb ein Verlustgeschäft.',
      supermarkets: 'Supermärkte schaffen bis zu 145 Arbeitsplätze und bis zu 220 $ Gewerbeeinnahmen. Zusätzlich verbessert jeder Supermarkt die Lebensmittel-Logistik und senkt den monatlichen Nahrungsbedarf um 4%, maximal um 20%. Jeder Supermarkt kann außerdem bis zu 150 überschüssige Nahrungseinheiten pro Monat regional vermarkten. Verkauft wird zum Endkundenpreis von 165% des aktuellen Nahrungspreises, also mit 65% Handelsaufschlag. Auch hier entscheidet die Kundennachfrage über die normale Gewerbeleistung.',
      food: 'Jeden Monat muss ausreichend Nahrung zugeteilt werden. Eine Einheit steht für einen standardisierten Warenkorb; der Grundbedarf liegt bei rund 0,68 Einheiten je Einwohner und Monat. Supermärkte senken Logistikverluste zusätzlich. Stellst du mehr als den Einwohnerbedarf bereit, kann der Überschuss über vorhandene Supermärkte regional verkauft werden. Nicht verkaufte Überschüsse bleiben im Lager. Unterversorgung drückt die Zustimmung, führt zu Wegzug und kann das Spiel beenden.'
    };
    return texts[key] || ITEMS[key].short;
  }

  function openItemInfo(g, key) {
    if (!ITEMS[key]) return;
    const item = ITEMS[key];
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.innerHTML = `<div class="modal info-modal">
      <div class="info-title-row"><div><div class="hint">OBJEKT-INFORMATION</div><h2>${esc(item.name)}</h2></div><button class="icon-close" aria-label="Schließen">×</button></div>
      <p class="info-lead">${esc(item.short)}</p>
      <div class="info-stats">${infoRows(g,key).map(([a,b])=>`<div class="summary-row"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>
      <div class="info-box"><b>Wirkung im Spiel</b><p>${esc(itemExplanation(g,key))}</p></div>
      <div class="info-box recommendation"><b>Aktuelle Einschätzung</b><p>${esc(recommendationFor(g,key))}</p></div>
      <div class="two-col info-actions">
        <button class="btn" id="infoClose">SCHLIESSEN</button>
        <button class="btn primary" id="infoBuy" ${g.canBuy(key)?'':'disabled'}>KAUFEN ${item.tradeQty?`(+${item.tradeQty})`:''}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay); enhanceDialog(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.icon-close').onclick = close;
    overlay.querySelector('#infoClose').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    overlay.querySelector('#infoBuy').onclick = () => { close(); g.buy(key); };
  }

  function openMonthModal(g) {
    const maxFood = g.inventory.food;
    const foodNeed = g.monthlyFoodNeed();
    const defaultFood = Math.min(maxFood, foodNeed);
    const defaultAdmit = Math.max(0, Math.min(1000, g.housingCapacity()-g.population));
    const baseForecast = g.forecast();
    const overlay = document.createElement('div'); overlay.className='modal-backdrop';
    overlay.innerHTML = `<div class="modal month-decision-modal"><div class="hint">MONATSENDE ${String(g.month).padStart(2,'0')}/${g.year}</div><h2>Entscheidungen des Bürgermeisters</h2>
      <div class="decision-forecast ${baseForecast.sustainableBalance<0?'negative':'positive'}" id="liveForecastBox">
        <div class="decision-forecast-label">Voraussichtlicher Saldo nach Versorgung</div>
        <b class="decision-forecast-value" id="liveSaldo">${money(baseForecast.sustainableBalance)}</b>
        <div class="live-forecast-grid">
          <div><span>Einwohnersteuer</span><b id="liveResidentTax">+${money(baseForecast.residents)}</b></div>
          <div><span>Steuereffekt</span><b id="liveTaxDelta">±0 $</b></div>
          <div><span>Regionalverkauf</span><b id="liveFoodExport">+0 $</b></div>
          <div><span>Wareneinsatz Export</span><b id="liveFoodExportCost">−0 $</b></div>
          <div><span>Handelsgewinn</span><b id="liveFoodExportMargin">0 $</b></div>
          <div><span>Überschuss</span><b id="liveFoodSurplus">0 / ${fmt.format(g.foodExportCapacity())}</b></div>
          <div><span>Operativer Saldo</span><b id="liveOperating">${money(baseForecast.balance)}</b></div>
          <div><span>Versorgung</span><b id="liveFoodCoverage">${foodNeed ? Math.min(100, Math.round(defaultFood/foodNeed*100)) : 100}%</b></div>
        </div>
      </div>
      <div class="field"><label>Wohnsteuer: <b id="taxOut">${g.taxRate}%</b></label><input id="tax" type="range" min="0" max="30" value="${g.taxRate}"><div class="hint">Der Saldo oben wird live neu berechnet. Höhere Steuern bringen sofort mehr Einnahmen, senken aber Attraktivität und Zustimmung.</div></div>
      <div class="field"><label>Nahrung für Einwohner: <b id="foodOut">${fmt.format(defaultFood)}</b></label><input id="food" type="range" min="0" max="${maxFood}" value="${defaultFood}"><div class="hint">Bedarf aktuell ungefähr ${fmt.format(foodNeed)} Einheiten. Mehr bereitgestellte Nahrung wird bei vorhandenen Supermärkten bis zur Absatzgrenze regional verkauft; der Rest bleibt im Lager.</div></div>
      <div class="field"><label>Maximal aufzunehmende Zuzügler</label><input id="admit" type="number" min="0" max="5000" value="${defaultAdmit}"><div class="hint">Neue Einwohner wirken erst ab dem Folgemonat auf die Steuereinnahmen. Das Limit beeinflusst deshalb den aktuellen Saldo nicht künstlich.</div></div>
      <div class="two-col"><button class="btn" id="cancelMonth">ABBRECHEN</button><button class="btn primary" id="confirmMonth">MONAT BERECHNEN</button></div>
    </div>`;
    document.body.appendChild(overlay); enhanceDialog(overlay);
    const tax=overlay.querySelector('#tax');
    const food=overlay.querySelector('#food');
    const taxOut=overlay.querySelector('#taxOut');
    const foodOut=overlay.querySelector('#foodOut');
    const forecastBox=overlay.querySelector('#liveForecastBox');
    const saldoOut=overlay.querySelector('#liveSaldo');
    const residentTaxOut=overlay.querySelector('#liveResidentTax');
    const taxDeltaOut=overlay.querySelector('#liveTaxDelta');
    const operatingOut=overlay.querySelector('#liveOperating');
    const foodCoverageOut=overlay.querySelector('#liveFoodCoverage');
    const foodExportOut=overlay.querySelector('#liveFoodExport');
    const foodExportCostOut=overlay.querySelector('#liveFoodExportCost');
    const foodExportMarginOut=overlay.querySelector('#liveFoodExportMargin');
    const foodSurplusOut=overlay.querySelector('#liveFoodSurplus');

    const liveProjection = () => {
      const selectedTax = clamp(Number(tax.value) || 0, 0, 30);
      const selectedFood = clamp(Number(food.value) || 0, 0, maxFood);
      const employment = clamp(g.employmentCoverage(), 0, 1);
      const taxableFactor = .58 + employment * .42;
      const residentTax = Math.round(g.population * taxableFactor * (selectedTax / 100) * 13.5 * g.productivityFactor());
      const exportTrade = g.foodExportPreview(selectedFood);
      const totalRevenue = residentTax + baseForecast.commerce + exportTrade.revenue;
      const operatingBalance = totalRevenue - baseForecast.expenses;
      const exportRestockCost = exportTrade.restockCost;
      const exportMargin = exportTrade.grossMargin;
      const sustainableBalance = operatingBalance - baseForecast.foodProvision - exportRestockCost;
      const taxDelta = residentTax - baseForecast.residents;
      const coverage = foodNeed ? Math.min(100, Math.round(exportTrade.consumed / foodNeed * 100)) : 100;

      taxOut.textContent = `${selectedTax}%`;
      foodOut.textContent = fmt.format(Math.round(selectedFood));
      residentTaxOut.textContent = `+${money(residentTax)}`;
      taxDeltaOut.textContent = taxDelta === 0 ? '±0 $' : `${taxDelta > 0 ? '+' : ''}${money(taxDelta)}`;
      taxDeltaOut.className = taxDelta > 0 ? 'good' : taxDelta < 0 ? 'bad' : '';
      foodExportOut.textContent = `+${money(exportTrade.revenue)}`;
      foodExportOut.className = exportTrade.revenue > 0 ? 'good' : '';
      foodExportCostOut.textContent = exportRestockCost ? `−${money(exportRestockCost)}` : '−0 $';
      foodExportCostOut.className = exportRestockCost ? 'bad' : '';
      foodExportMarginOut.textContent = money(exportMargin);
      foodExportMarginOut.className = exportMargin > 0 ? 'good' : exportMargin < 0 ? 'bad' : '';
      foodSurplusOut.textContent = `${fmt.format(exportTrade.sold)} / ${fmt.format(exportTrade.capacity)}`;
      foodSurplusOut.className = exportTrade.sold > 0 ? 'good' : '';
      operatingOut.textContent = money(operatingBalance);
      operatingOut.className = operatingBalance >= 0 ? 'good' : 'bad';
      saldoOut.textContent = money(sustainableBalance);
      forecastBox.classList.toggle('positive', sustainableBalance >= 0);
      forecastBox.classList.toggle('negative', sustainableBalance < 0);
      foodCoverageOut.textContent = `${coverage}%`;
      foodCoverageOut.className = coverage >= 100 ? 'good' : coverage >= 90 ? 'warn' : 'bad';
    };

    tax.addEventListener('input', liveProjection);
    food.addEventListener('input', liveProjection);
    liveProjection();
    overlay.querySelector('#cancelMonth').onclick=()=>overlay.remove();
    overlay.querySelector('#confirmMonth').onclick=()=>{
      const settings={taxRate:tax.value,foodAllocation:food.value,admitLimit:overlay.querySelector('#admit').value}; overlay.remove(); g.advanceMonth(settings);
    };
  }

  function openSummary(g, afterClose) {
    const s=g.lastSummary; const overlay=document.createElement('div'); overlay.className='modal-backdrop';
    const balance=s.revenue-s.maintenance;
    const sustainable=Number.isFinite(s.sustainableBalance)?s.sustainableBalance:(balance-(s.foodReplacementCost||0)-(s.foodExportRestockCost||0));
    overlay.innerHTML=`<div class="modal"><div class="hint">MONATSBERICHT</div><h2>Bilanz des vergangenen Monats</h2>
      <div class="month-summary">
        <div class="summary-row"><span>Einwohnersteuern</span><b class="good">+${money(s.residentRevenue)}</b></div>
        <div class="summary-row"><span>Gewerbe</span><b class="good">+${money(s.commerceRevenue)}</b></div>
        ${s.foodExportRevenue?`<div class="summary-row"><span>Nahrungs-Regionalverkauf (${fmt.format(s.foodExportSold)} Einh.)</span><b class="good">+${money(s.foodExportRevenue)}</b></div><div class="summary-row"><span>Wareneinsatz Regionalverkauf</span><b class="bad">−${money(s.foodExportRestockCost||0)}</b></div><div class="summary-row"><span>Handelsgewinn Regionalverkauf</span><b class="good">+${money(s.foodExportMargin||0)}</b></div>`:''}
        <div class="summary-row"><span>Gebäude</span><b class="bad">-${money(s.building)}</b></div>
        <div class="summary-row"><span>Städtische Dienste</span><b class="bad">-${money(s.services)}</b></div>
        ${s.interest?`<div class="summary-row"><span>Schuldzinsen</span><b class="bad">-${money(s.interest)}</b></div>`:''}
        <div class="summary-row"><span>Operativer Saldo</span><b class="${balance<0?'bad':'good'}">${money(balance)}</b></div>
        <div class="summary-row"><span>Nahrung · Wiederbeschaffung</span><b class="bad">−${money(s.foodReplacementCost||0)}</b></div>
        <div class="summary-row strong"><span>Nachhaltiger Saldo</span><b class="${sustainable<0?'bad':'good'}">${money(sustainable)}</b></div>
        <div class="summary-row"><span>Stadtkasse</span><b>${money(g.cash)}</b></div>
        <div class="summary-row"><span>Gewerbe-Auslastung</span><b>${Math.round(s.commerceUtilization*100)}%</b></div>
        <div class="summary-row"><span>Zuzüge</span><b class="good">+${s.newcomers}</b></div>
        <div class="summary-row"><span>Wegzüge</span><b class="${s.leaving?'bad':''}">-${s.leaving}</b></div>
        <div class="summary-row"><span>Nahrung</span><b class="${s.foodRatio<.9?'bad':''}">${s.foodServed}/${s.foodNeed}</b></div>
        <div class="summary-row"><span>Attraktivität</span><b>${s.attractiveness}/100</b></div>
      </div>
      <p>Einwohner: <b class="kpi-big">${fmt.format(s.oldPop)} → ${fmt.format(s.newPop)}</b></p>
      <p>Zustimmungsänderung: <b class="${s.approvalDelta<0?'bad':'good'}">${s.approvalDelta>=0?'+':''}${s.approvalDelta} Punkte</b></p>
      <button class="btn primary center" id="closeSummary" style="width:100%">WEITER</button>
    </div>`;
    document.body.appendChild(overlay); enhanceDialog(overlay); overlay.querySelector('#closeSummary').onclick=()=>{ overlay.remove(); if (afterClose) afterClose(); };
  }

  function maybeShowQueuedOverlays(g) {
    if (g.promotionQueue && g.promotionQueue.length) return openPromotionLetter(g);
    if (g.ended) return openEnding(g);
  }

  function openPromotionLetter(g) {
    const letter = g.promotionQueue.shift();
    saveGame(g);
    const overlay=document.createElement('div'); overlay.className='modal-backdrop';
    overlay.innerHTML=`<div class="modal info-modal"><div class="hint">REGIERUNGSBRIEF</div>
      <div class="info-title-row"><div><h2>${esc(letter.title)}</h2><div class="hint">${esc(letter.subject)}</div></div><button class="icon-close" aria-label="Schließen">×</button></div>
      <div class="info-box"><b>An ${esc(g.mayorName)}, Bürgermeister von ${esc(g.cityName)}</b><p>${esc(letter.body)}</p></div>
      <div class="info-box recommendation"><b>Bewilligte Förderung</b><p>${money(letter.cash)} wurden der Stadtkasse gutgeschrieben. ${esc(g.cityName)} trägt nun offiziell den Status <b>${esc(letter.status)}</b>.</p></div>
      <div class="info-actions"><button class="btn primary center" id="promoOk" style="width:100%">DANKEND ZUR KENNTNIS GENOMMEN</button></div>
    </div>`;
    document.body.appendChild(overlay); enhanceDialog(overlay);
    const close = () => { overlay.remove(); maybeShowQueuedOverlays(g); };
    overlay.querySelector('.icon-close').onclick = close;
    overlay.querySelector('#promoOk').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
  }

  function openEnding(g) {
    const overlay=document.createElement('div'); overlay.className='modal-backdrop';
    const r=g.termReport;
    const termHtml=r?`<div class="term-report"><h2>Amtsbilanz nach vier Jahren</h2>
      <div class="term-grid">
        <div><span>Finanzen</span><b>${r.finances}/100</b></div><div><span>Wachstum</span><b>${r.growth}/100</b></div>
        <div><span>Zustimmung</span><b>${r.approval}/100</b></div><div><span>Versorgung</span><b>${r.services}/100</b></div>
        <div><span>Infrastruktur</span><b>${r.infrastructure}/100</b></div><div><span>Gesamt</span><b>${r.total}/100</b></div>
      </div><div class="election-result ${r.reelected?'good':'bad'}">Wahlergebnis: ${r.voteShare}%</div></div>`:'';
    overlay.innerHTML=`<div class="modal overlay-message"><div class="hint">SPIELENDE</div>
      <h1 class="${g.ending.win?'good':'bad'}">${g.ending.win?'GEWONNEN!':'ABGEWÄHLT!'}</h1>
      <p>${esc(g.ending.reason)}</p>${termHtml}
      <p class="kpi-big">${fmt.format(g.score)} Punkte</p>
      <p>${fmt.format(g.population)} Einwohner · ${money(g.cash)} · ${g.status()}</p>
      <div class="two-col"><button class="btn" id="endHome">HAUPTMENÜ</button><button class="btn primary" id="endNew">NEUES SPIEL</button></div>
    </div>`;
    document.body.appendChild(overlay); enhanceDialog(overlay);
    overlay.querySelector('#endHome').onclick=()=>{overlay.remove();renderHome();};
    overlay.querySelector('#endNew').onclick=()=>{overlay.remove();renderSetup();};
  }

  function winText(k) { return ({cash:'200.000 $ Stadtkasse',population:'10.000 Einwohner',modern:'Moderne Stadt',fouryears:'4 Jahre Amtszeit + Wiederwahl'})[k] || k; }

  function renderScores() {
    const scores=getScores();
    app.innerHTML=`<section class="crt form-card"><div class="screen"><div class="hint">LOKALE BESTENLISTE</div><h1>Die besten Bürgermeister</h1>
      ${scores.length?scores.map((s,i)=>`<div class="summary-row"><span>${i+1}. ${esc(s.mayor)} · ${esc(s.city)} ${s.win?'★':''}</span><b>${fmt.format(s.score)}</b></div>`).join(''):'<p class="hint">Noch keine abgeschlossenen Spiele.</p>'}
      <button class="btn" id="backBtn" style="margin-top:14px;width:100%">ZURÜCK</button></div></section>`;
    document.getElementById('backBtn').onclick=renderHome;
  }

  function renderRules() {
    app.innerHTML=`<section class="crt form-card"><div class="screen"><div class="hint">SPIELREGELN</div><h1>Klein, aber nicht beliebig</h1>
      <p>Jeder Zug entspricht einem Monat. Zuerst kaufst oder verkaufst du Stadtvermögen. Danach legst du Steuern, Nahrungsmenge und die maximal erlaubte Zahl neuer Einwohner fest.</p>
      <p><b>Wachstum:</b> Menschen ziehen bei freien Wohnungen, Arbeit, vernünftigen Steuern, Versorgung, Bildung und guter Stimmung zu.</p>
      <p><b>Gewerbe:</b> Geschäfte und Supermärkte funktionieren nicht automatisch mit voller Leistung. Zu viele Verkaufsflächen bei zu wenigen Einwohnern bedeuten geringe Auslastung, weniger Jobs und weniger Gewerbeeinnahmen.</p>
      <p><b>Finanzen:</b> Einnahmen hängen von Beschäftigung, Steuersatz, Gewerbeauslastung und Produktivität ab. Gebäude, Einwohner und Schulden verursachen laufende Kosten.</p>
      <p><b>Bildung:</b> Schulen und Universitäten werden bei größerer Bevölkerung wichtig. Gute Bildungsdeckung stabilisiert die Stadt; Universitäten steigern zusätzlich die Produktivität.</p>
      <p><b>Versorgung:</b> Zu wenig Nahrung, Wohnraum oder Arbeit führt zu Unzufriedenheit und Wegzug. Supermärkte verbessern die Lebensmittel-Logistik. Überschüssig bereitgestellte Nahrung kann über Supermärkte regional verkauft werden: bis zu 150 Einheiten je Supermarkt und Monat zu 165% des aktuellen Nahrungspreises. Der Monatsplan zieht den Wareneinsatz der exportierten Nahrung ab und zeigt damit nur die echte Handelsmarge. Der rote Großhandels-Verkauf im Markt ist dagegen ein Sofortverkauf zu 45% des Marktwertes. Nicht verkaufte Überschüsse bleiben im Lager.</p>
      <p><b>Stadtstatus:</b> Ab Großstadt zählen nicht nur Einwohner. Für Moderne Stadt und Metropole müssen auch Infrastruktur, Wohnraum, Arbeit, Bildung, Zustimmung und Versorgung stimmen.</p><p><b>Vier Jahre:</b> Nach 48 Monaten gibt es eine Amtsbilanz und eine echte Wiederwahl. Finanzen, Wachstum, Zustimmung, Versorgung und Infrastruktur entscheiden über das Wahlergebnis.</p><p><b>Verlieren:</b> Drei Monate tiefe Überschuldung, dauerhaft extrem schlechte Zustimmung, eine schwere Versorgungskrise oder eine fast entvölkerte Stadt beenden die Amtszeit. Niederlagen werden immer vor Siegbedingungen ausgewertet.</p>
      <p><b>Info-Fenster:</b> Tippe im Markt auf das <b>i</b>, den Namen eines Gebäudes oder direkt auf ein Gebäude im Stadtbild. Dort siehst du die konkreten Auswirkungen und eine Einschätzung für deine aktuelle Stadt.</p>
      <button class="btn" id="backBtn" style="width:100%">ZURÜCK</button></div></section>`;
    document.getElementById('backBtn').onclick=renderHome;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      syncInstallButton();
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      syncInstallButton();
    });
  }

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  renderHome();
})();
