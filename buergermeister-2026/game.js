(() => {
'use strict';

const $ = s => document.querySelector(s);
const moneyFmt = n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(n));
const numFmt = n => new Intl.NumberFormat('de-DE').format(Math.round(n));
const pct = n => `${Math.round(n)}%`;
const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const SAVE_KEY = 'buergermeister2026-save-v3';
const LEGACY_SAVE_KEYS = ['buergermeister2026-save-v2','buergermeister2026-save-v1'];
const GRID_W = 18;
const GRID_H = 14;

const BUILDINGS = {
  road:         { name: 'Straße', emoji: '🛣️', cost: 12000, upkeep: 120, buildMonths: 0, color: '#59636b', jobs: 0, capacity: 0, happy: 0 },
  house:        { name: 'Wohnquartier', emoji: '🏠', cost: 150000, upkeep: 950, buildMonths: 2, color: '#d99c58', jobs: 8, capacity: 140, happy: 1, propertyBase: 5200 },
  apartments:   { name: 'Mehrfamilienhäuser', emoji: '🏢', cost: 420000, upkeep: 2800, buildMonths: 4, color: '#be8761', jobs: 18, capacity: 380, happy: -1, propertyBase: 14500 },
  shop:         { name: 'Ortszentrum', emoji: '🏪', cost: 260000, upkeep: 1750, buildMonths: 3, color: '#d68a45', jobs: 95, capacity: 0, happy: 2, businessBase: 9800 },
  factory:      { name: 'Gewerbegebiet', emoji: '🏭', cost: 620000, upkeep: 4200, buildMonths: 5, color: '#9a8b78', jobs: 230, capacity: 0, happy: -5, businessBase: 25000 },
  park:         { name: 'Park', emoji: '🌳', cost: 90000, upkeep: 650, buildMonths: 1, color: '#4f8b4d', jobs: 5, capacity: 0, happy: 6 },
  kindergarten: { name: 'Kita', emoji: '🧸', cost: 680000, upkeep: 9600, buildMonths: 5, color: '#e4b75f', jobs: 35, capacity: 0, happy: 5, service: 'education', serviceCapacity: 220 },
  school:       { name: 'Schule', emoji: '🏫', cost: 1600000, upkeep: 22000, buildMonths: 8, color: '#b37a55', jobs: 70, capacity: 0, happy: 7, service: 'education', serviceCapacity: 540 },
  fire:         { name: 'Feuerwehr', emoji: '🚒', cost: 920000, upkeep: 13500, buildMonths: 6, color: '#b94d47', jobs: 34, capacity: 0, happy: 6, service: 'safety', serviceCapacity: 850 },
  clinic:       { name: 'Gesundheitszentrum', emoji: '🏥', cost: 1800000, upkeep: 26000, buildMonths: 8, color: '#d8dee5', jobs: 82, capacity: 0, happy: 8, service: 'health', serviceCapacity: 1000 },
  solar:        { name: 'Solarpark', emoji: '☀️', cost: 360000, upkeep: 1600, buildMonths: 4, color: '#4e84a8', jobs: 12, capacity: 0, happy: 3, energyBase: 8500 },
  townhall:     { name: 'Rathaus', emoji: '🏛️', cost: 0, upkeep: 11000, buildMonths: 0, color: '#d0b17b', jobs: 42, capacity: 0, happy: 2, unique: true }
};

const EVENTS = [
  {
    title: 'Starkregen und Straßenschäden',
    text: 'Mehrere Straßen und ein Regenwassergraben müssen kurzfristig repariert werden.',
    choices: [
      { label: 'Umfangreich sanieren', detail: '90.000 € Kosten, Infrastruktur +7, Zufriedenheit +3', apply: s => { s.money -= 90000; s.infrastructure += 7; s.happiness += 3; } },
      { label: 'Nur das Nötigste reparieren', detail: '35.000 € Kosten, Infrastruktur +2', apply: s => { s.money -= 35000; s.infrastructure += 2; } }
    ]
  },
  {
    title: 'Landeszuschuss für Ortskern',
    text: 'Das Land fördert Maßnahmen zur Belebung des Ortszentrums und öffentlicher Plätze.',
    choices: [
      { label: 'Zuschuss annehmen', detail: '+120.000 € Zuschuss, Zustimmung +2', apply: s => { s.money += 120000; s.approval += 2; } },
      { label: 'Später entscheiden', detail: 'Keine direkte Auswirkung', apply: () => {} }
    ]
  },
  {
    title: 'Firma prüft Ansiedlung',
    text: 'Ein regionaler Betrieb sucht eine neue Fläche und erwartet eine aktive Begleitung durch die Gemeinde.',
    choices: [
      { label: 'Fläche vorbereiten', detail: '60.000 € Kosten, Wirtschaft +5, zusätzliche Jobs', apply: s => { s.money -= 60000; s.economy += 5; s.bonusJobs += 120; } },
      { label: 'Absagen', detail: 'Zufriedenheit -2, Wirtschaft -3', apply: s => { s.happiness -= 2; s.economy -= 3; } }
    ]
  },
  {
    title: 'Bürger fordern Freizeitfläche',
    text: 'Familien wünschen sich einen neuen Treffpunkt mit Grünflächen und Aufenthaltsqualität.',
    choices: [
      { label: 'Projekt umsetzen', detail: '75.000 € Kosten, Umwelt +5, Zufriedenheit +5', apply: s => { s.money -= 75000; s.environment += 5; s.happiness += 5; } },
      { label: 'Verschieben', detail: 'Zufriedenheit -4', apply: s => { s.happiness -= 4; } }
    ]
  },
  {
    title: 'Kreis hebt Umlage an',
    text: 'Die Kreisumlage steigt im kommenden Monat aufgrund angespannter Haushalte.',
    choices: [
      { label: 'Zur Kenntnis nehmen', detail: 'Kreisumlage +1 Punkt', apply: s => { s.levyModifier += 1; } },
      { label: 'Öffentlich protestieren', detail: 'Zustimmung +2, Kreisumlage +1 bleibt', apply: s => { s.levyModifier += 1; s.approval += 2; } }
    ]
  }
];

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function emptyGrid() { return Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null)); }

function baseStarterState() {
  const g = emptyGrid();
  for (let x = 2; x < 16; x++) g[7][x] = { type: 'road' };
  for (let y = 3; y < 12; y++) g[y][8] = { type: 'road' };
  g[6][7] = { type: 'townhall' };
  g[5][5] = { type: 'house' };
  g[5][6] = { type: 'house' };
  g[8][5] = { type: 'house' };
  g[8][6] = { type: 'house' };
  g[4][10] = { type: 'house' };
  g[9][11] = { type: 'shop' };
  g[5][11] = { type: 'park' };
  g[8][10] = { type: 'kindergarten' };
  return {
    version: 3,
    cityName: 'Musterstadt',
    year: 2026,
    month: 0,
    money: 950000,
    debt: 0,
    interestRate: 3.4,
    inflation: 2.0,
    economy: 55,
    population: 620,
    happiness: 63,
    approval: 60,
    councilSupport: 58,
    environment: 56,
    infrastructure: 61,
    bonusJobs: 0,
    levyModifier: 0,
    capitalSpentYear: 0,
    capitalSpentLastYear: 0,
    fiscalHistory: [],
    taxRates: { property: 100, business: 100, fees: 100 },
    grid: g,
    selected: 'road',
    speed: 1,
    monthsPlayed: 0,
    lastEvent: 0,
    eventLog: [],
    electionsWon: 0,
    gameOver: false,
    stats: {
      income: 0, expenses: 0, operating: 0,
      propertyTax: 0, residentShare: 0, businessTax: 0, fees: 0, grants: 0, energy: 0,
      admin: 0, facilities: 0, social: 0, roads: 0, levy: 0, interest: 0, repayment: 0,
      attractiveness: 0, commuters: 0, servicePressure: 0, businessClimate: 0, families: 0, workingAge: 0, seniors: 0, youth: 0
    },
    objectives: { pop1500: false, happy75: false, balance: false, services: false }
  };
}

