'use strict';

const { test, expect } = require('@playwright/test');
const { version: expectedReleaseVersion } = require('../package.json');

test('Produktionsseite, PostgreSQL, QuizTime 13, Recht und Raumlebenszyklus funktionieren', async ({ page, request }) => {
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

  const phase11 = await request.get('/api/platform/readiness');
  expect(phase11.ok()).toBeTruthy();
  const phase11Status = await phase11.json();
  expect(phase11Status.version).toBe('11.0.0');
  expect(phase11Status.status).not.toBe('fail');

  const release = await request.get('/api/platform/release-readiness');
  expect([200, 503]).toContain(release.status());
  const releaseStatus = await release.json();
  expect(releaseStatus.version).toBe(expectedReleaseVersion);
  expect(releaseStatus.checks.some(item => item.key === 'database' && item.ok)).toBe(true);
  expect(releaseStatus.checks.some(item => item.key === 'migration-120' && item.ok)).toBe(true);
  expect(releaseStatus.checks.some(item => item.key === 'catalog-child' && item.ok)).toBe(true);
  expect(releaseStatus.checks.some(item => item.key === 'catalog-adult' && item.ok)).toBe(true);
  expect(releaseStatus.checks.some(item => item.key === 'legal-contact')).toBe(true);

  const account = await request.get('/api/account/status');
  expect(account.ok()).toBeTruthy();
  const accountStatus = await account.json();
  expect(accountStatus.email?.configured).toBe(true);

  const legal = await request.get('/legal');
  expect(legal.ok()).toBeTruthy();
  const legalText = await legal.text();
  expect(legalText).toContain('Dennis Koch');
  expect(legalText).toContain('In der Flöte 19');

  await page.goto('/');
  await expect(page).toHaveTitle(/QuizTime/i);
  await expect(page.locator('body')).toContainText('QuizTime');
  await expect(page.locator('body')).toContainText(/Version 13|QuizTime 13|Arena/);
  await expect(page.locator('.app-bottom-nav .app-nav-item')).toHaveCount(4);

  await page.goto('/progress');
  await expect(page).toHaveTitle(/Fortschritt.*QuizTime/i);
  await expect(page.locator('body')).toContainText(/Dein Fortschritt|Bitte anmelden/);

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
