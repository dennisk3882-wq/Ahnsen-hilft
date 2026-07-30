'use strict';

const { test, expect } = require('@playwright/test');

test('Zwei Browser spielen gemeinsam und verbinden sich nach Reload erneut', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/online');
  await host.fill('#onlineHostName', 'E2E Gastgeber');
  await host.fill('#onlineRoomTitle', 'Automatischer Browsertest');
  await host.selectOption('#onlineQuestionCount', '5');
  await host.selectOption('#onlineMaxPlayers', '4');
  await host.locator('#onlineCreateForm button[type="submit"]').click();
  await expect(host.locator('#onlineRoomView')).toBeVisible();
  const code = (await host.locator('#onlineRoomCode').textContent()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  await guest.goto('/online');
  await guest.locator('[data-online-tab="join"]').click();
  await guest.fill('#onlineJoinCode', code);
  await guest.fill('#onlineJoinName', 'E2E Gast');
  await guest.locator('#onlineJoinForm button[type="submit"]').click();
  await expect(guest.locator('#onlineRoomView')).toBeVisible();
  await expect(host.locator('#onlinePlayerList')).toContainText('E2E Gast');

  await guest.locator('#toggleOnlineReady').click();
  await expect(host.locator('#startOnlineGame')).toBeEnabled();
  await host.locator('#startOnlineGame').click();
  await expect(host.locator('[data-online-answer]')).toHaveCount(4);
  await expect(guest.locator('[data-online-answer]')).toHaveCount(4);

  await host.locator('[data-online-answer="0"]').click();
  await guest.locator('[data-online-answer="1"]').click();
  await expect(host.locator('.online-explanation')).toBeVisible();
  await expect(guest.locator('.online-explanation')).toBeVisible();

  await guest.reload();
  await expect(guest.locator('#onlineResumeCard')).toBeVisible();
  await guest.locator('#onlineResumeButton').click();
  await expect(guest.locator('#onlineRoomCode')).toHaveText(code);
  await expect(guest.locator('#onlineConnection')).toContainText(/Live verbunden|Verbinden/i);

  await hostContext.close();
  await guestContext.close();
});
