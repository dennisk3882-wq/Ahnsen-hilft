'use strict';

const { test, expect } = require('@playwright/test');
const { uniqueIdentity, registerAndVerifyProfile } = require('./helpers');

test('Arena lädt Missionen, Liga und offizielles Quiz der Woche', async ({ page, request }) => {
  const identity = uniqueIdentity('Arena');
  await registerAndVerifyProfile(page, request, identity);

  await page.goto('/arena');
  await expect(page.locator('#arenaApp')).toBeVisible();
  await expect(page.locator('#arenaProfile')).toContainText(identity.name);
  await expect(page.locator('#arenaSummary')).toContainText(/Liga|Missionen/);

  await page.locator('[data-arena-tab="missions"]').click();
  await expect(page.locator('#dailyMissions .mission-card')).toHaveCount(4);
  await expect(page.locator('#weeklyMissions .mission-card')).toHaveCount(4);

  await page.locator('[data-arena-tab="league"]').click();
  await expect(page.locator('#leagueName')).toContainText(/Bronze|Silber|Gold|Meister/);
  await expect(page.locator('#leagueBoard')).toContainText(identity.name);

  await page.locator('[data-arena-tab="events"]').click();
  await expect(page.locator('#eventList')).toContainText(/Quiz der Woche|Monats-Challenge/);
  await page.locator('[data-event-start]:not([disabled])').first().click();
  await expect(page.locator('#eventPlayer')).toBeVisible();
  await expect(page.locator('#eventPlayerContent')).toContainText(/Frage 1 von/);
  await page.locator('[data-event-answer]').first().click();
  await expect(page.locator('#eventPlayerContent')).toContainText(/Richtig|Leider falsch/);
});

test('Phase-10-Admin zeigt Event-, Liga- und Stabilitätsverwaltung', async ({ page }) => {
  await page.goto('/platform-admin');
  await page.fill('#adminPassword', process.env.ADMIN_PASSWORD || 'e2e-admin-password');
  await page.locator('#adminLoginForm button[type="submit"]').click();
  await expect(page.locator('#adminDashboard')).toBeVisible();
  await page.locator('[data-admin-tab="phase10"]').click();
  await expect(page.locator('#adminPhase10Content')).toContainText(/Offizielle Events|Ligen & Saisonabschluss/);
  await expect(page.locator('#adminOfficialEvents .admin-item')).toHaveCount(2);
  await expect(page.locator('#adminStabilityPanel')).toContainText(/Stabilität|Migration|Abgleich/i);
});
