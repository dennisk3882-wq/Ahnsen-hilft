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
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.icon-close').onclick = close;
    overlay.querySelector('#installHelpClose').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
  }

  const ITEMS = {
    land: {
      name: 'Land', base: 120, min: 1, maintenance: 0, sell: .74, unit: 'Acker', footprint: 0,
      short: 'Baufläche für die weitere Stadtentwicklung.'
    },
    houses: {
      name: 'Haus', base: 430, min: 0, maintenance: 9, sell: .68, capacity: 55, footprint: 1,
      short: 'Schafft 55 Wohnplätze und ermöglicht Zuzug.'
    },
    towers: {
      name: 'Hochhaus', base: 3600, min: 0, maintenance: 92, sell: .66, capacity: 420, footprint: 2,
      short: 'Viel Wohnraum auf wenig Land, aber hoher Unterhalt.'
    },
    schools: {
      name: 'Schule', base: 2500, min: 0, maintenance: 120, sell: .63, service: 320, footprint: 3,
      short: 'Versorgt bis zu 320 Einwohner mit Bildungsinfrastruktur.'
    },
    universities: {
      name: 'Universität', base: 11200, min: 0, maintenance: 490, sell: .61, service: 2200, footprint: 8,
      short: 'Große Bildungsreserve und Produktivitätsschub für die Stadt.'
    },
    shops: {
      name: 'Geschäft', base: 900, min: 0, maintenance: 28, sell: .69, jobs: 36, footprint: 1,
      commerceTax: 55, demandPop: 180,
      short: 'Schafft Arbeitsplätze und Gewerbeeinnahmen – wenn genügend Kunden da sind.'
    },
    supermarkets: {
      name: 'Supermarkt', base: 4300, min: 0, maintenance: 135, sell: .65, jobs: 145, footprint: 3,
      commerceTax: 220, demandPop: 850,
      short: 'Großer Arbeitgeber, Gewerbesteuer und bessere Lebensmittelversorgung.'
    },
    food: {
      name: 'Nahrung', base: 2, min: 0, maintenance: 0, sell: .45, unit: 'Einheiten', tradeQty: 100, footprint: 0,
      short: 'Wird monatlich verbraucht. Versorgungsausfälle sind sehr gefährlich.'
    }
  };

  const CITY_LEVELS = [
    [0, 'Letztes Kuhdorf'], [350, 'Dorf'], [900, 'Großes Dorf'], [1800, 'Kleinstadt'],
    [4000, 'Stadt'], [7500, 'Großstadt'], [12000, 'Moderne Stadt'], [22000, 'Metropole']
  ];



  const CITY_STAGE_ORDER = ['Letztes Kuhdorf', 'Dorf', 'Großes Dorf', 'Kleinstadt', 'Stadt', 'Großstadt', 'Moderne Stadt', 'Metropole'];
  const CITY_STAGE_IMAGES = {
    kuhdorf: 'assets/stage-kuhdorf.webp',
    dorf: 'assets/stage-dorf.webp',
    kleinstadt: 'assets/stage-kleinstadt.webp',
    stadt: 'assets/stage-stadt.webp',
    modern: 'assets/stage-modern.webp'
  };
  const CITY_PROMOTIONS = {
    'Dorf': { cash: 450, title: 'Anerkennung als Dorf', subject: 'Landesamt für Kommunalentwicklung' },
    'Großes Dorf': { cash: 700, title: 'Förderung für wachsendes Dorf', subject: 'Regionale Entwicklungsstelle' },
    'Kleinstadt': { cash: 1200, title: 'Aufstufung zur Kleinstadt', subject: 'Niedersächsisches Innenministerium' },
    'Stadt': { cash: 1800, title: 'Offizieller Stadtstatus', subject: 'Ministerium für Landesentwicklung' },
    'Großstadt': { cash: 3000, title: 'Starthilfe für die Großstadt', subject: 'Landesdirektion Kommunen' },
    'Moderne Stadt': { cash: 5000, title: 'Zukunftsprogramm Moderne Stadt', subject: 'Bundesförderung Zukunft Kommunen' },
    'Metropole': { cash: 9000, title: 'Metropolenförderung', subject: 'Bundeskanzleramt · Kommunale Sondermittel' }
  };
  const CITY_HOTSPOTS = {
    kuhdorf: [
      { key:'houses', left:5, top:25, width:17, height:19 },
      { key:'houses', left:25, top:25, width:16, height:19 },
      { key:'shops', left:52, top:27, width:16, height:15 },
      { key:'land', left:72, top:22, width:22, height:24 },
      { key:'land', left:7, top:48, width:29, height:30 },
      { key:'land', left:55, top:48, width:34, height:30 }
    ],
    dorf: [
      { key:'houses', left:4, top:22, width:11, height:15 },
      { key:'houses', left:17, top:22, width:12, height:15 },
      { key:'houses', left:31, top:22, width:11, height:15 },
      { key:'shops', left:47, top:23, width:14, height:14 },
      { key:'schools', left:77, top:22, width:13, height:15 },
      { key:'houses', left:6, top:52, width:12, height:17 },
      { key:'houses', left:76, top:52, width:12, height:17 },
      { key:'land', left:35, top:46, width:28, height:22 }
    ],
    kleinstadt: [
      { key:'houses', left:4, top:14, width:10, height:12 },
      { key:'houses', left:16, top:14, width:12, height:12 },
      { key:'shops', left:4, top:35, width:18, height:16 },
      { key:'shops', left:28, top:37, width:10, height:10 },
      { key:'shops', left:40, top:37, width:10, height:10 },
      { key:'supermarkets', left:52, top:37, width:10, height:10 },
      { key:'schools', left:64, top:14, width:18, height:14 },
      { key:'houses', left:5, top:58, width:15, height:14 },
      { key:'houses', left:24, top:58, width:15, height:14 },
      { key:'houses', left:43, top:58, width:15, height:14 },
      { key:'shops', left:76, top:54, width:15, height:14 }
    ],
    stadt: [
      { key:'towers', left:3, top:14, width:15, height:23 },
      { key:'schools', left:41, top:14, width:20, height:23 },
      { key:'schools', left:73, top:13, width:14, height:25 },
      { key:'shops', left:39, top:49, width:24, height:17 },
      { key:'supermarkets', left:68, top:56, width:10, height:10 },
      { key:'houses', left:8, top:61, width:18, height:13 },
      { key:'houses', left:28, top:60, width:11, height:14 }
    ],
    modern: [
      { key:'schools', left:40, top:16, width:21, height:16 },
      { key:'shops', left:22, top:37, width:13, height:12 },
      { key:'shops', left:72, top:33, width:16, height:16 },
      { key:'universities', left:4, top:61, width:22, height:16 },
      { key:'supermarkets', left:65, top:59, width:19, height:16 },
      { key:'towers', left:2, top:8, width:17, height:22 },
      { key:'towers', left:78, top:5, width:17, height:23 }
    ]
  };

  const EVENTS = [
    { minPop:0, apply:g => { g.market.food = Math.max(1, Math.floor(g.market.food * .72)); g.log('Gute Ernte: Nahrung ist billiger geworden.', 'good'); } },
    { minPop:250, apply:g => { const c = rnd(180, 650); g.cash -= c; g.log(`Straßenreparaturen kosten ${money(c)}.`, 'bad'); } },
    { minPop:600, apply:g => { const bonus = rnd(12, 35); g.tempJobBonus += bonus; g.log(`Ein regionaler Betrieb schafft vorübergehend ${bonus} Arbeitsplätze.`, 'good'); } },
    { minPop:900, apply:g => { const c = rnd(300, 1200); g.cash -= c; g.approval -= 2; g.log(`Sturmschäden verursachen ${money(c)} Reparaturkosten.`, 'bad'); } },
    { minPop:1200, apply:g => { g.cash -= 250; g.approval += 5; g.log('Stadtfest: -250 $, aber die Stimmung steigt.', 'good'); } },
    { minPop:2000, apply:g => { g.commerceMomentum = clamp(g.commerceMomentum + .08, .75, 1.35); g.log('Investoren erhöhen die Gewerbedynamik.', 'good'); } },
    { minPop:3000, apply:g => { g.market.food = Math.round(g.market.food * 1.45); g.approval -= 3; g.log('Lebensmittelskandal: Nahrung wird deutlich teurer.', 'bad'); } },
    { minPop:5000, apply:g => { const b = 1400; g.cash += b; g.log(`Bildungsförderung: +${money(b)}.`, 'good'); } },
    { minPop:6500, apply:g => { if (g.housingCapacity() < g.population * 1.04) { g.approval -= 7; g.log('Pressekritik wegen Wohnraummangel.', 'bad'); } } },
    { minPop:1500, apply:g => { if (g.commerceUtilization() < .55) { g.approval -= 2; g.log('Mehrere Geschäfte klagen über zu wenig Kundschaft.', 'bad'); } } }
  ];

  class Game {
    constructor(data = {}) {
      const loadedVersion = Number(data.version || 2);
      Object.assign(this, {
        version: 4,
        cityName: 'Neustadt', mayorName: 'Bürgermeister', winCondition: 'modern',
        year: 1992, month: 1, cash: 1000, population: 125,
        approval: 62, taxRate: 8, foodAllocation: 125, admitLimit: 80,
        inventory: { land: 7, houses: 3, towers: 0, schools: 0, universities: 0, shops: 1, supermarkets: 0, food: 450 },
        market: {}, logs: [], score: 0, losingDebtMonths: 0, lowApprovalMonths: 0,
        severeFoodMonths: 0, commerceMomentum: 1, tempJobBonus: 0, monthsPlayed: 0,
        lastSummary: null, ended: false, ending: null, seenPromotions: [], promotionQueue: []
      }, data);
      this.version = 4;
      this.inventory = { land:7, houses:3, towers:0, schools:0, universities:0, shops:1, supermarkets:0, food:450, ...(data.inventory || {}) };
      this.logs = Array.isArray(data.logs) ? data.logs : [];
      this.market = { ...(data.market || {}) };
      this.seenPromotions = Array.isArray(data.seenPromotions) ? data.seenPromotions : [];
      this.promotionQueue = Array.isArray(data.promotionQueue) ? data.promotionQueue : [];
      this.ensureMarket();
      if (loadedVersion < 4) this.normalizeLegacyAssetPrices();
    }

    ensureMarket() {
      for (const [key, item] of Object.entries(ITEMS)) if (!this.market[key]) this.market[key] = item.base;
    }

    supermarketTargetPrice() {
      const base = ITEMS.supermarkets.base;
      const inflation = Math.pow(1.024, Math.max(0, this.monthsPlayed) / 12);
      // Ein Supermarkt wird erst bei echter regionaler Nachfrage knapper.
      const desired = Math.max(.15, this.population / 1100);
      const gap = desired - this.inventory.supermarkets;
      const demand = clamp(.94 + gap * .08, .88, 1.24);
      return Math.max(1, base * inflation * demand);
    }

    normalizeLegacySupermarketPrice() {
      const target = this.supermarketTargetPrice();
      this.market.supermarkets = Math.max(1, Math.round(clamp(this.market.supermarkets, target * .80, target * 1.25)));
    }

    assetTargetPrice(key) {
      const item = ITEMS[key];
      if (!item || key === 'food') return item ? item.base : 1;
      if (key === 'supermarkets') return this.supermarketTargetPrice();

      const inflation = Math.pow(1.024, Math.max(0, this.monthsPlayed) / 12);
      let demand = 1;

      if (key === 'land') {
        const free = this.landFree();
        demand = free < 2 ? 1.18 : free < 5 ? 1.08 : .98;
      } else if (key === 'houses' || key === 'towers') {
        const ratio = this.housingCapacity() / Math.max(1, this.population);
        demand = clamp(1 + (1.08 - ratio) * .50, .86, 1.26);
      } else if (key === 'schools') {
        demand = this.population < 350 ? .90 : clamp(.96 + (1 - this.educationCoverage()) * .18, .90, 1.17);
      } else if (key === 'universities') {
        demand = this.population < 1800 ? .86 : clamp(.94 + (1 - this.educationCoverage()) * .16, .88, 1.16);
      } else if (key === 'shops') {
        demand = clamp(.94 + this.commerceUtilization() * .12, .94, 1.08);
      }

      return Math.max(1, item.base * inflation * demand);
    }

    normalizeLegacyAssetPrices() {
      // Versionen bis v3 konnten Gebäude durch monatliches Aufmultiplizieren künstlich verteuern.
      // Nahrung bleibt absichtlich unberührt, weil ihr Markt eine eigene Versorgungslogik hat.
      for (const key of Object.keys(ITEMS)) {
        if (key === 'food') continue;
        const target = this.assetTargetPrice(key);
        const current = this.market[key] || ITEMS[key].base;
        this.market[key] = Math.max(1, Math.round(clamp(current, target * .80, target * 1.25)));
      }
    }

    log(text, type='') {
      this.logs.unshift({ text, type, stamp: `${String(this.month).padStart(2,'0')}/${this.year}` });
      this.logs = this.logs.slice(0, 55);
    }

    status() {
      let s = CITY_LEVELS[0][1];
      for (const [threshold, name] of CITY_LEVELS) if (this.population >= threshold) s = name;
      const infra = this.infrastructureScore();
      if (this.population >= 9000 && infra >= 62) s = 'Moderne Stadt';
      if (this.population >= 16000 && infra >= 78) s = 'Metropole';
      return s;
    }


    statusRank(name = this.status()) {
      const idx = CITY_STAGE_ORDER.indexOf(name);
      return idx === -1 ? 0 : idx;
    }

    visualStage(name = this.status()) {
      if (name === 'Letztes Kuhdorf') return 'kuhdorf';
      if (name === 'Dorf' || name === 'Großes Dorf') return 'dorf';
      if (name === 'Kleinstadt') return 'kleinstadt';
      if (name === 'Stadt' || name === 'Großstadt') return 'stadt';
      return 'modern';
    }

    grantPromotionRewards(oldStatus, newStatus) {
      const oldRank = this.statusRank(oldStatus);
      const newRank = this.statusRank(newStatus);
      if (newRank <= oldRank) return;
      for (let i = oldRank + 1; i <= newRank; i++) {
        const status = CITY_STAGE_ORDER[i];
        const promo = CITY_PROMOTIONS[status];
        if (!promo || this.seenPromotions.includes(status)) continue;
        this.seenPromotions.push(status);
        this.cash += promo.cash;
        const lines = {
          'Dorf': 'Ihre Gemeinde hat die erste Entwicklungsstufe verlassen. Mit der beigefügten Starthilfe sollen Verwaltung und Grundversorgung gefestigt werden.',
          'Großes Dorf': 'Die Einwohnerzahl wächst verlässlich. Wir bewilligen zusätzliche Strukturmittel, damit Wohnraum, Handel und Ortskern Schritt halten können.',
          'Kleinstadt': 'Mit dem neuen Status steigen auch die Erwartungen. Das Land unterstützt den Ausbau von Verwaltung, Infrastruktur und öffentlicher Daseinsvorsorge.',
          'Stadt': 'Die positive Entwicklung Ihrer Kommune wird anerkannt. Die beigefügten Mittel sollen den Übergang zu einer vollwertigen Stadt erleichtern.',
          'Großstadt': 'Ihre Stadt hat regionale Bedeutung erlangt. Das Förderpaket ist für Verkehr, Nahversorgung und urbane Ordnung vorgesehen.',
          'Moderne Stadt': 'Ihre Kommune gilt nun als moderne Stadt. Mit dieser Zuwendung sollen Innovation, Lebensqualität und wirtschaftliche Stärke gesichert werden.',
          'Metropole': 'Als aufstrebendes Zentrum erhält Ihre Stadt ein Sonderbudget für Zukunftsprojekte und überregionale Strahlkraft.'
        };
        this.promotionQueue.push({
          status,
          cash: promo.cash,
          subject: promo.subject,
          title: promo.title,
          body: lines[status] || 'Die Entwicklung Ihrer Stadt wird mit einer einmaligen Zuwendung gewürdigt.'
        });
        this.log(`Aufstieg: ${this.cityName} ist jetzt ${status}. Die Regierung gewährt ${money(promo.cash)} Fördermittel.`, 'good');
      }
    }

    housingCapacity() {
      return this.inventory.houses * ITEMS.houses.capacity + this.inventory.towers * ITEMS.towers.capacity;
    }

    schoolCapacity() {
      return this.inventory.schools * ITEMS.schools.service + this.inventory.universities * ITEMS.universities.service;
    }

    educationNeed() { return Math.max(1, Math.round(this.population * .22)); }
    educationCoverage() { return clamp(this.schoolCapacity() / this.educationNeed(), 0, 1.35); }

    foodEfficiency() {
      // Eine Nahrungseinheit steht für einen Warenkorb, nicht für eine einzelne Mahlzeit.
      // 0,68 pro Einwohner hält die Startstadt wirtschaftlich überlebensfähig,
      // Supermärkte senken Logistikverluste weiterhin um bis zu 20 %.
      return .68 * (1 - Math.min(.20, this.inventory.supermarkets * .04));
    }

    monthlyFoodNeed(pop = this.population) {
      return Math.max(0, Math.ceil(pop * this.foodEfficiency()));
    }

    foodExportCapacity() {
      return Math.max(0, this.inventory.supermarkets * 150);
    }

    foodExportPreview(allocation = this.foodAllocation) {
      const selected = clamp(Math.round(Number(allocation) || 0), 0, this.inventory.food);
      const need = this.monthlyFoodNeed();
      const consumed = Math.min(selected, need);
      const offered = Math.max(0, selected - consumed);
      const capacity = this.foodExportCapacity();
      const sold = capacity > 0 ? Math.min(offered, capacity) : 0;
      const retained = Math.max(0, offered - sold);
      const unitPrice = this.market.food * 1.65;
      const revenue = Math.round(sold * unitPrice);
      return { selected, need, consumed, offered, capacity, sold, retained, unitPrice, revenue };
    }

    retailDemandUnits(pop = this.population) {
      return Math.max(.35, pop / 180);
    }

    retailSupplyUnits(extraKey = null) {
      let shops = this.inventory.shops;
      let supers = this.inventory.supermarkets;
      if (extraKey === 'shops') shops++;
      if (extraKey === 'supermarkets') supers++;
      return shops + supers * 4.7;
    }

    commerceUtilization(extraKey = null) {
      const supply = this.retailSupplyUnits(extraKey);
      if (supply <= 0) return 0;
      return clamp(this.retailDemandUnits() / supply, .22, 1);
    }

    rawCommercialJobs(extraKey = null) {
      let shops = this.inventory.shops;
      let supers = this.inventory.supermarkets;
      if (extraKey === 'shops') shops++;
      if (extraKey === 'supermarkets') supers++;
      return shops * ITEMS.shops.jobs + supers * ITEMS.supermarkets.jobs;
    }

    jobsCapacity(extraKey = null) {
      const commercial = Math.round(this.rawCommercialJobs(extraKey) * this.commerceUtilization(extraKey));
      const baseLocalEconomy = Math.round(this.population * .20);
      return commercial + baseLocalEconomy + this.tempJobBonus;
    }

    employmentNeed() { return Math.max(1, Math.round(this.population * .42)); }
    employmentCoverage() { return clamp(this.jobsCapacity() / this.employmentNeed(), 0, 1.25); }

    productivityFactor() {
      const education = clamp(this.educationCoverage(), 0, 1);
      const universityBonus = Math.min(.18, this.inventory.universities * .03);
      return .92 + education * .08 + universityBonus;
    }

    landUsed() {
      return Object.entries(ITEMS).reduce((sum, [key, item]) => sum + (item.footprint || 0) * (this.inventory[key] || 0), 0);
    }

    landFree() { return Math.max(0, this.inventory.land - this.landUsed()); }

    infrastructureScore() {
      const housing = clamp(this.housingCapacity() / Math.max(1,this.population) * 24, 0, 24);
      const education = clamp(this.educationCoverage() * 20, 0, 22);
      const jobs = clamp(this.employmentCoverage() * 20, 0, 22);
      const services = clamp((this.inventory.shops>0?5:0)+(this.inventory.supermarkets>0?7:0)+(this.inventory.schools>0?6:0)+(this.inventory.universities>0?9:0),0,24);
      const finance = this.cash >= 0 ? 8 : clamp(8 + this.cash / 2500, 0, 8);
      return Math.round(clamp(housing + education + jobs + services + finance, 0, 100));
    }

    canBuy(key) {
      const item = ITEMS[key];
      const qty = item.tradeQty || 1;
      const price = this.market[key] * qty;
      if (this.cash < price) return false;
      if ((item.footprint || 0) > this.landFree()) return false;
      return true;
    }

    canSell(key) {
      const item = ITEMS[key];
      const qty = item.tradeQty || 1;
      if (this.inventory[key] - qty < item.min) return false;
      if (key === 'land' && this.inventory.land - 1 < this.landUsed()) return false;
      return true;
    }

    buy(key) {
      if (!this.canBuy(key)) return;
      const item = ITEMS[key];
      const qty = item.tradeQty || 1;
      const total = this.market[key] * qty;
      this.cash -= total;
      this.inventory[key] += qty;
      this.nudgePrice(key, true);
      this.log(`${item.name} gekauft: -${money(total)}.`);
      saveGame(this); renderGame(this);
    }

    sell(key) {
      if (!this.canSell(key)) return;
      const item = ITEMS[key];
      const qty = item.tradeQty || 1;
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
      const employment = this.employmentCoverage();
      const education = this.educationCoverage();
      const foodReserveMonths = this.inventory.food / Math.max(1, this.monthlyFoodNeed());
      let a = 46;
      a += clamp((10 - this.taxRate) * 2.3, -30, 23);
      a += clamp((housingRatio - 1) * 34, -38, 18);
      a += clamp((employment - .82) * 34, -30, 14);
      a += clamp((education - .65) * 15, -10, 10);
      a += clamp(foodReserveMonths * 3, 0, 9);
      a += (this.approval - 50) * .20;
      a += this.inventory.supermarkets > 0 ? Math.min(5, this.inventory.supermarkets * 1.5) : 0;
      if (this.cash < 0) a += clamp(this.cash / 1800, -12, 0);
      if (this.commerceUtilization() < .45) a -= 3;
      return Math.round(clamp(a, 0, 100));
    }

    buildingMaintenance() {
      return Math.round(Object.entries(ITEMS).reduce((sum,[key,item]) => sum + (item.maintenance || 0) * (this.inventory[key] || 0), 0));
    }

    serviceCost() {
      const sizeCost = this.population * .075;
      const densityCost = this.inventory.towers * 18;
      return Math.round(sizeCost + densityCost);
    }

    debtInterest() {
      return this.cash < 0 ? Math.max(5, Math.round(Math.abs(this.cash) * .015)) : 0;
    }

    monthlyMaintenance() {
      return this.buildingMaintenance() + this.serviceCost() + this.debtInterest();
    }

    revenueBreakdown() {
      const employment = clamp(this.employmentCoverage(), 0, 1);
      const taxableFactor = .58 + employment * .42;
      const residentTax = this.population * taxableFactor * (this.taxRate / 100) * 13.5 * this.productivityFactor();
      const utilization = this.commerceUtilization();
      const commerceBase = this.inventory.shops * ITEMS.shops.commerceTax + this.inventory.supermarkets * ITEMS.supermarkets.commerceTax;
      const commerce = commerceBase * utilization * this.commerceMomentum * this.productivityFactor();
      return {
        residents: Math.round(residentTax),
        commerce: Math.round(commerce),
        total: Math.round(residentTax + commerce),
        utilization
      };
    }

    monthlyRevenue() { return this.revenueBreakdown().total; }

    foodProvisionCost() {
      return Math.round(this.monthlyFoodNeed() * this.market.food);
    }

    forecast() {
      const rev = this.revenueBreakdown();
      const building = this.buildingMaintenance();
      const services = this.serviceCost();
      const interest = this.debtInterest();
      const expenses = building + services + interest;
      const balance = rev.total - expenses;
      const foodProvision = this.foodProvisionCost();
      return {
        ...rev, building, services, interest, expenses, balance,
        foodProvision,
        sustainableBalance: balance - foodProvision
      };
    }

    advisory() {
      const notes = [];
      const housing = this.housingCapacity() / Math.max(1, this.population);
      const employment = this.employmentCoverage();
      const edu = this.educationCoverage();
      const foodMonths = this.inventory.food / Math.max(1, this.monthlyFoodNeed());
      const util = this.commerceUtilization();
      const f = this.forecast();

      if (foodMonths < 1) notes.push({type:'bad', text:'Nahrung reicht nicht für einen vollen Monat. Versorgung hat höchste Priorität.'});
      else if (foodMonths < 2) notes.push({type:'warn', text:'Nahrungsreserve ist knapp. Ein Preissprung kann gefährlich werden.'});
      if (housing < 1.03) notes.push({type:'bad', text:'Kaum freie Wohnungen: weiterer Zuzug wird ausgebremst.'});
      else if (housing > 1.75 && this.population > 500) notes.push({type:'warn', text:'Sehr viel leerer Wohnraum bindet Kapital und Unterhalt.'});
      if (employment < .75) notes.push({type:'bad', text:'Zu wenige Arbeitsplätze: Steuereinnahmen und Zustimmung leiden.'});
      if (edu < .7 && this.population > 450) notes.push({type:'warn', text:'Bildungsversorgung ist zu niedrig und drückt Attraktivität und Produktivität.'});
      if (util < .5 && (this.inventory.shops + this.inventory.supermarkets) > 1) notes.push({type:'warn', text:'Gewerbe ist überbaut: viele Läden haben zu wenig Kundschaft und liefern weniger Einnahmen.'});
      if (f.sustainableBalance < 0) notes.push({type:'bad', text:`Nach Wiederbeschaffung der verbrauchten Nahrung fehlen voraussichtlich ${money(Math.abs(f.sustainableBalance))} pro Monat.`});
      else if (f.balance < 0) notes.push({type:'bad', text:`Der laufende Haushalt liegt voraussichtlich ${money(Math.abs(f.balance))} im Minus.`});
      if (this.cash < 0) notes.push({type:'bad', text:`Schulden verursachen aktuell ${money(f.interest)} Zinsen pro Monat.`});
      if (this.taxRate >= 16) notes.push({type:'warn', text:'Sehr hohe Wohnsteuer bringt kurzfristig Geld, bremst aber Zuzug und Zustimmung.'});
      if (!notes.length) notes.push({type:'good', text:'Die Grundversorgung wirkt stabil. Wachstum ist derzeit vertretbar.'});
      return notes.slice(0, 4);
    }

    advanceMonth(settings) {
      if (this.ended) return;
      this.taxRate = clamp(Number(settings.taxRate)||0, 0, 30);
      this.foodAllocation = clamp(Math.round(Number(settings.foodAllocation)||0), 0, this.inventory.food);
      this.admitLimit = clamp(Math.round(Number(settings.admitLimit)||0), 0, 5000);

      const oldStatus = this.status();
      const oldPop = this.population;
      const oldCash = this.cash;
      const foodNeed = this.monthlyFoodNeed();
      const foodTrade = this.foodExportPreview(this.foodAllocation);
      const foodServed = foodTrade.consumed;
      const foodRatio = foodNeed ? foodServed / foodNeed : 1;
      this.inventory.food -= foodTrade.consumed + foodTrade.sold;

      const finance = this.forecast();
      const monthBalance = finance.balance + foodTrade.revenue;
      this.cash += monthBalance;

      const housingRatio = this.housingCapacity() / Math.max(1,this.population);
      const employment = this.employmentCoverage();
      const education = this.educationCoverage();

      let approvalDelta = 0;
      approvalDelta += this.taxRate <= 6 ? 3 : this.taxRate <= 10 ? 1 : this.taxRate <= 13 ? -1 : this.taxRate <= 17 ? -4 : -9;
      approvalDelta += foodRatio >= 1 ? 2 : foodRatio >= .9 ? -2 : foodRatio >= .7 ? -9 : -18;
      approvalDelta += housingRatio >= 1.08 ? 2 : housingRatio >= 1 ? 0 : -8;
      approvalDelta += employment >= .98 ? 2 : employment >= .82 ? 0 : employment >= .65 ? -4 : -8;
      approvalDelta += education >= .9 ? 2 : education >= .65 ? 0 : this.population > 450 ? -3 : 0;
      approvalDelta += monthBalance >= 0 ? 1 : -1;
      if (this.cash < -5000) approvalDelta -= 2;
      if (finance.utilization < .4 && this.inventory.shops + this.inventory.supermarkets > 2) approvalDelta -= 1;
      this.approval = clamp(this.approval + approvalDelta, 0, 100);

      let leaving = 0;
      if (foodRatio < 1) leaving += Math.round(this.population * (1-foodRatio) * .24);
      if (housingRatio < .95) leaving += Math.round(this.population * (.95-housingRatio) * .14);
      if (employment < .7) leaving += Math.round(this.population * (.7-employment) * .06);
      if (this.approval < 35) leaving += Math.round(this.population * ((35-this.approval)/100) * .045);
      leaving = Math.min(this.population, leaving);

      const attractiveness = this.calculateAttractiveness();
      const populationAfterLeaving = Math.max(0, this.population - leaving);
      const housingSlots = Math.max(0, this.housingCapacity() - populationAfterLeaving);
      // Arbeitsplätze und lokale Nachfrage wachsen teilweise mit neuen Einwohnern.
      // Deshalb darf Zuzug nicht verlangen, dass sämtliche künftigen Jobs schon vorher existieren.
      // Schlechte Beschäftigung bremst weiterhin stark; gute Beschäftigung schafft echte Wachstumsreserve.
      const employmentGrowthRate = clamp((employment - .52) * .32, .01, .14);
      const economicRoom = employment < .55
        ? Math.max(2, Math.round(this.population * .008))
        : Math.max(5, Math.round(this.population * employmentGrowthRate));
      const potential = Math.max(0, Math.round((14 + this.population * .016) * (attractiveness / 50) * (0.82 + Math.random()*.36)));
      const newcomers = Math.min(this.admitLimit, housingSlots, Math.max(0,economicRoom), potential);
      this.population = Math.max(0, populationAfterLeaving + newcomers);

      const births = Math.max(0, Math.round(this.population * (foodRatio >= .95 && housingRatio >= 1 ? .0016 : .0003)));
      this.population += births;

      if (foodRatio < .65) this.severeFoodMonths++; else this.severeFoodMonths = 0;
      if (this.cash < -15000) this.losingDebtMonths++; else this.losingDebtMonths = Math.max(0,this.losingDebtMonths-1);
      if (this.approval < 18) this.lowApprovalMonths++; else this.lowApprovalMonths = 0;

      this.tempJobBonus = Math.max(0, Math.round(this.tempJobBonus * .75));
      this.commerceMomentum = clamp(this.commerceMomentum * .996, .78, 1.30);
      this.monthsPlayed++;

      this.lastSummary = {
        oldPop, newPop:this.population, newcomers, leaving, births,
        revenue:finance.total + foodTrade.revenue, residentRevenue:finance.residents, commerceRevenue:finance.commerce,
        foodExportRevenue:foodTrade.revenue, foodExportSold:foodTrade.sold, foodExportCapacity:foodTrade.capacity, foodRetained:foodTrade.retained,
        maintenance:finance.expenses, building:finance.building, services:finance.services, interest:finance.interest,
        oldCash, newCash:this.cash, foodServed, foodNeed, foodRatio, attractiveness, approvalDelta,
        commerceUtilization: finance.utilization
      };

      this.log(`Monat: ${money(finance.total + foodTrade.revenue)} Einnahmen, ${money(finance.expenses)} Kosten, ${newcomers} Zuzüge, ${leaving} Wegzüge.`);
      if (foodTrade.sold > 0) this.log(`Regionalverkauf: ${fmt.format(foodTrade.sold)} Nahrung über Supermärkte verkauft, +${money(foodTrade.revenue)}.`, 'good');
      if (monthBalance < 0) this.log(`Haushaltsdefizit: ${money(monthBalance)}.`, 'bad');
      if (finance.utilization < .45 && this.inventory.shops + this.inventory.supermarkets > 1) this.log('Gewerbe schwach ausgelastet: zu viele Verkaufsflächen für die Einwohnerzahl.', 'bad');

      this.rollEvent();
      this.updateMarket();
      this.grantPromotionRewards(oldStatus, this.status());
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
      const foodInflation = 1.002 + Math.min(.008, this.monthsPlayed * .00008);
      for (const [key,item] of Object.entries(ITEMS)) {
        if (key !== 'food') {
          const target = this.assetTargetPrice(key);
          const current = this.market[key] || item.base;
          const normalized = clamp(current, target * .78, target * 1.34);
          const noisyTarget = target * (1 + (Math.random() - .5) * .03);
          const next = normalized + (noisyTarget - normalized) * .23;
          this.market[key] = clamp(Math.round(next), Math.round(item.base * .60), Math.round(item.base * 1.90));
          continue;
        }

        // Nahrung behält die bestehende, bewusst volatilere Versorgungslogik.
        let factor = foodInflation * (0.965 + Math.random() * .07);
        const pressure = this.inventory.food < this.monthlyFoodNeed() * 1.5 ? 1.035 : .995;
        const supermarketRelief = 1 - Math.min(.018, this.inventory.supermarkets * .003);
        factor *= pressure * supermarketRelief;
        this.market.food = Math.max(1, Math.round(this.market.food * factor));
        const floor = Math.max(1, Math.round(item.base * .55));
        const ceiling = Math.round(item.base * 3.2 + 5);
        this.market.food = clamp(this.market.food, floor, ceiling);
      }
    }

    incrementDate() {
      this.month++;
      if (this.month > 12) { this.month = 1; this.year++; }
    }

    updateScore() {
      const f = this.forecast();
      this.score = Math.max(0, Math.round(
        this.population*4 + this.cash*.18 + this.infrastructureScore()*230 + this.approval*65 +
        Math.max(0,f.balance)*.25 - Math.max(0,-this.cash)*.55
      ));
    }

    checkEnd() {
      let win = false, reason = '';
      if (this.winCondition === 'cash' && this.cash >= 200000) { win=true; reason='Die Stadtkasse hat 200.000 $ überschritten.'; }
      if (this.winCondition === 'population' && this.population >= 10000) { win=true; reason='Deine Stadt hat 10.000 Einwohner erreicht.'; }
      if (this.winCondition === 'modern' && (this.status() === 'Moderne Stadt' || this.status() === 'Metropole')) { win=true; reason='Aus dem Kuhdorf ist eine moderne Stadt geworden.'; }
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
    g.log('Startkapital: 1.000 $. Plane jeden Ausbau – Unterhalt läuft jeden Monat.');
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
    document.getElementById('installBtn').onclick = installPwa;
    syncInstallButton();
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
    if (key === 'food') rows.push(['Kaufmenge', '+100 Einheiten']);
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
    document.body.appendChild(overlay);
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
    document.body.appendChild(overlay);
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
      const sustainableBalance = operatingBalance - baseForecast.foodProvision;
      const taxDelta = residentTax - baseForecast.residents;
      const coverage = foodNeed ? Math.min(100, Math.round(exportTrade.consumed / foodNeed * 100)) : 100;

      taxOut.textContent = `${selectedTax}%`;
      foodOut.textContent = fmt.format(Math.round(selectedFood));
      residentTaxOut.textContent = `+${money(residentTax)}`;
      taxDeltaOut.textContent = taxDelta === 0 ? '±0 $' : `${taxDelta > 0 ? '+' : ''}${money(taxDelta)}`;
      taxDeltaOut.className = taxDelta > 0 ? 'good' : taxDelta < 0 ? 'bad' : '';
      foodExportOut.textContent = `+${money(exportTrade.revenue)}`;
      foodExportOut.className = exportTrade.revenue > 0 ? 'good' : '';
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
    overlay.innerHTML=`<div class="modal"><div class="hint">MONATSBERICHT</div><h2>Bilanz des vergangenen Monats</h2>
      <div class="month-summary">
        <div class="summary-row"><span>Einwohnersteuern</span><b class="good">+${money(s.residentRevenue)}</b></div>
        <div class="summary-row"><span>Gewerbe</span><b class="good">+${money(s.commerceRevenue)}</b></div>
        ${s.foodExportRevenue?`<div class="summary-row"><span>Nahrungs-Regionalverkauf (${fmt.format(s.foodExportSold)} Einh.)</span><b class="good">+${money(s.foodExportRevenue)}</b></div>`:''}
        <div class="summary-row"><span>Gebäude</span><b class="bad">-${money(s.building)}</b></div>
        <div class="summary-row"><span>Städtische Dienste</span><b class="bad">-${money(s.services)}</b></div>
        ${s.interest?`<div class="summary-row"><span>Schuldzinsen</span><b class="bad">-${money(s.interest)}</b></div>`:''}
        <div class="summary-row"><span>Operativer Saldo</span><b class="${balance<0?'bad':'good'}">${money(balance)}</b></div>
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
    document.body.appendChild(overlay); overlay.querySelector('#closeSummary').onclick=()=>{ overlay.remove(); if (afterClose) afterClose(); };
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
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); maybeShowQueuedOverlays(g); };
    overlay.querySelector('.icon-close').onclick = close;
    overlay.querySelector('#promoOk').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
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
      <p><b>Wachstum:</b> Menschen ziehen bei freien Wohnungen, Arbeit, vernünftigen Steuern, Versorgung, Bildung und guter Stimmung zu.</p>
      <p><b>Gewerbe:</b> Geschäfte und Supermärkte funktionieren nicht automatisch mit voller Leistung. Zu viele Verkaufsflächen bei zu wenigen Einwohnern bedeuten geringe Auslastung, weniger Jobs und weniger Gewerbeeinnahmen.</p>
      <p><b>Finanzen:</b> Einnahmen hängen von Beschäftigung, Steuersatz, Gewerbeauslastung und Produktivität ab. Gebäude, Einwohner und Schulden verursachen laufende Kosten.</p>
      <p><b>Bildung:</b> Schulen und Universitäten werden bei größerer Bevölkerung wichtig. Gute Bildungsdeckung stabilisiert die Stadt; Universitäten steigern zusätzlich die Produktivität.</p>
      <p><b>Versorgung:</b> Zu wenig Nahrung, Wohnraum oder Arbeit führt zu Unzufriedenheit und Wegzug. Supermärkte verbessern die Lebensmittel-Logistik. Überschüssig bereitgestellte Nahrung kann über Supermärkte regional verkauft werden: bis zu 150 Einheiten je Supermarkt und Monat zu 165% des aktuellen Nahrungspreises (65% Handelsaufschlag). Nicht verkaufte Überschüsse bleiben im Lager.</p>
      <p><b>Verlieren:</b> Drei Monate tiefe Überschuldung, dauerhaft extrem schlechte Zustimmung, eine schwere Versorgungskrise oder eine fast entvölkerte Stadt beenden die Amtszeit.</p>
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
