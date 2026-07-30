'use strict';

const { test, expect } = require('@playwright/test');
const { uniqueIdentity, registerProfile } = require('./helpers');

test('Admin-Dashboard zeigt Systemtests und verwaltet Profile', async ({ page }) => {
  const identity = uniqueIdentity('AdminTest');
  await registerProfile(page, identity);
  const logoutStatus = await page.evaluate(async () => (await fetch('/api/solo/profiles/logout', { method: 'POST' })).status);
  expect(logoutStatus).toBe(200);

  await page.goto('/platform-admin');
  await page.fill('#adminPassword', process.env.ADMIN_PASSWORD || 'e2e-admin-password');
  await page.locator('#adminLoginForm button[type="submit"]').click();
  await expect(page.locator('#adminDashboard')).toBeVisible();
  await expect(page.locator('#adminMetrics')).toContainText('Profile');
  await expect(page.locator('#adminBrowserTests')).toContainText(/erfolgreich|Browser-Tests/i);

  await page.locator('[data-admin-tab="profiles"]').click();
  await page.fill('#adminProfileQuery', identity.name);
  await page.locator('#adminProfileSearch button[type="submit"]').click();
  await expect(page.locator('#adminProfiles')).toContainText(identity.name);
  await page.locator('[data-profile-open]').first().click();
  await expect(page.locator('#adminProfileDetails')).toContainText(identity.name);

  const dialogs = [];
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    if (dialog.type() === 'prompt' && /Stunden/i.test(dialog.message())) await dialog.accept('1');
    else if (dialog.type() === 'prompt') await dialog.accept('Automatischer Browsertest');
    else await dialog.accept();
  });

  await page.locator('#adminProfileDetails [data-paction="suspend"]').click();
  await expect(page.locator('#adminProfileDetails .admin-status')).toContainText('suspended');
  expect(dialogs.length).toBeGreaterThanOrEqual(3);

  await page.locator('#adminProfileDetails [data-paction="activate"]').click();
  await expect(page.locator('#adminProfileDetails .admin-status')).toContainText('active');
});
