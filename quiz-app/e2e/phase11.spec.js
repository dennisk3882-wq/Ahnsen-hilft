'use strict';

const { test, expect } = require('@playwright/test');
const { uniqueIdentity, registerAndVerifyProfile } = require('./helpers');

async function jsonFetch(page, url, options = {}) {
  return page.evaluate(async ({ target, init }) => {
    const response = await fetch(target, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { target: url, init: options });
}

test('Phase 11 verbindet Einführung, Antwortschutz, Adminsteuerung und Analytics', async ({ page, request }) => {
  const identity = uniqueIdentity('Launch');
  await registerAndVerifyProfile(page, request, identity);

  const readiness = await request.get('/api/platform/readiness');
  expect([200, 503]).toContain(readiness.status());
  const readinessBody = await readiness.json();
  expect(readinessBody.version).toBe('11.0.0');
  expect(readinessBody.checks.some(item => item.key === 'database' && item.ok)).toBe(true);
  expect(readinessBody.checks.some(item => item.key === 'migration' && item.ok)).toBe(true);

  await page.goto('/welcome');
  await expect(page.locator('#welcomeApp')).toBeVisible();
  await expect(page.locator('#welcomeSteps .welcome-step')).toHaveCount(7);

  for (const key of ['profile', 'email', 'first-quiz', 'arena', 'friend', 'competition', 'profile-style']) {
    const step = await jsonFetch(page, `/api/platform/phase11/onboarding/steps/${key}`, { method: 'POST', body: '{}' });
    expect(step.status).toBe(200);
  }
  await page.reload();
  await expect(page.locator('#welcomeProgressLabel')).toContainText('7 von 7');
  await expect(page.locator('#claimWelcomeReward')).toBeEnabled();
  await page.locator('#claimWelcomeReward').click();
  await expect(page.locator('#claimWelcomeReward')).toContainText('abgeholt');

  const started = await jsonFetch(page, '/api/solo/start', {
    method: 'POST',
    body: JSON.stringify({ quizType: 'child', category: 'Gemischt', questionCount: 5, mode: 'relaxed' }),
  });
  expect(started.status).toBe(200);
  const clientEventId = `phase11-${Date.now()}`;
  const firstAnswer = await jsonFetch(page, '/api/solo/answer', {
    method: 'POST',
    body: JSON.stringify({ sessionId: started.body.sessionId, answerIndex: 0, clientEventId, responseMs: 100, questionKey: started.body.question.id }),
  });
  expect(firstAnswer.status).toBe(200);
  const duplicate = await jsonFetch(page, '/api/solo/answer', {
    method: 'POST',
    body: JSON.stringify({ sessionId: started.body.sessionId, answerIndex: 0, clientEventId, responseMs: 100, questionKey: started.body.question.id }),
  });
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.reason).toBe('duplicate_answer');

  await page.goto('/platform-admin');
  await page.fill('#adminPassword', process.env.ADMIN_PASSWORD || 'e2e-admin-password');
  await page.locator('#adminLoginForm button[type="submit"]').click();
  await expect(page.locator('#adminDashboard')).toBeVisible();
  await page.locator('[data-admin-tab="phase11"]').click();
  await expect(page.locator('#adminPhase11Content')).toContainText(/Launch-Reife|Bereitschaft/i);
  await expect(page.locator('[data-phase11-content="readiness"] .phase11-status-card').first()).toBeVisible();

  const riskResponse = await page.evaluate(async () => {
    const response = await fetch('/api/platform/admin/phase11/risks?status=all');
    return { status: response.status, body: await response.json() };
  });
  expect(riskResponse.status).toBe(200);
  expect(riskResponse.body.flags.some(item => item.flag_type === 'answer-speed')).toBe(true);

  const startsAt = new Date(Date.now() + 24 * 3600000).toISOString();
  const endsAt = new Date(Date.now() + 8 * 24 * 3600000).toISOString();
  const event = await page.evaluate(async ({ startsAt, endsAt }) => {
    const response = await fetch('/api/platform/admin/phase11/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Phase 11 Testevent', description: 'Automatisch geprüfter Entwurf.', eventType: 'special',
        status: 'draft', quizType: 'adult', category: 'Geografie', questionCount: 10,
        maxAttempts: 3, startsAt, endsAt, rewardXp: 300, rewardSeasonPoints: 120,
        badgeId: 'phase11-test', communityTarget: 50, featured: false,
      }),
    });
    return { status: response.status, body: await response.json() };
  }, { startsAt, endsAt });
  expect(event.status).toBe(201);
  expect(event.body.event.title).toBe('Phase 11 Testevent');
  expect(event.body.event.active).toBe(false);

  const questions = await page.evaluate(async () => {
    const response = await fetch('/api/platform/admin/phase11/questions?q=Hauptstadt');
    return { status: response.status, body: await response.json() };
  });
  expect(questions.status).toBe(200);
  expect(questions.body.questions.length).toBeGreaterThan(0);
  const questionId = questions.body.questions[0].id;
  const disabled = await page.evaluate(async id => {
    const response = await fetch(`/api/platform/admin/phase11/questions/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disabled: true, reason: 'E2E-Prüfung' }),
    });
    return { status: response.status, body: await response.json() };
  }, questionId);
  expect(disabled.status).toBe(200);
  expect(disabled.body.disabled).toBe(true);
  const enabled = await page.evaluate(async id => {
    const response = await fetch(`/api/platform/admin/phase11/questions/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disabled: false, reason: '' }),
    });
    return { status: response.status, body: await response.json() };
  }, questionId);
  expect(enabled.status).toBe(200);
  expect(enabled.body.disabled).toBe(false);

  await page.locator('[data-phase11-view="analytics"]').click();
  await expect(page.locator('[data-phase11-content="analytics"] .phase11-kpi')).toHaveCount(8);
  await expect(page.locator('[data-phase11-content="analytics"]')).toContainText(/Profile gesamt|Abschlussquote/);
});
