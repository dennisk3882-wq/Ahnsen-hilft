import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DEEP = process.env.DEEP_TEST === '1' || process.argv.includes('--deep');
const REPORT_PATH = path.resolve(process.env.TEST_REPORT || path.join(ROOT, 'test-report.json'));
const SUMMARY_PATH = process.env.GITHUB_STEP_SUMMARY || '';

const CONFIG = DEEP ? {
  reachabilitySeeds: 36,
  fuzzGames: 120,
  fuzzMonths: 180,
  maxWinMonths: 600,
  randomPolicyGames: 80
} : {
  reachabilitySeeds: 10,
  fuzzGames: 24,
  fuzzMonths: 84,
  maxWinMonths: 480,
  randomPolicyGames: 18
};

const report = {
  mode: DEEP ? 'deep' : 'standard',
  startedAt: new Date().toISOString(),
  passed: [],
  warnings: [],
  failures: [],
  metrics: {},
  simulations: 0,
  simulatedMonths: 0
};

function pass(name, details = '') { report.passed.push({ name, details }); }
function warn(name, details = '') { report.warnings.push({ name, details }); }
function fail(name, details = '') { report.failures.push({ name, details }); }
function metric(name, value) { report.metrics[name] = value; }

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function patchedGameSource(source) {
  let out = source;
  out = out.replace("const app = document.getElementById('app');", 'const app = null;');
  out = out.replace(/saveGame\(this\);\s*renderGame\(this(?:,\s*true)?\);/g, ';');
  out = out.replace(/addScore\(this\);/g, ';');

  const bootstrap = /\s*if \('serviceWorker' in navigator\)[\s\S]*?\s*renderHome\(\);\s*\}\)\(\);\s*$/;
  if (!bootstrap.test(out)) throw new Error('Headless bootstrap patch failed: app.js footer changed.');
  out = out.replace(bootstrap,
    "\n  globalThis.__BGM_TEST__ = { Game, ITEMS, CITY_LEVELS, EVENTS, clamp };\n})();\n");
  return out;
}

function loadEngine(seed = 1) {
  const appPath = path.join(ROOT, 'app.js');
  const source = fs.readFileSync(appPath, 'utf8');
  const math = Object.create(Math);
  math.random = mulberry32(seed);
  const context = vm.createContext({ console, Intl, Date, Math: math });
  vm.runInContext(patchedGameSource(source), context, { filename: 'app.js', timeout: 3000 });
  if (!context.__BGM_TEST__?.Game) throw new Error('Game engine could not be exposed for testing.');
  return context.__BGM_TEST__;
}

function checkFinite(label, value) {
  assert.equal(Number.isFinite(value), true, `${label} must be finite, got ${value}`);
}

function assertInvariants(g, ITEMS) {
  for (const field of ['cash','population','approval','taxRate','monthsPlayed','commerceMomentum','tempJobBonus']) {
    checkFinite(field, g[field]);
  }
  assert.ok(g.population >= 0, 'population must never be negative');
  assert.ok(g.approval >= 0 && g.approval <= 100, 'approval must remain 0..100');
  assert.ok(g.landUsed() <= g.inventory.land + 1e-9, `used land ${g.landUsed()} exceeds owned land ${g.inventory.land}`);
  assert.ok(g.landFree() >= 0, 'free land must not be negative');

  for (const key of Object.keys(ITEMS)) {
    checkFinite(`inventory.${key}`, g.inventory[key]);
    assert.ok(g.inventory[key] >= 0, `${key} inventory must not be negative`);
    checkFinite(`market.${key}`, g.market[key]);
    assert.ok(g.market[key] > 0, `${key} market price must stay positive`);
  }

  for (const [name, value] of Object.entries(g.forecast())) {
    checkFinite(`forecast.${name}`, value);
  }
  checkFinite('housingCapacity', g.housingCapacity());
  checkFinite('jobsCapacity', g.jobsCapacity());
  checkFinite('schoolCapacity', g.schoolCapacity());
  checkFinite('attractiveness', g.calculateAttractiveness());
  checkFinite('infrastructureScore', g.infrastructureScore());
  assert.ok(g.calculateAttractiveness() >= 0 && g.calculateAttractiveness() <= 100, 'attractiveness must remain 0..100');
  assert.ok(g.infrastructureScore() >= 0 && g.infrastructureScore() <= 100, 'infrastructure must remain 0..100');
}

