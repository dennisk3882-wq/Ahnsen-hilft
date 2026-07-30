'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public', 'player.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'start.css'), 'utf8');

for (const id of [
  'modeChooser',
  'resumeLiveButton',
  'openLiveLoginButton',
  'forgetLiveButton',
  'backToModesButton',
  'exitLiveViewButton',
  'logoutLiveButton',
]) {
  assert(html.includes(`id="${id}"`), `Startseitenelement fehlt: ${id}`);
  assert(script.includes(`#${id}`), `JavaScript-Verknüpfung fehlt: ${id}`);
}

assert(html.includes('href="/solo"'), 'Direkter Einstieg in das Solo-Quiz fehlt.');
assert(html.includes('href="/start.css"'), 'Startseiten-Stylesheet ist nicht eingebunden.');
assert(css.includes('.home-mode-grid'), 'Neues Layout der Modusauswahl fehlt.');
assert(css.includes('.home-mode-card'), 'Neon-Spielmoduskarten fehlen im Stylesheet.');

for (const modeClass of [
  'home-mode-solo',
  'home-mode-offline',
  'home-mode-online',
  'home-mode-live',
]) {
  assert(html.includes(modeClass), `Spielmodus-Karte fehlt: ${modeClass}`);
}

assert(script.includes('showModeChooser();'), 'Die Hauptseite startet nicht in der Modusauswahl.');
assert(!script.includes('if (response.ok) { renderState(await response.json()); connectSocket(); }'), 'Alte automatische Live-Anmeldung ist noch enthalten.');

console.log('Start page mode-selection tests passed.');
