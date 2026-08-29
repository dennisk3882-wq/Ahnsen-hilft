import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

async function waitClosed() {
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden', timeout: 5000 });
}
async function quick(type, title, amount) {
  await page.locator('#quickAddMobile').click();
  await page.locator(`[data-q="${type}"]`).click();
  const form = page.locator('#txForm');
  await form.locator('[name="title"]').fill(title);
  await form.locator('[name="amount"]').fill(String(amount));
  await form.locator('button.primary-button').click();
  await waitClosed();
}

try {
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  const setup = page.locator('#newProjectForm');
  await setup.waitFor({ state: 'visible', timeout: 7000 });
  await setup.locator('[name="household"]').fill('Smoke Haushalt');
  await setup.locator('[name="accountName"]').fill('Test Giro');
  await setup.locator('[name="balance"]').fill('1000');
  await setup.locator('button.primary-button').click();
  await waitClosed();
  await page.waitForFunction(() => typeof accountTotal === 'function' && Math.abs(accountTotal() - 1000) < 0.001);

  // Mobile KPI layout must no longer be a clipped horizontal strip.
  const metricLayout = await page.locator('.metrics-grid').evaluate(el => ({ display: getComputedStyle(el).display, cols: getComputedStyle(el).gridTemplateColumns, overflowX: getComputedStyle(el).overflowX }));
  assert.equal(metricLayout.display, 'grid');
  assert.ok(metricLayout.cols.split(' ').length >= 2, `expected >=2 KPI columns, got ${metricLayout.cols}`);

  await quick('expense', 'Smoke Einkauf', 100);
  assert.equal(Math.round((await page.evaluate(() => accountTotal())) * 100), 90000);

  await quick('refund', 'Smoke Erstattung', 20);
  assert.equal(Math.round((await page.evaluate(() => accountTotal())) * 100), 92000);
  assert.equal(Math.round((await page.evaluate(() => monthSummary().expense)) * 100), 8000);

  // Split booking: 40 food + 20 other = 60 total.
  await page.locator('#quickAddMobile').click();
  await page.locator('[data-q="expense"]').click();
  const splitForm = page.locator('#txForm');
  await splitForm.locator('[name="title"]').fill('Smoke Split');
  await splitForm.locator('[name="amount"]').fill('60');
  await splitForm.locator('#splitToggle').check();
  const splitAmounts = splitForm.locator('[name="splitAmount"]');
  await splitAmounts.nth(0).fill('40');
  await splitAmounts.nth(1).fill('20');
  await splitForm.locator('button.primary-button').click();
  await waitClosed();
  assert.equal(Math.round((await page.evaluate(() => accountTotal())) * 100), 86000);
  assert.equal(Math.round((await page.evaluate(() => monthSummary().expense)) * 100), 14000);
  assert.equal(Math.round((await page.evaluate(() => categorySpend('c_food'))) * 100), 4000);

  // Reconciliation must create a checkpoint, then a new same-day payment must still count afterwards.
  await page.evaluate(() => {
    const a = data.accounts[0];
    reconcileAccount(a.id, 1000, localISO(now), 'Smoke checkpoint');
    saveData('Smoke checkpoint');
  });
  assert.equal(Math.round((await page.evaluate(() => accountTotal())) * 100), 100000);
  await quick('expense', 'Nach Abgleich', 10);
  assert.equal(Math.round((await page.evaluate(() => accountTotal())) * 100), 99000);

  // Runtime recurrence uses exact start/end boundaries.
  const recurrence = await page.evaluate(() => {
    const r = { id: 'smoke_rec', title: 'Smoke Recurring', amount: 10, type: 'expense', categoryId: 'c_other', accountId: data.accounts[0].id, memberId: 'm1', frequency: 'monthly', day: 5, start: '2026-08-29', end: '', active: true, estimate: false };
    data.recurring.push(r);
    generateRecurringRange('2026-08-01', '2026-08-31');
    const august = data.transactions.filter(t => t.recurringId === r.id).map(t => t.date);
    generateRecurringRange('2026-09-01', '2026-09-30');
    const september = data.transactions.filter(t => t.recurringId === r.id).map(t => t.date);
    return { august, september };
  });
  assert.deepEqual(recurrence.august, []);
  assert.deepEqual(recurrence.september, ['2026-09-05']);

  const issues = await page.evaluate(() => integrityReport().map(x => x.text));
  assert.deepEqual(issues, [], `integrity issues: ${issues.join('; ')}`);

  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Finanzplan browser smoke: OK');
} finally {
  await browser.close();
}
