'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const status = require('../browser-test-status');

const root = path.join(__dirname, '..');
const repoRoot = path.join(root, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readRepo = file => fs.readFileSync(path.join(repoRoot, file), 'utf8');

const now = new Date().toISOString();
const successRun = { label: 'Browser-Tests', status: 'completed', conclusion: 'success', updatedAt: now };
assert.strictEqual(status._test.summarize(successRun, { ...successRun, label: 'Produktionsprüfung' }).state, 'success');
assert.strictEqual(status._test.summarize({ ...successRun, conclusion: 'failure' }, successRun).state, 'failed');
assert.strictEqual(status._test.summarize({ ...successRun, status: 'in_progress', conclusion: null }, successRun).state, 'running');

const bootstrap = read('platform-bootstrap.js');
const adminHtml = read('public/platform-admin.html');
const adminClient = read('public/platform-admin-browser-tests.js');
const serviceWorker = read('public/sw.js');
const browserWorkflow = readRepo('.github/workflows/quiz-browser-tests.yml');
const productionWorkflow = readRepo('.github/workflows/quiz-production-smoke.yml');
const playwrightConfig = read('playwright.config.js');

assert(bootstrap.includes('installBrowserTestStatusRoute'), 'Admin-Teststatusroute wird nicht installiert.');
assert(bootstrap.includes('installE2ETestSupport'), 'Isolierte E2E-Testunterstützung fehlt.');
assert(adminHtml.includes('id="adminBrowserTests"'), 'Browser-Teststatus fehlt im Admin-Dashboard.');
assert(adminClient.includes('/api/platform/admin/browser-tests'), 'Admin-Client lädt den Teststatus nicht.');
assert(serviceWorker.includes('/platform-admin-browser-tests.js'), 'Neue Admin-Anzeige fehlt im PWA-Cache.');
assert(browserWorkflow.includes('postgres:16-alpine'), 'Browserworkflow besitzt keine isolierte PostgreSQL-Datenbank.');
assert(browserWorkflow.includes('npx playwright test'), 'Vollständige Playwright-Tests werden nicht ausgeführt.');
assert(browserWorkflow.includes('actions/upload-artifact@v4'), 'Fehlerberichte werden nicht als Artefakt gespeichert.');
assert(productionWorkflow.includes("cron: '17 */6 * * *'"), 'Sechsstündiger Produktionsplan fehlt.');
assert(productionWorkflow.includes('production-smoke.spec.js'), 'Produktions-Smoke-Test fehlt.');
assert(playwrightConfig.includes("trace: 'retain-on-failure'"), 'Playwright-Traces bei Fehlern fehlen.');
assert(playwrightConfig.includes("video: 'retain-on-failure'"), 'Browservideos bei Fehlern fehlen.');

console.log('QuizTime autonomous browser and production smoke tests passed.');
