'use strict';

const crypto = require('crypto');
const storage = require('./platform-storage');
const profileStore = require('./extended-storage');
const accountStorage = require('./account-storage');
const adminStorage = require('./platform-admin-storage');
const emailService = require('./email-service');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'quizmaster2026');
const ADMIN_SECRET = crypto.createHash('sha256').update(String(
  process.env.PLATFORM_ADMIN_SECRET || process.env.PROFILE_SESSION_SECRET || ADMIN_PASSWORD,
)).digest();
const ADMIN_COOKIE = 'quiztime_platform_admin';
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;
const INTERNAL_SECRET = String(process.env.PLATFORM_INTERNAL_SECRET || process.env.ADMIN_PASSWORD || process.env.EVENT_PASSWORD || 'quiztime-internal');

function wrap(handler) {
  return async (req, res, next) => {
    try { await handler(req, res, next); } catch (error) { next(error); }
  };
}
function safeStatus(value) { return ['open','reviewing','resolved','dismissed'].includes(value) ? value : 'open'; }
function safeProfileName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 30); }
function profileNameKey(value) { return safeProfileName(value).toLocaleLowerCase('de-DE'); }
function adminToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ADMIN_TTL_MS, nonce: crypto.randomUUID() })).toString('base64url');
  const signature = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function validAdminToken(token) {
  try {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) return false;
    const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(signature); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    return Number(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp) > Date.now();
  } catch { return false; }
}
function requirePlatformAdmin(req, res, next) {
  if (!validAdminToken(req.cookies?.[ADMIN_COOKIE])) return res.status(401).json({ error: 'Plattform-Admin-Anmeldung erforderlich.' });
  next();
}
function b64url(value) { return Buffer.from(value).toString('base64url'); }
function publicApplicationKey(jwk) {
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  return Buffer.concat([Buffer.from([4]), x, y]).toString('base64url');
}
function vapidJwt(endpoint, privateJwk) {
  const audience = new URL(endpoint).origin;
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: String(process.env.VAPID_SUBJECT || 'mailto:admin@quiztime.local') }));
  const unsigned = `${header}.${payload}`;
  const key = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${signature.toString('base64url')}`;
}
async function sendEmptyPush(endpoint, keys) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `vapid t=${vapidJwt(endpoint, keys.private_jwk)}, k=${publicApplicationKey(keys.public_jwk)}`, TTL: '120', Urgency: 'normal', 'Content-Length': '0' },
  });
  return response.status;
}
async function notifyProfile(profileId, notification) {
  if (!storage.enabled()) return false;
  await storage.addNotification(profileId, notification);
  const account = await accountStorage.getAccount(profileId).catch(() => null);
  if (account?.preferences?.pushNotifications === false) return true;
  const [subscriptions, keys] = await Promise.all([storage.listPushSubscriptions(profileId), storage.getPushKeys()]);
  await Promise.all(subscriptions.map(async subscription => {
    try {
      const status = await sendEmptyPush(subscription.endpoint, keys);
      if (status === 404 || status === 410) await storage.removePushSubscription(profileId, subscription.endpoint);
    } catch { /* In-App-Nachricht bleibt erhalten. */ }
  }));
  return true;
}

async function createMatchedRoom(match) {
  const [profileA, profileB] = await Promise.all([profileStore.getProfileById(match.profileA), profileStore.getProfileById(match.profileB)]);
  if (!profileA || !profileB) throw new Error('Matchmaking-Profile nicht gefunden.');
  const base = `http://127.0.0.1:${PORT}`;
  const createdResponse = await fetch(`${base}/api/online/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-quiztime-internal': INTERNAL_SECRET },
    body: JSON.stringify({ hostName: profileA.name, title: 'QuizTime Schnellspiel', visibility: 'private', gameMode: match.gameMode, quizType: match.quizType, category: 'Gemischt', questionCount: 10, maxPlayers: 2, team: match.gameMode === 'teams' ? 'violet' : null }),
  });
  const created = await createdResponse.json().catch(() => ({}));
  if (!createdResponse.ok) throw new Error(created.error || 'Online-Raum konnte nicht erstellt werden.');
  const joinedResponse = await fetch(`${base}/api/online/rooms/${encodeURIComponent(created.code)}/join`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-quiztime-internal': INTERNAL_SECRET },
    body: JSON.stringify({ name: profileB.name, team: match.gameMode === 'teams' ? 'blue' : null }),
  });
  const joined = await joinedResponse.json().catch(() => ({}));
  if (!joinedResponse.ok) throw new Error(joined.error || 'Zweiter Spieler konnte nicht beitreten.');
  const credentialsA = { code: created.code, token: created.token, playerId: created.playerId, name: profileA.name };
  const credentialsB = { code: joined.code, token: joined.token, playerId: joined.playerId, name: profileB.name };
  await storage.setMatchReady(match.id, created.code, credentialsA, credentialsB);
  await Promise.all([
    notifyProfile(profileA.id, { type: 'match', title: 'Gegner gefunden', body: `${profileB.name} wartet im Schnellspiel.`, url: '/community?tab=matchmaking' }),
    notifyProfile(profileB.id, { type: 'match', title: 'Gegner gefunden', body: `${profileA.name} wartet im Schnellspiel.`, url: '/community?tab=matchmaking' }),
  ]);
}

function installPlatformRoutes(app, { requireProfile }) {
  app.get('/api/platform/status', wrap(async (_req, res) => {
    res.json({ enabled: storage.enabled(), features: ['friends','invites','matchmaking','tournaments','seasons','push','reports','account','admin','monitoring'], userQuizPublishing: false });
  }));

  app.get('/api/platform/me', requireProfile, (req, res) => res.json({ profile: req.soloProfile }));
  app.get('/api/platform/profiles/search', requireProfile, wrap(async (req, res) => {
    const profiles = await accountStorage.filterPublicProfiles(await storage.profileSearch(req.soloProfile.id, req.query.q));
    res.json({ profiles });
  }));
  app.get('/api/platform/friends', requireProfile, wrap(async (req, res) => res.json({ friends: await storage.listFriends(req.soloProfile.id) })));
  app.post('/api/platform/friends/request', requireProfile, wrap(async (req, res) => {
    const targetId = String(req.body?.profileId || '');
    if (!await accountStorage.canRequestFriend(targetId)) return res.status(403).json({ error: 'Dieses Profil nimmt derzeit keine Freundschaftsanfragen an.' });
    await storage.requestFriend(req.soloProfile.id, targetId);
    await notifyProfile(targetId, { type: 'friend', title: 'Neue Freundschaftsanfrage', body: `${req.soloProfile.name} möchte dich als Freund hinzufügen.`, url: '/community?tab=friends' });
    res.status(201).json({ ok: true });
  }));
  app.post('/api/platform/friends/respond', requireProfile, wrap(async (req, res) => { await storage.respondFriend(req.soloProfile.id, String(req.body?.profileId || ''), req.body?.accept === true); res.json({ ok: true }); }));
  app.delete('/api/platform/friends/:profileId', requireProfile, wrap(async (req, res) => { await storage.removeFriend(req.soloProfile.id, req.params.profileId); res.json({ ok: true }); }));

  app.get('/api/platform/blocks', requireProfile, wrap(async (req, res) => res.json({ blocks: await storage.listBlocks(req.soloProfile.id) })));
  app.post('/api/platform/blocks', requireProfile, wrap(async (req, res) => { await storage.blockProfile(req.soloProfile.id, String(req.body?.profileId || '')); res.status(201).json({ ok: true }); }));
  app.delete('/api/platform/blocks/:profileId', requireProfile, wrap(async (req, res) => { await storage.unblockProfile(req.soloProfile.id, req.params.profileId); res.json({ ok: true }); }));

  app.get('/api/platform/invites', requireProfile, wrap(async (req, res) => res.json({ invites: await storage.listInvites(req.soloProfile.id) })));
  app.post('/api/platform/invites', requireProfile, wrap(async (req, res) => {
    const recipientId = String(req.body?.recipientId || '');
    if (!await accountStorage.canInvite(req.soloProfile.id, recipientId)) return res.status(403).json({ error: 'Dieses Profil erlaubt diese Einladung nicht.' });
    const invite = await storage.createInvite({ senderId: req.soloProfile.id, recipientId, roomCode: req.body?.roomCode, type: req.body?.type, referenceCode: req.body?.referenceCode, message: req.body?.message });
    await notifyProfile(recipientId, { type: 'invite', title: 'Neue QuizTime-Einladung', body: `${req.soloProfile.name} hat dich eingeladen.`, url: '/community?tab=friends' });
    res.status(201).json({ invite });
  }));
  app.post('/api/platform/invites/:id/respond', requireProfile, wrap(async (req, res) => res.json({ invite: await storage.respondInvite(req.soloProfile.id, req.params.id, req.body?.status) })));

  app.post('/api/platform/reports', requireProfile, wrap(async (req, res) => {
    const report = await storage.createReport({ reporterId: req.soloProfile.id, targetProfileId: req.body?.targetProfileId, targetName: req.body?.targetName, roomCode: req.body?.roomCode, reason: req.body?.reason, details: req.body?.details });
    await storage.audit({ actorType: 'profile', actorId: req.soloProfile.id, action: 'report_created', target: String(report.id), details: { roomCode: report.room_code, reason: report.reason } });
    res.status(201).json({ report });
  }));

  app.get('/api/platform/seasons/current', requireProfile, wrap(async (_req, res) => {
    const result = await storage.seasonLeaderboard(100);
    result.leaderboard = await accountStorage.filterLeaderboard(result.leaderboard || []);
    res.json(result);
  }));

  app.get('/api/platform/tournaments', requireProfile, wrap(async (req, res) => res.json({ tournaments: await storage.listTournaments(req.soloProfile.id) })));
  app.post('/api/platform/tournaments', requireProfile, wrap(async (req, res) => res.status(201).json({ tournament: await storage.createTournament(req.soloProfile.id, req.body || {}) })));
  app.post('/api/platform/tournaments/join', requireProfile, wrap(async (req, res) => { await storage.joinTournament(req.soloProfile.id, req.body?.code); res.json({ ok: true }); }));
  app.get('/api/platform/tournaments/:code', requireProfile, wrap(async (req, res) => {
    const tournament = await storage.tournamentDetails(req.params.code);
    if (!tournament) return res.status(404).json({ error: 'Turnier nicht gefunden.' });
    res.json({ tournament, currentProfileId: req.soloProfile.id });
  }));
  app.patch('/api/platform/tournaments/:code', requireProfile, wrap(async (req, res) => res.json({ tournament: await storage.updateTournament(req.soloProfile.id, req.params.code, req.body || {}) })));
  app.post('/api/platform/tournaments/:code/score', requireProfile, wrap(async (req, res) => res.json({ result: await storage.recordTournamentScore(req.soloProfile.id, req.params.code, req.body?.profileId, req.body?.score, req.body?.won === true) })));

  app.use('/api/platform/packs', (_req, res) => res.status(410).json({ error: 'Eigene Quizpakete wurden deaktiviert. QuizTime verwendet ausschließlich redaktionell gepflegte Fragenkataloge.' }));

  app.post('/api/platform/matchmaking/join', requireProfile, wrap(async (req, res) => {
    const match = await storage.enqueueMatch(req.soloProfile.id, req.body?.quizType, req.body?.gameMode, process.env.RENDER_INSTANCE_ID || process.pid);
    if (match) createMatchedRoom(match).catch(async error => { await storage.setMatchFailed(match.id, error.message); await storage.recordMetric({ type: 'matchmaking_error', details: { message: error.message } }); });
    res.status(202).json({ waiting: !match, matchId: match?.id || null });
  }));
  app.delete('/api/platform/matchmaking', requireProfile, wrap(async (req, res) => { await storage.leaveMatchQueue(req.soloProfile.id); res.json({ ok: true }); }));
  app.get('/api/platform/matchmaking/status', requireProfile, wrap(async (req, res) => res.json({ match: await storage.matchStatus(req.soloProfile.id) })));

  app.get('/api/platform/notifications', requireProfile, wrap(async (req, res) => res.json({ notifications: await storage.listNotifications(req.soloProfile.id) })));
  app.post('/api/platform/notifications/read', requireProfile, wrap(async (req, res) => { await storage.markNotificationsRead(req.soloProfile.id); res.json({ ok: true }); }));
  app.get('/api/platform/push/public-key', requireProfile, wrap(async (_req, res) => { const keys = await storage.getPushKeys(); res.json({ publicKey: publicApplicationKey(keys.public_jwk) }); }));
  app.post('/api/platform/push/subscribe', requireProfile, wrap(async (req, res) => { await storage.savePushSubscription(req.soloProfile.id, req.body?.subscription); res.status(201).json({ ok: true }); }));
  app.delete('/api/platform/push/subscribe', requireProfile, wrap(async (req, res) => { await storage.removePushSubscription(req.soloProfile.id, req.body?.endpoint); res.json({ ok: true }); }));

  app.post('/api/platform/admin/login', wrap(async (req, res) => {
    if (String(req.body?.password || '') !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Falsches Admin-Passwort.' });
    res.cookie(ADMIN_COOKIE, adminToken(), { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: ADMIN_TTL_MS });
    await storage.audit({ actorType: 'admin', action: 'admin_login' });
    res.json({ ok: true });
  }));
  app.post('/api/platform/admin/logout', requirePlatformAdmin, (req, res) => { res.clearCookie(ADMIN_COOKIE, { path: '/' }); res.json({ ok: true }); });
  app.get('/api/platform/admin/summary', requirePlatformAdmin, wrap(async (_req, res) => res.json({ ...(await storage.dashboardSummary()), email: emailService.status() })));
  app.get('/api/platform/admin/metrics', requirePlatformAdmin, wrap(async (req, res) => res.json({ metrics: await adminStorage.metrics(req.query.hours) })));

  app.get('/api/platform/admin/profiles', requirePlatformAdmin, wrap(async (req, res) => res.json({ profiles: await accountStorage.adminListProfiles({ search: req.query.q, status: req.query.status, limit: req.query.limit }) })));
  app.get('/api/platform/admin/profiles/:id', requirePlatformAdmin, wrap(async (req, res) => {
    const profile = await accountStorage.adminProfileDetails(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Profil wurde nicht gefunden.' });
    res.json({ profile });
  }));
  app.patch('/api/platform/admin/profiles/:id/status', requirePlatformAdmin, wrap(async (req, res) => {
    const profile = await accountStorage.adminSetStatus(req.params.id, req.body?.status, req.body?.reason, req.body?.until);
    await storage.audit({ actorType: 'admin', action: 'profile_status_changed', target: req.params.id, details: { status: req.body?.status, reason: req.body?.reason } });
    res.json({ profile });
  }));
  app.patch('/api/platform/admin/profiles/:id/name', requirePlatformAdmin, wrap(async (req, res) => {
    const name = safeProfileName(req.body?.name);
    if (name.length < 2) return res.status(400).json({ error: 'Profilname ist zu kurz.' });
    const profile = await accountStorage.adminRenameProfile(req.params.id, name, profileNameKey(name));
    await storage.audit({ actorType: 'admin', action: 'profile_renamed', target: req.params.id, details: { name } });
    res.json({ profile });
  }));
  app.post('/api/platform/admin/profiles/:id/password-reset', requirePlatformAdmin, wrap(async (req, res) => {
    const reset = await accountStorage.createPasswordResetForProfile(req.params.id);
    const emailSent = await emailService.sendPasswordResetEmail(reset).catch(() => false);
    await storage.audit({ actorType: 'admin', action: 'password_reset_sent', target: req.params.id, details: { emailSent } });
    res.json({ ok: true, emailSent });
  }));
  app.delete('/api/platform/admin/profiles/:id', requirePlatformAdmin, wrap(async (req, res) => {
    const deleted = await accountStorage.adminDeleteProfile(req.params.id);
    await storage.audit({ actorType: 'admin', action: 'profile_deleted', target: req.params.id, details: { reason: req.body?.reason } });
    res.json({ deleted });
  }));

  app.get('/api/platform/admin/rooms', requirePlatformAdmin, wrap(async (_req, res) => res.json({ rooms: await adminStorage.listRooms() })));
  app.post('/api/platform/admin/rooms/:code/close', requirePlatformAdmin, wrap(async (req, res) => {
    await adminStorage.closeRoom(req.params.code, req.body?.reason);
    await storage.audit({ actorType: 'admin', action: 'room_closed', target: req.params.code, details: { reason: req.body?.reason } });
    res.json({ ok: true });
  }));
  app.post('/api/platform/admin/rooms/:code/kick', requirePlatformAdmin, wrap(async (req, res) => {
    const player = await adminStorage.kickRoomPlayer(req.params.code, String(req.body?.playerId || ''), req.body?.reason);
    await storage.audit({ actorType: 'admin', action: 'room_player_removed', target: req.params.code, details: player });
    res.json({ player });
  }));

  app.get('/api/platform/admin/reports', requirePlatformAdmin, wrap(async (req, res) => res.json({ reports: await storage.listReports(req.query.status === 'all' ? 'all' : safeStatus(req.query.status), 200) })));
  app.patch('/api/platform/admin/reports/:id', requirePlatformAdmin, wrap(async (req, res) => res.json({ report: await storage.resolveReport(req.params.id, req.body?.status, req.body?.note) })));

  app.get('/api/platform/admin/tournaments', requirePlatformAdmin, wrap(async (_req, res) => res.json({ tournaments: await adminStorage.listTournaments() })));
  app.patch('/api/platform/admin/tournaments/:code', requirePlatformAdmin, wrap(async (req, res) => res.json({ tournament: await adminStorage.setTournamentStatus(req.params.code, req.body?.status) })));
  app.delete('/api/platform/admin/tournaments/:code', requirePlatformAdmin, wrap(async (req, res) => { const deleted = await adminStorage.deleteTournament(req.params.code); res.json({ deleted }); }));

  app.get('/api/platform/admin/legacy-packs', requirePlatformAdmin, wrap(async (_req, res) => res.json({ packs: await adminStorage.listLegacyPacks() })));
  app.delete('/api/platform/admin/legacy-packs/:code', requirePlatformAdmin, wrap(async (req, res) => { const deleted = await adminStorage.deleteLegacyPack(req.params.code); res.json({ deleted }); }));

  app.get('/api/platform/admin/bans', requirePlatformAdmin, wrap(async (_req, res) => res.json({ bans: await adminStorage.listBans() })));
  app.post('/api/platform/admin/ban', requirePlatformAdmin, wrap(async (req, res) => { await storage.banKey(String(req.body?.keyHash || ''), req.body?.reason, req.body?.minutes); res.json({ ok: true }); }));
  app.delete('/api/platform/admin/bans/:keyHash', requirePlatformAdmin, wrap(async (req, res) => { const removed = await adminStorage.removeBan(req.params.keyHash); res.json({ removed }); }));

  app.get('/api/platform/admin/export', requirePlatformAdmin, wrap(async (_req, res) => {
    const data = await storage.exportData();
    res.set('Content-Disposition', `attachment; filename="quiztime-export-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(data);
  }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    storage.recordMetric({ type: 'unhandled_error', route: req.originalUrl, statusCode: 500, details: { message: error.message, stack: String(error.stack || '').slice(0, 4000) } });
    if (error.code === '23505') return res.status(409).json({ error: 'Dieser Wert wird bereits verwendet.' });
    res.status(500).json({ error: 'Die Anfrage konnte nicht verarbeitet werden.' });
  });
}

module.exports = {
  installPlatformRoutes,
  requirePlatformAdmin,
  _test: { validAdminToken, publicApplicationKey, vapidJwt },
};
