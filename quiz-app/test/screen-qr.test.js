'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'screen.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public', 'screen.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'screen-qr.css'), 'utf8');

assert(html.includes('/vendor/qrcode.min.js'), 'Lokale QR-Code-Bibliothek fehlt auf der Beamerseite.');
assert(html.includes('/screen-qr.css'), 'QR-Code-Stylesheet fehlt auf der Beamerseite.');
assert(script.includes('function renderQrCode'), 'QR-Code-Rendering fehlt.');
assert(script.includes('screenJoinQr'), 'QR-Code-Zielcontainer fehlt.');
assert(script.includes('qr.addData(url)'), 'Die Quizadresse wird nicht in den QR-Code geschrieben.');
assert(script.includes('renderQrCode(joinUrl)'), 'Der QR-Code wird im Warteraum nicht erzeugt.');
assert(css.includes('.screen-qr-card'), 'QR-Code-Darstellung ist nicht gestaltet.');

console.log('Beamer QR code tests passed.');