function runTest(name, fn) {
  try {
    const details = fn();
    pass(name, details || 'OK');
  } catch (err) {
    fail(name, err?.stack || String(err));
  }
}

function staticAssetChecks() {
  const required = ['index.html','styles.css','app.js','manifest.webmanifest','sw.js','icons/icon.svg'];
  for (const rel of required) assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);

  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const ref of ['styles.css','app.js','manifest.webmanifest']) assert.ok(index.includes(ref), `index.html does not reference ${ref}`);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.ok(manifest.name && manifest.short_name, 'manifest requires name and short_name');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest requires icons');
  for (const icon of manifest.icons) {
    const rel = String(icon.src || '').replace(/^\.\//, '');
    assert.ok(rel && fs.existsSync(path.join(ROOT, rel)), `manifest icon missing: ${icon.src}`);
  }

  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const ref of ['index.html','styles.css','app.js','manifest.webmanifest','icons/icon.svg']) assert.ok(sw.includes(ref), `service worker cache is missing ${ref}`);

  return `${required.length} core assets + manifest/service-worker references valid`;
}

function contractChecks() {
  const { Game, ITEMS } = loadEngine(1001);
  const g = new Game({ winCondition: 'population' });
  assertInvariants(g, ITEMS);
  assert.equal(g.cash, 1000);
  assert.equal(g.population, 125);

  const startCash = g.cash;
  const startHouses = g.inventory.houses;
  assert.equal(g.canBuy('houses'), true, 'starter city should be able to buy one house');
  g.buy('houses');
  assert.equal(g.inventory.houses, startHouses + 1, 'house purchase did not increase inventory');
  assert.ok(g.cash < startCash, 'house purchase did not reduce cash');

  const foodBefore = g.monthlyFoodNeed();
  g.inventory.supermarkets = 1;
  assert.ok(g.monthlyFoodNeed() < foodBefore, 'supermarket must improve food logistics');

  const productivityBefore = g.productivityFactor();
  g.inventory.universities = 1;
  assert.ok(g.productivityFactor() > productivityBefore, 'university must improve productivity');

  g.cash = -1000;
  assert.ok(g.debtInterest() > 0, 'negative cash must create interest');
  const f = g.forecast();
  assert.equal(f.balance, f.total - f.expenses, 'forecast balance decomposition broken');

  const demandGame = new Game({ population: 1800, inventory:{ land:60,houses:35,towers:0,schools:2,universities:0,shops:1,supermarkets:0,food:5000 } });
  const util1 = demandGame.commerceUtilization();
  demandGame.inventory.shops += 20;
  const util2 = demandGame.commerceUtilization();
  assert.ok(util2 < util1, 'retail oversupply should reduce utilization');

  return 'economy contracts and cross-effects verified';
}

function defeatChecks() {
  const { Game } = loadEngine(2001);

  const debt = new Game({ winCondition:'population', cash:-20000, losingDebtMonths:3 });
  debt.checkEnd();
  assert.equal(debt.ended, true);
  assert.equal(debt.ending.win, false);

  const approval = new Game({ winCondition:'population', approval:10, lowApprovalMonths:3 });
  approval.checkEnd();
  assert.equal(approval.ended, true);
  assert.equal(approval.ending.win, false);

  const food = new Game({ winCondition:'population', severeFoodMonths:2 });
  food.checkEnd();
  assert.equal(food.ended, true);
  assert.equal(food.ending.win, false);

  const empty = new Game({ winCondition:'population', population:20, monthsPlayed:6 });
  empty.checkEnd();
  assert.equal(empty.ended, true);
  assert.equal(empty.ending.win, false);

  return 'debt, approval, food and depopulation defeats all reachable';
}

function buyWithReserve(g, key, reserve = 0, max = 1) {
  let count = 0;
  while (count < max && !g.ended && g.canBuy(key)) {
    const item = g.market[key] * (key === 'food' ? 100 : 1);
    if (g.cash - item < reserve) break;
    g.buy(key);
    count++;
  }
  return count;
}

