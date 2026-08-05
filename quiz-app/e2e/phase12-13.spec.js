'use strict';

const { test, expect } = require('@playwright/test');
const { uniqueIdentity, latestMail, registerAndVerifyProfile } = require('./helpers');

async function jsonFetch(page, url, options = {}) {
  return page.evaluate(async ({ url, options }) => {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { url, options });
}

test('Phase 12 und 13 verbinden Recht, Fragenqualität, Release-Prüfung und Spielerbindung', async ({ page, request }) => {
  const identity = uniqueIdentity('Release');
  await registerAndVerifyProfile(page, request, identity);

  const legalPage = await request.get('/legal');
  expect(legalPage.ok()).toBeTruthy();
  const legalText = await legalPage.text();
  expect(legalText).toContain('Dennis Koch');
  expect(legalText).toContain('In der Flöte 19');
  expect(legalText).toContain('31708');

  const consent = await jsonFetch(page, '/api/platform/legal/consent');
  expect(consent.status).toBe(200);
  expect(consent.body.valid).toBe(true);
  expect(consent.body.current.privacyVersion).toBe('2026-08-05');

  const readiness = await request.get('/api/platform/release-readiness');
  expect([200, 503]).toContain(readiness.status());
  const readinessBody = await readiness.json();
  expect(readinessBody.version).toBe('13.0.0');
  expect(readinessBody.checks.some(item => item.key === 'database' && item.ok)).toBe(true);
  expect(readinessBody.checks.some(item => item.key === 'migration-120' && item.ok)).toBe(true);
  expect(readinessBody.checks.some(item => item.key === 'catalog-child' && item.ok)).toBe(true);
  expect(readinessBody.checks.some(item => item.key === 'catalog-adult' && item.ok)).toBe(true);

  const started = await jsonFetch(page, '/api/solo/start', { method: 'POST', body: JSON.stringify({ quizType: 'child', category: 'Gemischt', questionCount: 5, mode: 'relaxed' }) });
  expect(started.status).toBe(200);
  const question = started.body.question;
  const answered = await jsonFetch(page, '/api/solo/answer', { method: 'POST', body: JSON.stringify({ sessionId: started.body.sessionId, answerIndex: 0, clientEventId: `phase13-${Date.now()}`, responseMs: 900, questionKey: question.id }) });
  expect(answered.status).toBe(200);
  expect(answered.body.question.correctIndex).toBeGreaterThanOrEqual(0);
  const next = await jsonFetch(page, '/api/solo/next', { method: 'POST', body: JSON.stringify({ sessionId: started.body.sessionId }) });
  expect(next.status).toBe(200);

  const report = await jsonFetch(page, '/api/platform/questions/report', { method: 'POST', body: JSON.stringify({ questionId: question.id, questionText: question.text, quizType: 'child', category: question.category, reportType: 'unclear', comment: 'Automatische Browserprüfung der Fragenmeldung.', pagePath: '/solo', appVersion: '13.0.0' }) });
  expect(report.status).toBe(201);
  expect(report.body.status).toBe('open');

  await page.goto('/progress');
  await expect(page.locator('#progressApp')).toBeVisible();
  await expect(page.locator('#currentStreak')).toContainText(/\d+/);
  await page.fill('#weeklyGoalInput', '7');
  await page.fill('#reminderHour', '19');
  await page.check('#reminderEnabled');
  await page.locator('#progressSettings button[type="submit"]').click();
  await expect(page.locator('#progressSettingsMessage')).toContainText(/gespeichert/i);
  const overview = await jsonFetch(page, '/api/platform/phase13/overview');
  expect(overview.status).toBe(200);
  expect(overview.body.weeklyGoal.target).toBe(7);
  expect(overview.body.preferences.reminderEnabled).toBe(true);
  expect(Array.isArray(overview.body.recommendations)).toBe(true);

  const guardianAddress = `guardian.${Date.now()}@example.test`;
  const under16 = await jsonFetch(page, '/api/platform/legal/consent', { method: 'POST', body: JSON.stringify({ ageGroup: 'under16', guardianEmail: guardianAddress, accepted: true }) });
  expect(under16.status).toBe(200);
  expect(under16.body.valid).toBe(false);
  expect(under16.body.guardianRequired).toBe(true);
  const blocked = await jsonFetch(page, '/api/platform/phase13/overview');
  expect(blocked.status).toBe(428);
  expect(blocked.body.reason).toBe('legal_consent_required');
  const guardianMail = await latestMail(request, guardianAddress, 'Zustimmung');
  const guardianUrl = String(guardianMail.text || '').match(/https?:\/\/[^\s]+\/legal\/guardian\?token=[^\s]+/)?.[0];
  expect(guardianUrl).toBeTruthy();
  await page.goto(guardianUrl);
  await expect(page.locator('body')).toContainText(/Zustimmung bestätigt/i);
  const allowed = await jsonFetch(page, '/api/platform/phase13/overview');
  expect(allowed.status).toBe(200);

  await page.goto('/platform-admin');
  await page.fill('#adminPassword', process.env.ADMIN_PASSWORD || 'e2e-admin-password');
  await page.locator('#adminLoginForm button[type="submit"]').click();
  await expect(page.locator('#adminDashboard')).toBeVisible();
  await page.locator('[data-admin-tab="phase12"]').click();
  await expect(page.locator('#adminPhase12Content')).toContainText(/Release-Bereitschaft/i);
  await expect(page.locator('#p12ReleaseChecks .phase12-check')).toHaveCount(8);
  await expect(page.locator('#p12Reports')).toContainText('Automatische Browserprüfung');

  const reports = await page.evaluate(async () => {
    const response = await fetch('/api/platform/admin/phase12/question-reports?status=open');
    return { status: response.status, body: await response.json() };
  });
  expect(reports.status).toBe(200);
  expect(reports.body.reports.some(item => item.id === report.body.id)).toBe(true);

  const versionsBefore = await page.evaluate(async id => {
    const response = await fetch(`/api/platform/admin/phase12/questions/${encodeURIComponent(id)}/versions`);
    return { status: response.status, body: await response.json() };
  }, question.id);
  expect(versionsBefore.status).toBe(200);
  const edit = await page.evaluate(async ({ question, revealed }) => {
    const response = await fetch(`/api/platform/admin/phase12/questions/${encodeURIComponent(question.id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quizType: 'child', text: question.text, category: question.category, options: question.options, correctIndex: revealed.correctIndex, explanation: revealed.explanation, note: 'E2E-Versionsprüfung' }),
    });
    return { status: response.status, body: await response.json() };
  }, { question, revealed: answered.body.question });
  expect(edit.status).toBe(200);
  const versionsAfter = await page.evaluate(async id => (await fetch(`/api/platform/admin/phase12/questions/${encodeURIComponent(id)}/versions`)).json(), question.id);
  expect(versionsAfter.versions.length).toBe(versionsBefore.body.versions.length + 1);
});
