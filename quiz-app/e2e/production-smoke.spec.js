'use strict';

const { test, expect } = require('@playwright/test');

test('Produktionsseite, PostgreSQL, E-Mail-Konfiguration und Raumlebenszyklus funktionieren', async ({ page, request }) => {
  const health = await request.get('/health');
  expect(health.ok()).toBeTruthy();

  const online = await request.get('/api/online/status');
  expect(online.ok()).toBeTruthy();
  const onlineStatus = await online.json();
  expect(onlineStatus.online).toBe(true);
  expect(onlineStatus.persistence).toBe('postgresql');

  const account = await request.get('/api/account/status');
  expect(account.ok()).toBeTruthy();
  const accountStatus = await account.json();
  expect(accountStatus.email?.configured).toBe(true);

  await page.goto('/');
  await expect(page).toHaveTitle(/QuizTime/i);
  await expect(page.locator('body')).toContainText('QuizTime');

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