function strategicMonth(g, objective) {
  const f = g.forecast();
  const foodNeed = Math.max(1, g.monthlyFoodNeed());
  const foodMonths = g.inventory.food / foodNeed;
  const reserve = Math.max(300, g.monthlyMaintenance() * 3, g.population * 0.14);

  // Survival first: food buffer, but do not destroy the treasury to overstock.
  let foodGuard = 0;
  const targetFoodMonths = g.population > 3000 ? 2.1 : 2.7;
  while (g.inventory.food / Math.max(1,g.monthlyFoodNeed()) < targetFoodMonths && g.canBuy('food') && foodGuard++ < 35) {
    const cost = g.market.food * 100;
    if (g.cash - cost < Math.min(reserve, 1200) && foodMonths >= 1.05) break;
    g.buy('food');
  }

  // Acquire land before capacity hits zero. Land is cheap, but avoid hoarding it excessively.
  const desiredFreeLand = g.population > 5000 ? 10 : g.population > 1500 ? 7 : 4;
  if (g.landFree() < desiredFreeLand && g.cash > reserve + g.market.land * 2) {
    buyWithReserve(g, 'land', reserve, Math.min(8, desiredFreeLand - g.landFree()));
  }

  // Housing: keep a controlled reserve so growth has room, but not huge empty stock.
  const housingRatio = g.housingCapacity() / Math.max(1, g.population);
  if (housingRatio < 1.18 && g.cash > reserve) {
    if (g.population >= 1300 && (g.landFree() < 8 || g.population > 3500)) buyWithReserve(g, 'towers', reserve, 2);
    else buyWithReserve(g, 'houses', reserve, 4);
  }

  // Employment: only add retail where there is enough demand after construction.
  let employmentGuard = 0;
  while (g.employmentCoverage() < .94 && g.cash > reserve && employmentGuard++ < 5) {
    if (g.population >= 900 && g.commerceUtilization('supermarkets') >= .58 && g.inventory.supermarkets < Math.max(1, Math.floor(g.population/2200))) {
      if (!buyWithReserve(g, 'supermarkets', reserve, 1)) break;
    } else if (g.commerceUtilization('shops') >= .58) {
      if (!buyWithReserve(g, 'shops', reserve, 1)) break;
    } else break;
  }

  // Education scales later than basic housing/jobs.
  if (g.population >= 430 && g.educationCoverage() < .82 && g.cash > reserve + 500) {
    if (g.population >= 4200 && g.cash > reserve + g.market.universities * 1.1) buyWithReserve(g, 'universities', reserve, 1);
    else buyWithReserve(g, 'schools', reserve, 2);
  }

  // Larger cities benefit from some supermarkets even when jobs are otherwise covered.
  if (g.population >= 1100 && g.inventory.supermarkets < Math.max(1, Math.floor(g.population/2600)) && g.commerceUtilization('supermarkets') >= .62) {
    buyWithReserve(g, 'supermarkets', reserve, 1);
  }

  let taxRate = objective === 'cash' ? 11 : objective === 'fouryears' ? 10 : 8;
  if (g.cash < 0) taxRate = Math.min(15, taxRate + 4);
  else if (f.balance < 0 && g.approval > 55) taxRate = Math.min(13, taxRate + 2);
  if (g.approval < 38) taxRate = Math.min(taxRate, 6);
  if (g.approval < 25) taxRate = 4;

  const need = g.monthlyFoodNeed();
  const foodAllocation = Math.min(g.inventory.food, need);
  const spareHousing = Math.max(0, g.housingCapacity() - g.population);
  let admitLimit = objective === 'cash' ? Math.ceil(spareHousing * .55) : spareHousing;
  if (g.employmentCoverage() < .68) admitLimit = Math.min(admitLimit, Math.ceil(g.population * .015));
  if (g.inventory.food < need * 1.15) admitLimit = Math.min(admitLimit, Math.ceil(g.population * .01));
  admitLimit = Math.max(0, Math.min(5000, admitLimit));

  g.advanceMonth({ taxRate, foodAllocation, admitLimit });
}

function simulateStrategic(objective, seed) {
  const { Game, ITEMS } = loadEngine(seed);
  const g = new Game({ winCondition: objective });
  let months = 0;
  while (!g.ended && months < CONFIG.maxWinMonths) {
    strategicMonth(g, objective);
    assertInvariants(g, ITEMS);
    months++;
    report.simulatedMonths++;
  }
  report.simulations++;
  return { win: !!g.ending?.win, months, pop:g.population, cash:g.cash, score:g.score, reason:g.ending?.reason || 'time limit' };
}

