'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const storage = require('./extended-storage');
const accountStorage = require('./account-storage');
const emailService = require('./email-service');
const { installWeakPracticeRoutes } = require('./weak-practice');
const { installOfflineRoutes } = require('./offline-routes');
const { installOnlineMultiplayerRoutes } = require('./online-multiplayer');

const scrypt = promisify(crypto.scrypt);
const COOKIE_NAME = 'solo_profile';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_SECRET = String(
  process.env.PROFILE_SESSION_SECRET
  || process.env.ADMIN_PASSWORD
  || process.env.EVENT_PASSWORD
  || 'ahnsen-solo-profile-session',
);
const attempts = new Map();
const recoveryAttempts = new Map();

function safeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
}

function nameKey(value) {
  return safeName(value).toLocaleLowerCase('de-DE');
}

function ipOf(req) {
  return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function consumeBucket(store, key, max, windowMs) {
  const now = Date.now();
  const active = (store.get(String(key || 'unknown')) || []).filter(timestamp => now - timestamp < windowMs);
  if (active.length >= max) return false;
  active.push(now);
  store.set(String(key || 'unknown'), active);
  return true;
}

function consumeAttempt(ip) {
  return consumeBucket(attempts, ip, 12, 10 * 60 * 1000);
}

function consumeRecoveryAttempt(ip) {
  return consumeBucket(recoveryAttempts, ip, 6, 30 * 60 * 1000);
}

function clearAttempts(ip) {
  attempts.delete(String(ip || 'unknown'));
}

async function passwordDigest(password, salt) {
  const derived = await scrypt(String(password), salt, 64);
  return Buffer.from(derived).toString('base64url');
}

async function makePassword(password) {
  const salt = crypto.randomBytes(18).toString('base64url');
  return { salt, hash: await passwordDigest(password, salt) };
}

async function verifyPassword(password, salt, expectedHash) {
  const actual = await passwordDigest(password, salt);
  const a = Buffer.from(actual);
  const b = Buffer.from(String(expectedHash || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validateNewPassword(password, confirmation) {
  if (password.length < 8 || password.length > 72) throw new Error('Das Passwort muss zwischen 8 und 72 Zeichen lang sein.');
  if (password !== confirmation) throw new Error('Die beiden Passwörter stimmen nicht überein.');
  if (!/[A-Za-zÄÖÜäöüß]/u.test(password) || !/\d/u.test(password)) throw new Error('Das Passwort muss mindestens einen Buchstaben und eine Zahl enthalten.');
}

function signPayload(payload) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
}

function createToken(profileId, sessionVersion = 1) {
  const payload = Buffer.from(JSON.stringify({
    profileId,
    sessionVersion: Number(sessionVersion || 1),
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE_MS,
  })).toString('base64url');
  return `${payload}.${signPayload(payload)}`;
}

function readToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = signPayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.profileId || Number(parsed.expiresAt) <= Date.now()) return null;
    parsed.sessionVersion = Number(parsed.sessionVersion || 1);
    return parsed;
  } catch {
    return null;
  }
}

function setProfileCookie(res, profileId, sessionVersion = 1) {
  res.cookie(COOKIE_NAME, createToken(profileId, sessionVersion), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  });
}

function clearProfileCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function publicProfile(row) {
  return row ? {
    id: row.id,
    name: row.name,
    avatarId: storage.normalizeAvatarId(row.avatarId || row.avatar_id),
    createdAt: row.createdAt || row.created_at,
    lastPlayedAt: row.lastPlayedAt,
    games: Number(row.games || 0),
  } : null;
}

async function sessionForRequest(req) {
  const parsed = readToken(req.cookies?.[COOKIE_NAME]);
  if (!parsed) return { profile: null, reason: 'missing' };
  const [profile, auth] = await Promise.all([
    storage.getProfileById(parsed.profileId),
    accountStorage.getAuthState(parsed.profileId),
  ]);
  if (!profile || !auth) return { profile: null, reason: 'missing' };
  if (auth.status !== 'active') return { profile: null, reason: auth.status, auth };
  if (Number(auth.sessionVersion || 1) !== Number(parsed.sessionVersion || 1)) return { profile: null, reason: 'revoked', auth };
  return { profile: publicProfile(profile), auth, token: parsed };
}