function normalizeState(raw) {
  const base = baseStarterState();
  const merged = { ...base, ...(raw || {}) };
  merged.version = 3;
  merged.taxRates = { ...base.taxRates, ...(raw?.taxRates || {}) };
  merged.stats = { ...base.stats, ...(raw?.stats || {}) };
  merged.objectives = { ...base.objectives, ...(raw?.objectives || {}) };
  merged.money = Number.isFinite(merged.money) ? merged.money : base.money;
  merged.debt = Number.isFinite(merged.debt) ? merged.debt : 0;
  merged.interestRate = Number.isFinite(merged.interestRate) ? merged.interestRate : base.interestRate;
  merged.inflation = Number.isFinite(merged.inflation) ? merged.inflation : base.inflation;
  merged.economy = Number.isFinite(merged.economy) ? merged.economy : base.economy;
  merged.levyModifier = Number.isFinite(merged.levyModifier) ? merged.levyModifier : 0;
  merged.councilSupport = Number.isFinite(merged.councilSupport) ? merged.councilSupport : base.councilSupport;
  merged.capitalSpentYear = Number.isFinite(merged.capitalSpentYear) ? merged.capitalSpentYear : 0;
  merged.capitalSpentLastYear = Number.isFinite(merged.capitalSpentLastYear) ? merged.capitalSpentLastYear : 0;
  merged.fiscalHistory = Array.isArray(merged.fiscalHistory) ? merged.fiscalHistory : [];
  merged.grid = Array.isArray(merged.grid) ? merged.grid : base.grid;
  return merged;
}

function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
function load() {
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      for (const key of LEGACY_SAVE_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed ? normalizeState(parsed) : null;
  } catch {
    return null;
  }
}

let state = load() || baseStarterState();

const canvas = $('#gameCanvas');
const ctx = canvas.getContext('2d');
let view = { scale: 1, offsetX: 0, offsetY: 0 };
let dragging = false;
let lastPointer = null;
let lastTick = performance.now();
let toastTimer = null;

function resetGame() {
  state = baseStarterState();
  save();
  fitMap();
  renderPanel('overview');
  showToast('Neues Spiel gestartet');
}

function counts(activeOnly = false) {
  const c = {};
  for (const row of state.grid) {
    for (const cell of row) {
      if (!cell) continue;
      if (activeOnly && cell.underConstruction) continue;
      c[cell.type] = (c[cell.type] || 0) + 1;
    }
  }
  return c;
}

function constructionProjects() {
  const list = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const cell = state.grid[y][x];
      if (cell?.underConstruction) list.push({ x, y, ...cell, name: BUILDINGS[cell.type]?.name || cell.type });
    }
  }
  return list;
}

function demographicSnapshot(pop = state.population) {
  const attractiveness = state.stats.attractiveness || 55;
  const familyBias = clamp((attractiveness - 50) * 0.002, -0.035, 0.05);
  const youth = Math.round(pop * clamp(0.17 + familyBias, 0.12, 0.23));
  const seniors = Math.round(pop * clamp(0.22 - familyBias * 0.45, 0.16, 0.29));
  const workingAge = Math.max(0, pop - youth - seniors);
  const families = Math.round(pop / 2.35);
  return { youth, seniors, workingAge, families };
}

function progressConstruction() {
  const completed = [];
  for (const row of state.grid) {
    for (const cell of row) {
      if (!cell?.underConstruction) continue;
      cell.monthsLeft = Math.max(0, (cell.monthsLeft || 1) - 1);
      if (cell.monthsLeft <= 0) {
        cell.underConstruction = false;
        completed.push(BUILDINGS[cell.type]?.name || cell.type);
      }
    }
  }
  if (completed.length) {
    const unique = [...new Set(completed)];
    state.eventLog.unshift({ date: `${monthNames[state.month]} ${state.year}`, title: 'Bauprojekte fertiggestellt', choice: unique.join(', ') });
    state.eventLog = state.eventLog.slice(0, 24);
    showToast(`${completed.length} Bauprojekt${completed.length === 1 ? '' : 'e'} fertiggestellt`);
  }
}

function buildingCount(type) {
  let total = 0;
  for (const row of state.grid) for (const cell of row) if (cell?.type === type) total++;
  return total;
}