function reachabilityChecks() {
  const objectives = ['fouryears','cash','population','modern'];
  const result = {};
  const offsets = { fouryears:10000, cash:20000, population:30000, modern:40000 };

  for (const objective of objectives) {
    const runs = [];
    for (let i=0; i<CONFIG.reachabilitySeeds; i++) runs.push(simulateStrategic(objective, offsets[objective] + i * 37));
    const wins = runs.filter(r => r.win);
    const winRate = wins.length / runs.length;
    const winMonths = wins.map(r=>r.months).sort((a,b)=>a-b);
    const median = winMonths.length ? winMonths[Math.floor(winMonths.length/2)] : null;
    result[objective] = { runs:runs.length, wins:wins.length, winRate:Number(winRate.toFixed(3)), medianWinMonths:median, fastestWin:winMonths[0] ?? null, slowestWin:winMonths.at(-1) ?? null };

    assert.ok(wins.length > 0, `${objective}: no strategic simulation could win within ${CONFIG.maxWinMonths} months`);
    if (objective !== 'fouryears' && winRate < .25) warn(`Balance: ${objective} may be too hard`, `${Math.round(winRate*100)}% strategic win rate`);
    if (objective !== 'fouryears' && median !== null && median < 24) warn(`Balance: ${objective} may be too easy`, `median strategic win in ${median} months`);
    if (median !== null && median > 420) warn(`Balance: ${objective} may be too slow`, `median strategic win in ${median} months`);
  }

  metric('reachability', result);
  return `all 4 win conditions reached by the strategic simulator`;
}

function fuzzChecks() {
  let ended = 0;
  for (let gameIndex=0; gameIndex<CONFIG.fuzzGames; gameIndex++) {
    const seed = 50000 + gameIndex * 101;
    const { Game, ITEMS } = loadEngine(seed);
    const rng = mulberry32(seed ^ 0xA53C9E1);
    const g = new Game({ winCondition:'population' });
    const keys = Object.keys(ITEMS);

    for (let m=0; m<CONFIG.fuzzMonths && !g.ended; m++) {
      const actions = 1 + Math.floor(rng()*5);
      for (let a=0; a<actions; a++) {
        const key = keys[Math.floor(rng()*keys.length)];
        if (rng() < .72) { if (g.canBuy(key)) g.buy(key); }
        else { if (g.canSell(key)) g.sell(key); }
        assertInvariants(g, ITEMS);
      }

      const need = g.monthlyFoodNeed();
      const foodAllocation = Math.min(g.inventory.food, Math.max(0, Math.round(need * (0.45 + rng()*.8))));
      g.advanceMonth({
        taxRate: Math.floor(rng()*31),
        foodAllocation,
        admitLimit: Math.floor(rng() * Math.max(1, Math.min(800, g.housingCapacity()+1)))
      });
      assertInvariants(g, ITEMS);
      report.simulatedMonths++;
    }
    if (g.ended) ended++;
    report.simulations++;
  }
  metric('fuzz', { games:CONFIG.fuzzGames, ended });
  return `${CONFIG.fuzzGames} randomized games completed without invariant violations`;
}

function randomPolicyBalanceCheck() {
  let wins = 0, losses = 0, alive = 0;
  const endings = {};
  for (let i=0; i<CONFIG.randomPolicyGames; i++) {
    const seed = 80000 + i * 59;
    const { Game, ITEMS } = loadEngine(seed);
    const rng = mulberry32(seed + 9);
    const g = new Game({ winCondition:'fouryears' });
    for (let m=0; m<72 && !g.ended; m++) {
      if (rng() < .4) {
        const candidates = Object.keys(ITEMS).filter(k=>g.canBuy(k));
        if (candidates.length) g.buy(candidates[Math.floor(rng()*candidates.length)]);
      }
      const need = g.monthlyFoodNeed();
      g.advanceMonth({
        taxRate: Math.round(4 + rng()*21),
        foodAllocation: Math.min(g.inventory.food, Math.round(need*(.65+rng()*.55))),
        admitLimit: Math.floor(rng()*300)
      });
      assertInvariants(g, ITEMS);
      report.simulatedMonths++;
    }
    report.simulations++;
    if (g.ending?.win) wins++;
    else if (g.ended) {
      losses++;
      const key = g.ending?.reason || 'unknown';
      endings[key] = (endings[key]||0)+1;
    } else alive++;
  }
  metric('randomPolicy', { games:CONFIG.randomPolicyGames, wins, losses, alive, endings });
  if (losses === 0) warn('Balance: losing may be too difficult', 'No random-policy run lost within the test horizon.');
  if (wins === CONFIG.randomPolicyGames) warn('Balance: survival may be too easy', 'Every random-policy run survived four years.');
  return `${wins} random wins, ${losses} random losses, ${alive} unresolved`;
}