async function profileForRequest(req) {
  const session = await sessionForRequest(req);
  return session.profile;
}

async function requireProfile(req, res, next) {
  try {
    if (!storage.enabled()) {
      req.soloProfile = { id: '00000000-0000-0000-0000-000000000000', name: 'Gast', avatarId: 'robot' };
      return next();
    }
    const session = await sessionForRequest(req);
    if (!session.profile) {
      const message = session.reason === 'suspended'
        ? `Das Profil ist vorübergehend gesperrt${session.auth?.statusReason ? `: ${session.auth.statusReason}` : '.'}`
        : session.reason === 'banned'
          ? `Das Profil wurde gesperrt${session.auth?.statusReason ? `: ${session.auth.statusReason}` : '.'}`
          : session.reason === 'revoked'
            ? 'Diese Anmeldung wurde beendet. Bitte erneut anmelden.'
            : 'Bitte zuerst ein Solo-Profil auswählen und das Passwort eingeben.';
      clearProfileCookie(res);
      return res.status(401).json({ error: message, reason: session.reason });
    }
    req.soloProfile = session.profile;
    req.soloAccount = session.auth;
    next();
  } catch (error) {
    res.status(503).json({ error: `Profil konnte nicht geladen werden: ${error.message}` });
  }
}

async function passwordForProfile(profile) {
  return storage.findProfileByNameKey(nameKey(profile.name));
}

async function confirmProfilePassword(profile, password) {
  const stored = await passwordForProfile(profile);
  if (!stored || !await verifyPassword(String(password || ''), stored.password_salt, stored.password_hash)) {
    throw new Error('Das aktuelle Passwort ist falsch.');
  }
  return stored;
}

async function sendVerification(verification) {
  return emailService.sendVerificationEmail(verification).catch(error => {
    console.error('Bestätigungs-E-Mail konnte nicht gesendet werden:', error.message);
    return false;
  });
}

async function sendPasswordReset(reset) {
  return emailService.sendPasswordResetEmail(reset).catch(error => {
    console.error('Passwort-E-Mail konnte nicht gesendet werden:', error.message);
    return false;
  });
}

