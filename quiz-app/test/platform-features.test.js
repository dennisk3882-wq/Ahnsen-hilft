'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const security = require('../platform-security');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const routes = read('platform-routes.js');
const social = read('platform-social-storage.js');
const games = read('platform-game-storage.js');
const ops = read('platform-ops-storage.js');
const online = read('public/online.html');
const secureStream = read('public/secure-eventsource.js');
const community = read('public/community.html');
const admin = read('public/platform-admin.html');
const account = read('public/account.html');
const sw = read('public/sw.js');

for (const route of [
  "app.get('/api/platform/friends'",
  "app.post('/api/platform/matchmaking/join'",
  "app.post('/api/platform/tournaments'",
  "app.get('/api/platform/seasons/current'",
  "app.post('/api/platform/reports'",
  "app.get('/api/platform/admin/summary'",
  "app.get('/api/platform/admin/export'",
  "app.get('/api/platform/admin/rooms'",
  "app.get('/api/platform/admin/profiles'",
]) assert(routes.includes(route), `Plattformroute fehlt: ${route}`);

assert(routes.includes("app.use('/api/platform/packs'"), 'Deaktivierung der Nutzer-Quizpakete fehlt.');
assert(routes.includes('Eigene Quizpakete wurden deaktiviert'), 'Deaktivierte Paketrouten liefern keinen verständlichen Hinweis.');
assert(!routes.includes("app.post('/api/platform/packs'"), 'Nutzer können weiterhin Quizpakete veröffentlichen.');

assert(social.includes('quiz_platform_friendships'), 'Freundschaften werden nicht dauerhaft gespeichert.');
assert(social.includes('quiz_platform_blocks'), 'Blockierungen fehlen.');
assert(social.includes('quiz_platform_reports'), 'Meldungen fehlen.');
assert(games.includes('FOR UPDATE SKIP LOCKED'), 'Instanzsicheres Matchmaking fehlt.');
assert(games.includes('quiz_platform_tournaments'), 'Turnierspeicher fehlt.');
assert(games.includes('quiz_platform_seasons'), 'Saisonspeicher fehlt.');
assert(ops.includes('quiz_platform_metrics'), 'Monitoring-Speicher fehlt.');
assert(ops.includes('quiz_platform_audit'), 'Audit-Protokoll fehlt.');
assert(ops.includes('quiz_platform_push_subscriptions'), 'Push-Abonnements fehlen.');
assert(!ops.includes('SELECT * FROM quiz_solo_profiles'), 'Plattformexport würde sensible Profilfelder exportieren.');

const ticket = security.seal({ code: 'ABC123', token: 'x'.repeat(30), expiresAt: Date.now() + 60000 });
assert.strictEqual(security.unseal(ticket).code, 'ABC123', 'Echtzeit-Ticket lässt sich nicht sicher prüfen.');
assert(security.contentProblem('Du Hurensohn'), 'Chatfilter erkennt grobe Beleidigungen nicht.');
assert.strictEqual(security.contentProblem('Viel Erfolg beim Quiz!'), null, 'Unauffälliger Chat wird blockiert.');

assert(online.includes('/secure-eventsource.js'), 'Sicherer Echtzeit-Client ist nicht vor dem Online-Client geladen.');
assert(secureStream.includes('/stream-ticket'), 'Kurzlebige SSE-Tickets werden clientseitig nicht angefordert.');
for (const id of ['profileSearchForm','joinMatchmaking','tournamentCreateForm','seasonLeaderboard','notificationList']) {
  assert(community.includes(`id="${id}"`), `Community-Bereich fehlt: ${id}`);
}
assert(!community.includes('packCreateForm'), 'Quizpaket-Editor ist weiterhin in der Community sichtbar.');
for (const id of ['adminMetrics','adminProfiles','adminRooms','adminReports','adminTournaments','adminPacks','adminErrors','adminAudit']) {
  assert(admin.includes(`id="${id}"`), `Admin-Dashboard fehlt: ${id}`);
}
for (const id of ['nameForm','emailForm','passwordForm','preferencesForm','sessionsForm','deleteForm']) {
  assert(account.includes(`id="${id}"`), `Kontocenter-Bereich fehlt: ${id}`);
}
assert(sw.includes("'quiztime-account-admin-v2'"), 'PWA-Cache wurde nicht auf die Konto-/Adminversion erhöht.');
assert(sw.includes("'/account'"), 'Kontocenter ist nicht offline vorbereitet.');
assert(sw.includes("'/recover'"), 'Wiederherstellungsseite ist nicht im PWA-Cache enthalten.');
assert(!sw.includes("'/pack'"), 'Deaktivierte Quizpaketseite wird weiterhin vorab gecacht.');
assert(sw.includes("self.addEventListener('push'"), 'Push-Empfang im Service Worker fehlt.');

console.log('QuizTime security, community, curated-content, account and admin tests passed.');
