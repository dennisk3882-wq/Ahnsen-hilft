'use strict';

const { test, expect } = require('@playwright/test');

test('Produktionsseite, PostgreSQL, Phase 11, E-Mail und Raumlebenszyklus funktionieren', async ({ page, request }) => {
  const health = await request.get('/health');
  expect(health.ok()).toBeTruthy();

  const online = await request.get('/api/online/status');
  expect(online.ok()).toBeTruthy();
  const onlineStatus = await online.json();
  expect(onlineStatus.online).toBe(true);
  expect(onlineStatus.persistence).toBe('postgresql');

  const stability = await request.get('/api/platform/stability/status');
  expect(stability.ok()).toBeTruthy();
  const stabilityStatus = await stability.json();
  expect(stabilityStatus.version).toBe('10.1.0');
  expect(stabilityStatus.databaseReachable).toBe(true);
  expect(stabilityStatus.timezone).toBe('Europe/Berlin');
  expect(stabilityStatus.migrations?.some(item => item.version === '010_phase10_stability.sql')).toBe(true);

  const readiness = await request.get('/api/platform/readiness');
  expect(readiness.ok()).toBeTruthy();
  const readinessStatus = await readiness.json();
  expect(readinessStatus.version).toBe('11.0.0');
  expect(readinessStatus.status).not.toBe('fail');
  expect(readinessStatus.checks.some(item => item.key === 'migration' && item.ok)).toBe(true);
  expect(readinessStatus.checks.some(item => item.key === 'catalog' && item.ok)).toBe(true);

  const account = await request.get('/api/account/status');
  expect(account.ok()).toBeTruthy();
  const accountStatus = await account.json();
  expect(accountStatus.email?.configured).toBe(true);

  await page.goto('/');
  await expect(page).toHaveTitle(/QuizTime/i);
  await expect(page.locator('body')).toContainText('QuizTime');
  await expect(page.locator('body')).toContainText(/11\.0|Einführung|Arena/);
  await expect(page.locator('.app-bottom-nav .app-nav-item')).toHaveCount(4);

  await page.goto('/welcome');
  await expect(page).toHaveTitle(/Willkommen.*QuizTime/i);
  await expect(page.locator('body')).toContainText(/Einführung|QuizTime-Profi/);

  await page.goto('/arena');
  await expect(page).toHaveTitle(/Arena.*QuizTime/i);
  await expect(page.locator('body')).toContainText(/Arena|E-Mail-Bestätigung/);

  await page.goto('/competitions');
  await expect(page).toHaveTitle(/Wettbewerbe.*QuizTime/i);
  await expect(page.locator('body')).toContainText(/Wettbewerb|Saison/);

  await page.goto('/online');
  await page.fill('#onlineHostName', `Smoke${Date.now()}`.slice(0, 30));
  await page.fill('#onlineRoomTitle', 'Automatische Produktionsprüfung');
  await page.selectOption('#onlineQuestionCount', '5');
  await page.locator('#onlineCreateForm button[type="submit"]').click();
  await expect(page.locator('#onlineRoomView')).toBeVisible();
  await expect(page.locator('#onlineRoomCode')).toHaveText(/^[A-Z0-9]{6}$/);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#leaveOnlineRoom').click();
  await expect(page.locator('#onlineLanding')).toBeVisible();
});
