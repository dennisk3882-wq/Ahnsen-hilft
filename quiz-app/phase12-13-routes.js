'use strict';

const path = require('path');
const storage = require('./phase12-13-storage');
const phase11 = require('./phase11-storage');
const platformStorage = require('./platform-storage');
const legalPages = require('./legal-pages');

function wrap(handler) {
  return async (req, res, next) => {
    try { await handler(req, res, next); } catch (error) { next(error); }
  };
}

function installPhase1213Routes(app, { requireProfile, requireAdmin, profileForRequest }) {
  storage.ensureReady().catch(error => storage.recordError('phase12-startup', error));
  storage.startSchedulers();

  app.get('/legal', (_req, res) => res.type('html').send(legalPages.legalDocument(storage.legalConfig())));
  for (const route of ['/impressum', '/datenschutz', '/nutzungsbedingungen', '/jugendschutz']) {
    app.get(route, (_req, res) => {
      const anchors = { '/impressum': 'impressum', '/datenschutz': 'datenschutz', '/nutzungsbedingungen': 'nutzung', '/jugendschutz': 'kinder' };
      res.redirect(302, `/legal#${anchors[route]}`);
    });
  }
  app.get('/progress', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'progress.html')));

  app.get('/legal/guardian', wrap(async (req, res) => {
    try {
      await storage.verifyGuardian(req.query?.token);
      res.type('html').send(legalPages.guardianResult(storage.legalConfig(), { ok: true, message: 'Die Zustimmung wurde gespeichert. Das Kinderprofil kann nun Community- und Wettbewerbsfunktionen verwenden.' }));
    } catch (error) {
      res.status(400).type('html').send(legalPages.guardianResult(storage.legalConfig(), { ok: false, message: error.message }));
    }
  }));

  app.get('/api/platform/release-readiness', wrap(async (_req, res) => {
    const result = await storage.releaseChecks();
    res.status(result.status === 'fail' ? 503 : 200).json(result);
  }));
  app.get('/api/platform/legal/config', (_req, res) => res.json(storage.legalConfig()));
  app.get('/api/platform/legal/consent', requireProfile, wrap(async (req, res) => res.json(await storage.legalConsent(req.soloProfile.id))));
  app.post('/api/platform/legal/consent', requireProfile, wrap(async (req, res) => res.json(await storage.submitLegalConsent(req.soloProfile.id, req.body || {}))));
  app.post('/api/platform/feedback', wrap(async (req, res) => {
    const profile = await profileForRequest(req).catch(() => null);
    res.status(201).json(await storage.submitFeedback(profile?.id || null, req.body || {}));
  }));
  app.post('/api/platform/questions/report', requireProfile, wrap(async (req, res) => res.status(201).json(await storage.reportQuestion(req.soloProfile.id, req.body || {}))));
  app.get('/api/platform/phase13/overview', requireProfile, wrap(async (req, res) => res.json(await storage.engagementOverview(req.soloProfile.id))));
  app.patch('/api/platform/phase13/preferences', requireProfile, wrap(async (req, res) => res.json({ preferences: await storage.updateEngagementPreferences(req.soloProfile.id, req.body || {}) })));

  app.get('/api/platform/admin/phase12/release', requireAdmin, wrap(async (_req, res) => res.json({ current: await storage.releaseChecks(), history: await storage.releaseHistory(), backups: await storage.backupChecks() })));
  app.post('/api/platform/admin/phase12/release/run', requireAdmin, wrap(async (_req, res) => res.json(await storage.releaseChecks({ persist: true }))));
  app.post('/api/platform/admin/phase12/backups/check', requireAdmin, wrap(async (req, res) => {
    const result = await storage.recordBackupCheck(req.body?.checkType || 'manual-confirmation', req.body?.status || 'warning', req.body?.details || {});
    await platformStorage.audit({ actorType: 'admin', action: 'phase12_backup_check_recorded', target: result.id, details: req.body || {} });
    res.status(201).json(result);
  }));
  app.get('/api/platform/admin/phase12/question-reports', requireAdmin, wrap(async (req, res) => res.json({ reports: await storage.questionReports(req.query.status || 'open') })));
  app.patch('/api/platform/admin/phase12/question-reports/:id', requireAdmin, wrap(async (req, res) => {
    const report = await storage.updateQuestionReport(req.params.id, req.body || {});
    if (!report) return res.status(404).json({ error: 'Fragenmeldung wurde nicht gefunden.' });
    await platformStorage.audit({ actorType: 'admin', action: 'phase12_question_report_updated', target: req.params.id, details: req.body || {} });
    res.json({ report });
  }));
  app.get('/api/platform/admin/phase12/questions/stats', requireAdmin, wrap(async (req, res) => res.json({ questions: await storage.questionStatistics(req.query.q || '') })));
  app.put('/api/platform/admin/phase12/questions/:id', requireAdmin, wrap(async (req, res) => {
    const question = await storage.editQuestion(req.params.id, req.body || {}, 'platform-admin');
    await platformStorage.audit({ actorType: 'admin', action: 'phase12_question_edited', target: req.params.id, details: { quizType: req.body?.quizType, note: req.body?.note } });
    res.json({ question });
  }));
  app.get('/api/platform/admin/phase12/questions/:id/versions', requireAdmin, wrap(async (req, res) => res.json({ versions: await storage.questionVersions(req.params.id) })));
  app.put('/api/platform/admin/phase12/questions/:id/control', requireAdmin, wrap(async (req, res) => {
    const result = await phase11.setQuestionControl(req.params.id, req.body || {}, 'platform-admin');
    await platformStorage.audit({ actorType: 'admin', action: 'phase12_question_control', target: req.params.id, details: req.body || {} });
    res.json(result);
  }));
  app.get('/api/platform/admin/phase12/feedback', requireAdmin, wrap(async (req, res) => res.json({ feedback: await storage.feedbackList(req.query.status || 'open') })));
  app.patch('/api/platform/admin/phase12/feedback/:id', requireAdmin, wrap(async (req, res) => {
    const feedback = await storage.updateFeedback(req.params.id, req.body || {});
    if (!feedback) return res.status(404).json({ error: 'Rückmeldung wurde nicht gefunden.' });
    res.json({ feedback });
  }));
  app.get('/api/platform/admin/phase12/errors', requireAdmin, wrap(async (_req, res) => res.json({ errors: await storage.errorEvents() })));
  app.post('/api/platform/admin/phase12/errors/:id/resolve', requireAdmin, wrap(async (req, res) => {
    const error = await storage.resolveError(req.params.id);
    if (!error) return res.status(404).json({ error: 'Fehlerereignis wurde nicht gefunden.' });
    res.json({ error });
  }));

  app.use((error, req, _res, next) => storage.recordError('express', error, { method: req.method, path: req.originalUrl }).finally(() => next(error)));
}

module.exports = { installPhase1213Routes };
