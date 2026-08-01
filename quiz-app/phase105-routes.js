'use strict';

const path = require('path');
const db = require('./platform-db');
const storage = require('./phase105-storage');

function wrap(handler) {
  return async (req, res, next) => {
    try { await handler(req, res, next); } catch (error) { next(error); }
  };
}

async function ensurePreferenceRow(profileId) {
  await db.query(`
    INSERT INTO quiz_account_preferences(profile_id)
    VALUES($1)
    ON CONFLICT(profile_id) DO NOTHING
  `, [profileId]);
}

function installPhase105Routes(app, { requireProfile, requireAdmin, requireVerified, profileForRequest }) {
  storage.ensureReady().catch(error => console.error('Phase 10.5 konnte nicht vorbereitet werden:', error.message));

  app.get('/competitions', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'competitions.html'));
  });

  app.get('/profile/:id', (req, res, next) => {
    if (!/^[0-9a-f-]{36}$/iu.test(String(req.params.id || ''))) return next();
    res.sendFile(path.join(__dirname, 'public', 'public-profile.html'));
  });

  app.get('/api/platform/profiles/:id/public', wrap(async (req, res) => {
    await storage.ensureReady();
    await ensurePreferenceRow(req.params.id);
    const viewer = await profileForRequest(req).catch(() => null);
    const profile = await storage.publicProfile(req.params.id, viewer?.id || null);
    if (!profile) return res.status(404).json({ error: 'Profil wurde nicht gefunden.' });
    res.json(profile);
  }));

  app.get('/api/platform/public-profile/me/settings', requireProfile, requireVerified, wrap(async (req, res) => {
    await storage.ensureReady();
    await ensurePreferenceRow(req.soloProfile.id);
    res.json({ settings: await storage.profileSettings(req.soloProfile.id) });
  }));

  app.patch('/api/platform/public-profile/me/settings', requireProfile, requireVerified, wrap(async (req, res) => {
    await storage.ensureReady();
    await ensurePreferenceRow(req.soloProfile.id);
    res.json({ settings: await storage.updateProfileSettings(req.soloProfile.id, req.body || {}) });
  }));

  app.get('/api/platform/phase105/competitions', requireProfile, requireVerified, wrap(async (req, res) => {
    await storage.ensureReady();
    res.json(await storage.competitionOverview(req.soloProfile.id));
  }));

  app.get('/api/platform/phase105/calendar', requireProfile, requireVerified, wrap(async (req, res) => {
    await storage.ensureReady();
    res.json({ calendar: await storage.competitionCalendar(req.soloProfile.id, req.query || {}) });
  }));

  app.get('/api/platform/phase105/seasons', wrap(async (req, res) => {
    await storage.ensureReady();
    res.json({ seasons: await storage.seasonArchive(req.query.limit) });
  }));

  app.get('/api/platform/phase105/seasons/:id', wrap(async (req, res) => {
    await storage.ensureReady();
    const season = await storage.seasonDetails(req.params.id);
    if (!season) return res.status(404).json({ error: 'Saison wurde nicht gefunden.' });
    res.json(season);
  }));

  app.get('/api/platform/phase105/tournament-champions', wrap(async (req, res) => {
    await storage.ensureReady();
    res.json({ champions: await storage.tournamentChampions(req.query.limit) });
  }));

  app.post('/api/platform/admin/phase105/events/ensure', requireAdmin, wrap(async (_req, res) => {
    await storage.ensureReady();
    await storage.ensureCompetitionEvents();
    res.json({ ok: true, calendar: await storage.competitionCalendar(null) });
  }));
}

module.exports = { installPhase105Routes };
