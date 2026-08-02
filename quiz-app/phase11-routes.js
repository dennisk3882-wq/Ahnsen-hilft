'use strict';

const path = require('path');
const phase11 = require('./phase11-storage');
const phase10 = require('./phase10-storage');
const gameStorage = require('./platform-game-storage');
const platformStorage = require('./platform-storage');
const { patchPhase11 } = require('./phase11-patch');

patchPhase11();

function wrap(handler) {
  return async (req, res, next) => {
    try { await handler(req, res, next); } catch (error) { next(error); }
  };
}

async function guardAnswerRequest(req, res, next, profileForRequest) {
  if (req.__quiztimePhase11AnswerGuarded || req.method !== 'POST' || !phase11.answerSource(req)) return next();
  try {
    const profile = req.soloProfile || await profileForRequest(req).catch(() => null);
    if (!profile?.id) return next();
    const event = await phase11.beginAnswerEvent(req, profile.id);
    req.__quiztimePhase11AnswerGuarded = true;
    req.__quiztimePhase11AnswerEventId = event?.id || null;
    if (event?.id) res.once('finish', () => phase11.finishAnswerEvent(event.id, res.statusCode).catch(() => {}));
    return next();
  } catch (error) {
    if (error.code === 'DUPLICATE_ANSWER_EVENT') return res.status(409).json({ error: error.message, reason: 'duplicate_answer' });
    if (error.code === 'COMPETITION_BLOCKED') return res.status(403).json({ error: error.message, reason: 'competition_blocked' });
    return next(error);
  }
}

function protectExistingAnswerRoutes(app, profileForRequest) {
  const layers = app?._router?.stack || [];
  for (const layer of layers) {
    const route = layer.route;
    if (!route || route.path !== '/api/solo/answer' || !Array.isArray(route.stack) || !route.stack.length) continue;
    const firstLayer = route.stack[0];
    if (firstLayer.handle?.__quiztimePhase11Wrapped) continue;
    const original = firstLayer.handle;
    const wrapped = function phase11ProfileThenAnswerGuard(req, res, next) {
      return original(req, res, error => {
        if (error) return next(error);
        if (res.headersSent) return undefined;
        return guardAnswerRequest(req, res, next, profileForRequest);
      });
    };
    wrapped.__quiztimePhase11Wrapped = true;
    firstLayer.handle = wrapped;
  }
}

function installPhase11RequestGuard(app, profileForRequest) {
  if (app.__quiztimePhase11RequestGuardInstalled) return;
  app.__quiztimePhase11RequestGuardInstalled = true;
  protectExistingAnswerRoutes(app, profileForRequest);
  app.use((req, res, next) => guardAnswerRequest(req, res, next, profileForRequest));
}