function metrics() {
  const c = counts(true);
  let residentialCapacity = 0;
  let localJobs = state.bonusJobs;
  let facilityUpkeepBase = 0;
  let happinessMod = 0;
  let serviceCapacity = { education: 0, safety: 0, health: 0 };
  let propertyBase = 0;
  let businessBase = 0;
  let energyBase = 0;
  let leisureScore = 0;

  for (const [type, amount] of Object.entries(c)) {
    const b = BUILDINGS[type];
    if (!b) continue;
    residentialCapacity += (b.capacity || 0) * amount;
    localJobs += (b.jobs || 0) * amount;
    facilityUpkeepBase += (b.upkeep || 0) * amount;
    happinessMod += (b.happy || 0) * amount;
    propertyBase += (b.propertyBase || 0) * amount;
    businessBase += (b.businessBase || 0) * amount;
    energyBase += (b.energyBase || 0) * amount;
    if (b.service) serviceCapacity[b.service] += (b.serviceCapacity || 0) * amount;
    if (type === 'park') leisureScore += 10 * amount;
    if (type === 'shop') leisureScore += 4 * amount;
  }

  const commuterPool = Math.round(localJobs * 0.28);
  const employableDemand = Math.max(0, state.population - Math.round(state.population * 0.12));
  const employedResidents = Math.min(employableDemand, Math.max(0, localJobs - commuterPool));
  const unemployment = employableDemand > 0 ? Math.max(0, 100 - (employedResidents / employableDemand) * 100) : 0;

  const children = Math.round(state.population * 0.16);
  const pupils = Math.round(state.population * 0.12);
  const medicalNeed = state.population;
  const serviceLevels = {
    education: clamp((serviceCapacity.education / Math.max(1, children + pupils)) * 100, 0, 160),
    safety: clamp((serviceCapacity.safety / Math.max(1, state.population)) * 100, 0, 160),
    health: clamp((serviceCapacity.health / Math.max(1, medicalNeed)) * 100, 0, 160)
  };

  const roadCount = c.road || 0;
  const taxPressure = ((state.taxRates.property - 100) + (state.taxRates.business - 100) + (state.taxRates.fees - 100)) / 3;
  const attractiveness = clamp(
    48
      + (state.happiness - 50) * 0.45
      + (state.environment - 50) * 0.22
      + (state.infrastructure - 50) * 0.25
      + (serviceLevels.education - 75) * 0.08
      + (serviceLevels.health - 75) * 0.07
      + leisureScore * 0.25
      - unemployment * 0.28
      - taxPressure * 0.35,
    5,
    95
  );

  const residentShare = Math.round(state.population * 74 * (1 + state.economy / 300));
  const propertyTax = Math.round(propertyBase * (state.taxRates.property / 100) * (1 + state.population / 7000));
  const businessTax = Math.round(businessBase * (state.taxRates.business / 100) * (0.6 + state.economy / 100));
  const fees = Math.round(state.population * 17 * (state.taxRates.fees / 100));
  const grants = Math.round(11000 + state.population * 12 + Math.max(0, (75 - attractiveness)) * 90);
  const energy = Math.round(energyBase * (0.85 + state.economy / 200));
  const income = residentShare + propertyTax + businessTax + fees + grants + energy;

  const inflationFactor = 1 + state.inflation / 100;
  const admin = Math.round((12000 + state.population * 6.4) * inflationFactor);
  const facilities = Math.round(facilityUpkeepBase * inflationFactor);
  const social = Math.round((state.population * (11 + unemployment * 0.32)) * inflationFactor);
  const roads = Math.round((roadCount * 650 + state.population * 3 + Math.max(0, 70 - state.infrastructure) * 250) * inflationFactor);
  const levy = Math.round((9000 + state.population * (11 + state.levyModifier * 0.8)) * inflationFactor);
  const interest = Math.round((state.debt * (state.interestRate / 100)) / 12);
  const repayment = Math.round(state.debt > 0 ? Math.min(Math.max(7000, state.debt * 0.008), state.debt) : 0);
  const expenses = admin + facilities + social + roads + levy + interest + repayment;
  const operating = income - expenses;
  const demographics = demographicSnapshot(state.population);
  const businessClimate = clamp(50 + (state.economy - 50) * 0.55 + (state.infrastructure - 50) * 0.22 - (state.taxRates.business - 100) * 0.38 + (c.shop || 0) * 1.5, 5, 98);
  const companies = (c.shop || 0) * 14 + (c.factory || 0) * 9 + Math.round(state.bonusJobs / 25);

  return {
    c,
    residentialCapacity,
    localJobs,
    commuterPool,
    unemployment,
    serviceCapacity,
    serviceLevels,
    propertyTax,
    residentShare,
    businessTax,
    fees,
    grants,
    energy,
    income,
    admin,
    facilities,
    social,
    roads,
    levy,
    interest,
    repayment,
    expenses,
    operating,
    happinessMod,
    attractiveness,
    leisureScore, demographics, businessClimate, companies
  };
}

function changeRate(kind, delta) {
  const current = state.taxRates[kind];
  state.taxRates[kind] = clamp(current + delta, 75, 150);
  save();
  renderPanel('finance');
  updateHUD();
}

function takeLoan() {
  state.debt += 250000;
  state.money += 250000;
  state.approval -= 2;
  showToast('Kredit über 250.000 € aufgenommen');
  save();
  renderPanel('finance');
  updateHUD();
}

function repayDebt() {
  const amount = Math.min(50000, state.debt, Math.max(0, state.money - 10000));
  if (amount <= 0) {
    showToast('Keine ausreichenden freien Mittel für Sondertilgung');
    return;
  }
  state.debt -= amount;
  state.money -= amount;
  state.approval += 1;
  showToast(`Sondertilgung: ${moneyFmt(amount)}`);
  save();
  renderPanel('finance');
  updateHUD();
}

function checkObjectives(m) {
  state.objectives.pop1500 = state.population >= 1500;
  state.objectives.happy75 = state.happiness >= 75;
  state.objectives.balance = m.operating >= 10000;
  state.objectives.services = m.serviceLevels.education >= 85 && m.serviceLevels.safety >= 85 && m.serviceLevels.health >= 85;
}

function triggerEvent() {
  const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  openModal(`<div class="tag">Ereignis</div><h2>${ev.title}</h2><p>${ev.text}</p>${ev.choices.map((c, i) => `<button class="choice" data-choice="${i}"><b>${c.label}</b><small>${c.detail}</small></button>`).join('')}`);
  document.querySelectorAll('[data-choice]').forEach(btn => {
    btn.onclick = () => {
      const choice = ev.choices[+btn.dataset.choice];
      choice.apply(state);
      state.happiness = clamp(state.happiness, 5, 98);
      state.approval = clamp(state.approval, 5, 98);
      state.environment = clamp(state.environment, 5, 100);
      state.infrastructure = clamp(state.infrastructure, 5, 100);
      state.economy = clamp(state.economy, 15, 95);
      state.eventLog.unshift({ date: `${monthNames[state.month]} ${state.year}`, title: ev.title, choice: choice.label });
      state.eventLog = state.eventLog.slice(0, 24);
      closeModal();
      save();
      updateHUD();
      renderPanel('events');
      showToast('Entscheidung übernommen');
    };
  });
}

function election() {
  const debtPenalty = clamp(state.debt / 100000, 0, 18);
  const score = Math.round(state.approval * 0.50 + state.happiness * 0.24 + clamp(state.stats.attractiveness, 0, 100) * 0.12 + state.councilSupport * 0.14 - debtPenalty);
  if (score >= 50) {
    state.electionsWon++;
    state.money += 80000;
    openModal(`<h2>🗳️ Wiedergewählt!</h2><p>Du erreichst <b>${score}%</b> und bekommst eine weitere Amtszeit.</p><p class="good">80.000 € Investitionszuschuss wurden bewilligt.</p><button class="primary" id="continueBtn">Weiterregieren</button>`);
    setTimeout(() => { $('#continueBtn').onclick = closeModal; }, 0);
  } else {
    state.gameOver = true;
    openModal(`<h2>🗳️ Wahl verloren</h2><p>Mit <b>${score}%</b> reicht es nicht für eine weitere Amtszeit.</p><button class="primary" id="restartBtn">Neue Amtszeit starten</button>`);
    setTimeout(() => { $('#restartBtn').onclick = () => { closeModal(); resetGame(); }; }, 0);
  }
  save();
}

