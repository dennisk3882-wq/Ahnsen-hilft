'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('migrations/120_phase12_13_release_quality.sql');
const shared = read('phase12-shared.js');
const legalStorage = read('phase12-legal-storage.js');
const quality = read('phase12-quality-storage.js');
const operations = read('phase12-operations.js');
const engagement = read('phase13-storage.js');
const routes = read('phase12-13-routes.js');
const bootstrap = read('phase12-13-bootstrap.js');
const legalPages = read('legal-pages.js');
const packageJson = JSON.parse(read('package.json'));
const sw = read('public/sw.js');
const client = read('public/phase12-13-client.js');
const progress = read('public/progress.html');
const adminWrapper = read('public/platform-admin-phase11.js');
const adminCore = read('public/platform-admin-phase11-core.js');

for (const table of ['quiz_phase12_question_reports','quiz_phase12_question_versions','quiz_phase12_feedback','quiz_phase12_error_events','quiz_phase12_release_checks','quiz_phase12_legal_consents','quiz_phase13_engagement','quiz_phase13_daily_activity','quiz_phase13_achievements','quiz_phase13_records']) {
  assert(migration.includes(table), `Phase-12/13-Tabelle fehlt: ${table}`);
}
assert.strictEqual(packageJson.version, '13.0.0', 'Paketversion ist nicht 13.0.0.');
assert.strictEqual(packageJson.scripts.check, 'node scripts/check-js.js', 'Automatische JavaScript-Prüfung ist nicht aktiv.');
assert(shared.includes("VERSION = '13.0.0'"), 'Zentrale Version 13.0.0 fehlt.');
assert(shared.includes("name: 'Dennis Koch'"), 'Betreibername fehlt.');
assert(shared.includes("street: 'In der Flöte 19'"), 'Betreiberanschrift fehlt.');
assert(shared.includes("postalCode: '31708'"), 'Postleitzahl fehlt.');
assert(shared.includes('LEGAL_CONTACT_EMAIL'), 'Konfigurierbare Impressums-E-Mail fehlt.');
assert(legalStorage.includes("ageGroup === 'under16'"), 'Altersgruppenprüfung fehlt.');
assert(legalStorage.includes('guardian_verified_at'), 'Bestätigung durch Erziehungsberechtigte fehlt.');
assert(quality.includes('reportQuestion'), 'Fragenmeldung fehlt.');
assert(quality.includes('questionStatistics'), 'Fragenstatistik fehlt.');
assert(quality.includes('quiz_phase12_question_versions'), 'Fragenversionsverlauf fehlt.');
assert(quality.includes('reloadFromDatabase'), 'Katalog wird nach Korrektur nicht neu geladen.');
assert(operations.includes('releaseChecks'), 'Release-Bereitschaft fehlt.');
assert(operations.includes('recordError'), 'Zentrale Fehleraggregation fehlt.');
assert(operations.includes("migration-120"), 'Migration 120 wird nicht geprüft.');
assert(engagement.includes('current_streak'), 'Aktivitätsserie fehlt.');
assert(engagement.includes('weekly_goal'), 'Wochenziel fehlt.');
assert(engagement.includes('recommendations'), 'Persönliche Empfehlungen fehlen.');
assert(engagement.includes('friendActivity'), 'Freundesaktivitäten fehlen.');
assert(routes.includes("app.get('/legal'"), 'Rechtsseite ist nicht angebunden.');
assert(routes.includes("app.get('/progress'"), 'Fortschrittsseite ist nicht angebunden.');
assert(routes.includes("app.post('/api/platform/questions/report'"), 'Fragenmelde-API fehlt.');
assert(routes.includes("app.get('/api/platform/release-readiness'"), 'Release-Endpunkt fehlt.');
assert(bootstrap.includes('installLegalGuard'), 'Rechtliche Einwilligung wird nicht geschützt.');
assert(bootstrap.includes('installActivityCapture'), 'Aktivitätsaufzeichnung fehlt.');
assert(legalPages.includes('technische Vorlagen'), 'Hinweis auf rechtliche Prüfung fehlt.');
assert(legalPages.includes('Tracking-Cookies werden in Version 13 nicht eingesetzt'), 'Tracking-Hinweis fehlt.');
assert(client.includes('Problem melden'), 'Globaler Problem-melden-Button fehlt.');
assert(client.includes('Ein vollständiges Geburtsdatum wird nicht gespeichert'), 'Datensparsame Altersabfrage fehlt.');
assert(progress.includes('Dein Fortschritt'), 'Fortschrittsseite fehlt.');
assert(sw.includes("quiztime-phase13-v1"), 'PWA-Cache wurde nicht auf Phase 13 erhöht.');
for (const asset of ['/progress','/legal','/phase12-13-client.js','/platform-admin-phase11-core.js']) assert(sw.includes(`'${asset}'`), `PWA-Asset fehlt: ${asset}`);
assert(adminWrapper.includes('/platform-admin-phase11-core.js'), 'Phase-11-Admin-Kern wird nicht nachgeladen.');
assert(adminWrapper.includes('/platform-admin-phase12.js'), 'Phase-12-Admin wird nicht geladen.');
assert(adminCore.includes('Launch-Reife'), 'Bestehende Phase-11-Administration ging verloren.');
assert(read('solo-profile-auth.js').includes("app.get('/api/account/export'"), 'Datenexport fehlt.');
assert(read('solo-profile-auth.js').includes("app.delete('/api/account'"), 'Kontolöschung fehlt.');

const moduleApi = require('../phase12-13-storage');
assert.strictEqual(moduleApi._test.berlinDate(new Date('2026-08-05T10:00:00Z')), '2026-08-05');
assert.strictEqual(moduleApi._test.mondayFor('2026-08-05'), '2026-08-03');
assert.strictEqual(moduleApi._test.dateDiffDays('2026-08-05', '2026-08-04'), 1);
assert(moduleApi._test.resolveQuestion({ questionId: 'child-001', quizType: 'child' }), 'Bekannte Kinderfrage wird nicht aufgelöst.');

console.log('Phase 12/13 release, legal, quality and engagement tests passed.');
