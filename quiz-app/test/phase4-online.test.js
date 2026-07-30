'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  calculateOnlineScore,
  normalizeRoomCode,
  TEAM_NAMES,
} = require('../online-multiplayer');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

assert.strictEqual(calculateOnlineScore({ correct: true, remainingSeconds: 20 }), 30, 'Maximaler Zeitbonus ist falsch.');
assert.strictEqual(calculateOnlineScore({ correct: true, remainingSeconds: 13 }), 23, 'Zeitbonus wird falsch berechnet.');
assert.strictEqual(calculateOnlineScore({ correct: false, remainingSeconds: 19 }), -5, 'Falsche Antwort muss fünf Minuspunkte ergeben.');
assert.strictEqual(calculateOnlineScore({ correct: false, timedOut: true }), 0, 'Zeitablauf muss null Punkte ergeben.');
assert.strictEqual(normalizeRoomCode(' ahn-sen! '), 'AHNSEN', 'Raumcode wird nicht zuverlässig normalisiert.');
assert.strictEqual(TEAM_NAMES.violet, 'Team Violett', 'Violettes Team fehlt.');
assert.strictEqual(TEAM_NAMES.blue, 'Team Blau', 'Blaues Team fehlt.');

const index = read('public/index.html');
const html = read('public/online.html');
const css = read('public/online.css');
const client = read('public/online.js');
const server = read('online-multiplayer.js');
const auth = read('solo-profile-auth.js');
const sw = read('public/sw.js');

const onlineCard = index.slice(index.indexOf('home-mode-online'), index.indexOf('home-mode-live'));
assert(onlineCard.includes('href="/online"'), 'Online-Mehrspieler ist auf der Startseite nicht freigeschaltet.');
assert(onlineCard.includes('Sofort spielbar'), 'Online-Mehrspieler ist nicht als spielbar markiert.');
assert(!onlineCard.includes('data-upcoming'), 'Online-Mehrspieler ist weiterhin nur eine Vorschau.');
assert(index.includes('Alle vier Plattformphasen sind integriert'), 'Abschluss der vier Plattformphasen wird nicht angezeigt.');

for (const asset of ['/online.css', '/online.js']) {
  assert(html.includes(asset), `Online-Seite lädt das Asset nicht: ${asset}`);
}
for (const id of [
  'onlineCreateForm',
  'onlineJoinForm',
  'onlineJoinCode',
  'onlinePublicRooms',
  'onlineRoomView',
  'onlineStage',
  'onlinePlayerList',
  'onlineChatForm',
]) {
  assert(html.includes(`id="${id}"`), `Online-Oberfläche fehlt: ${id}`);
}
assert(html.includes('value="individual"'), 'Einzelspielermodus fehlt.');
assert(html.includes('value="teams"'), 'Teammodus fehlt.');
assert(html.includes('value="private"'), 'Private Räume fehlen.');
assert(html.includes('value="public"'), 'Öffentliche Räume fehlen.');

for (const route of [
  "app.get('/api/online/config'",
  "app.get('/api/online/rooms/public'",
  "app.post('/api/online/rooms'",
  "app.post('/api/online/rooms/:code/join'",
  "app.get('/api/online/rooms/:code/events'",
  "app.post('/api/online/rooms/:code/ready'",
  "app.post('/api/online/rooms/:code/start'",
  "app.post('/api/online/rooms/:code/answer'",
  "app.post('/api/online/rooms/:code/next'",
  "app.post('/api/online/rooms/:code/chat'",
  "app.post('/api/online/rooms/:code/leave'",
]) {
  assert(server.includes(route), `Online-API fehlt: ${route}`);
}
assert(auth.includes("require('./online-multiplayer')"), 'Online-Modul ist nicht an den Webserver angebunden.');
assert(auth.includes('installOnlineMultiplayerRoutes(app);'), 'Online-Routen werden nicht registriert.');
assert(server.includes("'Content-Type': 'text/event-stream'"), 'Echtzeit-SSE fehlt.');
assert(server.includes("'X-Accel-Buffering': 'no'"), 'SSE-Pufferung wird für den Proxy nicht deaktiviert.');
assert(server.includes('scheduleQuestionTimer(room)'), 'Serverseitiger Fragentimer fehlt.');
assert(server.includes('allPlayersAnswered(room)'), 'Vorzeitige Auflösung nach allen Antworten fehlt.');
assert(server.includes('room.phase === \'revealed\''), 'Lösungen werden nicht auf die Auflösungsphase begrenzt.');
assert(server.includes('randomToken()'), 'Sichere, zufällige Spielertokens fehlen.');
assert(server.includes('ROOM_CODE_LENGTH = 6'), 'Sechsstellige Raumcodes fehlen.');
assert(server.includes('teamLeaderboard(room)'), 'Team-Rangliste fehlt.');
assert(server.includes('getPlayerByToken'), 'Spieleraktionen werden nicht mit einem Raumtoken geschützt.');

for (const feature of [
  'new EventSource(',
  'ahnsen_online_credentials_v1',
  'serverClockOffset',
  "roomAction('ready'",
  "roomAction('answer'",
  "roomAction('next'",
  "roomAction('restart'",
  "roomAction('chat'",
  'loadPublicRooms',
  'previewJoinRoom',
  'shareRoom',
  'renderRevealed',
  'renderFinished',
]) {
  assert(client.includes(feature), `Online-Clientfunktion fehlt: ${feature}`);
}
assert(client.includes('Date.now() + serverClockOffset'), 'Countdown wird nicht an der Serverzeit ausgerichtet.');
assert(client.includes('player.ready && player.connected'), 'Getrennte Spieler können im Client fälschlich als startbereit gelten.');

for (const selector of [
  '.online-hero',
  '.online-entry-grid',
  '.online-room-header',
  '.online-player-list',
  '.online-question-view',
  '.online-answer-grid',
  '.online-winner-card',
]) {
  assert(css.includes(selector), `Online-Neon-Designbereich fehlt: ${selector}`);
}

assert(sw.includes("'ahnsen-quiz-phase4-v1'"), 'PWA-Cache wurde nicht auf Phase 4 erhöht.');
for (const asset of ['/online', '/online.css', '/online.js']) {
  assert(sw.includes(`'${asset}'`), `Online-PWA-Asset fehlt: ${asset}`);
}

console.log('Phase 4 online multiplayer tests passed.');