function simulateMonth() {
  if (state.gameOver) return;

  state.month++;
  state.monthsPlayed++;
  if (state.month > 11) {
    state.month = 0;
    state.capitalSpentLastYear = state.capitalSpentYear;
    state.fiscalHistory.unshift({ year: state.year, income: state.stats.income * 12, expenses: state.stats.expenses * 12, capital: state.capitalSpentYear, debt: state.debt });
    state.fiscalHistory = state.fiscalHistory.slice(0, 5);
    state.capitalSpentYear = 0;
    state.year++;
  }

  progressConstruction();

  state.economy = clamp(state.economy + rand(-2.2, 2.4), 20, 95);
  state.inflation = clamp(state.inflation + rand(-0.18, 0.22), 1.0, 8.0);
  state.interestRate = clamp(state.interestRate + rand(-0.08, 0.10), 2.0, 8.5);

  const m = metrics();
  state.stats = {
    income: m.income,
    expenses: m.expenses,
    operating: m.operating,
    propertyTax: m.propertyTax,
    residentShare: m.residentShare,
    businessTax: m.businessTax,
    fees: m.fees,
    grants: m.grants,
    energy: m.energy,
    admin: m.admin,
    facilities: m.facilities,
    social: m.social,
    roads: m.roads,
    levy: m.levy,
    interest: m.interest,
    repayment: m.repayment,
    attractiveness: m.attractiveness,
    commuters: m.commuterPool,
    servicePressure: Math.round((m.serviceLevels.education + m.serviceLevels.safety + m.serviceLevels.health) / 3),
    businessClimate: m.businessClimate,
    families: m.demographics.families,
    workingAge: m.demographics.workingAge,
    seniors: m.demographics.seniors,
    youth: m.demographics.youth
  };

  state.money += m.operating;
  state.debt = Math.max(0, state.debt - m.repayment);

  if (state.money < -25000) {
    const needed = Math.ceil(Math.abs(state.money) / 5000) * 5000 + 20000;
    state.debt += needed;
    state.money += needed;
    state.approval -= 2;
    showToast(`Automatischer Kassenkredit: ${moneyFmt(needed)}`);
  }

  const freeHomes = Math.max(0, m.residentialCapacity - state.population);
  const employmentGap = m.localJobs - state.population;
  const taxPenalty = ((state.taxRates.property - 100) * 0.18 + (state.taxRates.fees - 100) * 0.14 + (state.taxRates.business - 100) * 0.08);
  const moveIntent = m.attractiveness * 0.22 + employmentGap * 0.02 + freeHomes * 0.015 - taxPenalty;
  const moveDelta = clamp(Math.round(moveIntent / 2.8), -35, 42);
  const growth = clamp(Math.min(freeHomes, moveDelta), -20, freeHomes);
  state.population = Math.max(150, state.population + growth);

  const servicesAvg = (m.serviceLevels.education + m.serviceLevels.safety + m.serviceLevels.health) / 3;
  const economicMood = (state.economy - 50) * 0.14;
  const fiscalMood = m.operating >= 0 ? 2.5 : -4.5;
  const debtMood = state.debt > 0 ? -Math.min(9, state.debt / 180000) : 0;
  const targetHappy = clamp(52 + m.happinessMod + (servicesAvg - 75) * 0.12 + (state.environment - 50) * 0.16 + (state.infrastructure - 50) * 0.13 + economicMood + fiscalMood + debtMood - m.unemployment * 0.22, 8, 95);
  state.happiness = clamp(Math.round(state.happiness + (targetHappy - state.happiness) * 0.24), 5, 98);
  state.approval = clamp(Math.round(state.approval + (state.happiness - state.approval) * 0.11 + (m.operating > 0 ? 0.8 : -0.9)), 5, 98);
  state.councilSupport = clamp(Math.round(state.councilSupport + (state.approval - state.councilSupport) * 0.08 + (m.operating > 0 ? 0.35 : -0.45)), 18, 92);

  state.infrastructure = clamp(state.infrastructure - 0.25 + buildingCount('road') * 0.01, 10, 100);
  state.environment = clamp(state.environment - 0.12 - buildingCount('factory') * 0.35 + buildingCount('park') * 0.28 + buildingCount('solar') * 0.2, 10, 100);

  checkObjectives(m);
  if (state.monthsPlayed - state.lastEvent >= 5 && Math.random() < 0.28) {
    state.lastEvent = state.monthsPlayed;
    triggerEvent();
  }
  if (state.monthsPlayed > 0 && state.monthsPlayed % 48 === 0) election();
  if (state.money < -300000 && state.debt > 1200000) {
    state.gameOver = true;
    openModal(`<h2>💸 Haushalt kollabiert</h2><p>Die Gemeinde ist dauerhaft überschuldet und nicht mehr handlungsfähig.</p><button class="primary" id="restartBtn">Neues Spiel</button>`);
    setTimeout(() => { $('#restartBtn').onclick = () => { closeModal(); resetGame(); }; }, 0);
  }

  save();
  updateHUD();
  if ($('#panel').classList.contains('open')) renderPanel(document.querySelector('.dock button.active')?.dataset.panel || 'overview');
}

function resize() {
  const r = canvas.getBoundingClientRect();
  const d = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(r.width * d);
  canvas.height = Math.floor(r.height * d);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  draw();
}

function cellSize() { return 52 * view.scale; }

function fitMap() {
  const r = canvas.getBoundingClientRect();
  view.scale = Math.max(0.55, Math.min(1.08, Math.min((r.width - 40) / (GRID_W * 52), (r.height - 40) / (GRID_H * 52))));
  view.offsetX = (r.width - GRID_W * 52 * view.scale) / 2;
  view.offsetY = (r.height - GRID_H * 52 * view.scale) / 2;
  draw();
}

function roadNeighbors(x, y) {
  return {
    n: state.grid[y - 1]?.[x]?.type === 'road',
    e: state.grid[y]?.[x + 1]?.type === 'road',
    s: state.grid[y + 1]?.[x]?.type === 'road',
    w: state.grid[y]?.[x - 1]?.type === 'road'
  };
}

function drawTileGrass(px, py, cs, x, y) {
  const g = ctx.createLinearGradient(px, py, px, py + cs);
  g.addColorStop(0, (x + y) % 2 ? '#638b54' : '#6d965b');
  g.addColorStop(1, (x + y) % 2 ? '#567e49' : '#5e8650');
  ctx.fillStyle = g;
  ctx.fillRect(px, py, cs + 1, cs + 1);

  ctx.fillStyle = 'rgba(255,255,255,.04)';
  ctx.fillRect(px + cs * 0.08, py + cs * 0.08, cs * 0.12, cs * 0.12);
  ctx.fillRect(px + cs * 0.75, py + cs * 0.65, cs * 0.1, cs * 0.1);
  ctx.fillStyle = 'rgba(0,0,0,.08)';
  ctx.fillRect(px + cs * 0.3, py + cs * 0.72, cs * 0.08, cs * 0.08);
}

