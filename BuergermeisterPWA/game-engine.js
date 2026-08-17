(() => {
  'use strict';
  const fmt = new Intl.NumberFormat('de-DE');
  const money = n => `${n < 0 ? '-' : ''}${fmt.format(Math.abs(Math.round(n)))} $`;
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
  const rnd = (min,max)=>Math.floor(Math.random()*(max-min+1))+min;
  const choice = arr => arr[Math.floor(Math.random()*arr.length)];
  globalThis.BGM_HOOKS = globalThis.BGM_HOOKS || {};

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
    { name:'Letztes Kuhdorf', minPop:0 },
    { name:'Dorf', minPop:350 },
    { name:'Großes Dorf', minPop:900 },
    { name:'Kleinstadt', minPop:1800 },
    { name:'Stadt', minPop:4000 },
    { name:'Großstadt', minPop:6500, minInfra:50, minEmployment:.72, minEducation:.45, minApproval:35 },
    { name:'Moderne Stadt', minPop:9000, minInfra:65, minHousing:1.00, minEmployment:.78, minEducation:.70, minApproval:40, minFood:.65 },
    { name:'Metropole', minPop:16000, minInfra:80, minHousing:1.02, minEmployment:.85, minEducation:.82, minApproval:55, minFood:.85, requireSolvent:true }
  ];

  const CITY_STAGE_ORDER = CITY_LEVELS.map(stage => stage.name);
  const CITY_STAGE_IMAGES = {
    kuhdorf: 'assets/stage-kuhdorf.svg',
    dorf: 'assets/stage-dorf.svg',
    'grosses-dorf': 'assets/stage-grosses-dorf.svg',
    kleinstadt: 'assets/stage-kleinstadt.svg',
    stadt: 'assets/stage-stadt.svg',
    grossstadt: 'assets/stage-grossstadt.svg',
    'moderne-stadt': 'assets/stage-moderne-stadt.svg',
    metropole: 'assets/stage-metropole.svg'
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
      {key:'houses',left:7,top:30,width:18,height:21},{key:'shops',left:35,top:35,width:15,height:16},{key:'land',left:60,top:25,width:34,height:46}
    ],
    dorf: [
      {key:'houses',left:5,top:25,width:30,height:22},{key:'shops',left:40,top:33,width:16,height:16},{key:'schools',left:70,top:22,width:18,height:22},{key:'land',left:12,top:55,width:28,height:20}
    ],
    'grosses-dorf': [
      {key:'houses',left:4,top:20,width:38,height:24},{key:'shops',left:47,top:31,width:18,height:16},{key:'schools',left:72,top:19,width:19,height:23},{key:'land',left:55,top:57,width:34,height:18}
    ],
    kleinstadt: [
      {key:'houses',left:3,top:18,width:26,height:24},{key:'shops',left:31,top:32,width:22,height:18},{key:'supermarkets',left:58,top:35,width:18,height:16},{key:'schools',left:76,top:17,width:18,height:22}
    ],
    stadt: [
      {key:'towers',left:3,top:13,width:22,height:33},{key:'shops',left:28,top:34,width:25,height:18},{key:'schools',left:55,top:17,width:19,height:23},{key:'supermarkets',left:76,top:38,width:18,height:18}
    ],
    grossstadt: [
      {key:'towers',left:2,top:8,width:36,height:42},{key:'shops',left:39,top:36,width:22,height:18},{key:'schools',left:62,top:20,width:16,height:24},{key:'supermarkets',left:79,top:36,width:18,height:19}
    ],
    'moderne-stadt': [
      {key:'towers',left:2,top:5,width:28,height:44},{key:'universities',left:31,top:28,width:25,height:22},{key:'shops',left:58,top:33,width:17,height:17},{key:'supermarkets',left:77,top:35,width:18,height:18}
    ],
    metropole: [
      {key:'towers',left:1,top:2,width:48,height:48},{key:'universities',left:50,top:22,width:22,height:24},{key:'shops',left:72,top:31,width:12,height:18},{key:'supermarkets',left:84,top:35,width:14,height:18}
    ]
  };

  const EVENTS = [
    { id:'harvest', minPop:0, cooldown:8, weight:7, condition:g=>g.market.food>1, apply:g=>{ g.market.food=Math.max(1,Math.floor(g.market.food*.74)); g.log('Gute Ernte: Nahrung ist billiger geworden.','good'); } },
    { id:'roads', minPop:250, cooldown:7, weight:6, apply:g=>{ const c=rnd(180,650); g.cash-=c; g.log(`Straßenreparaturen kosten ${money(c)}.`,'bad'); } },
    { id:'employer', minPop:600, cooldown:10, weight:6, condition:g=>g.employmentCoverage()<1.05, apply:g=>{ const bonus=rnd(12,35); g.tempJobBonus+=bonus; g.log(`Ein regionaler Betrieb schafft vorübergehend ${bonus} Arbeitsplätze.`,'good'); } },
    { id:'storm', minPop:900, cooldown:18, weight:3, apply:g=>{ const c=rnd(300,1200); g.cash-=c; g.approval-=2; g.log(`Sturmschäden verursachen ${money(c)} Reparaturkosten.`,'bad'); } },
    { id:'festival', minPop:1200, cooldown:12, weight:4, condition:g=>g.cash>300, apply:g=>{ g.cash-=250; g.approval+=5; g.log('Stadtfest: -250 $, aber die Stimmung steigt.','good'); } },
    { id:'investors', minPop:2000, cooldown:14, weight:4, condition:g=>g.commerceUtilization()>.45, apply:g=>{ g.commerceMomentum=clamp(g.commerceMomentum+.08,.75,1.35); g.log('Investoren erhöhen die Gewerbedynamik.','good'); } },
    { id:'food-scandal', minPop:3000, cooldown:20, weight:2, apply:g=>{ g.market.food=Math.round(g.market.food*1.35); g.approval-=3; g.log('Lebensmittelskandal: Nahrung wird deutlich teurer.','bad'); } },
    { id:'education-grant', minPop:5000, cooldown:18, weight:4, condition:g=>g.educationCoverage()<1.1, apply:g=>{ const b=1400; g.cash+=b; g.log(`Bildungsförderung: +${money(b)}.`,'good'); } },
    { id:'housing-press', minPop:2500, cooldown:8, weight:5, condition:g=>g.housingCapacity()<g.population*1.04, apply:g=>{ g.approval-=7; g.log('Pressekritik wegen Wohnraummangel.','bad'); } },
    { id:'retail-crisis', minPop:1500, cooldown:9, weight:5, condition:g=>g.commerceUtilization()<.55&&(g.inventory.shops+g.inventory.supermarkets)>2, apply:g=>{ g.approval-=2; g.commerceMomentum=clamp(g.commerceMomentum-.04,.75,1.35); g.log('Mehrere Geschäfte klagen über zu wenig Kundschaft.','bad'); } },
    { id:'citizen-award', minPop:1000, cooldown:14, weight:3, condition:g=>g.approval>72&&g.infrastructureScore()>45, apply:g=>{ g.approval+=3; g.log('Bürgerinitiative zeichnet die Stadtentwicklung aus.','good'); } },
    { id:'energy-bill', minPop:4000, cooldown:16, weight:3, condition:g=>g.inventory.towers>2, apply:g=>{ const c=Math.round(180+g.inventory.towers*22); g.cash-=c; g.log(`Hohe Energiekosten belasten städtische Gebäude mit ${money(c)}.`,'bad'); } },
    { id:'regional-fair', minPop:3500, cooldown:15, weight:3, condition:g=>g.inventory.supermarkets>0, apply:g=>{ g.commerceMomentum=clamp(g.commerceMomentum+.05,.75,1.35); g.approval+=2; g.log('Regionalmesse stärkt Handel und Ansehen der Stadt.','good'); } }
  ];

  class Game {
    constructor(data = {}) {
      const loadedVersion = Number(data.version || 2);
      Object.assign(this, {
        version: 5,
        cityName: 'Neustadt', mayorName: 'Bürgermeister', winCondition: 'modern',
        year: 1992, month: 1, cash: 1000, population: 125,
        approval: 62, taxRate: 8, foodAllocation: 125, admitLimit: 80,
        inventory: { land: 7, houses: 3, towers: 0, schools: 0, universities: 0, shops: 1, supermarkets: 0, food: 450 },
        market: {}, logs: [], score: 0, losingDebtMonths: 0, lowApprovalMonths: 0,
        severeFoodMonths: 0, commerceMomentum: 1, tempJobBonus: 0, monthsPlayed: 0,
        lastSummary: null, ended: false, ending: null, seenPromotions: [], promotionQueue: [],
        eventCooldowns: {}, termReport: null
      }, data);
      this.version = 5;
      this.inventory = { land:7, houses:3, towers:0, schools:0, universities:0, shops:1, supermarkets:0, food:450, ...(data.inventory || {}) };
      this.logs = Array.isArray(data.logs) ? data.logs : [];
      this.market = { ...(data.market || {}) };
      this.seenPromotions = Array.isArray(data.seenPromotions) ? data.seenPromotions : [];
      this.promotionQueue = Array.isArray(data.promotionQueue) ? data.promotionQueue : [];
      this.eventCooldowns = data.eventCooldowns && typeof data.eventCooldowns === 'object' ? {...data.eventCooldowns} : {};
      this.termReport = data.termReport && typeof data.termReport === 'object' ? {...data.termReport} : null;
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

    meetsCityStage(stage) {
      if (this.population < (stage.minPop || 0)) return false;
      const housing = this.housingCapacity() / Math.max(1,this.population);
      const employment = this.employmentCoverage();
      const education = this.educationCoverage();
      const food = this.inventory.food / Math.max(1,this.monthlyFoodNeed());
      if (stage.minInfra != null && this.infrastructureScore() < stage.minInfra) return false;
      if (stage.minHousing != null && housing < stage.minHousing) return false;
      if (stage.minEmployment != null && employment < stage.minEmployment) return false;
      if (stage.minEducation != null && education < stage.minEducation) return false;
      if (stage.minApproval != null && this.approval < stage.minApproval) return false;
      if (stage.minFood != null && food < stage.minFood) return false;
      if (stage.requireSolvent && this.cash < 0) return false;
      return true;
    }

    status() {
      let result = CITY_LEVELS[0].name;
      for (const stage of CITY_LEVELS) if (this.meetsCityStage(stage)) result = stage.name;
      return result;
    }

    statusRank(name = this.status()) {
      const idx = CITY_STAGE_ORDER.indexOf(name);
      return idx === -1 ? 0 : idx;
    }

    visualStage(name = this.status()) {
      return ({
        'Letztes Kuhdorf':'kuhdorf',
        'Dorf':'dorf',
        'Großes Dorf':'grosses-dorf',
        'Kleinstadt':'kleinstadt',
        'Stadt':'stadt',
        'Großstadt':'grossstadt',
        'Moderne Stadt':'moderne-stadt',
        'Metropole':'metropole'
      })[name] || 'kuhdorf';
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
      const restockCost = Math.round(sold * this.market.food);
      const grossMargin = revenue - restockCost;
      return { selected, need, consumed, offered, capacity, sold, retained, unitPrice, revenue, restockCost, grossMargin };
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
      globalThis.BGM_HOOKS?.save?.(this); globalThis.BGM_HOOKS?.render?.(this);
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
      globalThis.BGM_HOOKS?.save?.(this); globalThis.BGM_HOOKS?.render?.(this);
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

    forecastWithTrade(allocation = this.foodAllocation) {
      const base = this.forecast();
      const trade = this.foodExportPreview(allocation);
      return {
        ...base, trade,
        exportRestockCost: trade.restockCost,
        exportMargin: trade.grossMargin,
        sustainableWithTrade: base.sustainableBalance + trade.grossMargin
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
        foodExportRestockCost:foodTrade.restockCost, foodExportMargin:foodTrade.grossMargin, foodReplacementCost:finance.foodProvision,
        sustainableBalance:finance.sustainableBalance + foodTrade.grossMargin,
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
      globalThis.BGM_HOOKS?.save?.(this);
      globalThis.BGM_HOOKS?.render?.(this, true);
    }

    rollEvent() {
      if (Math.random() > .34) return;
      const possible = EVENTS.filter(e => {
        if (this.population < (e.minPop || 0)) return false;
        if (e.condition && !e.condition(this)) return false;
        const last = Number(this.eventCooldowns[e.id] ?? -9999);
        if (this.monthsPlayed - last < (e.cooldown || 0)) return false;
        return true;
      });
      if (!possible.length) return;
      const totalWeight = possible.reduce((sum,e)=>sum+(e.weight||1),0);
      let roll = Math.random() * totalWeight;
      let picked = possible[possible.length-1];
      for (const event of possible) { roll -= event.weight || 1; if (roll <= 0) { picked = event; break; } }
      picked.apply(this);
      this.eventCooldowns[picked.id] = this.monthsPlayed;
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
        Math.max(0,f.sustainableBalance)*.25 - Math.max(0,-this.cash)*.55
      ));
    }

    termEvaluation() {
      const f = this.forecast();
      const housing = this.housingCapacity() / Math.max(1,this.population);
      const jobs = this.employmentCoverage();
      const education = this.educationCoverage();
      const food = this.inventory.food / Math.max(1,this.monthlyFoodNeed());
      const growth = clamp((this.population - 125) / 12, 0, 100);
      const finances = clamp(50 + f.sustainableBalance / Math.max(5,this.monthlyFoodNeed()) * 18 + this.cash / 250, 0, 100);
      const services = clamp((Math.min(1.1,housing)/1.1*25) + (Math.min(1.05,jobs)/1.05*25) + (Math.min(1.05,education)/1.05*25) + (Math.min(1.5,food)/1.5*25), 0, 100);
      const infrastructure = this.infrastructureScore();
      const approval = this.approval;
      const total = Math.round(finances*.22 + growth*.18 + approval*.24 + services*.18 + infrastructure*.18);
      const voteShare = Math.round(clamp(25 + total*.50 + (approval-50)*.08, 22, 79));
      const reelected = total >= 52 && voteShare >= 50 && approval >= 28 && this.severeFoodMonths === 0 && this.losingDebtMonths < 3;
      this.termReport = { finances:Math.round(finances), growth:Math.round(growth), approval:Math.round(approval), services:Math.round(services), infrastructure:Math.round(infrastructure), total, voteShare, reelected };
      return this.termReport;
    }

    checkEnd() {
      // Niederlagen werden zuerst geprüft: ein zusammengebrochener Haushalt darf nicht im selben Monat noch zum Sieg werden.
      if (this.losingDebtMonths >= 3) return this.finish(false, 'Die Stadt war drei Monate tief überschuldet. Die Kommunalaufsicht übernimmt.');
      if (this.lowApprovalMonths >= 3) return this.finish(false, 'Deine Zustimmung lag zu lange unter 18 %. Der Gemeinderat entzieht dir das Vertrauen.');
      if (this.severeFoodMonths >= 2) return this.finish(false, 'Zwei Monate schwere Versorgungskrise: Die Stadtverwaltung bricht zusammen.');
      if (this.population < 35 && this.monthsPlayed >= 6) return this.finish(false, 'Fast alle Einwohner haben die Stadt verlassen.');

      if (this.winCondition === 'cash' && this.cash >= 200000) return this.finish(true, 'Die Stadtkasse hat 200.000 $ überschritten.');
      if (this.winCondition === 'population' && this.population >= 10000) return this.finish(true, 'Deine Stadt hat 10.000 Einwohner erreicht.');
      if (this.winCondition === 'modern' && ['Moderne Stadt','Metropole'].includes(this.status())) return this.finish(true, 'Aus dem Kuhdorf ist eine stabile moderne Stadt geworden.');
      if (this.winCondition === 'fouryears' && this.monthsPlayed >= 48) {
        const report = this.termEvaluation();
        return this.finish(report.reelected,
          report.reelected
            ? `Vier Jahre Amtszeit: Wiederwahl mit ${report.voteShare}% der Stimmen.`
            : `Vier Jahre Amtszeit: nur ${report.voteShare}% der Stimmen – die Bürger wählen einen neuen Bürgermeister.`);
      }
    }

    finish(win, reason) {
      this.ended = true;
      this.ending = { win, reason, termReport:this.termReport };
      this.updateScore();
      globalThis.BGM_HOOKS?.score?.(this);
    }
  }


  globalThis.BGM_ENGINE = { Game, ITEMS, CITY_LEVELS, CITY_STAGE_ORDER, CITY_STAGE_IMAGES, CITY_PROMOTIONS, CITY_HOTSPOTS, EVENTS };
})();