function passiveFailureCheck() {
  const { Game, ITEMS } = loadEngine(91001);
  const g = new Game({ winCondition:'population' });
  for (let m=0; m<24 && !g.ended; m++) {
    g.advanceMonth({ taxRate:8, foodAllocation:Math.min(g.inventory.food,g.monthlyFoodNeed()), admitLimit:0 });
    assertInvariants(g, ITEMS);
    report.simulatedMonths++;
  }
  report.simulations++;
  assert.equal(g.ended, true, 'A completely passive city with no food purchases should eventually fail');
  assert.equal(g.ending.win, false, 'Passive failure scenario unexpectedly won');
  return `passive no-purchase strategy loses as intended (${g.ending.reason})`;
}

function balanceSanityChecks() {
  const { Game } = loadEngine(92001);
  const g = new Game({ population:2200, cash:25000, inventory:{land:70,houses:20,towers:3,schools:2,universities:0,shops:11,supermarkets:1,food:6000} });
  const baseline = g.forecast();

  g.inventory.shops += 20;
  const overbuilt = g.forecast();
  assert.ok(g.commerceUtilization() < baseline.utilization, 'commercial overbuilding must reduce utilization');
  assert.ok(overbuilt.commerce < baseline.commerce * 3.2, 'commercial income scales implausibly despite heavy overbuilding');

  const lowEducation = new Game({ population:5000, cash:20000, inventory:{land:90,houses:25,towers:9,schools:0,universities:0,shops:20,supermarkets:2,food:10000} });
  const p0 = lowEducation.productivityFactor();
  lowEducation.inventory.schools = 4;
  const p1 = lowEducation.productivityFactor();
  assert.ok(p1 > p0, 'education investment should improve productivity for an undereducated city');

  return 'diminishing retail returns and education productivity effects verified';
}

function writeOutputs() {
  report.finishedAt = new Date().toISOString();
  report.ok = report.failures.length === 0;
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  const lines = [
    '# Bürgermeister Auto-Test',
    '',
    `**Mode:** ${report.mode}`,
    `**Result:** ${report.ok ? '✅ PASS' : '❌ FAIL'}`,
    `**Simulated games:** ${report.simulations}`,
    `**Simulated months:** ${report.simulatedMonths}`,
    `**Passed checks:** ${report.passed.length}`,
    `**Warnings:** ${report.warnings.length}`,
    `**Failures:** ${report.failures.length}`,
    '',
    '## Reachability',
    '',
    '```json',
    JSON.stringify(report.metrics.reachability || {}, null, 2),
    '```',
    '',
    '## Warnings',
    ...(report.warnings.length ? report.warnings.map(w=>`- ⚠️ **${w.name}:** ${w.details}`) : ['- None']),
    '',
    '## Failures',
    ...(report.failures.length ? report.failures.map(f=>`- ❌ **${f.name}:** ${String(f.details).split('\n')[0]}`) : ['- None'])
  ];
  const markdown = lines.join('\n') + '\n';
  if (SUMMARY_PATH) fs.appendFileSync(SUMMARY_PATH, markdown);
  console.log(markdown);
  console.log(`Full JSON report: ${REPORT_PATH}`);
}

runTest('Static PWA integrity', staticAssetChecks);
runTest('Core economic contracts', contractChecks);
runTest('All defeat conditions', defeatChecks);
runTest('All win conditions reachable', reachabilityChecks);
runTest('Randomized invariant fuzzing', fuzzChecks);
runTest('Random-policy balance sampling', randomPolicyBalanceCheck);
runTest('Passive strategy can lose', passiveFailureCheck);
runTest('Balance sanity / diminishing returns', balanceSanityChecks);

writeOutputs();
process.exitCode = report.failures.length ? 1 : 0;
