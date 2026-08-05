'use strict';

const path = require('path');
const storage = require('./phase12-13-storage');

function wrap(handler) {
  return async (req, res, next) => { try { await handler(req, res, next); } catch (error) { next(error); } };
}
function clientMeta(req) {
  const ua = String(req.get('user-agent') || '');
  return {
    browser: /Edg\//u.test(ua) ? 'Edge' : /Firefox\//u.test(ua) ? 'Firefox' : /Chrome\//u.test(ua) ? 'Chrome' : /Safari\//u.test(ua) ? 'Safari' : 'Andere',
    device: /iPad|Tablet/u.test(ua) ? 'Tablet' : /Mobile|Android|iPhone/u.test(ua) ? 'Smartphone' : 'Desktop',
  };
}

function installPhase1213Routes(app, { requireProfile, requireAdmin, profileForRequest }) {
  storage.ensureReady().catch(error => console.error('Phase 12/13 konnte nicht vorbereitet werden:', error.message));

  for (const [url, file] of [['/release','release.html'],['/privacy','privacy.html'],['/imprint','imprint.html'],['/terms','terms.html'],['/retention','retention.html']]) {
    app.get(url, (_req,res)=>res.sendFile(path.join(__dirname,'public',file)));
  }

  app.get('/api/platform/release-readiness', wrap(async (_req,res)=>res.json(await storage.releaseReadiness())));
  app.post('/api/platform/feedback', wrap(async (req,res)=>{
    const profile = await profileForRequest(req).catch(()=>null);
    res.status(201).json(await storage.submitFeedback(profile?.id, req.body || {}, clientMeta(req)));
  }));
  app.post('/api/platform/question-reports', wrap(async (req,res)=>{
    const profile = await profileForRequest(req).catch(()=>null);
    res.status(201).json(await storage.submitQuestionReport(profile?.id, req.body || {}));
  }));

  app.get('/api/platform/phase13/overview', requireProfile, wrap(async (req,res)=>res.json(await storage.retentionOverview(req.soloProfile.id))));
  app.patch('/api/platform/phase13/settings', requireProfile, wrap(async (req,res)=>res.json(await storage.updateRetention(req.soloProfile.id,req.body||{}))));
  app.post('/api/platform/phase13/goals/:key/claim', requireProfile, wrap(async (req,res)=>res.json(await storage.claimGoal(req.soloProfile.id,req.params.key))));

  app.get('/api/platform/privacy/requests', requireProfile, wrap(async (req,res)=>res.json({requests:await storage.myDataRequests(req.soloProfile.id)})));
  app.post('/api/platform/privacy/requests', requireProfile, wrap(async (req,res)=>res.status(201).json(await storage.requestDataAction(req.soloProfile.id,req.body?.type))));

  app.get('/api/platform/admin/phase12/reports', requireAdmin, wrap(async (req,res)=>res.json({reports:await storage.questionReports(req.query.status||'open')})));
  app.patch('/api/platform/admin/phase12/reports/:id', requireAdmin, wrap(async (req,res)=>res.json({report:await storage.updateReport(req.params.id,req.body||{})})));
  app.put('/api/platform/admin/phase12/questions/:id/revision', requireAdmin, wrap(async (req,res)=>res.json({question:await storage.reviseQuestion(req.params.id,req.body||{})})));
  app.get('/api/platform/admin/phase12/questions/:id/revisions', requireAdmin, wrap(async (req,res)=>res.json({revisions:await storage.revisions(req.params.id)})));
  app.get('/api/platform/admin/phase12/feedback', requireAdmin, wrap(async (req,res)=>res.json({feedback:await storage.feedback(req.query.status||'open')})));
  app.patch('/api/platform/admin/phase12/feedback/:id', requireAdmin, wrap(async (req,res)=>res.json({feedback:await storage.updateFeedback(req.params.id,req.body||{})})));
  app.get('/api/platform/admin/phase12/release', requireAdmin, wrap(async (_req,res)=>res.json({current:await storage.releaseReadiness(),history:await storage.releaseHistory()})));
  app.post('/api/platform/admin/phase12/release/run', requireAdmin, wrap(async (_req,res)=>res.json(await storage.saveReleaseCheck())));
}

module.exports = { installPhase1213Routes };
