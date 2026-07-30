'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const security = require('../platform-security');
const storage = require('../platform-storage');

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
const sw = read('public/sw.js');

for (const route of [
  "app.get('/api/platform/friends'",
  "app.post('/api/platform/matchmaking/join'",
  "app.post('/api/platform/tournaments'",
  "app.post('/api/platform/packs'",
  "app.get('/api/platform/seasons/current'",
  "app.post('/api/platform/reports'",
  "app.get('/api/platform/admin/summary'",
  "app.get('/api/platform/admin/export'",
]) assert(routes.includes(route), `Plattformroute fehlt: ${route}`);

assert(social.includes('quiz_platform_friendships'), 'Freundschaften werden nicht dauerhaft gespeichert.');
assert(social.includes('quiz_platform_blocks'), 'Blockierungen fehlen.');
assert(social.includes('quiz_platform_reports'), 'Meldungen fehlen.');
assert(games.includes('FOR UPDATE SKIP LOCKED'), 'Instanzsicheres Matchmaking fehlt.');
assert(games.includes('quiz_platform_tournaments'), 'Turnierspeicher fehlt.');
assert(games.includes('quiz_platform_packs'), 'Quizpaketspeicher fehlt.');
assert(games.includes('quiz_platform_seasons'), 'Saisonspeicher fehlt.');
assert(ops.includes('quiz_platform_metrics'), 'Monitoring-Speicher fehlt.');
assert(ops.includes('quiz_platform_audit'), 'Audit-Protokoll fehlt.');
assert(ops.includes('quiz_platform_push_subscriptions'), 'Push-Abonnements fehlen.');

const ticket = security.seal({ code: 'ABC123', token: 'x'.repeat(30), expiresAt: Date.now() + 60000 });
assert.strictEqual(security.unseal(ticket).code, 'ABC123', 'Echtzeit-Ticket lässt sich nicht sicher prüfen.');
assert(security.contentProblem('Du Hurensohn'), 'Chatfilter erkennt grobe Beleidigungen nicht.');
assert.strictEqual(security.contentProblem('Viel Erfolg beim Quiz!'), null, 'Unauffälliger Chat wird blockiert.');
assert.strictEqual(storage._test.normalizeQuestions([
  { text: 'Frage 1', options: ['A','B','C','D'], correctIndex: 0 },
  { text: 'Frage 2', options: ['A','B','C','D'], correctIndex: 1 },
  { text: 'Frage 3', options: ['A','B','C','D'], correctIndex: 2 },
]).length, 3, 'Eigene Quizpakete werden nicht validiert.');

assert(online.includes('/secure-eventsource.js'), 'Sicherer Echtzeit-Client ist nicht vor dem Online-Client geladen.');
assert(secureStream.includes('/stream-ticket'), 'Kurzlebige SSE-Tickets werden clientseitig nicht angefordert.');
for (const id of ['profileSearchForm','joinMatchmaking','tournamentCreateForm','packCreateForm','seasonLeaderboard','notificationList']) {
  assert(community.includes(`id="${id}"`), `Community-Bereich fehlt: ${id}`);
}
for (const id of ['adminMetrics','adminReports','adminErrors','adminAudit']) {
  assert(admin.includes(`id="${id}"`), `Admin-Dashboard fehlt: ${id}`);
}
assert(sw.includes("'quiztime-platform-v1'"), 'PWA-Cache wurde nicht auf die Plattformversion erhöht.');
assert(sw.includes("self.addEventListener('push'"), 'Push-Empfang im Service Worker fehlt.');

console.log('QuizTime security, community, scaling and admin tests passed.');