function drawRoad(px, py, cs, x, y) {
  const nb = roadNeighbors(x, y);
  ctx.fillStyle = '#6b7278';
  ctx.fillRect(px + cs * 0.32, py + cs * 0.32, cs * 0.36, cs * 0.36);
  if (nb.n) ctx.fillRect(px + cs * 0.32, py, cs * 0.36, cs * 0.37);
  if (nb.s) ctx.fillRect(px + cs * 0.32, py + cs * 0.63, cs * 0.36, cs * 0.37);
  if (nb.w) ctx.fillRect(px, py + cs * 0.32, cs * 0.37, cs * 0.36);
  if (nb.e) ctx.fillRect(px + cs * 0.63, py + cs * 0.32, cs * 0.37, cs * 0.36);

  ctx.fillStyle = '#828a90';
  ctx.fillRect(px + cs * 0.34, py + cs * 0.34, cs * 0.32, cs * 0.32);
  if (nb.n) ctx.fillRect(px + cs * 0.34, py, cs * 0.32, cs * 0.35);
  if (nb.s) ctx.fillRect(px + cs * 0.34, py + cs * 0.65, cs * 0.32, cs * 0.35);
  if (nb.w) ctx.fillRect(px, py + cs * 0.34, cs * 0.35, cs * 0.32);
  if (nb.e) ctx.fillRect(px + cs * 0.65, py + cs * 0.34, cs * 0.35, cs * 0.32);

  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = Math.max(1, cs * 0.02);
  ctx.strokeRect(px + cs * 0.32, py + cs * 0.32, cs * 0.36, cs * 0.36);

  ctx.strokeStyle = '#ead98e';
  ctx.lineWidth = Math.max(1, cs * 0.035);
  ctx.setLineDash([cs * 0.12, cs * 0.09]);
  ctx.beginPath();
  if (nb.n || nb.s) {
    ctx.moveTo(px + cs * 0.5, py + (nb.n ? 0 : cs * 0.34));
    ctx.lineTo(px + cs * 0.5, py + (nb.s ? cs : cs * 0.66));
  }
  if (nb.e || nb.w || (!nb.n && !nb.s)) {
    ctx.moveTo(px + (nb.w ? 0 : cs * 0.34), py + cs * 0.5);
    ctx.lineTo(px + (nb.e ? cs : cs * 0.66), py + cs * 0.5);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPlot(px, py, cs) {
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath();
  ctx.ellipse(px + cs * 0.54, py + cs * 0.8, cs * 0.3, cs * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#769a63';
  ctx.fillRect(px + cs * 0.12, py + cs * 0.16, cs * 0.76, cs * 0.64);
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = Math.max(1, cs * 0.015);
  ctx.strokeRect(px + cs * 0.12, py + cs * 0.16, cs * 0.76, cs * 0.64);
}

function drawRoof(px, py, w, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(px, py + h);
  ctx.lineTo(px + w * 0.5, py);
  ctx.lineTo(px + w, py + h);
  ctx.closePath();
  ctx.fill();
}

function drawWindowGrid(x, y, cols, rows, w, h, color='#c8e6ff') {
  const gapX = w / cols;
  const gapY = h / rows;
  ctx.fillStyle = color;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      ctx.fillRect(x + cx * gapX + gapX * 0.18, y + cy * gapY + gapY * 0.18, gapX * 0.45, gapY * 0.42);
    }
  }
}

function drawHouse(px, py, cs, color) {
  drawPlot(px, py, cs);
  ctx.fillStyle = color;
  ctx.fillRect(px + cs * 0.26, py + cs * 0.38, cs * 0.46, cs * 0.28);
  drawRoof(px + cs * 0.22, py + cs * 0.24, cs * 0.54, cs * 0.18, '#9b543c');
  ctx.fillStyle = '#f3eddc';
  ctx.fillRect(px + cs * 0.43, py + cs * 0.5, cs * 0.08, cs * 0.16);
  drawWindowGrid(px + cs * 0.3, py + cs * 0.45, 2, 1, cs * 0.18, cs * 0.12);
  drawWindowGrid(px + cs * 0.54, py + cs * 0.45, 2, 1, cs * 0.12, cs * 0.12);
}

function drawApartments(px, py, cs) {
  drawPlot(px, py, cs);
  ctx.fillStyle = '#d4b2a1';
  ctx.fillRect(px + cs * 0.18, py + cs * 0.28, cs * 0.62, cs * 0.4);
  ctx.fillStyle = '#ba7c65';
  ctx.fillRect(px + cs * 0.2, py + cs * 0.24, cs * 0.58, cs * 0.09);
  drawWindowGrid(px + cs * 0.24, py + cs * 0.34, 4, 3, cs * 0.48, cs * 0.25, '#d8edff');
  ctx.fillStyle = '#f3eddc';
  ctx.fillRect(px + cs * 0.46, py + cs * 0.55, cs * 0.08, cs * 0.13);
}

function drawShop(px, py, cs) {
  drawPlot(px, py, cs);
  ctx.fillStyle = '#f3dcc3';
  ctx.fillRect(px + cs * 0.18, py + cs * 0.38, cs * 0.62, cs * 0.24);
  ctx.fillStyle = '#b26e49';
  ctx.fillRect(px + cs * 0.18, py + cs * 0.3, cs * 0.62, cs * 0.1);
  ctx.fillStyle = '#c63f38';
  for (let i = 0; i < 5; i++) ctx.fillRect(px + cs * (0.2 + i * 0.12), py + cs * 0.4, cs * 0.06, cs * 0.08);
  ctx.fillStyle = '#cde6ff';
  ctx.fillRect(px + cs * 0.24, py + cs * 0.49, cs * 0.22, cs * 0.08);
  ctx.fillRect(px + cs * 0.52, py + cs * 0.49, cs * 0.18, cs * 0.08);
}

function drawFactory(px, py, cs) {
  drawPlot(px, py, cs);
  ctx.fillStyle = '#a5a19c';
  ctx.fillRect(px + cs * 0.18, py + cs * 0.4, cs * 0.58, cs * 0.22);
  ctx.fillStyle = '#8d6d60';
  ctx.fillRect(px + cs * 0.55, py + cs * 0.2, cs * 0.1, cs * 0.26);
  ctx.fillStyle = '#73635b';
  ctx.beginPath();
  ctx.moveTo(px + cs * 0.18, py + cs * 0.4);
  ctx.lineTo(px + cs * 0.36, py + cs * 0.28);
  ctx.lineTo(px + cs * 0.52, py + cs * 0.4);
  ctx.closePath();
  ctx.fill();
  drawWindowGrid(px + cs * 0.26, py + cs * 0.47, 4, 1, cs * 0.34, cs * 0.07, '#dbe6ef');
}

function drawPark(px, py, cs) {
  drawPlot(px, py, cs);
  ctx.fillStyle = '#5d8a42';
  ctx.beginPath();
  ctx.arc(px + cs * 0.48, py + cs * 0.42, cs * 0.16, 0, Math.PI * 2);
  ctx.arc(px + cs * 0.61, py + cs * 0.45, cs * 0.14, 0, Math.PI * 2);
  ctx.arc(px + cs * 0.4, py + cs * 0.48, cs * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#734b32';
  ctx.fillRect(px + cs * 0.47, py + cs * 0.46, cs * 0.05, cs * 0.16);
  ctx.fillStyle = '#c9b47a';
  ctx.fillRect(px + cs * 0.2, py + cs * 0.6, cs * 0.4, cs * 0.05);
}

function drawCivic(px, py, cs, body, roof, accent) {
  drawPlot(px, py, cs);
  ctx.fillStyle = body;
  ctx.fillRect(px + cs * 0.18, py + cs * 0.34, cs * 0.62, cs * 0.3);
  drawRoof(px + cs * 0.15, py + cs * 0.2, cs * 0.68, cs * 0.18, roof);
  ctx.fillStyle = accent;
  ctx.fillRect(px + cs * 0.46, py + cs * 0.47, cs * 0.08, cs * 0.17);
  drawWindowGrid(px + cs * 0.24, py + cs * 0.42, 3, 2, cs * 0.48, cs * 0.16);
}

function drawSolar(px, py, cs) {
  drawPlot(px, py, cs);
  ctx.fillStyle = '#366d9a';
  ctx.fillRect(px + cs * 0.18, py + cs * 0.38, cs * 0.22, cs * 0.18);
  ctx.fillRect(px + cs * 0.44, py + cs * 0.38, cs * 0.22, cs * 0.18);
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = Math.max(1, cs * 0.01);
  for (const x of [0.18, 0.44]) {
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(px + cs * (x + i * 0.073), py + cs * 0.38);
      ctx.lineTo(px + cs * (x + i * 0.073), py + cs * 0.56);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#e8c85a';
  ctx.beginPath();
  ctx.arc(px + cs * 0.72, py + cs * 0.34, cs * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawConstructionSite(cell, px, py, cs) {
  drawPlot(px, py, cs);
  ctx.fillStyle = '#c99b4d';
  ctx.fillRect(px + cs * 0.18, py + cs * 0.57, cs * 0.64, cs * 0.07);
  ctx.strokeStyle = '#f2d48a';
  ctx.lineWidth = Math.max(1, cs * 0.025);
  for (let i = 0; i < 5; i++) {
    const x = px + cs * (0.2 + i * 0.14);
    ctx.beginPath(); ctx.moveTo(x, py + cs * 0.25); ctx.lineTo(x, py + cs * 0.63); ctx.stroke();
  }
  ctx.fillStyle = '#33434e';
  ctx.fillRect(px + cs * 0.64, py + cs * 0.26, cs * 0.07, cs * 0.3);
  ctx.fillStyle = '#f4cf53';
  ctx.fillRect(px + cs * 0.68, py + cs * 0.26, cs * 0.17, cs * 0.04);
  ctx.font = `${Math.max(9, cs * 0.16)}px system-ui`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(`${cell.monthsLeft || 1}M`, px + cs * 0.5, py + cs * 0.75);
}

function drawBuilding(cell, px, py, cs, x, y) {
  const type = cell.type;
  if (cell.underConstruction) return drawConstructionSite(cell, px, py, cs);
  if (type === 'road') return drawRoad(px, py, cs, x, y);
  if (type === 'house') return drawHouse(px, py, cs, '#f2c38a');
  if (type === 'apartments') return drawApartments(px, py, cs);
  if (type === 'shop') return drawShop(px, py, cs);
  if (type === 'factory') return drawFactory(px, py, cs);
  if (type === 'park') return drawPark(px, py, cs);
  if (type === 'kindergarten') return drawCivic(px, py, cs, '#f1d79b', '#cb8747', '#c9955a');
  if (type === 'school') return drawCivic(px, py, cs, '#d4a17d', '#8c4736', '#8a5d3b');
  if (type === 'fire') return drawCivic(px, py, cs, '#d4675c', '#8e2d2d', '#772323');
  if (type === 'clinic') return drawCivic(px, py, cs, '#dce7ec', '#6a8db3', '#afc1cf');
  if (type === 'solar') return drawSolar(px, py, cs);
  if (type === 'townhall') return drawCivic(px, py, cs, '#d8c4a1', '#7f684a', '#6f5b40');
}

function draw() {
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  const sky = ctx.createLinearGradient(0, 0, 0, r.height);
  sky.addColorStop(0, '#295033');
  sky.addColorStop(1, '#203c25');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, r.width, r.height);

  const cs = cellSize();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const px = view.offsetX + x * cs;
      const py = view.offsetY + y * cs;
      drawTileGrass(px, py, cs, x, y);
      ctx.strokeStyle = 'rgba(16,37,18,.12)';
      ctx.lineWidth = Math.max(1, cs * 0.012);
      ctx.strokeRect(px, py, cs, cs);
      const cell = state.grid[y][x];
      if (cell) drawBuilding(cell, px, py, cs, x, y);
    }
  }
}

function pointerCell(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const cs = cellSize();
  const x = Math.floor((clientX - r.left - view.offsetX) / cs);
  const y = Math.floor((clientY - r.top - view.offsetY) / cs);
  return { x, y };
}

function validCell(x, y) { return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H; }
function hasRoadAdjacent(x, y) { return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => state.grid[y + dy]?.[x + dx]?.type === 'road'); }

function buildAt(x, y) {
  if (!validCell(x, y) || state.gameOver) return;
  const type = state.selected;
  const b = BUILDINGS[type];

  if (type === 'bulldoze') {
    const old = state.grid[y][x];
    if (!old || old.type === 'townhall') {
      showToast(old ? 'Das Rathaus kann nicht abgerissen werden' : 'Hier steht nichts');
      return;
    }
    state.grid[y][x] = null;
    state.money -= 5000;
    showToast('Gebäude abgerissen (-5.000 €)');
    save(); updateHUD(); draw(); renderPanel('build');
    return;
  }

  if (state.grid[y][x]) {
    showToast('Feld ist bereits belegt');
    return;
  }
  if (type !== 'road' && !hasRoadAdjacent(x, y)) {
    showToast('Gebäude benötigen eine angrenzende Straße');
    return;
  }
  if (b.unique && buildingCount(type)) {
    showToast(`${b.name} ist bereits vorhanden`);
    return;
  }
  if (state.money < b.cost) {
    showToast('Nicht genügend Geld');
    return;
  }

  if (b.cost >= 900000 && state.councilSupport < 40) {
    showToast('Für dieses Großprojekt fehlt dir aktuell eine Ratsmehrheit');
    return;
  }
  state.money -= b.cost;
  state.capitalSpentYear += b.cost;
  const months = b.buildMonths || 0;
  state.grid[y][x] = months > 0 ? { type, underConstruction: true, monthsLeft: months } : { type };
  if (b.cost >= 900000) state.councilSupport = clamp(state.councilSupport - 2, 0, 100);
  if (type === 'park') state.environment = clamp(state.environment + 2, 0, 100);
  if (type === 'road') state.infrastructure = clamp(state.infrastructure + 0.4, 0, 100);
  if (type === 'factory') state.economy = clamp(state.economy + 1.5, 0, 100);
  showToast(months > 0 ? `${b.name}: Bauzeit ${months} Monate` : `${b.name} gebaut: ${moneyFmt(b.cost)}`);
  save();
  updateHUD();
  draw();
  renderPanel('build');
}

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  dragging = true;
  lastPointer = { x: e.clientX, y: e.clientY, moved: false };
});
canvas.addEventListener('pointermove', e => {
  if (!dragging || !lastPointer) return;
  const dx = e.clientX - lastPointer.x;
  const dy = e.clientY - lastPointer.y;
  if (Math.abs(dx) + Math.abs(dy) > 6) {
    view.offsetX += dx;
    view.offsetY += dy;
    lastPointer = { x: e.clientX, y: e.clientY, moved: true };
    draw();
  }
});
canvas.addEventListener('pointerup', e => {
  if (dragging && lastPointer && !lastPointer.moved) {
    const c = pointerCell(e.clientX, e.clientY);
    buildAt(c.x, c.y);
  }
  dragging = false;
  lastPointer = null;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const old = view.scale;
  view.scale = clamp(view.scale * (e.deltaY < 0 ? 1.1 : 0.9), 0.45, 1.8);
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const my = e.clientY - r.top;
  view.offsetX = mx - (mx - view.offsetX) * (view.scale / old);
  view.offsetY = my - (my - view.offsetY) * (view.scale / old);
  draw();
}, { passive: false });

