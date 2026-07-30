'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  progressionSummary,
  streakSummary,
  achievementList,
} = require('../progression');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const progression = progressionSummary({ games: 2, correct: 20, points: 300 });
assert.strictEqual(progression.xp, 820, 'XP werden nicht aus Spielen, richtigen Antworten und Punkten berechnet.');
assert.strictEqual(progression.level, 2, 'Levelberechnung ist fehlerhaft.');
assert.strictEqual(progression.xpIntoLevel, 320, 'Fortschritt innerhalb des Levels ist fehlerhaft.');
assert.strictEqual(progression.xpForNextLevel, 180, 'Rest-XP bis zum nächsten Level sind fehlerhaft.');

const streak = streakSummary([
  '2026-07-27T12:00:00Z',
  '2026-07-28T12:00:00Z',
  '2026-07-29T12:00:00Z',
  '2026-07-29T18:00:00Z',
], new Date('2026-07-30T06:00:00Z'));
assert.strictEqual(streak.current, 3, 'Aktive Serie vom Vortag wird nicht fortgeführt.');
assert.strictEqual(streak.best, 3, 'Beste Serie wird nicht korrekt berechnet.');
assert.strictEqual(streak.playedToday, false, 'Heutiger Spielstatus ist falsch.');

const achievements = achievementList({
  games: 20,
  correct: 120,
  answers: 140,
  accuracy: 86,
  bestScore: 240,
  level: 8,
  currentStreak: 4,
  bestStreak: 8,
  categories: [{ category: 'Geografie', correct: 15, accuracy: 90 }],
});
for (const id of ['first-game', 'hundred-correct', 'accuracy-80', 'level-five', 'streak-three', 'streak-seven', 'category-Geografie']) {
  assert(achievements.some(item => item.id === id), `Abzeichen fehlt: ${id}`);
}

const storage = read('extended-storage.js');
const auth = read('solo-profile-auth.js');
const practice = read('weak-practice.js');
const html = read('public/solo.html');
const profiles = read('public/solo-profiles.js');
const practiceClient = read('public/wrong-practice.js');
const phase2Css = read('public/profile-phase2.css');
const phase2Extras = read('public/profile-phase2-extras.css');
const sw = read('public/sw.js');

assert(storage.includes('avatar_id'), 'Avatar-Spalte und Migration fehlen.');
assert(storage.includes('getLeaderboard'), 'Dauerhafte Bestenliste fehlt.');
assert(storage.includes('getWeakQuestionIds'), 'Fehlerfragen können nicht ermittelt werden.');
assert(storage.includes('dailyTask'), 'Tägliche Aufgabe fehlt in den Profilstatistiken.');
assert(storage.includes('currentStreak'), 'Serienfortschritt fehlt in den Profilstatistiken.');

assert(auth.includes("app.get('/api/solo/leaderboard'"), 'Bestenlisten-API fehlt.');
assert(auth.includes("app.patch('/api/solo/profiles/me/avatar'"), 'Avatar-API fehlt.');
assert(auth.includes('installWeakPracticeRoutes(app, requireProfile)'), 'Fehlertraining wird nicht vor den normalen Solo-Routen installiert.');

assert(practice.includes("app.post('/api/solo/practice/start'"), 'Start-API für Fehlertraining fehlt.');
assert(practice.includes("app.post('/api/solo/answer'"), 'Fehlertraining verarbeitet keine Antworten.');
assert(practice.includes("mode: 'practice'"), 'Trainingsantworten werden nicht als Training gespeichert.');
assert(practice.includes('storage.getWeakQuestionIds'), 'Fehlertraining verwendet nicht die persönlichen Fehlerfragen.');

for (const view of ['categories', 'leaderboard', 'profile']) {
  assert(html.includes(`data-profile-view="${view}"`), `Aktive Navigation fehlt: ${view}`);
}
assert(html.includes('href="/profile-phase2.css"'), 'Phase-2-Profilstylesheet fehlt.');
assert(html.includes('href="/profile-phase2-extras.css"'), 'Phase-2-Detailstylesheet fehlt.');
assert(html.includes('src="/wrong-practice.js"'), 'Client für Fehlertraining ist nicht eingebunden.');
assert(!html.includes('data-upcoming-title="Spielerprofil"'), 'Profil ist weiterhin nur als Vorschau markiert.');

for (const feature of ['phase2-avatar-picker', 'phase2-level-chip', 'phase2-badge-grid', 'phase2-leaderboard', 'data-wrong-practice']) {
  assert(profiles.includes(feature) || phase2Css.includes(feature) || phase2Extras.includes(feature), `Phase-2-Oberfläche fehlt: ${feature}`);
}
assert(profiles.includes("api('/api/solo/profiles/stats')"), 'Profil-Dashboard lädt keine Fortschrittsdaten.');
assert(profiles.includes("api('/api/solo/leaderboard')"), 'Profil-Dashboard lädt keine Bestenliste.');
assert(profiles.includes("method: 'PATCH'"), 'Avatar wird nicht dauerhaft gespeichert.');
assert(practiceClient.includes('window.startWrongAnswerPractice'), 'Fehlertraining ist nicht aus dem Profil startbar.');
assert(practiceClient.includes("'/api/solo/practice/start'"), 'Fehlertraining ruft die Start-API nicht auf.');
assert(practiceClient.includes('settings.questionCount = 10'), 'Nach kurzen Trainingslisten bleibt keine gültige Fragenzahl ausgewählt.');
assert(!practiceClient.includes('settings.questionCount = practiceState.totalQuestions'), 'Kurze Trainingslisten machen die normale Solo-Auswahl ungültig.');

assert(/'ahnsen-quiz-phase\d+-v\d+'/.test(sw), 'PWA-Cache besitzt keine gültige Phasenkennung.');
for (const asset of ['/profile-phase2.css', '/profile-phase2-extras.css', '/wrong-practice.js']) {
  assert(sw.includes(`'${asset}'`), `Phase-2-PWA-Asset fehlt: ${asset}`);
}

console.log('Phase 2 profile, progress, leaderboard and practice tests passed.');
