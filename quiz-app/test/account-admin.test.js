'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const accountStorage = require('../account-storage');
const auth = require('../solo-profile-auth');
const email = require('../email-service');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  assert.strictEqual(accountStorage.normalizeEmail(' Test@Example.DE '), 'test@example.de', 'E-Mail-Adresse wird nicht normalisiert.');
  assert.strictEqual(accountStorage.normalizeEmail('keine-adresse'), '', 'Ungültige E-Mail-Adresse wird akzeptiert.');
  assert.strictEqual(accountStorage._test.tokenHash('abc'), accountStorage._test.tokenHash('abc'), 'Token-Hash ist nicht stabil.');
  assert.notStrictEqual(accountStorage._test.tokenHash('abc'), accountStorage._test.tokenHash('abcd'), 'Verschiedene Tokens ergeben denselben Hash.');

  const secured = await auth.makePassword('QuizTime2026');
  assert(await auth.verifyPassword('QuizTime2026', secured.salt, secured.hash), 'Neues Passwort kann nicht verifiziert werden.');
  assert(!await auth.verifyPassword('Falsch2026', secured.salt, secured.hash), 'Falsches Passwort wird akzeptiert.');
  assert.throws(() => auth._test.validateNewPassword('kurz1', 'kurz1'), /8 und 72/, 'Zu kurzes Passwort wird akzeptiert.');
  assert.throws(() => auth._test.validateNewPassword('nurBuchstaben', 'nurBuchstaben'), /Buchstaben und eine Zahl/, 'Passwort ohne Zahl wird akzeptiert.');
  assert.doesNotThrow(() => auth._test.validateNewPassword('QuizTime2026', 'QuizTime2026'), 'Gültiges Passwort wird abgelehnt.');

  const token = auth._test.createToken('00000000-0000-0000-0000-000000000001', 7);
  const parsed = auth._test.readToken(token);
  assert.strictEqual(parsed.sessionVersion, 7, 'Sitzungsversion fehlt im Profil-Cookie.');
  assert.strictEqual(email.status().configured, false, 'Isolierter Test darf keinen echten E-Mail-Dienst verwenden.');

  const accountSource = read('account-storage.js');
  const authSource = read('solo-profile-auth.js');
  const routes = read('platform-routes.js');
  const adminStorage = read('platform-admin-storage.js');
  const adminProfiles = read('platform-admin-profile-storage.js');
  const accountHtml = read('public/account.html');
  const recoverHtml = read('public/recover.html');
  const entry = read('public/account-entry.js');
  const adminHtml = read('public/platform-admin.html');
  const adminClient = read('public/platform-admin.js');
  const ops = read('platform-ops-storage.js');

  for (const table of ['quiz_account_preferences','quiz_account_email_verifications','quiz_account_password_resets']) {
    assert(accountSource.includes(table), `Kontotabelle fehlt: ${table}`);
  }
  assert(accountSource.includes('session_version'), 'Sitzungswiderruf fehlt.');
  assert(accountSource.includes('account_status'), 'Profilstatus für Sperren fehlt.');
  assert(authSource.includes("app.post('/api/account/password/forgot'"), 'Passwort-vergessen-API fehlt.');
  assert(authSource.includes("app.post('/api/account/password/reset'"), 'Passwort-Reset-API fehlt.');
  assert(authSource.includes("app.get('/api/account/email/verify'"), 'E-Mail-Bestätigung fehlt.');
  assert(authSource.includes("app.delete('/api/account'"), 'Selbstständige Profillöschung fehlt.');
  assert(authSource.includes('Falls die Adresse zu einem bestätigten QuizTime-Profil gehört'), 'Passwortanfrage verrät möglicherweise vorhandene E-Mail-Adressen.');
  assert(!authSource.includes('Passwort per E-Mail'), 'Klartextpasswort dürfte nicht per E-Mail angeboten werden.');

  for (const id of ['nameForm','emailForm','passwordForm','preferencesForm','sessionsForm','accountBlockList','accountTournamentList','deleteForm']) {
    assert(accountHtml.includes(`id="${id}"`), `Kontocenter-Oberfläche fehlt: ${id}`);
  }
  assert(recoverHtml.includes('forgotForm'), 'Passwort-vergessen-Seite fehlt.');
  assert(recoverHtml.includes('resetForm'), 'Passwort-Reset-Seite fehlt.');
  assert(entry.includes('profileRegisterEmail'), 'E-Mail-Feld wird nicht in die Registrierung eingebaut.');
  assert(entry.includes('/recover'), 'Passwort-vergessen-Link fehlt in der Anmeldung.');

  for (const route of [
    "app.get('/api/platform/admin/profiles'",
    "app.patch('/api/platform/admin/profiles/:id/status'",
    "app.post('/api/platform/admin/profiles/:id/password-reset'",
    "app.get('/api/platform/admin/rooms'",
    "app.post('/api/platform/admin/rooms/:code/close'",
    "app.post('/api/platform/admin/rooms/:code/kick'",
    "app.get('/api/platform/admin/tournaments'",
    "app.get('/api/platform/admin/legacy-packs'",
    "app.get('/api/platform/admin/bans'",
  ]) assert(routes.includes(route), `Vollständige Admin-Route fehlt: ${route}`);

  assert(adminStorage.includes('quiz_platform_closed_rooms'), 'Raumschließungen werden nicht dauerhaft gespeichert.');
  assert(adminStorage.includes('quiz_platform_room_player_bans'), 'Admin-Spielerentfernung wird nicht dauerhaft geschützt.');
  assert(adminProfiles.includes('WITH attempts AS'), 'Profilstatistiken werden nicht ohne Join-Vervielfachung aggregiert.');
  for (const id of ['adminProfiles','adminProfileDetails','adminRooms','adminReports','adminTournaments','adminPacks','adminBans','adminErrors','adminAudit']) {
    assert(adminHtml.includes(`id="${id}"`), `Admin-Oberfläche fehlt: ${id}`);
  }
  for (const feature of ['loadProfiles','openProfile','setProfileStatus','loadRooms','closeRoom','kickPlayer','loadTournaments','loadPacks','loadSecurity']) {
    assert(adminClient.includes(`function ${feature}`) || adminClient.includes(`async function ${feature}`), `Admin-Clientfunktion fehlt: ${feature}`);
  }

  assert(!ops.includes('password_hash'), 'Plattformexport enthält Passwort-Hashes.');
  assert(!ops.includes('password_salt'), 'Plattformexport enthält Passwort-Salts.');
  assert(!ops.includes('private_jwk'), 'Plattformexport enthält private Push-Schlüssel.');
  assert(ops.includes('Sicherheitsfelder und Passwort-Hashes'), 'Export dokumentiert ausgeschlossene Sicherheitsfelder nicht.');

  console.log('QuizTime account recovery, privacy and complete admin tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