function updateHUD() {
  $('#cityName').textContent = state.cityName;
  $('#money').textContent = window.innerWidth < 800 ? new Intl.NumberFormat('de-DE',{notation:'compact',maximumFractionDigits:2}).format(state.money) + ' €' : moneyFmt(state.money);
  $('#population').textContent = numFmt(state.population);
  $('#happiness').textContent = pct(state.happiness);
  $('#dateLabel').textContent = `${monthNames[state.month]} ${state.year}`;
  $('#money').className = state.money < 0 ? 'bad' : state.money > 300000 ? 'good' : '';
  $('#happiness').className = state.happiness >= 70 ? 'good' : state.happiness < 45 ? 'bad' : '';
}

function meter(label, value, colorClass = 'good') {
  return `<div class="stat-row"><span>${label}</span><b>${Math.round(value)}%</b></div><div class="meter ${colorClass}" style="color:var(--${colorClass})"><i style="width:${clamp(value, 0, 100)}%"></i></div>`;
}
function objective(label, done) {
  return `<div class="card objective"><span>${done ? '✅' : '⬜'}</span><b>${label}</b><span class="tag">${done ? 'Erreicht' : 'Offen'}</span></div>`;
}

function financeRateControl(title, key, current) {
  return `<div class="card"><h3>${title}</h3><div class="stat-row"><span>Hebesatz / Niveau</span><b>${current}%</b></div><div class="toolbar-row"><button class="secondary" data-rate="${key}" data-delta="-5">-5</button><button class="secondary" data-rate="${key}" data-delta="5">+5</button></div></div>`;
}

