'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('public/index.html');
const solo = read('public/solo.html');
const appCss = read('public/app.css');
const startCss = read('public/start.css');
const soloAppCss = read('public/solo-app.css');
const appJs = read('public/app.js');
const sw = read('public/sw.js');
const manifest = JSON.parse(read('public/manifest.webmanifest'));

assert(index.includes('Offline-Mehrspieler'), 'Offline-Mehrspieler-Karte fehlt.');
assert(index.includes('Online-Mehrspieler'), 'Online-Mehrspieler-Karte fehlt.');
assert(index.includes('Live-Quiz'), 'Live-Quiz-Karte fehlt.');
assert(index.includes('href="/solo"'), 'Solo-Einstieg fehlt.');
assert(index.includes('class="app-bottom-nav"'), 'Feste App-Navigation fehlt auf der Startseite.');
assert(solo.includes('class="app-bottom-nav"'), 'Feste App-Navigation fehlt im Solo-Bereich.');
assert(index.includes('rel="manifest"'), 'Manifest ist auf der Startseite nicht eingebunden.');
assert(solo.includes('rel="manifest"'), 'Manifest ist im Solo-Bereich nicht eingebunden.');
assert(index.includes('/app.js'), 'Gemeinsame App-Logik fehlt auf der Startseite.');
assert(solo.includes('/app.js'), 'Gemeinsame App-Logik fehlt im Solo-Bereich.');

assert(appCss.includes('.app-bottom-nav'), 'App-Navigation ist nicht gestaltet.');
assert(startCss.includes('.home-mode-grid'), 'Vier Spielmodus-Karten sind nicht gestaltet.');
assert(startCss.includes('.home-mode-card'), 'Neon-Spielmoduskarten fehlen.');
assert(startCss.includes('.home-welcome'), 'Professioneller Startseiten-Einstieg fehlt.');
assert(startCss.includes('.home-feature-rail'), 'Vorteilsleiste der Startseite fehlt.');
assert(soloAppCss.includes('.solo-app-hero'), 'Solo-App-Design fehlt.');
assert(soloAppCss.includes('.solo-explanation'), 'Erklärungskarte ist nicht veredelt.');

for (const modeClass of [
  'home-mode-solo',
  'home-mode-offline',
  'home-mode-online',
  'home-mode-live',
]) {
  assert(index.includes(modeClass), `Spielmodus-Karte fehlt: ${modeClass}`);
}

assert(appJs.includes("navigator.serviceWorker.register('/sw.js')"), 'Service Worker wird nicht registriert.');
assert(appJs.includes('beforeinstallprompt'), 'PWA-Installationshinweis fehlt.');
assert(appJs.includes('data-upcoming'), 'Vorschau-Bereiche sind nicht interaktiv.');
assert(appJs.includes('watchQuizTimeBranding'), 'QuizTime-Branding wird nicht auf allen App-Seiten angewendet.');
assert(sw.includes("url.pathname.startsWith('/api/')"), 'API-Anfragen dürfen nicht offline gecacht werden.');
assert(sw.includes("url.pathname.startsWith('/socket.io/')"), 'Socket.IO darf nicht offline gecacht werden.');

assert.strictEqual(manifest.name, 'QuizTime');
assert.strictEqual(manifest.short_name, 'QuizTime');
assert.strictEqual(manifest.display, 'standalone');
assert(manifest.icons.length >= 2, 'PWA-App-Symbole fehlen.');
assert(fs.existsSync(path.join(root, 'public/icons/ahnsen-quiz.svg')), 'App-Symbol fehlt.');
assert(fs.existsSync(path.join(root, 'public/icons/ahnsen-quiz-maskable.svg')), 'Maskierbares App-Symbol fehlt.');

console.log('Stage 1 web-app, design and PWA tests passed.');