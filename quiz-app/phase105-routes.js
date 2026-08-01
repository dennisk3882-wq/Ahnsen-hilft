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

async function tournamentChampions(limit = 12) {
  const { rows } = await db.query(`
    SELECT t.id,t.code,t.name AS tournament_name,t.description,t.format,m.completed_at,
           p.id AS profile_id,p.name AS champion_name,p.avatar_id
      FROM quiz_phase10_tournament_matches m
      JOIN quiz_platform_tournaments t ON t.id=m.tournament_id
      JOIN quiz_solo_profiles p ON p.id=m.winner_id
     WHERE m.next_match_id IS NULL AND m.status='completed'
     ORDER BY m.completed_at DESC LIMIT $1
  `, [Math.max(1, Math.min(50, Number(limit) || 12))]);
  return rows.map(row => ({
    ...row,
    name: row.champion_name,
    description: row.tournament_name,
  }));
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

  const publicProfileHandler = wrap(async (req, res) => {
    await storage.ensureReady();
    await ensurePreferenceRow(req.params.id);
    const viewer = await profileForRequest(req).catch(() => null);
    const profile = await storage.publicProfile(req.params.id, viewer?.id || null);
    if (!profile) return res.status(404).json({ error: 'Profil wurde nicht gefunden.' });
    res.json(profile);
  });
  app.get('/api/platform/profiles/:id/public', publicProfileHandler);
  app.get('/api/platform/public/profiles/:id', publicProfileHandler);

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
    const overview = await storage.competitionOverview(req.soloProfile.id);
    overview.tournamentChampions = await tournamentChampions(12);
    res.json(overview);
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
    res.json({ champions: await tournamentChampions(req.query.limit) });
  }));

  app.post('/api/platform/admin/phase105/events/ensure', requireAdmin, wrap(async (_req, res) => {
    await storage.ensureReady();
    await storage.ensureCompetitionEvents();
    res.json({ ok: true, calendar: await storage.competitionCalendar(null) });
  }));
}

module.exports = { installPhase105Routes };