function renderPanel(which) {
  document.querySelectorAll('.dock button').forEach(b => b.classList.toggle('active', b.dataset.panel === which));
  $('#panel').classList.add('open');
  const m = metrics();
  let html = '', title = '', sub = '';

  if (which === 'overview') {
    title = 'Übersicht';
    sub = 'Laufende Lage deiner Gemeinde';
    html = `
      <div class="card"><h3>Monatlicher Haushalt</h3>
        <div class="stat-row"><span>Einnahmen</span><b class="good">${moneyFmt(m.income)}</b></div>
        <div class="stat-row"><span>Ausgaben</span><b class="bad">${moneyFmt(m.expenses)}</b></div>
        <div class="stat-row"><span>Betriebssaldo / Monat</span><b class="${m.operating >= 0 ? 'good' : 'bad'}">${moneyFmt(m.operating)}</b></div>
        <div class="stat-row"><span>Prognose Betrieb / Jahr</span><b class="${m.operating >= 0 ? 'good' : 'bad'}">${moneyFmt(m.operating * 12)}</b></div>
        <div class="stat-row"><span>Investitionen dieses Jahr</span><b>${moneyFmt(state.capitalSpentYear)}</b></div>
        ${state.fiscalHistory[0] ? `<div class="stat-row"><span>Investitionen ${state.fiscalHistory[0].year}</span><b>${moneyFmt(state.fiscalHistory[0].capital)}</b></div>` : ''}
      </div>
      <div class="card"><h3>Entwicklung</h3>
        <div class="stat-row"><span>Wohnraum</span><b>${numFmt(m.residentialCapacity)} Personen</b></div>
        <div class="stat-row"><span>Arbeitsplätze vor Ort</span><b>${numFmt(m.localJobs)}</b></div>
        <div class="stat-row"><span>Betriebe</span><b>${numFmt(m.companies)}</b></div>
        <div class="stat-row"><span>Pendler</span><b>${numFmt(m.commuterPool)}</b></div>
        <div class="stat-row"><span>Arbeitslosigkeit</span><b>${m.unemployment.toFixed(1)}%</b></div>
        ${meter('Attraktivität', m.attractiveness, m.attractiveness < 45 ? 'warn' : 'good')}
        ${meter('Infrastruktur', state.infrastructure, state.infrastructure < 40 ? 'bad' : 'good')}
        ${meter('Umwelt', state.environment, state.environment < 40 ? 'bad' : 'good')}
      </div>
      <div class="card"><h3>Finanzlage</h3>
        <div class="stat-row"><span>Rücklage</span><b class="${state.money >= 0 ? 'good' : 'bad'}">${moneyFmt(state.money)}</b></div>
        <div class="stat-row"><span>Schuldenstand</span><b>${moneyFmt(state.debt)}</b></div>
        <div class="stat-row"><span>Zinsniveau</span><b>${state.interestRate.toFixed(1)}%</b></div>
        <div class="stat-row"><span>Konjunktur</span><b>${state.economy.toFixed(0)}%</b></div>
      </div>
      ${constructionProjects().length ? `<div class="card"><h3>Aktuelle Bauprojekte</h3>${constructionProjects().slice(0,5).map(p=>`<div class="stat-row"><span>${p.name}</span><b>${p.monthsLeft} Mon.</b></div>`).join('')}</div>` : ''}
      <h3>Ziele</h3>
      ${objective('1.500 Einwohner erreichen', state.objectives.pop1500)}
      ${objective('75% Zufriedenheit erreichen', state.objectives.happy75)}
      ${objective('Monatssaldo +10.000 €', state.objectives.balance)}
      ${objective('Grundversorgung stark ausbauen', state.objectives.services)}
    `;
  }

  if (which === 'build') {
    title = 'Bauen';
    sub = 'Neue Quartiere, Infrastruktur und Versorgung';
    html = `<div class="grid-buttons">${Object.entries(BUILDINGS).filter(([k]) => k !== 'townhall').map(([k, b]) => `<button class="build-btn ${state.selected === k ? 'selected' : ''}" data-build="${k}"><span class="emoji">${b.emoji}</span><b>${b.name}</b><small>${moneyFmt(b.cost)} · ${moneyFmt(b.upkeep)}/Monat · ${b.buildMonths ? `${b.buildMonths} Mon. Bauzeit` : 'sofort'}</small></button>`).join('')}<button class="build-btn ${state.selected === 'bulldoze' ? 'selected' : ''}" data-build="bulldoze"><span class="emoji">🧨</span><b>Abriss</b><small>5.000 € pro Gebäude</small></button></div>`;
  }

  if (which === 'finance') {
    title = 'Finanzen';
    sub = 'Echter kommunaler Haushalt';
    html = `
      <div class="card"><h3>Einnahmen</h3>
        <div class="stat-row"><span>Einkommensteueranteil</span><b class="good">${moneyFmt(m.residentShare)}</b></div>
        <div class="stat-row"><span>Grundsteuer</span><b class="good">${moneyFmt(m.propertyTax)}</b></div>
        <div class="stat-row"><span>Gewerbesteuer</span><b class="good">${moneyFmt(m.businessTax)}</b></div>
        <div class="stat-row"><span>Gebühren</span><b class="good">${moneyFmt(m.fees)}</b></div>
        <div class="stat-row"><span>Zuweisungen</span><b class="good">${moneyFmt(m.grants)}</b></div>
        <div class="stat-row"><span>Energieerlöse</span><b class="good">${moneyFmt(m.energy)}</b></div>
        <div class="stat-row"><b>Gesamt</b><b class="good">${moneyFmt(m.income)}</b></div>
      </div>
      <div class="card"><h3>Ausgaben</h3>
        <div class="stat-row"><span>Verwaltung & Personal</span><b class="bad">${moneyFmt(m.admin)}</b></div>
        <div class="stat-row"><span>Einrichtungen & Betrieb</span><b class="bad">${moneyFmt(m.facilities)}</b></div>
        <div class="stat-row"><span>Soziales & Leistungen</span><b class="bad">${moneyFmt(m.social)}</b></div>
        <div class="stat-row"><span>Straßen & Infrastruktur</span><b class="bad">${moneyFmt(m.roads)}</b></div>
        <div class="stat-row"><span>Kreisumlage</span><b class="bad">${moneyFmt(m.levy)}</b></div>
        <div class="stat-row"><span>Zinsen</span><b class="bad">${moneyFmt(m.interest)}</b></div>
        <div class="stat-row"><span>Tilgung</span><b class="bad">${moneyFmt(m.repayment)}</b></div>
        <div class="stat-row"><b>Gesamt</b><b class="bad">${moneyFmt(m.expenses)}</b></div>
      </div>
      <div class="card"><h3>Saldo und Finanzierung</h3>
        <div class="stat-row"><span>Betriebssaldo</span><b class="${m.operating >= 0 ? 'good' : 'bad'}">${moneyFmt(m.operating)}</b></div>
        <div class="stat-row"><span>Rücklage</span><b>${moneyFmt(state.money)}</b></div>
        <div class="stat-row"><span>Schulden</span><b>${moneyFmt(state.debt)}</b></div>
        <div class="toolbar-row"><button class="secondary" id="loanBtn">+ Kredit 250.000 €</button><button class="secondary" id="repayBtn">Sondertilgung 50.000 €</button></div>
      </div>
      ${financeRateControl('Grundsteuer', 'property', state.taxRates.property)}
      ${financeRateControl('Gewerbesteuer', 'business', state.taxRates.business)}
      ${financeRateControl('Gebührenniveau', 'fees', state.taxRates.fees)}
    `;
  }

  if (which === 'citizens') {
    title = 'Einwohner';
    sub = 'Bevölkerung, Versorgung und Lebensqualität';
    html = `
      <div class="card">
        <div class="stat-row"><span>Bevölkerung</span><b>${numFmt(state.population)}</b></div>
        <div class="stat-row"><span>Wohnkapazität</span><b>${numFmt(m.residentialCapacity)}</b></div>
        <div class="stat-row"><span>Arbeitsplätze vor Ort</span><b>${numFmt(m.localJobs)}</b></div>
        <div class="stat-row"><span>Arbeitslosigkeit</span><b>${m.unemployment.toFixed(1)}%</b></div>
        <div class="stat-row"><span>Familien/Haushalte</span><b>${numFmt(m.demographics.families)}</b></div>
        <div class="stat-row"><span>Kinder & Jugendliche</span><b>${numFmt(m.demographics.youth)}</b></div>
        <div class="stat-row"><span>Erwerbsalter</span><b>${numFmt(m.demographics.workingAge)}</b></div>
        <div class="stat-row"><span>Senioren</span><b>${numFmt(m.demographics.seniors)}</b></div>
      </div>
      <div class="card"><h3>Versorgung</h3>
        ${meter('Bildung', m.serviceLevels.education, m.serviceLevels.education < 60 ? 'warn' : 'good')}
        ${meter('Sicherheit', m.serviceLevels.safety, m.serviceLevels.safety < 60 ? 'warn' : 'good')}
        ${meter('Gesundheit', m.serviceLevels.health, m.serviceLevels.health < 60 ? 'warn' : 'good')}
      </div>
      <div class="card"><h3>Stimmung</h3>
        ${meter('Zufriedenheit', state.happiness, state.happiness < 45 ? 'bad' : state.happiness < 65 ? 'warn' : 'good')}
        ${meter('Attraktivität', m.attractiveness, m.attractiveness < 45 ? 'bad' : m.attractiveness < 65 ? 'warn' : 'good')}
      </div>
    `;
  }

  if (which === 'politics') {
    title = 'Politik';
    sub = 'Amtszeit, Wirtschaft und Wiederwahl';
    const months = 48 - (state.monthsPlayed % 48 || 0);
    html = `
      <div class="election"><h3>🗳️ Nächste Kommunalwahl</h3>
        <div style="font-size:28px;font-weight:900">in ${months} Monaten</div>
        <p>Aktuelle Zustimmung: <b>${state.approval}%</b></p>
        ${meter('Wahlprognose', state.approval, state.approval < 50 ? 'bad' : state.approval < 60 ? 'warn' : 'good')}
      </div>
      <div class="card">
        <div class="stat-row"><span>Gewonnene Wahlen</span><b>${state.electionsWon}</b></div>
        <div class="stat-row"><span>Amtszeit</span><b>${state.monthsPlayed} Monate</b></div>
        <div class="stat-row"><span>Konjunktur</span><b>${state.economy.toFixed(0)}%</b></div>
        <div class="stat-row"><span>Inflation</span><b>${state.inflation.toFixed(1)}%</b></div>
        <div class="stat-row"><span>Ratsmehrheit</span><b>${state.councilSupport}%</b></div>
        <div class="stat-row"><span>Wirtschaftsklima</span><b>${m.businessClimate.toFixed(0)}%</b></div>
      </div>
      <div class="card"><h3>Bürgermeisterbüro</h3><div class="toolbar-row"><button class="secondary" id="renameBtn">Gemeinde umbenennen</button><button class="danger" id="newGameBtn">Neues Spiel</button></div></div>
    `;
  }

  if (which === 'events') {
    title = 'Ereignisse';
    sub = 'Entscheidungen und Rückblick';
    html = state.eventLog.length ? state.eventLog.map(e => `<div class="card"><div class="tag">${e.date}</div><h3>${e.title}</h3><div class="muted">${e.choice}</div></div>`).join('') : `<div class="card"><p>Noch keine besonderen Ereignisse. Im Laufe der Amtszeit erscheinen neue Entscheidungen.</p></div>`;
  }

  $('#panelTitle').textContent = title;
  $('#panelSubtitle').textContent = sub;
  $('#panelContent').innerHTML = html;

  document.querySelectorAll('[data-build]').forEach(b => b.onclick = () => {
    state.selected = b.dataset.build;
    renderPanel('build');
    showToast(`${b.querySelector('b')?.textContent || 'Werkzeug'} ausgewählt`);
  });

  document.querySelectorAll('[data-rate]').forEach(btn => btn.onclick = () => changeRate(btn.dataset.rate, +btn.dataset.delta));
  $('#loanBtn')?.addEventListener('click', takeLoan);
  $('#repayBtn')?.addEventListener('click', repayDebt);

  $('#newGameBtn')?.addEventListener('click', () => openModal(`<h2>Neues Spiel?</h2><p>Der aktuelle lokale Spielstand wird ersetzt.</p><div class="toolbar-row"><button class="danger" id="confirmReset">Neu starten</button><button class="secondary" id="cancelReset">Abbrechen</button></div>`));
  setTimeout(() => {
    if ($('#confirmReset')) {
      $('#confirmReset').onclick = () => { closeModal(); resetGame(); };
      $('#cancelReset').onclick = closeModal;
    }
  }, 0);

  $('#renameBtn')?.addEventListener('click', () => {
    const n = prompt('Name deiner Gemeinde:', state.cityName);
    if (n && n.trim()) {
      state.cityName = n.trim().slice(0, 24);
      save(); updateHUD(); renderPanel('politics');
    }
  });
}

function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
function openModal(html) { $('#modalContent').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }

$('.dock').addEventListener('click', e => {
  const b = e.target.closest('button[data-panel]');
  if (b) renderPanel(b.dataset.panel);
});
$('#closePanel').onclick = () => $('#panel').classList.remove('open');
$('#menuBtn').onclick = () => renderPanel('overview');
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => {
  state.speed = +b.dataset.speed;
  document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('active', x === b));
  save();
});

function loop(now) {
  const interval = state.speed === 2 ? 1700 : state.speed === 1 ? 3400 : Infinity;
  if (now - lastTick > interval) {
    lastTick = now;
    simulateMonth();
  }
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => { resize(); fitMap(); });
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  showToast('Die App kann über das Browsermenü installiert werden');
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});

updateHUD();
resize();
fitMap();
renderPanel('overview');
requestAnimationFrame(loop);
})();
