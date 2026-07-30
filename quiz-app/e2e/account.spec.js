'use strict';

const { test, expect } = require('@playwright/test');
const { uniqueIdentity, latestMail, extractRecoverUrl, registerProfile, loginProfile } = require('./helpers');

test('Registrierung, E-Mail-Bestätigung, Kontocenter und Passwort-Reset funktionieren', async ({ page, request }) => {
  const identity = uniqueIdentity('Konto');
  await registerProfile(page, identity);

  const verification = await latestMail(request, identity.email, 'bestätigen');
  await page.goto(extractRecoverUrl(verification, 'verify'));
  await expect(page.locator('#verifyMessage')).toContainText(/bestätigt|erfolgreich/i);

  await page.goto('/account');
  await expect(page.locator('#accountApp')).toBeVisible();
  await expect(page.locator('#accountTitle')).toContainText(identity.name);
  await expect(page.locator('#emailBadge')).toContainText(/Bestätigt/i);

  await page.uncheck('#leaderboardVisible');
  await page.selectOption('#invitePolicy', 'none');
  await page.locator('#preferencesForm button[type="submit"]').click();
  await expect(page.locator('#preferencesMessage')).toContainText(/gespeichert/i);

  const logoutStatus = await page.evaluate(async () => (await fetch('/api/solo/profiles/logout', { method: 'POST' })).status);
  expect(logoutStatus).toBe(200);
  await page.goto('/recover');
  await page.fill('#forgotEmail', identity.email);
  await page.locator('#forgotForm button[type="submit"]').click();
  await expect(page.locator('#forgotMessage')).toContainText(/E-Mail/i);

  const reset = await latestMail(request, identity.email, 'zurücksetzen');
  await page.goto(extractRecoverUrl(reset, 'reset'));
  await expect(page.locator('#resetPanel')).toBeVisible();
  await page.fill('#resetPassword', identity.newPassword);
  await page.fill('#resetConfirmation', identity.newPassword);
  await page.locator('#resetForm button[type="submit"]').click();
  await expect(page.locator('#resetMessage')).toContainText(/gespeichert|erfolgreich/i);

  await loginProfile(page, identity, identity.newPassword);
});