function installProfileRoutes(app) {
  installOfflineRoutes(app);
  installOnlineMultiplayerRoutes(app);
  installWeakPracticeRoutes(app, requireProfile);
  accountStorage.ensureReady().catch(error => console.error('Kontotabellen konnten nicht vorbereitet werden:', error.message));

  app.get('/api/solo/profiles', async (_req, res) => {
    try {
      const profiles = await accountStorage.filterPublicProfiles(await storage.listProfiles());
      res.json({ enabled: storage.enabled(), avatars: storage.AVATAR_IDS, profiles });
    } catch (error) {
      res.status(503).json({ error: `Profile konnten nicht geladen werden: ${error.message}` });
    }
  });

  app.get('/api/solo/profiles/me', async (req, res) => {
    try {
      res.json({ profile: await profileForRequest(req) });
    } catch (error) {
      res.status(503).json({ error: `Profil konnte nicht geladen werden: ${error.message}` });
    }
  });

  app.get('/api/solo/leaderboard', async (req, res) => {
    try {
      const current = await profileForRequest(req);
      const leaderboard = await accountStorage.filterLeaderboard(await storage.getLeaderboard(50));
      res.json({ currentProfileId: current?.id || null, leaderboard });
    } catch (error) {
      res.status(503).json({ error: `Bestenliste konnte nicht geladen werden: ${error.message}` });
    }
  });

  app.post('/api/solo/profiles/register', async (req, res) => {
    const ip = ipOf(req);
    if (!consumeAttempt(ip)) return res.status(429).json({ error: 'Zu viele Versuche. Bitte in einigen Minuten erneut probieren.' });
    const name = safeName(req.body?.name);
    const email = accountStorage.normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const confirmation = String(req.body?.passwordConfirmation || '');
    const avatarId = storage.isAvatarId(req.body?.avatarId) ? req.body.avatarId : 'robot';
    if (name.length < 2) return res.status(400).json({ error: 'Der Profilname muss mindestens zwei Zeichen haben.' });
    if (!email) return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
    try { validateNewPassword(password, confirmation); } catch (error) { return res.status(400).json({ error: error.message }); }
    let profile = null;
    try {
      await accountStorage.ensureReady();
      const secured = await makePassword(password);
      profile = await storage.createProfile({
        id: crypto.randomUUID(),
        name,
        nameKey: nameKey(name),
        passwordSalt: secured.salt,
        passwordHash: secured.hash,
        avatarId,
      });
      const verification = await accountStorage.requestEmailVerification(profile.id, email);
      const emailSent = await sendVerification(verification);
      clearAttempts(ip);
      setProfileCookie(res, profile.id, 1);
      res.json({ profile: publicProfile(profile), emailVerificationRequired: true, emailSent });
    } catch (error) {
      if (profile && error.code === 'EMAIL_TAKEN') await accountStorage.deleteProfile(profile.id).catch(() => false);
      if (error.code === '23505') return res.status(409).json({ error: 'Dieser Profilname ist bereits vergeben.' });
      if (error.code === 'EMAIL_TAKEN') return res.status(409).json({ error: error.message });
      res.status(503).json({ error: `Profil konnte nicht angelegt werden: ${error.message}` });
    }
  });

  app.post('/api/solo/profiles/login', async (req, res) => {
    const ip = ipOf(req);
    if (!consumeAttempt(ip)) return res.status(429).json({ error: 'Zu viele Anmeldeversuche. Bitte in einigen Minuten erneut probieren.' });
    const profileName = safeName(req.body?.name);
    const password = String(req.body?.password || '');
    try {
      await accountStorage.ensureReady();
      const stored = await storage.findProfileByNameKey(nameKey(profileName));
      if (!stored || !await verifyPassword(password, stored.password_salt, stored.password_hash)) {
        return res.status(403).json({ error: 'Profilname oder Passwort ist falsch.' });
      }
      const auth = await accountStorage.getAuthState(stored.id);
      if (!auth || auth.status !== 'active') {
        return res.status(403).json({ error: auth?.statusReason || 'Dieses Profil ist derzeit gesperrt.' });
      }
      await storage.touchProfileLogin(stored.id);
      clearAttempts(ip);
      setProfileCookie(res, stored.id, auth.sessionVersion);
      res.json({ profile: publicProfile(stored) });
    } catch (error) {
      res.status(503).json({ error: `Anmeldung ist derzeit nicht möglich: ${error.message}` });
    }
  });

  app.post('/api/solo/profiles/logout', (_req, res) => {
    clearProfileCookie(res);
    res.json({ ok: true });
  });

  app.patch('/api/solo/profiles/me/avatar', requireProfile, async (req, res) => {
    const avatarId = String(req.body?.avatarId || '');
    if (!storage.isAvatarId(avatarId)) return res.status(400).json({ error: 'Bitte einen gültigen Avatar auswählen.' });
    try {
      const profile = await storage.updateProfileAvatar(req.soloProfile.id, avatarId);
      if (!profile) return res.status(404).json({ error: 'Profil wurde nicht gefunden.' });
      res.json({ profile: publicProfile(profile) });
    } catch (error) {
      res.status(503).json({ error: `Avatar konnte nicht gespeichert werden: ${error.message}` });
    }
  });

  app.get('/api/solo/profiles/stats', requireProfile, async (req, res) => {
    try {
      const stats = await storage.getProfileStats(req.soloProfile.id);
      if (!stats) return res.status(404).json({ error: 'Profil wurde nicht gefunden.' });
      res.json(stats);
    } catch (error) {
      res.status(503).json({ error: `Statistik konnte nicht geladen werden: ${error.message}` });
    }
  });

  app.get('/api/account/status', (_req, res) => res.json({ email: emailService.status() }));

  app.get('/api/account/me', requireProfile, async (req, res) => {
    const account = await accountStorage.getAccount(req.soloProfile.id);
    res.json({ account, emailService: emailService.status() });
  });

  app.patch('/api/account/name', requireProfile, async (req, res) => {
    try {
      await confirmProfilePassword(req.soloProfile, req.body?.password);
      const name = safeName(req.body?.name);
      if (name.length < 2) return res.status(400).json({ error: 'Der Profilname muss mindestens zwei Zeichen haben.' });
      const profile = await accountStorage.updateName(req.soloProfile.id, name, nameKey(name));
      res.json({ profile });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Dieser Profilname ist bereits vergeben.' });
      res.status(400).json({ error: error.message });
    }
  });

  app.patch('/api/account/password', requireProfile, async (req, res) => {
    try {
      await confirmProfilePassword(req.soloProfile, req.body?.currentPassword);
      const password = String(req.body?.newPassword || '');
      validateNewPassword(password, String(req.body?.confirmation || ''));
      const secured = await makePassword(password);
      const version = await accountStorage.updatePassword(req.soloProfile.id, secured.salt, secured.hash);
      setProfileCookie(res, req.soloProfile.id, version);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/account/email', requireProfile, async (req, res) => {
    try {
      await confirmProfilePassword(req.soloProfile, req.body?.password);
      const verification = await accountStorage.requestEmailVerification(req.soloProfile.id, req.body?.email);
      const emailSent = await sendVerification(verification);
      res.json({ ok: true, emailSent, pendingEmail: verification.email });
    } catch (error) {
      res.status(error.code === 'EMAIL_TAKEN' ? 409 : 400).json({ error: error.message });
    }
  });

  app.post('/api/account/email/resend', requireProfile, async (req, res) => {
    try {
      const account = await accountStorage.getAccount(req.soloProfile.id);
      const email = account?.pendingEmail || account?.email;
      if (!email || account?.emailVerified) return res.status(409).json({ error: 'Es gibt keine unbestätigte E-Mail-Adresse.' });
      const verification = await accountStorage.requestEmailVerification(req.soloProfile.id, email);
      const emailSent = await sendVerification(verification);
      res.json({ ok: true, emailSent });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/account/email/verify', async (req, res) => {
    try {
      const result = await accountStorage.verifyEmailToken(req.query?.token);
      res.json({ ok: true, email: result.email });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/account/password/forgot', async (req, res) => {
    const ip = ipOf(req);
    if (!consumeRecoveryAttempt(ip)) return res.status(429).json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' });
    try {
      const reset = await accountStorage.createPasswordReset(req.body?.email);
      if (reset) await sendPasswordReset(reset);
      res.json({ ok: true, message: 'Falls die Adresse zu einem bestätigten QuizTime-Profil gehört, wurde eine E-Mail versendet.' });
    } catch (error) {
      console.error('Passwortzurücksetzung konnte nicht vorbereitet werden:', error.message);
      res.json({ ok: true, message: 'Falls die Adresse zu einem bestätigten QuizTime-Profil gehört, wurde eine E-Mail versendet.' });
    }
  });

  app.post('/api/account/password/reset', async (req, res) => {
    const ip = ipOf(req);
    if (!consumeRecoveryAttempt(ip)) return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut versuchen.' });
    try {
      const password = String(req.body?.password || '');
      validateNewPassword(password, String(req.body?.confirmation || ''));
      const secured = await makePassword(password);
      await accountStorage.consumePasswordReset(req.body?.token, secured.salt, secured.hash);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch('/api/account/preferences', requireProfile, async (req, res) => {
    try {
      const preferences = await accountStorage.updatePreferences(req.soloProfile.id, req.body || {});
      res.json({ preferences });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/account/sessions/revoke', requireProfile, async (req, res) => {
    try {
      await confirmProfilePassword(req.soloProfile, req.body?.password);
      const version = await accountStorage.revokeSessions(req.soloProfile.id);
      setProfileCookie(res, req.soloProfile.id, version);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/account/export', requireProfile, async (req, res) => {
    const data = await accountStorage.exportProfileData(req.soloProfile.id);
    if (!data) return res.status(404).json({ error: 'Profil wurde nicht gefunden.' });
    res.set('Content-Disposition', `attachment; filename="quiztime-meine-daten-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(data);
  });

  app.delete('/api/account', requireProfile, async (req, res) => {
    try {
      await confirmProfilePassword(req.soloProfile, req.body?.password);
      if (safeName(req.body?.confirmation) !== req.soloProfile.name) return res.status(400).json({ error: 'Bitte den Profilnamen zur Bestätigung exakt eingeben.' });
      await accountStorage.deleteProfile(req.soloProfile.id);
      clearProfileCookie(res);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
}

module.exports = {
  installProfileRoutes,
  requireProfile,
  profileForRequest,
  safeName,
  nameKey,
  makePassword,
  verifyPassword,
  setProfileCookie,
  clearProfileCookie,
  _test: { makePassword, verifyPassword, createToken, readToken, validateNewPassword },
};
