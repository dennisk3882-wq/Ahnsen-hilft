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
const packageJson = JSON.parse(read('package.json'));
const e2ePackage = JSON.parse(read('e2e-tools/package.json'));
const e2eLock = JSON.parse(read('e2e-tools/package-lock.json'));
const playwrightRunner = read('scripts/run-playwright.js');
const postgresLogCheck = read('scripts/check-postgres-log.js');

assert(bootstrap.includes('installBrowserTestStatusRoute'), 'Admin-Teststatusroute wird nicht installiert.');
assert(bootstrap.includes('installE2ETestSupport'), 'Isolierte E2E-Testunterstützung fehlt.');
assert(adminHtml.includes('id="adminBrowserTests"'), 'Browser-Teststatus fehlt im Admin-Dashboard.');
assert(adminClient.includes('/api/platform/admin/browser-tests'), 'Admin-Client lädt den Teststatus nicht.');
assert(serviceWorker.includes('/platform-admin-browser-tests.js'), 'Neue Admin-Anzeige fehlt im PWA-Cache.');
assert(browserWorkflow.includes('postgres:16-alpine'), 'Browserworkflow besitzt keine isolierte PostgreSQL-Datenbank.');
assert.strictEqual(packageJson.scripts['test:browser'], 'node scripts/run-playwright.js test', 'Vollständige Playwright-Suite ist nicht über den gesperrten Runner angebunden.');
assert(browserWorkflow.includes('npm run test:browser'), 'Vollständige Playwright-Tests werden im Browserworkflow nicht ausgeführt.');
assert(playwrightRunner.includes("'@playwright', 'test', 'cli.js'"), 'Der Playwright-Runner nutzt nicht die getrennte Testinstallation.');
assert.strictEqual(e2ePackage.devDependencies['@playwright/test'], '1.61.1', 'Playwright ist nicht exakt gesperrt.');
assert.strictEqual(e2eLock.packages['node_modules/@playwright/test'].version, '1.61.1', 'Playwright-Lockfile stimmt nicht mit der Testversion überein.');
assert(browserWorkflow.includes('npm run test:postgres-log'), 'PostgreSQL-Fehler werden nach Browsertests nicht geprüft.');
assert(postgresLogCheck.includes('ERROR|FATAL|PANIC'), 'PostgreSQL-Prüfung erkennt kritische Datenbankmeldungen nicht.');
assert(browserWorkflow.includes('actions/upload-artifact@v6'), 'Fehlerberichte werden nicht mit der Node-24-fähigen Artefaktaktion gespeichert.');
assert(productionWorkflow.includes("cron: '17 */6 * * *'"), 'Sechsstündiger Produktionsplan fehlt.');
assert(productionWorkflow.includes('GITHUB_SHA'), 'Produktionsprüfung wartet nicht auf den tatsächlich ausgerollten Commit.');
assert(productionWorkflow.includes('production-smoke.spec.js'), 'Produktions-Smoke-Test fehlt.');
assert(playwrightConfig.includes("trace: 'retain-on-failure'"), 'Playwright-Traces bei Fehlern fehlen.');
assert(playwrightConfig.includes("video: 'retain-on-failure'"), 'Browservideos bei Fehlern fehlen.');

console.log('QuizTime 13.1 autonomous browser and production smoke tests passed.');