function installPhase11Routes(app, { requireProfile, requireAdmin, profileForRequest }) {
  phase11.ensureReady().catch(error => console.error('Phase 11 konnte nicht vorbereitet werden:', error.message));
  phase11.patchLeaderboards();

  app.get('/welcome', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'welcome.html')));

  app.get('/api/platform/readiness', wrap(async (_req, res) => {
    const result = await phase11.readinessChecks();
    res.status(result.status === 'fail' ? 503 : 200).json(result);
  }));

  app.get('/api/platform/phase11/onboarding', requireProfile, wrap(async (req, res) => {
    res.json(await phase11.onboarding(req.soloProfile.id));
  }));

  app.post('/api/platform/phase11/onboarding/steps/:key', requireProfile, wrap(async (req, res) => {
    res.json(await phase11.completeOnboardingStep(req.soloProfile.id, req.params.key));
  }));

  app.post('/api/platform/phase11/onboarding/dismiss', requireProfile, wrap(async (req, res) => {
    res.json(await phase11.dismissOnboarding(req.soloProfile.id, req.body?.dismissed !== false));
  }));

  app.post('/api/platform/phase11/onboarding/reward', requireProfile, wrap(async (req, res) => {
    res.json(await phase11.claimOnboardingReward(req.soloProfile.id));
  }));

  app.get('/api/platform/phase11/notices', requireProfile, wrap(async (req, res) => {
    res.json({ notices: await phase11.playerNotices(req.soloProfile.id), sanction: await phase11.activeSanction(req.soloProfile.id) });
  }));

  app.post('/api/platform/phase11/notices/:id/acknowledge', requireProfile, wrap(async (req, res) => {
    const notice = await phase11.acknowledgeNotice(req.soloProfile.id, req.params.id);
    if (!notice) return res.status(404).json({ error: 'Hinweis wurde nicht gefunden.' });
    res.json({ notice });
  }));

  app.post('/api/platform/phase11/telemetry/page', wrap(async (req, res) => {
    const profile = await profileForRequest(req).catch(() => null);
    if (profile?.id && req.body?.page === 'arena') await phase11.completeOnboardingStep(profile.id, 'arena');
    res.status(204).end();
  }));

  app.get('/api/platform/admin/phase11/readiness', requireAdmin, wrap(async (_req, res) => {
    res.json({ current: await phase11.readinessChecks(), history: await phase11.readinessHistory() });
  }));

  app.post('/api/platform/admin/phase11/readiness/run', requireAdmin, wrap(async (req, res) => {
    res.json(await phase11.runReadinessChecks(req.body?.baseUrl));
  }));

  app.get('/api/platform/admin/phase11/analytics', requireAdmin, wrap(async (req, res) => {
    res.json(await phase11.analytics(req.query.days));
  }));

  app.post('/api/platform/admin/phase11/analytics/snapshot', requireAdmin, wrap(async (_req, res) => {
    res.json(await phase11.snapshotAnalytics());
  }));

  app.get('/api/platform/admin/phase11/risks', requireAdmin, wrap(async (req, res) => {
    res.json({ flags: await phase11.riskFlags({ status: req.query.status || 'open' }) });
  }));

  app.patch('/api/platform/admin/phase11/risks/:id', requireAdmin, wrap(async (req, res) => {
    res.json({ flag: await phase11.updateRiskFlag(req.params.id, req.body || {}, 'platform-admin') });
  }));

  app.put('/api/platform/admin/phase11/profiles/:id/sanction', requireAdmin, wrap(async (req, res) => {
    const sanction = await phase11.setSanction(req.params.id, req.body || {}, 'platform-admin');
    await platformStorage.audit({ actorType: 'admin', action: 'phase11_sanction_updated', target: req.params.id, details: req.body || {} });
    res.json({ sanction });
  }));

  app.post('/api/platform/admin/phase11/profiles/:id/notice', requireAdmin, wrap(async (req, res) => {
    const noticeId = await phase11.addPlayerNotice(req.params.id, req.body || {}, 'platform-admin');
    await platformStorage.addNotification(req.params.id, {
      type: req.body?.type || 'warning',
      title: req.body?.title || 'Hinweis von QuizTime',
      body: req.body?.body || '',
      url: '/account',
    }).catch(() => false);
    res.status(201).json({ id: noticeId });
  }));

  app.get('/api/platform/admin/phase11/events', requireAdmin, wrap(async (_req, res) => {
    res.json({ events: await phase11.adminEvents() });
  }));

  app.post('/api/platform/admin/phase11/events', requireAdmin, wrap(async (req, res) => {
    res.status(201).json({ event: await phase11.saveAdminEvent(req.body || {}) });
  }));

  app.put('/api/platform/admin/phase11/events/:id', requireAdmin, wrap(async (req, res) => {
    res.json({ event: await phase11.saveAdminEvent(req.body || {}, req.params.id) });
  }));

  app.get('/api/platform/admin/phase11/events/:id/leaderboard', requireAdmin, wrap(async (req, res) => {
    res.json({ leaderboard: await phase10.eventLeaderboard(req.params.id, 300) });
  }));

  app.put('/api/platform/admin/phase11/events/:id/leaderboard/:profileId', requireAdmin, wrap(async (req, res) => {
    const entry = await phase11.correctEventEntry(req.params.id, req.params.profileId, req.body || {});
    await platformStorage.audit({ actorType: 'admin', action: 'phase11_event_result_corrected', target: `${req.params.id}:${req.params.profileId}`, details: req.body || {} });
    res.json({ entry });
  }));

  app.post('/api/platform/admin/phase11/seasons/settle', requireAdmin, wrap(async (req, res) => {
    if (String(req.body?.confirmation || '') !== 'SAISON ABSCHLIESSEN') return res.status(400).json({ error: 'Bestätigungstext stimmt nicht.' });
    const active = await gameStorage.activeSeason();
    if (new Date(active.ends_at).getTime() > Date.now() && req.body?.force !== true) {
      return res.status(409).json({ error: 'Die Saison läuft noch. Für einen vorzeitigen Abschluss ist die ausdrückliche Force-Freigabe erforderlich.' });
    }
    const nextSeason = await phase10.settleSeason();
    await platformStorage.audit({ actorType: 'admin', action: 'phase11_season_settled', target: active.id, details: { force: req.body?.force === true } });
    res.json({ settledSeason: active, nextSeason });
  }));

  app.get('/api/platform/admin/phase11/questions', requireAdmin, wrap(async (req, res) => {
    res.json({ questions: await phase11.questionControls(req.query.q || '') });
  }));

  app.put('/api/platform/admin/phase11/questions/:id', requireAdmin, wrap(async (req, res) => {
    const result = await phase11.setQuestionControl(req.params.id, req.body || {}, 'platform-admin');
    await platformStorage.audit({ actorType: 'admin', action: 'phase11_question_control', target: req.params.id, details: req.body || {} });
    res.json(result);
  }));
}

module.exports = { installPhase11RequestGuard, installPhase11Routes, _test: { guardAnswerRequest, protectExistingAnswerRoutes } };
