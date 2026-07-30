'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const storage = require('./extended-storage');
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

function safeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
}

function nameKey(value) {
  return safeName(value).toLocaleLowerCase('de-DE');
}

function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function consumeAttempt(ip) {
  const now = Date.now();
  const key = String(ip || 'unknown');
  const active = (attempts.get(key) || []).filter(timestamp => now - timestamp < 10 * 60 * 1000);
  if (active.length >= 12) return false;
  active.push(now);
  attempts.set(key, active);
  return true;
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

function signPayload(payload) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
}

function createToken(profileId) {
  const payload = Buffer.from(JSON.stringify({ profileId, expiresAt: Date.now() + SESSION_MAX_AGE_MS })).toString('base64url');
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
    return parsed;
  } catch {
    return null;
  }
}

function setProfileCookie(res, profileId) {
  res.cookie(COOKIE_NAME, createToken(profileId), {
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

async function profileForRequest(req) {
  const parsed = readToken(req.cookies?.[COOKIE_NAME]);
  if (!parsed) return null;
  const profile = await storage.getProfileById(parsed.profileId);
  return profile ? publicProfile(profile) : null;
}

async function requireProfile(req, res, next) {
  try {
    if (!storage.enabled()) {
      req.soloProfile = { id: '00000000-0000-0000-0000-000000000000', name: 'Gast', avatarId: 'robot' };
      return next();
    }
    const profile = await profileForRequest(req);
    if (!profile) return res.status(401).json({ error: 'Bitte zuerst ein Solo-Profil auswählen und das Passwort eingeben.' });
    req.soloProfile = profile;
    next();
  } catch (error) {
    res.status(503).json({ error: `Profil konnte nicht geladen werden: ${error.message}` });
  }
}

function installProfileRoutes(app) {
  installOfflineRoutes(app);
  installOnlineMultiplayerRoutes(app);
  installWeakPracticeRoutes(app, requireProfile);

  app.get('/api/solo/profiles', async (_req, res) => {
    try {
      res.json({
        enabled: storage.enabled(),
        avatars: storage.AVATAR_IDS,
        profiles: (await storage.listProfiles()).map(publicProfile),
      });
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
      res.json({
        currentProfileId: current?.id || null,
        leaderboard: await storage.getLeaderboard(50),
      });
    } catch (error) {
      res.status(503).json({ error: `Bestenliste konnte nicht geladen werden: ${error.message}` });
    }
  });

  app.post('/api/solo/profiles/register', async (req, res) => {
    const ip = ipOf(req);
    if (!consumeAttempt(ip)) return res.status(429).json({ error: 'Zu viele Versuche. Bitte in einigen Minuten erneut probieren.' });
    const name = safeName(req.body?.name);
    const password = String(req.body?.password || '');
    const confirmation = String(req.body?.passwordConfirmation || '');
    const avatarId = storage.isAvatarId(req.body?.avatarId) ? req.body.avatarId : 'robot';
    if (name.length < 2) return res.status(400).json({ error: 'Der Profilname muss mindestens zwei Zeichen haben.' });
    if (password.length < 4 || password.length > 72) return res.status(400).json({ error: 'Das Passwort muss zwischen 4 und 72 Zeichen lang sein.' });
    if (password !== confirmation) return res.status(400).json({ error: 'Die beiden Passwörter stimmen nicht überein.' });
    try {
      const secured = await makePassword(password);
      const profile = await storage.createProfile({
        id: crypto.randomUUID(),
        name,
        nameKey: nameKey(name),
        passwordSalt: secured.salt,
        passwordHash: secured.hash,
        avatarId,
      });
      clearAttempts(ip);
      setProfileCookie(res, profile.id);
      res.json({ profile: publicProfile(profile) });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Dieser Profilname ist bereits vergeben.' });
      res.status(503).json({ error: `Profil konnte nicht angelegt werden: ${error.message}` });
    }
  });

  app.post('/api/solo/profiles/login', async (req, res) => {
    const ip = ipOf(req);
    if (!consumeAttempt(ip)) return res.status(429).json({ error: 'Zu viele Anmeldeversuche. Bitte in einigen Minuten erneut probieren.' });
    const profileName = safeName(req.body?.name);
    const password = String(req.body?.password || '');
    try {
      const stored = await storage.findProfileByNameKey(nameKey(profileName));
      if (!stored || !await verifyPassword(password, stored.password_salt, stored.password_hash)) {
        return res.status(403).json({ error: 'Profilname oder Passwort ist falsch.' });
      }
      await storage.touchProfileLogin(stored.id);
      clearAttempts(ip);
      setProfileCookie(res, stored.id);
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
}

module.exports = {
  installProfileRoutes,
  requireProfile,
  profileForRequest,
  safeName,
  nameKey,
  _test: { makePassword, verifyPassword, createToken, readToken },
};
