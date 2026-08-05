'use strict';

const profileAuth = require('./solo-profile-auth');
const phase11Routes = require('./phase11-routes');
const storage = require('./phase12-13-storage');
const { installPhase1213Routes } = require('./phase12-13-routes');

function activityFor(req, payload) {
  const route = String(req.path || req.originalUrl || '');
  if (req.method !== 'POST') return null;
  if (route === '/api/solo/answer') return { activityType: 'solo-answer', answers: 1, correct: payload?.result?.correct ? 1 : 0, score: Number(payload?.result?.delta || 0) };
  if (route === '/api/solo/next' && payload?.finished) return { activityType: 'solo-game', games: 1, score: Number(payload?.summary?.score || 0) };
  if (/\/api\/platform\/phase10\/event-sessions\/[^/]+\/answer$/u.test(route)) return { activityType: 'event-answer', answers: 1, correct: payload?.result?.correct ? 1 : 0, score: payload?.result?.correct ? 10 : 0 };
  if (/\/api\/platform\/phase10\/event-sessions\/[^/]+\/next$/u.test(route) && payload?.completed) return { activityType: 'event-game', games: 1, score: Number(payload?.score || 0) };
  if (/\/api\/online\/rooms\/[^/]+\/answer$/u.test(route)) {
    const result = payload?.state?.player?.lastResult || payload?.result || {};
    return { activityType: 'online-answer', answers: 1, correct: result.correct ? 1 : 0, score: Number(result.delta || 0) };
  }
  if (/\/api\/online\/rooms\/[^/]+\/(next|finish)$/u.test(route) && (payload?.state?.room?.phase === 'finished' || payload?.finished)) return { activityType: 'online-game', games: 1, score: Number(payload?.state?.player?.score || 0) };
  if (/\/api\/platform\/(duels|tournaments|phase10\/tournaments)/u.test(route) && (payload?.completed || payload?.match?.status === 'completed')) return { activityType: 'competition-game', games: 1, score: Number(payload?.score || 0) };
  return null;
}

function installActivityCapture(app, profileForRequest) {
  app.use(async (req, res, next) => {
    const route = String(req.path || req.originalUrl || '');
    if (req.method !== 'POST' || !/(\/api\/solo|\/api\/online|\/api\/platform)/u.test(route)) return next();
    const profile = await profileForRequest(req).catch(() => null); if (!profile?.id) return next();
    let payload = null; const originalJson = res.json.bind(res); res.json = value => { payload = value; return originalJson(value); };
    res.once('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      const activity = activityFor(req, payload); if (activity) storage.recordActivity(profile.id, activity).catch(error => storage.recordError('phase13-capture', error, { route }));
    });
    next();
  });
}

function installLegalGuard(app, profileForRequest) {
  app.use(async (req, res, next) => {
    const route = String(req.path || req.originalUrl || '');
    const protectedArea = route.startsWith('/api/platform/') || route.startsWith('/api/online/');
    const allowed = route.startsWith('/api/platform/legal/') || route === '/api/platform/release-readiness' || route === '/api/platform/feedback'
      || route.startsWith('/api/platform/admin/') || route.startsWith('/api/platform/stability/') || route.startsWith('/api/platform/readiness');
    if (!protectedArea || allowed) return next();
    const profile = await profileForRequest(req).catch(() => null); if (!profile?.id) return next();
    try {
      const consent = await storage.legalConsent(profile.id); if (consent.valid) return next();
      return res.status(428).json({ error: consent.guardianRequired && !consent.guardianVerified ? 'Die Zustimmung der erziehungsberechtigten Person wurde noch nicht bestätigt.' : 'Bitte bestätige zuerst die aktuellen Datenschutz- und Nutzungsbedingungen.', reason: 'legal_consent_required', consent });
    } catch (error) {
      storage.recordError('legal-guard', error, { route, profileId: profile.id }).catch(() => {});
      return res.status(503).json({ error: 'Die rechtlichen Kontoeinstellungen konnten nicht geprüft werden.' });
    }
  });
}

if (!profileAuth.__quiztimePhase1213Wrapped) {
  const original = profileAuth.installProfileRoutes;
  profileAuth.installProfileRoutes = function installProfileRoutesWithPhase1213(app) {
    installActivityCapture(app, profileAuth.profileForRequest); installLegalGuard(app, profileAuth.profileForRequest); return original(app);
  };
  profileAuth.__quiztimePhase1213Wrapped = true;
}
if (!phase11Routes.__quiztimePhase1213Wrapped) {
  const original = phase11Routes.installPhase11Routes;
  phase11Routes.installPhase11Routes = function installPhase11RoutesWithPhase1213(app, dependencies) { original(app, dependencies); installPhase1213Routes(app, dependencies); };
  phase11Routes.__quiztimePhase1213Wrapped = true;
}
if (!global.__quiztimePhase1213ProcessHandlers) {
  process.on('unhandledRejection', error => storage.recordError('unhandled-rejection', error).catch(() => {}));
  process.on('uncaughtExceptionMonitor', error => storage.recordError('uncaught-exception', error).catch(() => {}));
  global.__quiztimePhase1213ProcessHandlers = true;
}

module.exports = { activityFor, installActivityCapture, installLegalGuard };
