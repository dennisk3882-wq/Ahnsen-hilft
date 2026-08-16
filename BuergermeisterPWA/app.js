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
      Object.assign(this, {
        version: 2,
        cityName: 'Neustadt', mayorName: 'Bürgermeister', winCondition: 'modern',
        year: 1992, month: 1, cash: 1000, population: 125,
        approval: 62, taxRate: 8, foodAllocation: 125, admitLimit: 80,
        inventory: { land: 7, houses: 3, towers: 0, schools: 0, universities: 0, shops: 1, supermarkets: 0, food: 450 },
        market: {}, logs: [], score: 0, losingDebtMonths: 0, lowApprovalMonths: 0,
        severeFoodMonths: 0, commerceMomentum: 1, tempJobBonus: 0, monthsPlayed: 0,
        lastSummary: null, ended: false, ending: null
      }, data);
      this.version = 2;
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

      const oldPop = this.population;
      const oldCash = this.cash;
      const foodNeed = this.monthlyFoodNeed();
      const foodServed = Math.min(this.foodAllocation, this.inventory.food);
      const foodRatio = foodNeed ? foodServed / foodNeed : 1;
      this.inventory.food -= foodServed;

      const finance = this.forecast();
      this.cash += finance.balance;

      const housingRatio = this.housingCapacity() / Math.max(1,this.population);
      const employment = this.employmentCoverage();
      const education = this.educationCoverage();

      let approvalDelta = 0;
      approvalDelta += this.taxRate <= 6 ? 3 : this.taxRate <= 10 ? 1 : this.taxRate <= 13 ? -1 : this.taxRate <= 17 ? -4 : -9;
      approvalDelta += foodRatio >= 1 ? 2 : foodRatio >= .9 ? -2 : foodRatio >= .7 ? -9 : -18;
      approvalDelta += housingRatio >= 1.08 ? 2 : housingRatio >= 1 ? 0 : -8;
      approvalDelta += employment >= .98 ? 2 : employment >= .82 ? 0 : employment >= .65 ? -4 : -8;
      approvalDelta += education >= .9 ? 2 : education >= .65 ? 0 : this.population > 450 ? -3 : 0;
      approvalDelta += finance.balance >= 0 ? 1 : -1;
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
        revenue:finance.total, residentRevenue:finance.residents, commerceRevenue:finance.commerce,
        maintenance:finance.expenses, building:finance.building, services:finance.services, interest:finance.interest,
        oldCash, newCash:this.cash, foodServed, foodNeed, foodRatio, attractiveness, approvalDelta,
        commerceUtilization: finance.utilization
      };

      this.log(`Monat: ${money(finance.total)} Einnahmen, ${money(finance.expenses)} Kosten, ${newcomers} Zuzüge, ${leaving} Wegzüge.`);
      if (finance.balance < 0) this.log(`Haushaltsdefizit: ${money(finance.balance)}.`, 'bad');
      if (finance.utilization < .45 && this.inventory.shops + this.inventory.supermarkets > 1) this.log('Gewerbe schwach ausgelastet: zu viele Verkaufsflächen für die Einwohnerzahl.', 'bad');

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
        let factor = inflation * (0.965 + Math.random() * .07);
        if (key === 'food') {
          const pressure = this.inventory.food < this.monthlyFoodNeed() * 1.5 ? 1.035 : .995;
          const supermarketRelief = 1 - Math.min(.018, this.inventory.supermarkets * .003);
          factor *= pressure * supermarketRelief;
        }
        if (key === 'land' && this.landFree() < 3) factor *= 1.018;
        if (key === 'houses' || key === 'towers') {
          if (this.housingCapacity() < this.population * 1.05) factor *= 1.012;
        }
        if (key === 'shops' || key === 'supermarkets') {
          factor *= this.commerceUtilization() > .8 ? 1.008 : .995;
        }
        this.market[key] = Math.max(1, Math.round(this.market[key] * factor));
        const floor = Math.max(1, Math.round(item.base * .55));
        const ceiling = Math.round(item.base * 3.2 + 5);
        this.market[key] = clamp(this.market[key], floor, ceiling);
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
      <p class="hint">Du beginnst bewusst klein: 1.000 $, drei Häuser, ein Geschäft und 125 Einwohner.</p>
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
    const add = (cls, key, count, yShift=0) => {
      const max = cls==='tower'?7:cls==='house'?10:cls==='shop'?5:4;
      for (let i=0;i<Math.min(count,max);i++) {
        const left = 3 + ((i*17 + count*7 + (cls.length*11)) % 88);
        const bottom = 75 + ((i%2)*4) + yShift;
        elems.push(`<i class="building ${cls} clickable-building" data-info="${key}" title="Info: ${ITEMS[key].name}" style="left:${left}%;bottom:${bottom}px;transform:scale(${.82 + (i%3)*.08});z-index:${2+(i%3)}"></i>`);
      }
    };
    add('house', 'houses', g.inventory.houses);
    add('shop', 'shops', g.inventory.shops, 1);
    add('shop', 'supermarkets', g.inventory.supermarkets, 1);
    add('school', 'schools', g.inventory.schools, 3);
    add('school', 'universities', g.inventory.universities, 3);
    add('tower', 'towers', g.inventory.towers, 0);
    return elems.join('');
  }

  function healthClass(value, goodAt=100, warnAt=80) {
    return value >= goodAt ? 'good' : value < warnAt ? 'bad' : 'warn';
  }

  function renderGame(g, showSummary=false) {
    const attract = g.calculateAttractiveness();
    const jobRatio = Math.round(g.employmentCoverage()*100);
    const housingRatio = Math.round(g.housingCapacity()/Math.max(1,g.population)*100);
    const eduRatio = Math.round(g.educationCoverage()*100);
    const util = Math.round(g.commerceUtilization()*100);
    const f = g.forecast();
    const advice = g.advisory();

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
            <div class="hint city-help">Tipp: Auch Gebäude im Stadtbild können für Informationen angetippt werden.</div>
          </div>

          <div class="panel" style="margin-top:10px"><h2>KAUFEN / VERKAUFEN</h2><div class="market">
            ${Object.entries(ITEMS).map(([key,item]) => `
              <div class="market-row">
                <button class="market-info" data-info="${key}" aria-label="Information zu ${item.name}">i</button>
                <div class="market-name market-click" data-info="${key}"><b>${item.name}</b><small>Bestand: ${fmt.format(g.inventory[key])}${key==='land'?` · frei ${g.landFree()}`:''}</small></div>
                <div class="price">${money(g.market[key])}${item.tradeQty?'<small>/Stk.</small>':''}</div>
                <button data-buy="${key}" ${g.canBuy(key)?'':'disabled'}>+${item.tradeQty||1}</button>
                <button data-sell="${key}" ${g.canSell(key)?'':'disabled'}>-${item.tradeQty||1}</button>
              </div>`).join('')}
          </div></div>
        </div>

        <div>
          <div class="panel"><h2>STADTWERTE</h2><div class="resource-grid">
            <div class="resource"><span>Wohnplätze</span><b class="${healthClass(housingRatio,105,95)}">${fmt.format(g.housingCapacity())}</b></div>
            <div class="resource"><span>Arbeitsplätze</span><b class="${healthClass(jobRatio,95,75)}">${fmt.format(g.jobsCapacity())}</b></div>
            <div class="resource"><span>Bildungsplätze</span><b class="${healthClass(eduRatio,90,65)}">${fmt.format(g.schoolCapacity())}</b></div>
            <div class="resource"><span>Nahrung</span><b class="${g.inventory.food<g.monthlyFoodNeed()?'bad':''}">${fmt.format(g.inventory.food)}</b></div>
            <div class="resource"><span>Freies Land</span><b>${fmt.format(g.landFree())}</b></div>
            <div class="resource"><span>Attraktivität</span><b>${attract}/100</b></div>
            <div class="resource"><span>Gewerbe-Auslastung</span><b class="${healthClass(util,75,45)}">${util}%</b></div>
            <div class="resource"><span>Produktivität</span><b>${Math.round(g.productivityFactor()*100)}%</b></div>
          </div></div>

          <div class="panel advisor" style="margin-top:10px"><h2>LAGEBERICHT</h2>
            ${advice.map(n=>`<div class="advisor-line ${n.type}">● ${esc(n.text)}</div>`).join('')}
          </div>

          <div class="panel" style="margin-top:10px"><h2>HAUSHALT · PROGNOSE</h2>
            <div class="resource"><span>Einwohnersteuern</span><b class="good">+${money(f.residents)}</b></div>
            <div class="resource"><span>Gewerbeeinnahmen</span><b class="good">+${money(f.commerce)}</b></div>
            <div class="resource"><span>Gebäudeunterhalt</span><b class="bad">-${money(f.building)}</b></div>
            <div class="resource"><span>Städtische Dienste</span><b class="bad">-${money(f.services)}</b></div>
            ${f.interest?`<div class="resource"><span>Schuldzinsen</span><b class="bad">-${money(f.interest)}</b></div>`:''}
            <div class="resource"><span>Nahrung · Wiederbeschaffung*</span><b class="bad">-${money(f.foodProvision)}</b></div>
            <div class="resource"><span>Operativer Saldo</span><b class="${f.balance<0?'bad':'good'}">${money(f.balance)}</b></div>
            <div class="resource strong"><span>Saldo nach Versorgung*</span><b class="${f.sustainableBalance<0?'bad':'good'}">${money(f.sustainableBalance)}</b></div>
            <div class="hint">*Planwert: Kosten, um die in einem normalen Monat verbrauchte Nahrung zum aktuellen Marktpreis wieder aufzufüllen.</div>
          </div>

          <div class="panel" style="margin-top:10px"><h2>POLITISCHE LAGE</h2>
            <div class="resource"><span>Zustimmung</span><b>${g.approval}%</b></div><div class="status-meter"><i style="width:${g.approval}%"></i></div>
            <div class="resource"><span>Wohnraumauslastung</span><b>${housingRatio}%</b></div>
            <div class="resource"><span>Arbeitsplatzdeckung</span><b>${jobRatio}%</b></div>
            <div class="resource"><span>Bildungsdeckung</span><b>${eduRatio}%</b></div>
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
    app.querySelectorAll('[data-info]').forEach(el => el.onclick=(ev)=>{ ev.stopPropagation(); openItemInfo(g, el.dataset.info); });
    document.getElementById('menuBtn').onclick = () => { saveGame(g); renderHome(); };
    document.getElementById('monthBtn').onclick = () => openMonthModal(g);

    if (g.ended) openEnding(g);
    else if (showSummary && g.lastSummary) openSummary(g);
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
    if (key === 'supermarkets') rows.push(['Nahrungsbedarf', '-4% je Supermarkt, max. -20%']);
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
      supermarkets: 'Supermärkte schaffen bis zu 145 Arbeitsplätze und bis zu 220 $ Gewerbeeinnahmen. Zusätzlich verbessert jeder Supermarkt die Lebensmittel-Logistik und senkt den monatlichen Nahrungsbedarf um 4%, maximal um 20%. Auch hier entscheidet die Kundennachfrage über die tatsächliche Leistung.',
      food: 'Jeden Monat muss ausreichend Nahrung zugeteilt werden. Eine Einheit steht für einen standardisierten Warenkorb; der Grundbedarf liegt bei rund 0,68 Einheiten je Einwohner und Monat. Supermärkte senken Logistikverluste zusätzlich. Unterversorgung drückt die Zustimmung, führt zu Wegzug und kann das Spiel beenden.'
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
    const defaultFood = Math.min(maxFood, g.monthlyFoodNeed());
    const defaultAdmit = Math.max(0, Math.min(1000, g.housingCapacity()-g.population));
    const f = g.forecast();
    const overlay = document.createElement('div'); overlay.className='modal-backdrop';
    overlay.innerHTML = `<div class="modal"><div class="hint">MONATSENDE ${String(g.month).padStart(2,'0')}/${g.year}</div><h2>Entscheidungen des Bürgermeisters</h2>
      <div class="decision-forecast ${f.sustainableBalance<0?'negative':'positive'}">Saldo nach laufender Versorgung: <b>${money(f.sustainableBalance)}</b></div>
      <div class="field"><label>Wohnsteuer: <b id="taxOut">${g.taxRate}%</b></label><input id="tax" type="range" min="0" max="30" value="${g.taxRate}"><div class="hint">Niedrige Steuern fördern Zuzug; hohe Steuern erhöhen Einnahmen, kosten aber Zustimmung.</div></div>
      <div class="field"><label>Nahrung für Einwohner: <b id="foodOut">${fmt.format(defaultFood)}</b></label><input id="food" type="range" min="0" max="${maxFood}" value="${defaultFood}"><div class="hint">Bedarf aktuell ungefähr ${fmt.format(g.monthlyFoodNeed())} Einheiten. Supermärkte sind bereits berücksichtigt.</div></div>
      <div class="field"><label>Maximal aufzunehmende Zuzügler</label><input id="admit" type="number" min="0" max="5000" value="${defaultAdmit}"><div class="hint">Ein Limit schützt dich davor, schneller zu wachsen als Versorgung und Arbeitsmarkt verkraften.</div></div>
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
        <div class="summary-row"><span>Einwohnersteuern</span><b class="good">+${money(s.residentRevenue)}</b></div>
        <div class="summary-row"><span>Gewerbe</span><b class="good">+${money(s.commerceRevenue)}</b></div>
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
      <p><b>Wachstum:</b> Menschen ziehen bei freien Wohnungen, Arbeit, vernünftigen Steuern, Versorgung, Bildung und guter Stimmung zu.</p>
      <p><b>Gewerbe:</b> Geschäfte und Supermärkte funktionieren nicht automatisch mit voller Leistung. Zu viele Verkaufsflächen bei zu wenigen Einwohnern bedeuten geringe Auslastung, weniger Jobs und weniger Gewerbeeinnahmen.</p>
      <p><b>Finanzen:</b> Einnahmen hängen von Beschäftigung, Steuersatz, Gewerbeauslastung und Produktivität ab. Gebäude, Einwohner und Schulden verursachen laufende Kosten.</p>
      <p><b>Bildung:</b> Schulen und Universitäten werden bei größerer Bevölkerung wichtig. Gute Bildungsdeckung stabilisiert die Stadt; Universitäten steigern zusätzlich die Produktivität.</p>
      <p><b>Versorgung:</b> Zu wenig Nahrung, Wohnraum oder Arbeit führt zu Unzufriedenheit und Wegzug. Supermärkte verbessern die Lebensmittel-Logistik.</p>
      <p><b>Verlieren:</b> Drei Monate tiefe Überschuldung, dauerhaft extrem schlechte Zustimmung, eine schwere Versorgungskrise oder eine fast entvölkerte Stadt beenden die Amtszeit.</p>
      <p><b>Info-Fenster:</b> Tippe im Markt auf das <b>i</b>, den Namen eines Gebäudes oder direkt auf ein Gebäude im Stadtbild. Dort siehst du die konkreten Auswirkungen und eine Einschätzung für deine aktuelle Stadt.</p>
      <button class="btn" id="backBtn" style="width:100%">ZURÜCK</button></div></section>`;
    document.getElementById('backBtn').onclick=renderHome;
  }

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  renderHome();
})();
