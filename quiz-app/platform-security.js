'use strict';

const crypto = require('crypto');
const storage = require('./platform-storage');
const adminStorage = require('./platform-admin-storage');

const SECRET = crypto.createHash('sha256').update(String(
  process.env.PLATFORM_SECURITY_SECRET
  || process.env.PROFILE_SESSION_SECRET
  || process.env.ADMIN_PASSWORD
  || process.env.EVENT_PASSWORD
  || 'quiztime-platform-security',
)).digest();
const buckets = new Map();
const strikes = new Map();
const TICKET_TTL_MS = 2 * 60 * 1000;
const INTERNAL_SECRET = String(process.env.PLATFORM_INTERNAL_SECRET || process.env.ADMIN_PASSWORD || process.env.EVENT_PASSWORD || 'quiztime-internal');
const TEST_MODE = process.env.NODE_ENV === 'test';

const blockedTerms = [
  /\b(?:nazi|hitlergruß|heil\s+hitler)\b/iu,
  /\b(?:hurensohn|fotze|wichser|missgeburt)\b/iu,
  /\b(?:kill\s+yourself|kys)\b/iu,
];

function safeIp(req) {
  return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .split(',')[0].trim().slice(0, 120);
}
function ipHash(req) { return crypto.createHmac('sha256', SECRET).update(safeIp(req)).digest('base64url'); }
function roomCode(req) {
  const direct = String(req.params?.code || req.body?.code || req.query?.code || '');
  const pathMatch = String(req.path || req.url || '').match(/\/rooms\/([A-Z0-9]{6})(?:\/|$)/iu);
  return String(direct || pathMatch?.[1] || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
function playerToken(req) { return String(req.body?.token || req.query?.token || req.headers['x-player-token'] || '').trim(); }
function routeKey(req) { return `${req.method}:${req.baseUrl || ''}${req.path || req.url}`.slice(0, 240); }

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  buckets.set(key, bucket);
  return { allowed: bucket.count <= max, retryAfterMs: Math.max(0, bucket.resetAt - now), count: bucket.count };
}

async function addStrike(hash, reason) {
  const now = Date.now();
  const current = strikes.get(hash) || [];
  const active = current.filter(timestamp => now - timestamp < 30 * 60 * 1000);
  active.push(now);
  strikes.set(hash, active);
  await storage.audit({ actorType: 'network', actorId: hash.slice(0, 16), action: 'security_strike', target: reason, ipHash: hash });
  if (active.length >= 6) {
    await storage.banKey(hash, `Automatische Sperre: ${reason}`, 30);
    strikes.delete(hash);
  }
}

function seal(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SECRET, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function unseal(value) {
  try {
    const data = Buffer.from(String(value || ''), 'base64url');
    if (data.length < 29) return null;
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', SECRET, iv);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
    if (!payload?.token || !payload?.code || Number(payload.expiresAt) <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function contentProblem(message) {
  const text = String(message || '').trim();
  if (!text) return null;
  if (text.length > 160) return 'Nachricht ist zu lang.';
  if (blockedTerms.some(pattern => pattern.test(text))) return 'Diese Nachricht verstößt gegen die Chatregeln.';
  if ((text.match(/https?:\/\//giu) || []).length > 1) return 'Im Chat ist höchstens ein Link erlaubt.';
  if (/(.)\1{12,}/u.test(text)) return 'Bitte keine Zeichenfluten senden.';
  return null;
}

function onlineRuleFor(req) {
  const path = req.path || '';
  if (req.method === 'POST' && path === '/rooms') return { max: 5, windowMs: 60 * 60 * 1000, label: 'Raumerstellung' };
  if (path.endsWith('/join') || path.endsWith('/preview')) return { max: 40, windowMs: 10 * 60 * 1000, label: 'Raumcode-Prüfung' };
  if (path.endsWith('/chat')) return { max: 8, windowMs: 20 * 1000, label: 'Chat' };
  if (path.endsWith('/answer')) return { max: 35, windowMs: 60 * 1000, label: 'Antworten' };
  if (path.endsWith('/stream-ticket')) return { max: 20, windowMs: 60 * 1000, label: 'Echtzeit-Ticket' };
  return { max: 180, windowMs: 60 * 1000, label: 'Online-API' };
}

function platformRuleFor(req) {
  const path = req.path || '';
  if (path === '/admin/login' && req.method === 'POST') return { max: 8, windowMs: 15 * 60 * 1000, label: 'Admin-Anmeldung' };
  if (path === '/client-error' && req.method === 'POST') return { max: 30, windowMs: 60 * 1000, label: 'Client-Fehler' };
  if (path.includes('/reports') && req.method === 'POST') return { max: 8, windowMs: 60 * 60 * 1000, label: 'Meldungen' };
  if (path.includes('/invites') && req.method === 'POST') return { max: 30, windowMs: 60 * 60 * 1000, label: 'Einladungen' };
  if (path.includes('/friends/request') && req.method === 'POST') return { max: 25, windowMs: 60 * 60 * 1000, label: 'Freundschaftsanfragen' };
  if (path.includes('/matchmaking/join') && req.method === 'POST') return { max: 12, windowMs: 10 * 60 * 1000, label: 'Matchmaking' };
  return { max: 150, windowMs: 60 * 1000, label: 'Plattform-API' };
}

function accountRuleFor(req) {
  const path = req.path || '';
  if (path === '/password/forgot' && req.method === 'POST') return { max: 6, windowMs: 30 * 60 * 1000, label: 'Passwort-Link' };
  if (path === '/password/reset' && req.method === 'POST') return { max: 8, windowMs: 30 * 60 * 1000, label: 'Passwort-Reset' };
  if (path === '/email/verify') return { max: 20, windowMs: 30 * 60 * 1000, label: 'E-Mail-Bestätigung' };
  if (path === '/email' || path === '/email/resend') return { max: 6, windowMs: 60 * 60 * 1000, label: 'E-Mail-Änderung' };
  return { max: 100, windowMs: 60 * 1000, label: 'Konto-API' };
}

async function enforceRule(req, res, next, rule) {
  if (req.quiztimeInternal) return next();
  const hash = ipHash(req);
  try {
    // Browser-E2E-Tests teilen sich technisch eine einzige Loopback-IP. Sie sollen
    // weiterhin durch die Regelpfade laufen, dürfen sich aber nicht gegenseitig
    // dauerhaft sperren. Produktionswerte und Sperrlogik bleiben unverändert.
    if (!TEST_MODE && storage.enabled()) {
      const ban = await storage.activeBan(hash);
      if (ban) return res.status(429).json({ error: `Vorübergehend gesperrt: ${ban.reason}`, retryAfter: ban.expires_at });
    }
    const effectiveMax = TEST_MODE ? Math.max(rule.max * 100, 1000) : rule.max;
    const limit = rateLimit(`${hash}:${rule.label}`, effectiveMax, rule.windowMs);
    if (!limit.allowed) {
      if (!TEST_MODE) await addStrike(hash, rule.label);
      res.set('Retry-After', String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))));
      return res.status(429).json({ error: `Zu viele Anfragen (${rule.label}). Bitte kurz warten.`, retryAfterMs: limit.retryAfterMs });
    }
    next();
  } catch (error) {
    next(error);
  }
}

function installPlatformSecurity(app) {
  app.use((req, _res, next) => {
    const supplied = String(req.headers['x-quiztime-internal'] || '');
    if (supplied && supplied.length === INTERNAL_SECRET.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(INTERNAL_SECRET))) req.quiztimeInternal = true;
    next();
  });
  app.use((req, res, next) => {
    const started = Date.now();
    res.set({
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    res.on('finish', () => {
      if (!req.path?.startsWith('/api/')) return;
      storage.recordMetric({
        type: res.statusCode >= 500 ? 'server_error' : res.statusCode >= 400 ? 'client_error_response' : 'request',
        route: routeKey(req),
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        profileId: req.soloProfile?.id || null,
        roomCode: roomCode(req),
      });
    });
    next();
  });

  app.use('/api/online', (req, res, next) => enforceRule(req, res, next, onlineRuleFor(req)));
  app.use('/api/platform', (req, res, next) => enforceRule(req, res, next, platformRuleFor(req)));
  app.use('/api/account', (req, res, next) => enforceRule(req, res, next, accountRuleFor(req)));

  app.use('/api/online', async (req, res, next) => {
    if (req.quiztimeInternal) return next();
    try {
      const code = roomCode(req);
      if (code) {
        const closed = await adminStorage.isRoomClosed(code);
        if (closed) return res.status(410).json({ error: closed.reason || 'Dieser Raum wurde durch die Plattform-Moderation geschlossen.' });
        const token = playerToken(req);
        if (token) {
          const banned = await adminStorage.isRoomPlayerBanned(code, token);
          if (banned) return res.status(403).json({ error: banned.reason || 'Du wurdest durch die Plattform-Moderation aus diesem Raum entfernt.' });
        }
      }
      if (req.path.endsWith('/chat') && req.method === 'POST') {
        const problem = contentProblem(req.body?.message);
        if (problem) {
          addStrike(ipHash(req), 'Chatinhalt').catch(() => false);
          return res.status(400).json({ error: problem });
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/online/rooms/:code/stream-ticket', async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const code = roomCode(req);
    if (code.length !== 6 || token.length < 20) return res.status(400).json({ error: 'Ungültige Raumverbindung.' });
    const banned = await adminStorage.isRoomPlayerBanned(code, token).catch(() => false);
    if (banned) return res.status(403).json({ error: banned.reason || 'Diese Raumverbindung wurde gesperrt.' });
    const expiresAt = Date.now() + TICKET_TTL_MS;
    res.json({ ticket: seal({ code, token, expiresAt, nonce: crypto.randomUUID() }), expiresAt });
  });

  app.use('/api/online/rooms/:code/events', async (req, res, next) => {
    const payload = unseal(req.query?.ticket);
    const code = roomCode(req);
    if (!payload || payload.code !== code) return res.status(401).json({ error: 'Echtzeit-Ticket ist ungültig oder abgelaufen.' });
    const banned = await adminStorage.isRoomPlayerBanned(code, payload.token).catch(() => false);
    if (banned) return res.status(403).json({ error: banned.reason || 'Du wurdest aus diesem Raum entfernt.' });
    req.query.token = payload.token;
    delete req.query.ticket;
    next();
  });

  app.post('/api/platform/client-error', async (req, res) => {
    const message = String(req.body?.message || '').slice(0, 500);
    const stack = String(req.body?.stack || '').slice(0, 2000);
    await storage.recordMetric({
      type: 'client_error',
      route: String(req.body?.url || '').slice(0, 300),
      statusCode: 0,
      durationMs: null,
      details: { message, stack, userAgent: String(req.headers['user-agent'] || '').slice(0, 300) },
    });
    res.status(202).json({ ok: true });
  });

  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
    for (const [key, values] of strikes) {
      const active = values.filter(timestamp => now - timestamp < 30 * 60 * 1000);
      if (active.length) strikes.set(key, active); else strikes.delete(key);
    }
    adminStorage.prune().catch(() => false);
  }, 10 * 60 * 1000).unref?.();
}

module.exports = {
  installPlatformSecurity,
  contentProblem,
  seal,
  unseal,
  ipHash,
  _test: { rateLimit, onlineRuleFor, platformRuleFor, accountRuleFor },
};
