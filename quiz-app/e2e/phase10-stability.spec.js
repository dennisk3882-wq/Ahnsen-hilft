'use strict';

const { test, expect } = require('@playwright/test');
const {
  uniqueIdentity,
  registerProfile,
  verifyProfileEmail,
  registerAndVerifyProfile,
} = require('./helpers');

async function jsonFetch(page, url, options = {}) {
  return page.evaluate(async ({ target, init }) => {
    const response = await fetch(target, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { target: url, init: options });
}

test('Arena sperrt unbestätigte Konten und wird nach E-Mail-Bestätigung freigeschaltet', async ({ page, request }) => {
  const identity = uniqueIdentity('VerifyGuard');
  await registerProfile(page, identity);

  const blocked = await jsonFetch(page, '/api/platform/phase10/overview');
  expect(blocked.status).toBe(403);
  expect(blocked.body.reason).toBe('email_unverified');

  await verifyProfileEmail(page, request, identity);
  const allowed = await jsonFetch(page, '/api/platform/phase10/overview');
  expect(allowed.status).toBe(200);
  expect(allowed.body.missions.daily).toHaveLength(4);
});

test('Normales Online-Spiel wird Profilen, Historie und Saisonliga zugeordnet', async ({ browser, request }) => {
  const hostIdentity = uniqueIdentity('ProfilHost');
  const guestIdentity = uniqueIdentity('ProfilGast');
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await registerAndVerifyProfile(host, request, hostIdentity);
    await registerAndVerifyProfile(guest, request, guestIdentity);

    await host.goto('/online');
    await host.fill('#onlineHostName', 'Wird serverseitig ersetzt');
    await host.fill('#onlineRoomTitle', 'Profilgebundener Test');
    await host.selectOption('#onlineQuestionCount', '5');
    await host.locator('#onlineCreateForm button[type="submit"]').click();
    const code = (await host.locator('#onlineRoomCode').textContent()).trim();

    await guest.goto('/online');
    await guest.locator('[data-online-tab="join"]').click();
    await guest.fill('#onlineJoinCode', code);
    await guest.fill('#onlineJoinName', 'Wird serverseitig ersetzt');
    await guest.locator('#onlineJoinForm button[type="submit"]').click();
    await expect(host.locator('#onlinePlayerList')).toContainText(guestIdentity.name);
    await expect(host.locator('#onlinePlayerList')).toContainText(hostIdentity.name);

    await guest.locator('#toggleOnlineReady').click();
    await expect(host.locator('#startOnlineGame')).toBeEnabled();
    await host.locator('#startOnlineGame').click();

    for (let index = 0; index < 5; index += 1) {
      await expect(host.locator('[data-online-answer]')).toHaveCount(4);
      await expect(guest.locator('[data-online-answer]')).toHaveCount(4);
      await host.locator('[data-online-answer="0"]').click();
      await guest.locator('[data-online-answer="1"]').click();
      await expect(host.locator('.online-explanation')).toBeVisible();
      await host.locator('#onlineNextQuestion').click();
    }
    await expect(host.locator('.online-finish-view')).toBeVisible();
    await expect(guest.locator('.online-finish-view')).toBeVisible();

    await expect.poll(async () => {
      const response = await jsonFetch(host, '/api/platform/phase10/history?type=online&days=30&limit=20');
      return response.body.history?.filter(item => item.source_type === 'online').length || 0;
    }).toBeGreaterThan(0);

    const league = await jsonFetch(host, '/api/platform/phase10/league?limit=200');
    expect(league.status).toBe(200);
    expect(Number(league.body.me?.points || 0)).toBeGreaterThan(0);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('Eventstart reserviert genau einen Versuch und setzt eine offene Runde fort', async ({ page, request }) => {
  const identity = uniqueIdentity('EventAttempt');
  await registerAndVerifyProfile(page, request, identity);

  const eventsResponse = await jsonFetch(page, '/api/platform/phase10/events');
  const event = (eventsResponse.body.events || []).find(item => item.availability === 'active');
  expect(event).toBeTruthy();

  const first = await jsonFetch(page, `/api/platform/phase10/events/${event.id}/start`, { method: 'POST', body: '{}' });
  const second = await jsonFetch(page, `/api/platform/phase10/events/${event.id}/start`, { method: 'POST', body: '{}' });
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(second.body.sessionId).toBe(first.body.sessionId);

  const refreshed = await jsonFetch(page, '/api/platform/phase10/events');
  const sameEvent = refreshed.body.events.find(item => item.id === event.id);
  expect(Number(sameEvent.attempts)).toBe(1);
  expect(sameEvent.open_session_id).toBe(first.body.sessionId);
});

test('Stabilitätsstatus meldet Migration, Zeitzone und erreichbare Datenbank', async ({ request }) => {
  const response = await request.get('/api/platform/stability/status');
  expect(response.ok()).toBeTruthy();
  const status = await response.json();
  expect(status.version).toBe('10.1.0');
  expect(status.databaseReachable).toBe(true);
  expect(status.timezone).toBe('Europe/Berlin');
  expect(status.migrations.some(item => item.version === '010_phase10_stability.sql')).toBe(true);
});
