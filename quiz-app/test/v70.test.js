'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildExplanation, enrichCatalog } = require('../question-explanations');
const { _test: profileTest } = require('../solo-profile-auth');
const root = path.join(__dirname, '..');
for (const type of ['adult', 'child']) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', type + '-questions.json'), 'utf8'));
  const enriched = enrichCatalog(catalog);
  assert.strictEqual(enriched.length, catalog.length);
  enriched.forEach((question, index) => assert(buildExplanation(question).length >= 18, type + ' Frage ' + (index + 1) + ' hat keine brauchbare Erklärung.'));
}
(async () => {
  const secured = await profileTest.makePassword('testpasswort');
  assert(await profileTest.verifyPassword('testpasswort', secured.salt, secured.hash));
  assert(!(await profileTest.verifyPassword('falsch', secured.salt, secured.hash)));
  const token = profileTest.createToken('profile-id');
  assert.strictEqual(profileTest.readToken(token).profileId, 'profile-id');
  const soloHtml = fs.readFileSync(path.join(root, 'public', 'solo.html'), 'utf8');
  const soloExit = fs.readFileSync(path.join(root, 'public', 'solo-exit.js'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'public', 'admin.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const screen = fs.readFileSync(path.join(root, 'public', 'screen.html'), 'utf8');
  assert(soloHtml.includes('/solo-profiles.js'));
  assert(soloHtml.includes('id="exitSoloButton"'));
  assert(soloHtml.includes('/solo-exit.js'));
  assert(soloExit.includes('window.confirm'));
  assert(soloExit.includes("method: 'DELETE'"));
  assert(soloExit.includes("window.location.assign('/solo')"));
  assert(admin.includes("start_tiebreak"));
  assert(admin.includes('data-score-adjust'));
  assert(server.includes("case 'adjust_score'"));
  assert(server.includes("case 'start_tiebreak'"));
  assert(screen.includes('/vendor/qrcode.min.js'));
  assert(!screen.includes('cdnjs.cloudflare.com'));
  console.log('Version 7 profile, explanation, solo-exit and live-admin tests passed.');
})().catch(error => { console.error(error); process.exit(1); });
