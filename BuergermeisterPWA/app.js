(() => {
  'use strict';

  const SAVE_KEY = 'buergermeister1992plus.save.v1';
  const SCORE_KEY = 'buergermeister1992plus.scores.v1';
  const app = document.getElementById('app');
  const fmt = new Intl.NumberFormat('de-DE');
  const money = n => `${n < 0 ? '-' : ''}${fmt.format(Math.abs(Math.round(n)))} $`;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const choice = arr => arr[Math.floor(Math.random() * arr.length)];

  const ITEMS = {
    land: { name: 'Land', base: 120, min: 1, maintenance: 0, sell: .74, unit: 'Acker' },
    houses: { name: 'Haus', base: 430, min: 0, maintenance: 9, sell: .68, capacity: 55 },
    towers: { name: 'Hochhaus', base: 3600, min: 0, maintenance: 92, sell: .66, capacity: 420 },
    schools: { name: 'Schule', base: 2500, min: 0, maintenance: 120, sell: .63, service: 320 },
    universities: { name: 'Universität', base: 11200, min: 0, maintenance: 490, sell: .61, service: 2200 },
    shops: { name: 'Laden', base: 900, min: 0, maintenance: 28, sell: .69, jobs: 36 },
    supermarkets: { name: 'Supermarkt', base: 4300, min: 0, maintenance: 135, sell: .65, jobs: 145 },
    food: { name: 'Nahrung', base: 2, min: 0, maintenance: 0, sell: .45, unit: 'Einheiten', tradeQty: 100 }
  };

  const CITY_LEVELS = [
    [0, 'Letztes Kuhdorf'], [350, 'Dorf'], [900, 'Großes Dorf'], [1800, 'Kleinstadt'],
    [4000, 'Stadt'], [7500, 'Großstadt'], [12000, 'Moderne Stadt'], [22000, 'Metropole']
  ];

  const EVENTS = [
    { minPop:0, text:'Eine gute Ernte senkt die Lebensmittelpreise.', apply:g => { g.market.food = Math.max(1, Math.round(g.market.food * .78)); g.log('Gute Ernte: Nahrung ist billiger geworden.', 'good'); } },
    { minPop:250, text:'Eine Straßenreparatur wird fällig.', apply:g => { const c = rnd(180, 650); g.cash -= c; g.log(`Straßenreparaturen kosten ${money(c)}.`, 'bad'); } },
    { minPop:600, text:'Ein regionaler Betrieb sucht einen Standort.', apply:g => { const bonus = rnd(12, 35); g.tempJobBonus += bonus; g.log(`Neuer Betrieb schafft vorübergehend ${bonus} Arbeitsplätze.`, 'good'); } },
    { minPop:900, text:'Sturm beschädigt kommunale Gebäude.', apply:g => { const c = rnd(300, 1200); g.cash -= c; g.approval -= 2; g.log(`Sturmschäden: ${money(c)} Reparaturkosten.`, 'bad'); } },
    { minPop:1200, text:'Ein Stadtfest stärkt die Stimmung.', apply:g => { g.cash -= 250; g.approval += 5; g.log('Stadtfest: -250 $, aber die Stimmung steigt.', 'good'); } },
    { minPop:2000, text:'Investoren entdecken die Stadt.', apply:g => { g.commerceMomentum += .08; g.log('Investoren erhöhen die Gewerbedynamik.', 'good'); } },
    { minPop:3000, text:'Ein Lebensmittelskandal treibt Preise hoch.', apply:g => { g.market.food = Math.round(g.market.food * 1.45); g.approval -= 3; g.log('Lebensmittelskandal: Nahrung wird deutlich teurer.', 'bad'); } },
    { minPop:5000, text:'Fördermittel für Bildung werden bewilligt.', apply:g => { const b = 1400; g.cash += b; g.log(`Bildungsförderung: +${money(b)}.`, 'good'); } },
    { minPop:6500, text:'Wohnraummangel beschäftigt die Presse.', apply:g => { if (g.housingCapacity() < g.population * 1.04) { g.approval -= 7; g.log('Pressekritik wegen Wohnraummangel.', 'bad'); } } }
  ];

  class Game {
    constructor(data = {}) {
      Object.assign(this, {
        version: 1,
        cityName: 'Neustadt', mayorName: 'Bürgermeister', winCondition: 'modern',
        year: 1992, month: 1, cash: 1000, population: 125,
        approval: 62, taxRate: 8, foodAllocation: 125, admitLimit: 80,
        inventory: { land: 7, houses: 3, towers: 0, schools: 0, universities: 0, shops: 1, supermarkets: 0, food: 450 },
        market: {}, logs: [], score: 0, losingDebtMonths: 0, lowApprovalMonths: 0,
        severeFoodMonths: 0, commerceMomentum: 1, tempJobBonus: 0, monthsPlayed: 0,
        lastSummary: null, ended: false, ending: null
      }, data);
      this.inventory = { land:7, houses:3, towers:0, schools:0, universities:0, shops:1, supermarkets:0, food:450, ...(data.inventory || {}) };
      this.logs = Array.isArray(data.logs) ? data.logs : [];
      this.market = { ...(data.market || {}) };
      this.ensureMarket();
    }

    ensureMarket() {
      for (const [key, item] of Object.entries(ITEMS)) if (!this.market[key]) this.market[key] = item.base;
    }

    log(text, type='') {
      this.logs.unshift({ text, type, stamp: `${String(this.month).padStart(2,'0')}/${this.year}` });
      this.logs = this.logs.slice(0, 45);
    }

    status() {
      let s = CITY_LEVELS[0][1];
      for (const [threshold, name] of CITY_LEVELS) if (this.population >= threshold) s = name;
      const infra = this.infrastructureScore();
      if (this.population >= 9000 && infra >= 62) s = 'Moderne Stadt';
      if (this.population >= 16000 && infra >= 78) s = 'Metropole';
      return s;
    }

    housingCapacity() { return this.inventory.houses * ITEMS.houses.capacity + this.inventory.towers * ITEMS.towers.capacity; }
    jobsCapacity() { return this.inventory.shops * ITEMS.shops.jobs + this.inventory.supermarkets * ITEMS.supermarkets.jobs + this.tempJobBonus + Math.round(this.population * .12); }
    schoolCapacity() { return this.inventory.schools * ITEMS.schools.service + this.inventory.universities * ITEMS.universities.service; }
    landUsed() { return this.inventory.houses + this.inventory.towers * 2 + this.inventory.schools * 3 + this.inventory.universities * 8 + this.inventory.shops + this.inventory.supermarkets * 3; }
    landFree() { return Math.max(0, this.inventory.land - this.landUsed()); }

    infrastructureScore() {
      const housing = clamp(this.housingCapacity() / Math.max(1,this.population) * 24, 0, 24);
      const education = clamp(this.schoolCapacity() / Math.max(1,this.population) * 18, 0, 22);
      const commerce = clamp(this.jobsCapacity() / Math.max(1,this.population * .48) * 22, 0, 22);
      const diversity = clamp((this.inventory.schools>0?6:0)+(this.inventory.universities>0?9:0)+(this.inventory.supermarkets>0?7:0),0,22);
      return Math.round(housing + education + commerce + diversity);
    }

    canBuy(key) {
      const qty = ITEMS[key].tradeQty || 1;
      const price = this.market[key] * qty;
      if (this.cash < price) return false;
      if (key !== 'land' && key !== 'food') {
        const footprint = key==='universities'?8:key==='schools'||key==='supermarkets'?3:key==='towers'?2:1;
        if (this.landFree() < footprint) return false;
      }
      return true;
    }

    buy(key) {
      if (!this.canBuy(key)) return;
      const qty = ITEMS[key].tradeQty || 1;
      this.cash -= this.market[key] * qty;
      this.inventory[key] += qty;
      this.nudgePrice(key, true);
      this.log(`${ITEMS[key].name} gekauft.`);
      saveGame(this); renderGame(this);
    }

    sell(key) {
      const item = ITEMS[key];
      const qty = item.tradeQty || 1;
      if (this.inventory[key] - qty < item.min) return;
      if (key === 'land' && this.inventory.land - 1 < this.landUsed()) return;
      const revenue = Math.round(this.market[key] * item.sell * qty);
      this.inventory[key] -= qty;
      this.cash += revenue;
      this.nudgePrice(key, false);
      this.log(`${item.name} verkauft: +${money(revenue)}.`);
      saveGame(this); renderGame(this);
    }

    nudgePrice(key, bought) {
      const factor = bought ? 1.035 : .985;
      this.market[key] = Math.max(1, Math.round(this.market[key] * factor));
    }

    calculateAttractiveness() {
      const housingRatio = this.housingCapacity() / Math.max(1, this.population);
      const jobsRatio = this.jobsCapacity() / Math.max(1, this.population * .47);
      const eduRatio = this.schoolCapacity() / Math.max(1, this.population * .22);
      const foodSecurity = this.inventory.food / Math.max(1, this.population);
      let a = 48;
      a += clamp((10 - this.taxRate) * 2.5, -28, 25);
      a += clamp((housingRatio - 1) * 28, -35, 20);
      a += clamp((jobsRatio - 1) * 22, -30, 16);
      a += clamp(eduRatio * 10, 0, 13);
      a += clamp(foodSecurity * 2, 0, 8);
      a += (this.approval - 50) * .18;
      return Math.round(clamp(a, 0, 100));
    }

    monthlyMaintenance() {
      return Math.round(Object.entries(ITEMS).reduce((sum,[key,item]) => sum + (item.maintenance || 0) * (this.inventory[key] || 0), 0));
    }

    monthlyRevenue() {
      const baseTax = this.population * (this.taxRate / 100) * 13;
      const commercial = (this.inventory.shops * 42 + this.inventory.supermarkets * 165) * this.commerceMomentum;
      const productivity = 1 + clamp(this.inventory.universities * .025, 0, .25);
      return Math.round((baseTax + commercial) * productivity);
    }

    advanceMonth(settings) {
      if (this.ended) return;
      this.taxRate = clamp(Number(settings.taxRate)||0, 0, 30);
      this.foodAllocation = clamp(Math.round(Number(settings.foodAllocation)||0), 0, this.inventory.food);
      this.admitLimit = clamp(Math.round(Number(settings.admitLimit)||0), 0, 5000);

      const oldPop = this.population;
      const oldCash = this.cash;
      const foodNeed = Math.ceil(this.population * 1.0);
      const foodServed = Math.min(this.foodAllocation, this.inventory.food);
      const foodRatio = foodNeed ? foodServed / foodNeed : 1;
      this.inventory.food -= foodServed;

      const revenue = this.monthlyRevenue();
      const maintenance = this.monthlyMaintenance();
      this.cash += revenue - maintenance;

      let approvalDelta = 0;
      approvalDelta += this.taxRate <= 7 ? 3 : this.taxRate <= 11 ? 0 : this.taxRate <= 16 ? -4 : -9;
      approvalDelta += foodRatio >= 1 ? 2 : foodRatio >= .85 ? -3 : foodRatio >= .65 ? -9 : -18;
      const crowding = this.housingCapacity() / Math.max(1,this.population);
      approvalDelta += crowding >= 1.08 ? 2 : crowding >= 1 ? 0 : -8;
      const jobRatio = this.jobsCapacity() / Math.max(1,this.population * .47);
      approvalDelta += jobRatio >= 1 ? 2 : jobRatio >= .8 ? -2 : -6;
      const educationRatio = this.schoolCapacity() / Math.max(1,this.population * .2);
      approvalDelta += educationRatio >= 1 ? 1 : this.population > 500 ? -2 : 0;
      this.approval = clamp(this.approval + approvalDelta, 0, 100);

      let leaving = 0;
      if (foodRatio < 1) leaving += Math.round(this.population * (1-foodRatio) * .23);
      if (crowding < .95) leaving += Math.round(this.population * (.95-crowding) * .12);
      if (this.approval < 35) leaving += Math.round(this.population * ((35-this.approval)/100) * .035);

      const attractiveness = this.calculateAttractiveness();
      const housingSlots = Math.max(0, this.housingCapacity() - (this.population - leaving));
      const potential = Math.max(0, Math.round((18 + this.population * .018) * (attractiveness / 52) * (0.85 + Math.random()*.3)));
      const newcomers = Math.min(this.admitLimit, housingSlots, potential);
      this.population = Math.max(0, this.population - leaving + newcomers);

      const births = Math.max(0, Math.round(this.population * (foodRatio >= .9 ? .0015 : 0)));
      this.population += births;

      if (foodRatio < .65) this.severeFoodMonths++; else this.severeFoodMonths = 0;
      if (this.cash < -15000) this.losingDebtMonths++; else this.losingDebtMonths = Math.max(0,this.losingDebtMonths-1);
      if (this.approval < 18) this.lowApprovalMonths++; else this.lowApprovalMonths = 0;

      this.tempJobBonus = Math.max(0, Math.round(this.tempJobBonus * .75));
      this.commerceMomentum = clamp(this.commerceMomentum * .995, .85, 1.28);
      this.monthsPlayed++;

      this.lastSummary = {
        oldPop, newPop:this.population, newcomers, leaving, births, revenue, maintenance,
        oldCash, newCash:this.cash, foodServed, foodNeed, foodRatio, attractiveness, approvalDelta
      };

      this.log(`Monat: ${money(revenue)} Einnahmen, ${money(maintenance)} Unterhalt, ${newcomers} Zuzüge, ${leaving} Wegzüge.`);

      this.rollEvent();
      this.updateMarket();
      this.checkEnd();
      if (!this.ended) this.incrementDate();
      this.updateScore();
      saveGame(this);
      renderGame(this, true);
    }

    rollEvent() {
      if (Math.random() > .34) return;
      const possible = EVENTS.filter(e => this.population >= e.minPop);
      if (!possible.length) return;
      choice(possible).apply(this);
      this.approval = clamp(this.approval,0,100);
    }

    updateMarket() {
      const inflation = 1.002 + Math.min(.008, this.monthsPlayed * .00008);
      for (const [key,item] of Object.entries(ITEMS)) {
        let factor = inflation * (0.965 + Math.random()*.07);
        if (key === 'houses' || key === 'towers') factor *= this.housingCapacity() < this.population * 1.1 ? 1.022 : .995;
        if (key === 'food') factor *= this.inventory.food < this.population * 1.5 ? 1.028 : .99;
        if (key === 'land') factor *= 1 + clamp(this.population/100000,0,.035);
        this.market[key] = Math.max(1, Math.round(this.market[key] * factor));
        const floor = Math.round(item.base * .55);
        const ceiling = Math.round(item.base * 4.2);
        this.market[key] = clamp(this.market[key], floor, ceiling);
      }
    }

    incrementDate() {
      this.month++;
      if (this.month > 12) { this.month = 1; this.year++; }
    }

    updateScore() {
      this.score = Math.max(0, Math.round(this.population*4 + this.cash*.18 + this.infrastructureScore()*230 + this.approval*65 - Math.max(0,-this.cash)*.5));
    }

    checkEnd() {
      let win = false, reason = '';
      if (this.winCondition === 'cash' && this.cash >= 200000) { win=true; reason='Die Stadtkasse hat 200.000 $ überschritten.'; }
      if (this.winCondition === 'population' && this.population >= 10000) { win=true; reason='Deine Stadt hat 10.000 Einwohner erreicht.'; }
      if (this.winCondition === 'modern' && this.status() === 'Moderne Stadt') { win=true; reason='Aus dem Kuhdorf ist eine moderne Stadt geworden.'; }
      if (this.winCondition === 'fouryears' && this.monthsPlayed >= 48) { win=true; reason='Vier Jahre Amtszeit sind geschafft.'; }
      if (win) return this.finish(true, reason);

      if (this.losingDebtMonths >= 3) return this.finish(false, 'Die Stadt war drei Monate tief überschuldet. Die Kommunalaufsicht übernimmt.');
      if (this.lowApprovalMonths >= 3) return this.finish(false, 'Deine Zustimmung lag zu lange unter 18 %. Der Gemeinderat entzieht dir das Vertrauen.');
      if (this.severeFoodMonths >= 2) return this.finish(false, 'Zwei Monate schwere Versorgungskrise: Die Stadtverwaltung bricht zusammen.');
      if (this.population < 35 && this.monthsPlayed >= 6) return this.finish(false, 'Fast alle Einwohner haben die Stadt verlassen.');
    }

    finish(win, reason) {
      this.ended = true;
      this.ending = { win, reason };
      this.updateScore();
      addScore(this);
    }
  }

  function newGame(data) {
    const g = new Game({
      cityName: data.cityName.trim() || 'Neustadt',
      mayorName: data.mayorName.trim() || 'Bürgermeister',
      winCondition: data.winCondition
    });
    g.log(`${g.mayorName} übernimmt das Rathaus von ${g.cityName}.`, 'good');
    g.log('Startkapital: 1.000 $. Viel Erfolg.');
    saveGame(g); renderGame(g);
  }

  function saveGame(g) { localStorage.setItem(SAVE_KEY, JSON.stringify(g)); }
  function loadGame() {
    try { const raw = localStorage.getItem(SAVE_KEY); return raw ? new Game(JSON.parse(raw)) : null; }
    catch { return null; }
  }
  function addScore(g) {
    const scores = getScores();
    scores.push({ city:g.cityName, mayor:g.mayorName, score:g.score, pop:g.population, cash:g.cash, win:!!g.ending?.win, date:new Date().toISOString() });
    scores.sort((a,b) => b.score-a.score);
    localStorage.setItem(SCORE_KEY, JSON.stringify(scores.slice(0,10)));
  }
  function getScores() { try { return JSON.parse(localStorage.getItem(SCORE_KEY) || '[]'); } catch { return []; } }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

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
        </div>
        <p class="footer-note">Eigenständige Neuinterpretation – keine Original-ROMs oder Originalgrafiken.</p>
      </div></section>`;
    document.getElementById('newBtn').onclick = renderSetup;
    document.getElementById('continueBtn').onclick = () => { const g=loadGame(); if(g) renderGame(g); };
    document.getElementById('scoresBtn').onclick = renderScores;
    document.getElementById('rulesBtn').onclick = renderRules;
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
        <option value="fouryears">4 Jahre Amtszeit / Bestwert</option>
      </select></div>
      <div class="two-col"><button class="btn" id="backBtn">ZURÜCK</button><button class="btn primary" id="startBtn">SPIEL STARTEN</button></div>
      <p class="hint">Du beginnst bewusst klein: 1.000 $, drei Häuser, ein Laden und 125 Einwohner.</p>
    </div></section>`;
    document.getElementById('backBtn').onclick = renderHome;
    document.getElementById('startBtn').onclick = () => newGame({
      cityName:document.getElementById('cityName').value,
      mayorName:document.getElementById('mayorName').value,
      winCondition:document.getElementById('winCondition').value
    });
  }

  function cityBuildings(g) {
    const elems = [];
    const add = (cls, count, yShift=0) => {
      const max = cls==='tower'?7:cls==='house'?10:cls==='shop'?5:4;
      for (let i=0;i<Math.min(count,max);i++) {
        const left = 3 + ((i*17 + count*7 + (cls.length*11)) % 88);
        const bottom = 75 + ((i%2)*4) + yShift;
        elems.push(`<i class="building ${cls}" style="left:${left}%;bottom:${bottom}px;transform:scale(${.82 + (i%3)*.08});z-index:${2+(i%3)}"></i>`);
      }
    };
    add('house', g.inventory.houses);
    add('shop', g.inventory.shops + g.inventory.supermarkets, 1);
    add('school', g.inventory.schools + g.inventory.universities, 3);
    add('tower', g.inventory.towers, 0);
    return elems.join('');
  }

  function renderGame(g, showSummary=false) {
    const attract = g.calculateAttractiveness();
    const jobRatio = Math.round(g.jobsCapacity()/Math.max(1,g.population*.47)*100);
    const housingRatio = Math.round(g.housingCapacity()/Math.max(1,g.population)*100);
    app.innerHTML = `<section class="crt"><div class="screen">
      <div class="topbar">
        <div class="stat"><b>${esc(g.cityName)}</b><span>${esc(g.mayorName)} · ${g.status()}</span></div>
        <div class="stat"><b>${String(g.month).padStart(2,'0')}/${g.year}</b><span>Datum</span></div>
        <div class="stat"><b class="${g.cash<0?'bad':''}">${money(g.cash)}</b><span>Stadtkasse</span></div>
        <div class="stat"><b>${fmt.format(g.population)}</b><span>Einwohner</span></div>
        <div class="stat"><b class="${g.approval<30?'bad':g.approval>70?'good':''}">${g.approval} %</b><span>Zustimmung</span></div>
      </div>

      <div class="game-grid">
        <div>
          <div class="panel">
            <h2>STADTBILD · ${esc(g.status())}</h2>
            <div class="city-scene">
              <i class="cloud" style="left:8%;top:14%"></i><i class="cloud" style="left:68%;top:22%;transform:scale(.7)"></i>
              <div class="city-label">${esc(g.cityName)} · Infrastruktur ${g.infrastructureScore()}/100</div>
              <i class="road-h"></i><i class="road-v"></i>${cityBuildings(g)}
            </div>
          </div>

          <div class="panel" style="margin-top:10px"><h2>KAUFEN / VERKAUFEN</h2><div class="market">
            ${Object.entries(ITEMS).map(([key,item]) => `
              <div class="market-row">
                <div class="market-name"><b>${item.name}</b><small>Bestand: ${fmt.format(g.inventory[key])}${key==='land'?` · frei ${g.landFree()}`:''}</small></div>
                <div class="price">${money(g.market[key])}${item.tradeQty?'<small>/Stk.</small>':''}</div>
                <button data-buy="${key}" ${g.canBuy(key)?'':'disabled'}>+${item.tradeQty||1}</button>
                <button data-sell="${key}" ${(g.inventory[key]-(item.tradeQty||1)>=item.min && !(key==='land'&&g.inventory.land-1<g.landUsed()))?'':'disabled'}>-${item.tradeQty||1}</button>
              </div>`).join('')}
          </div></div>
        </div>

        <div>
          <div class="panel"><h2>STADTWERTE</h2><div class="resource-grid">
            <div class="resource"><span>Wohnplätze</span><b class="${housingRatio<100?'bad':'good'}">${fmt.format(g.housingCapacity())}</b></div>
            <div class="resource"><span>Arbeitsplätze*</span><b class="${jobRatio<85?'bad':''}">${fmt.format(g.jobsCapacity())}</b></div>
            <div class="resource"><span>Bildungsplätze</span><b>${fmt.format(g.schoolCapacity())}</b></div>
            <div class="resource"><span>Nahrung</span><b class="${g.inventory.food<g.population?'bad':''}">${fmt.format(g.inventory.food)}</b></div>
            <div class="resource"><span>Freies Land</span><b>${fmt.format(g.landFree())}</b></div>
            <div class="resource"><span>Attraktivität</span><b>${attract}/100</b></div>
          </div><p class="hint">*inkl. kleiner Grundbeschäftigung und temporärer Effekte.</p></div>

          <div class="panel" style="margin-top:10px"><h2>POLITISCHE LAGE</h2>
            <div class="resource"><span>Zustimmung</span><b>${g.approval}%</b></div><div class="status-meter"><i style="width:${g.approval}%"></i></div>
            <div class="resource"><span>Wohnraumauslastung</span><b>${housingRatio}%</b></div>
            <div class="resource"><span>Arbeitsplatzdeckung</span><b>${jobRatio}%</b></div>
            <div class="resource"><span>Monatsunterhalt</span><b>${money(g.monthlyMaintenance())}</b></div>
            <div class="resource"><span>Prognose Einnahmen</span><b>${money(g.monthlyRevenue())}</b></div>
          </div>

          <div class="panel" style="margin-top:10px"><h2>RATHAUS-PROTOKOLL</h2>
            <div class="event-log">${g.logs.map(l=>`<div class="log-line ${l.type}"><span class="hint">${l.stamp}</span> ${esc(l.text)}</div>`).join('') || '<div class="hint">Noch keine Meldungen.</div>'}</div>
          </div>

          <div class="bottom-actions">
            <button class="btn small" id="menuBtn">MENÜ</button>
            <button class="btn primary small" id="monthBtn">MONAT ABSCHLIESSEN</button>
          </div>
        </div>
      </div>
      <div class="footer-note">Ziel: ${winText(g.winCondition)} · Punktestand ${fmt.format(g.score)}</div>
    </div></section>`;

    app.querySelectorAll('[data-buy]').forEach(b => b.onclick=()=>g.buy(b.dataset.buy));
    app.querySelectorAll('[data-sell]').forEach(b => b.onclick=()=>g.sell(b.dataset.sell));
    document.getElementById('menuBtn').onclick = () => { saveGame(g); renderHome(); };
    document.getElementById('monthBtn').onclick = () => openMonthModal(g);

    if (g.ended) openEnding(g);
    else if (showSummary && g.lastSummary) openSummary(g);
  }

  function openMonthModal(g) {
    const maxFood = g.inventory.food;
    const defaultFood = Math.min(maxFood, Math.ceil(g.population*1.02));
    const defaultAdmit = Math.max(0, Math.min(1000, g.housingCapacity()-g.population));
    const overlay = document.createElement('div'); overlay.className='modal-backdrop';
    overlay.innerHTML = `<div class="modal"><div class="hint">MONATSENDE ${String(g.month).padStart(2,'0')}/${g.year}</div><h2>Entscheidungen des Bürgermeisters</h2>
      <div class="field"><label>Wohnsteuer: <b id="taxOut">${g.taxRate}%</b></label><input id="tax" type="range" min="0" max="30" value="${g.taxRate}"><div class="hint">Niedrige Steuern fördern Zuzug; hohe Steuern bringen mehr Geld, kosten aber Zustimmung.</div></div>
      <div class="field"><label>Nahrung für Einwohner: <b id="foodOut">${fmt.format(defaultFood)}</b></label><input id="food" type="range" min="0" max="${maxFood}" value="${defaultFood}"><div class="hint">Bedarf aktuell ungefähr ${fmt.format(g.population)} Einheiten.</div></div>
      <div class="field"><label>Maximal aufzunehmende Zuzügler</label><input id="admit" type="number" min="0" max="5000" value="${defaultAdmit}"></div>
      <div class="two-col"><button class="btn" id="cancelMonth">ABBRECHEN</button><button class="btn primary" id="confirmMonth">MONAT BERECHNEN</button></div>
    </div>`;
    document.body.appendChild(overlay);
    const tax=overlay.querySelector('#tax'), food=overlay.querySelector('#food');
    tax.oninput=()=>overlay.querySelector('#taxOut').textContent=`${tax.value}%`;
    food.oninput=()=>overlay.querySelector('#foodOut').textContent=fmt.format(Number(food.value));
    overlay.querySelector('#cancelMonth').onclick=()=>overlay.remove();
    overlay.querySelector('#confirmMonth').onclick=()=>{
      const settings={taxRate:tax.value,foodAllocation:food.value,admitLimit:overlay.querySelector('#admit').value}; overlay.remove(); g.advanceMonth(settings);
    };
  }

  function openSummary(g) {
    const s=g.lastSummary; const overlay=document.createElement('div'); overlay.className='modal-backdrop';
    const balance=s.revenue-s.maintenance;
    overlay.innerHTML=`<div class="modal"><div class="hint">MONATSBERICHT</div><h2>Bilanz des vergangenen Monats</h2>
      <div class="month-summary">
        <div class="summary-row"><span>Steuern & Gewerbe</span><b class="good">+${money(s.revenue)}</b></div>
        <div class="summary-row"><span>Unterhalt</span><b class="bad">-${money(s.maintenance)}</b></div>
        <div class="summary-row"><span>Operativer Saldo</span><b class="${balance<0?'bad':'good'}">${money(balance)}</b></div>
        <div class="summary-row"><span>Stadtkasse</span><b>${money(g.cash)}</b></div>
        <div class="summary-row"><span>Zuzüge</span><b class="good">+${s.newcomers}</b></div>
        <div class="summary-row"><span>Wegzüge</span><b class="${s.leaving?'bad':''}">-${s.leaving}</b></div>
        <div class="summary-row"><span>Nahrung</span><b class="${s.foodRatio<.9?'bad':''}">${s.foodServed}/${s.foodNeed}</b></div>
        <div class="summary-row"><span>Attraktivität</span><b>${s.attractiveness}/100</b></div>
      </div>
      <p>Einwohner: <b class="kpi-big">${fmt.format(s.oldPop)} → ${fmt.format(s.newPop)}</b></p>
      <p>Zustimmungsänderung: <b class="${s.approvalDelta<0?'bad':'good'}">${s.approvalDelta>=0?'+':''}${s.approvalDelta} Punkte</b></p>
      <button class="btn primary center" id="closeSummary" style="width:100%">WEITER</button>
    </div>`;
    document.body.appendChild(overlay); overlay.querySelector('#closeSummary').onclick=()=>overlay.remove();
  }

  function openEnding(g) {
    const overlay=document.createElement('div'); overlay.className='modal-backdrop';
    overlay.innerHTML=`<div class="modal overlay-message"><div class="hint">SPIELENDE</div>
      <h1 class="${g.ending.win?'good':'bad'}">${g.ending.win?'GEWONNEN!':'ABGEWÄHLT!'}</h1>
      <p>${esc(g.ending.reason)}</p>
      <p class="kpi-big">${fmt.format(g.score)} Punkte</p>
      <p>${fmt.format(g.population)} Einwohner · ${money(g.cash)} · ${g.status()}</p>
      <div class="two-col"><button class="btn" id="endHome">HAUPTMENÜ</button><button class="btn primary" id="endNew">NEUES SPIEL</button></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#endHome').onclick=()=>{overlay.remove();renderHome();};
    overlay.querySelector('#endNew').onclick=()=>{overlay.remove();renderSetup();};
  }

  function winText(k) { return ({cash:'200.000 $ Stadtkasse',population:'10.000 Einwohner',modern:'Moderne Stadt',fouryears:'4 Jahre Amtszeit'})[k] || k; }

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
      <p><b>Wachstum:</b> Menschen ziehen vor allem bei freien Wohnungen, Arbeitsplätzen, niedrigen Steuern, Versorgung und guter Stimmung zu.</p>
      <p><b>Finanzen:</b> Einwohner und Gewerbe zahlen Einnahmen. Fast jedes Gebäude erzeugt laufenden Unterhalt. Schnelles Bauen ohne Einnahmebasis kann die Stadt ruinieren.</p>
      <p><b>Versorgung:</b> Zu wenig Nahrung, Wohnraum oder Arbeit führt zu Unzufriedenheit und Wegzug. Schulen und Universitäten werden bei größerer Bevölkerung wichtiger.</p>
      <p><b>Verlieren:</b> Drei Monate tiefe Überschuldung, dauerhaft extrem schlechte Zustimmung, eine schwere Versorgungskrise oder eine fast entvölkerte Stadt beenden die Amtszeit.</p>
      <button class="btn" id="backBtn" style="width:100%">ZURÜCK</button></div></section>`;
    document.getElementById('backBtn').onclick=renderHome;
  }

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  renderHome();
})();
