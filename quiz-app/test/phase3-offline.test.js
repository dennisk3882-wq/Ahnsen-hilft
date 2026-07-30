'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { catalogVersion } = require('../offline-routes');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('public/index.html');
const html = read('public/offline.html');
const css = read('public/offline.css');
const client = read('public/offline.js');
const routes = read('offline-routes.js');
const auth = read('solo-profile-auth.js');
const sw = read('public/sw.js');

assert.strictEqual(typeof catalogVersion(), 'string', 'Katalogversion ist nicht verfügbar.');
assert.strictEqual(catalogVersion().length, 16, 'Katalogversion hat nicht die erwartete Länge.');

assert(index.includes('href="/offline"'), 'Offline-Mehrspieler ist auf der Startseite nicht freigeschaltet.');
assert(index.includes('<span>Offline-Spiel starten</span>'), 'Startschaltfläche für Offline-Mehrspieler fehlt.');
const offlineCard = index.slice(index.indexOf('home-mode-offline'), index.indexOf('home-mode-online'));
assert(!offlineCard.includes('data-upcoming'), 'Offline-Mehrspieler ist weiterhin nur als Vorschau markiert.');
assert(offlineCard.includes('Sofort spielbar'), 'Offline-Modus ist nicht als spielbar gekennzeichnet.');

for (const asset of ['/offline.css', '/offline.js']) {
  assert(html.includes(asset), `Offline-Seite lädt das Asset nicht: ${asset}`);
}
for (const id of [
  'offlineSetup',
  'offlineGame',
  'offlineParticipants',
  'offlineQuizType',
  'offlineCategory',
  'offlineRounds',
  'startOfflineButton',
  'offlineStage',
  'offlineScoreboard',
]) {
  assert(html.includes(`id="${id}"`), `Offline-Oberfläche fehlt: ${id}`);
}
assert(html.includes('data-offline-kind="players"'), 'Spielermodus fehlt.');
assert(html.includes('data-offline-kind="teams"'), 'Teammodus fehlt.');
assert(html.includes('data-offline-mode="family"'), 'Familienmodus fehlt.');
assert(html.includes('data-offline-mode="party"'), 'Partymodus fehlt.');

assert(routes.includes("app.get('/api/offline/catalog'"), 'Offline-Katalog-API fehlt.');
assert(routes.includes('correctIndex: question.correctIndex'), 'Offline-Katalog liefert die serverseitig gepflegte Lösung nicht aus.');
assert(routes.includes('explanation: question.explanation'), 'Offline-Katalog liefert die Erklärungen nicht aus.');
assert(auth.includes("require('./offline-routes')"), 'Offline-Routen sind nicht in den Server eingebunden.');
assert(auth.includes('installOfflineRoutes(app);'), 'Offline-Katalogroute wird nicht registriert.');

for (const key of ['ahnsen_offline_catalog_v1', 'ahnsen_offline_game_v1', 'ahnsen_offline_setup_v1']) {
  assert(client.includes(key), `Lokaler Speicher fehlt: ${key}`);
}
assert(client.includes("fetch('/api/offline/catalog'"), 'Client lädt den Offline-Fragenkatalog nicht.');
assert(client.includes("setupState.kind === 'teams' ? 4 : 8"), 'Teilnehmergrenzen für Spieler und Teams fehlen.');
assert(client.includes("game.phase = 'handoff'"), 'Sicherer Gerätewechsel zwischen den Teilnehmern fehlt.');
assert(client.includes('PARTY_SECONDS = 20'), '20-Sekunden-Partytimer fehlt.');
assert(client.includes("correct ? 10 + remainingSeconds : -5"), 'Punkteberechnung des Partymodus ist falsch oder fehlt.');
assert(client.includes("correct ? 10 : 0"), 'Punkteberechnung des Familienmodus ist falsch oder fehlt.');
assert(client.includes('timedOut ? 0'), 'Zeitüberschreitung wird nicht mit null Punkten behandelt.');
assert(client.includes('renderScoreboard'), 'Laufende Rangliste fehlt.');
assert(client.includes('renderResult'), 'Endrangliste fehlt.');
assert(client.includes('loadSavedGame'), 'Gespeicherte Spiele können nicht fortgesetzt werden.');
assert(client.includes('Kurz erklärt'), 'Erklärung nach der Antwort fehlt.');

for (const selector of [
  '.offline-hero',
  '.offline-participant-row',
  '.offline-handoff',
  '.offline-answer-grid',
  '.offline-scoreboard',
  '.offline-winner-card',
]) {
  assert(css.includes(selector), `Neon-Designbereich fehlt: ${selector}`);
}

assert(sw.includes("'ahnsen-quiz-phase3-v1'"), 'PWA-Cache wurde nicht auf Phase 3 erhöht.');
for (const asset of ['/offline', '/offline.css', '/offline.js']) {
  assert(sw.includes(`'${asset}'`), `Offline-PWA-Asset fehlt: ${asset}`);
}

console.log('Phase 3 offline multiplayer tests passed.');
