'use strict';

const db = require('./platform-db');
const phase10 = require('./phase10-storage');
const profileStore = require('./extended-storage');
const { runMigrations } = require('./migration-runner');
const catalogService = require('./question-catalog-service');

let historyPatched = false;
let maintenanceStarted = false;

function safeText(value, max = 300) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function csvCell(value) {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

async function ensureFriend(profileId, friendId) {
  const { rows } = await db.query(`
    SELECT 1 FROM quiz_platform_friendships
     WHERE status='accepted'
       AND ((profile_low=$1 AND profile_high=$2) OR (profile_low=$2 AND profile_high=$1))
  `, [profileId, friendId]);
  if (!rows[0]) {
    const error = new Error('Diese Ansicht steht nur bestätigten Freunden zur Verfügung.');
    error.code = 'NOT_FRIENDS';
    throw error;
  }
}

async function friendOnlineStatus(friendId) {
  const { rows } = await db.query(`
    SELECT r.code,r.room->>'title' title,r.updated_at,
           EXISTS(
             SELECT 1 FROM jsonb_each(COALESCE(r.room->'players','{}'::jsonb)) player
              WHERE player.value->>'profileId'=$1
                AND COALESCE((player.value->>'connected')::boolean,FALSE)
           ) connected
      FROM quiz_online_rooms r
     WHERE r.expires_at>NOW()
       AND EXISTS(
         SELECT 1 FROM jsonb_each(COALESCE(r.room->'players','{}'::jsonb)) player
          WHERE player.value->>'profileId'=$1
       )
     ORDER BY r.updated_at DESC LIMIT 1
  `, [friendId]).catch(() => ({ rows: [] }));
  const room = rows[0];
  if (!room) return { online: false, roomCode: null, roomTitle: null, lastSeenAt: null };
  return { online: Boolean(room.connected), roomCode: room.code, roomTitle: room.title, lastSeenAt: room.updated_at };
}

async function friendInsights(viewerId, friendId) {
  await ensureFriend(viewerId, friendId);
  const [profileResult, preferenceResult, duelResult, sharedResult, online, stats] = await Promise.all([
    db.query(`
      SELECT p.id,p.name,p.avatar_id,p.created_at,p.last_login_at,
             COALESCE(pref.public_profile,TRUE) public_profile
        FROM quiz_solo_profiles p
        LEFT JOIN quiz_account_preferences pref ON pref.profile_id=p.id
       WHERE p.id=$1 AND p.account_status='active'
    `, [friendId]),
    db.query(`SELECT muted,notifications_enabled FROM quiz_friend_preferences WHERE profile_id=$1 AND friend_id=$2`, [viewerId, friendId]),
    db.query(`
      SELECT COUNT(*) FILTER(WHERE status='completed')::int series,
             COUNT(*) FILTER(WHERE winner_id=$1)::int friend_wins,
             COUNT(*) FILTER(WHERE winner_id=$2)::int my_wins,
             COUNT(*) FILTER(WHERE status IN ('pending','active'))::int open_series
        FROM quiz_phase10_duels
       WHERE (challenger_id=$1 AND opponent_id=$2) OR (challenger_id=$2 AND opponent_id=$1)
    `, [friendId, viewerId]),
    db.query(`
      SELECT h.id,h.source_type,h.result,h.score,h.opponent_score,h.category,h.played_at,h.metadata
        FROM quiz_phase10_match_history h
       WHERE h.profile_id=$1 AND h.opponent_profile_id=$2
       ORDER BY h.played_at DESC LIMIT 10
    `, [viewerId, friendId]),
    friendOnlineStatus(friendId),
    profileStore.getProfileStats(friendId).catch(() => null),
  ]);
  const profile = profileResult.rows[0];
  if (!profile || !profile.public_profile) throw new Error('Dieses Freundesprofil ist privat.');
  const prefs = preferenceResult.rows[0] || { muted: false, notifications_enabled: true };
  return {
    profile: {
      id: profile.id,
      name: profile.name,
      avatarId: profile.avatar_id,
      memberSince: profile.created_at,
      lastLoginAt: profile.last_login_at,
      level: Number(stats?.level || 1),
      xp: Number(stats?.xp || 0),
      games: Number(stats?.games || 0),
      accuracy: Number(stats?.accuracy || 0),
      achievements: Array.isArray(stats?.achievements) ? stats.achievements.length : 0,
    },
    online,
    preferences: { muted: Boolean(prefs.muted), notificationsEnabled: prefs.notifications_enabled !== false },
    duelStats: duelResult.rows[0] || { series: 0, friend_wins: 0, my_wins: 0, open_series: 0 },
    recentSharedMatches: sharedResult.rows,
  };
}

function patchHistory() {
  if (historyPatched) return;
  historyPatched = true;
  const original = phase10.history.bind(phase10);
  phase10.history = async (profileId, options) => {
    const rows = await original(profileId, options);
    if (!db.enabled() || !rows.length) return rows;
    const ids = rows.map(item => item.id).filter(id => /^[0-9a-f-]{36}$/iu.test(String(id)));
    if (!ids.length) return rows;
    const hidden = await db.query('SELECT history_id FROM quiz_phase10_history_hidden WHERE profile_id=$1 AND history_id=ANY($2::uuid[])', [profileId, ids]);
    const blocked = new Set(hidden.rows.map(row => row.history_id));
    return rows.filter(item => !blocked.has(item.id));
  };
}

async function historyDetails(profileId, sourceType, sourceId) {
  if (sourceType === 'solo') {
    const { rows } = await db.query(`
      SELECT session_id,question_index,quiz_type,category,mode,question_id,question_text,answer_index,correct_index,
             correct,timed_out,delta,answered_at
        FROM quiz_solo_attempts
       WHERE profile_id=$1 AND session_id=$2
       ORDER BY question_index
    `, [profileId, sourceId]);
    if (!rows.length) return null;
    return {
      sourceType: 'solo',
      sourceId,
      title: `${rows[0].category} · Solo`,
      playedAt: rows[0].answered_at,
      questions: rows,
      score: rows.reduce((sum, row) => sum + Number(row.delta || 0), 0),
      correct: rows.filter(row => row.correct).length,
    };
  }
  const { rows } = await db.query(`
    SELECT h.*,op.name opponent_name
      FROM quiz_phase10_match_history h
      LEFT JOIN quiz_solo_profiles op ON op.id=h.opponent_profile_id
     WHERE h.profile_id=$1 AND (h.id::text=$2 OR h.source_id=$2 OR h.room_code=$2)
     ORDER BY h.played_at DESC LIMIT 1
  `, [profileId, sourceId]);
  const history = rows[0];
  if (!history) return null;
  let room = null;
  const originalCode = history.metadata?.originalRoomCode;
  if (originalCode) {
    const roomResult = await db.query('SELECT room FROM quiz_online_rooms WHERE code=$1 AND expires_at>NOW()', [originalCode]).catch(() => ({ rows: [] }));
    room = roomResult.rows[0]?.room || null;
  }
  return { ...history, roomSnapshot: room };
}

async function eventPreview(data) {
  const quizType = data.quizType === 'child' ? 'child' : 'adult';
  const category = safeText(data.category || 'Gemischt', 50) || 'Gemischt';
  const questionCount = Math.max(5, Math.min(25, Number(data.questionCount) || 10));
  const source = catalogService.currentCatalog(quizType);
  const filtered = category === 'Gemischt' ? source : source.filter(question => question.category === category);
  const pool = filtered.length >= questionCount ? filtered : source;
  return {
    title: safeText(data.title || 'Eventvorschau', 120),
    quizType,
    category,
    questionCount: Math.min(questionCount, pool.length),
    availableQuestions: pool.length,
    sampleQuestions: pool.slice(0, Math.min(3, pool.length)).map(question => ({ id: question.id, category: question.category, text: question.text, options: question.options })),
  };
}

function installCompletionRoutes(app, { requireProfile, requireAdmin, requireVerified }) {
  app.get('/api/platform/friends/:id/insights', requireProfile, requireVerified, async (req, res, next) => {
    try { res.json(await friendInsights(req.soloProfile.id, req.params.id)); } catch (error) { next(error); }
  });

  app.patch('/api/platform/friends/:id/preferences', requireProfile, requireVerified, async (req, res, next) => {
    try {
      await ensureFriend(req.soloProfile.id, req.params.id);
      const muted = req.body?.muted === true;
      const notifications = req.body?.notificationsEnabled !== false;
      const { rows } = await db.query(`
        INSERT INTO quiz_friend_preferences(profile_id,friend_id,muted,notifications_enabled)
        VALUES($1,$2,$3,$4)
        ON CONFLICT(profile_id,friend_id) DO UPDATE SET muted=EXCLUDED.muted,notifications_enabled=EXCLUDED.notifications_enabled,updated_at=NOW()
        RETURNING *
      `, [req.soloProfile.id, req.params.id, muted, notifications]);
      res.json({ preferences: { muted: rows[0].muted, notificationsEnabled: rows[0].notifications_enabled } });
    } catch (error) { next(error); }
  });

  app.get('/api/platform/phase10/history/details/:sourceType/:sourceId', requireProfile, requireVerified, async (req, res, next) => {
    try {
      const details = await historyDetails(req.soloProfile.id, req.params.sourceType, req.params.sourceId);
      if (!details) return res.status(404).json({ error: 'Spiel wurde nicht gefunden.' });
      res.json({ details });
    } catch (error) { next(error); }
  });

  app.get('/api/platform/phase10/history/export', requireProfile, requireVerified, async (req, res, next) => {
    try {
      const rows = await phase10.history(req.soloProfile.id, { type: req.query.type || 'all', days: req.query.days || 3650, limit: 300 });
      if (req.query.format === 'csv') {
        const columns = ['source_type','source_id','result','score','opponent_score','correct','wrong','unanswered','quiz_type','category','played_at'];
        const csv = [columns.map(csvCell).join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n');
        res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="quiztime-historie.csv"' });
        return res.send(`\uFEFF${csv}`);
      }
      res.set('Content-Disposition', 'attachment; filename="quiztime-historie.json"');
      res.json({ exportedAt: new Date().toISOString(), profileId: req.soloProfile.id, history: rows });
    } catch (error) { next(error); }
  });

  app.delete('/api/platform/phase10/history/:id', requireProfile, requireVerified, async (req, res, next) => {
    try {
      if (!/^[0-9a-f-]{36}$/iu.test(req.params.id)) return res.status(400).json({ error: 'Dieser Verlaufseintrag kann nicht ausgeblendet werden.' });
      const found = await db.query('SELECT id FROM quiz_phase10_match_history WHERE id=$1 AND profile_id=$2', [req.params.id, req.soloProfile.id]);
      if (!found.rows[0]) return res.status(404).json({ error: 'Verlaufseintrag wurde nicht gefunden.' });
      await db.query('INSERT INTO quiz_phase10_history_hidden(profile_id,history_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.soloProfile.id, req.params.id]);
      res.json({ ok: true, note: 'Der Eintrag wurde aus deiner Ansicht ausgeblendet. Wettbewerbliche Punkte bleiben aus Gründen der Ranglistenintegrität unverändert.' });
    } catch (error) { next(error); }
  });

  app.post('/api/platform/admin/stability/events/preview', requireAdmin, async (req, res, next) => {
    try { res.json({ preview: await eventPreview(req.body || {}) }); } catch (error) { next(error); }
  });

  app.post('/api/platform/admin/stability/events/:id/duplicate', requireAdmin, async (req, res, next) => {
    try {
      const source = await db.query('SELECT * FROM quiz_phase10_events WHERE id=$1', [req.params.id]);
      const event = source.rows[0];
      if (!event) return res.status(404).json({ error: 'Event wurde nicht gefunden.' });
      const id = db.crypto.randomUUID();
      const slug = `draft-${Date.now()}-${db.randomCode(4).toLowerCase()}`;
      const { rows } = await db.query(`
        INSERT INTO quiz_phase10_events(id,slug,title,description,event_type,quiz_type,category,question_count,starts_at,ends_at,
          reward_xp,reward_season_points,badge_id,community_target,active,settings,publication_status,source_event_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,FALSE,$15::jsonb,'draft',$16)
        RETURNING *
      `, [id, slug, `${event.title} – Kopie`, event.description, event.event_type, event.quiz_type, event.category, event.question_count,
        new Date(Date.now() + 86400000), new Date(Date.now() + 8 * 86400000), event.reward_xp, event.reward_season_points,
        event.badge_id, event.community_target, JSON.stringify(event.settings || {}), event.id]);
      res.status(201).json({ event: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/platform/admin/stability/events/:id/publication', requireAdmin, async (req, res, next) => {
    try {
      const publish = req.body?.published === true;
      const { rows } = await db.query(`
        UPDATE quiz_phase10_events SET publication_status=$2,active=$2='published',updated_at=NOW()
         WHERE id=$1 RETURNING *
      `, [req.params.id, publish ? 'published' : 'draft']);
      if (!rows[0]) return res.status(404).json({ error: 'Event wurde nicht gefunden.' });
      res.json({ event: rows[0] });
    } catch (error) { next(error); }
  });
}

async function pruneOperationalData() {
  if (!db.enabled()) return {};
  await runMigrations();
  const results = {};
  for (const [key, sql] of Object.entries({
    accountVerificationTokens: "DELETE FROM quiz_account_email_verifications WHERE used_at IS NOT NULL OR expires_at<NOW()-INTERVAL '1 day'",
    passwordResetTokens: "DELETE FROM quiz_account_password_resets WHERE used_at IS NOT NULL OR expires_at<NOW()-INTERVAL '1 day'",
    expiredInvites: "DELETE FROM quiz_platform_invites WHERE expires_at<NOW()-INTERVAL '30 days'",
    oldNotifications: "DELETE FROM quiz_platform_notifications WHERE created_at<NOW()-INTERVAL '180 days'",
    oldMetrics: "DELETE FROM quiz_platform_metrics WHERE created_at<NOW()-INTERVAL '90 days'",
    expiredSoloSessions: "DELETE FROM quiz_solo_sessions WHERE expires_at<NOW()-INTERVAL '7 days'",
    expiredEventSessions: "DELETE FROM quiz_phase10_event_sessions WHERE expires_at<NOW()-INTERVAL '30 days'",
    oldRoomSnapshots: 'DELETE FROM quiz_online_rooms WHERE expires_at<=NOW()',
  })) {
    try { results[key] = (await db.query(sql)).rowCount; } catch { results[key] = null; }
  }
  return results;
}

function startMaintenance() {
  if (maintenanceStarted || !db.enabled()) return;
  maintenanceStarted = true;
  const run = () => pruneOperationalData().catch(error => console.error('QuizTime-Datenpflege fehlgeschlagen:', error.message));
  const initial = setTimeout(run, 2 * 60 * 1000);
  initial.unref?.();
  const timer = setInterval(run, 24 * 60 * 60 * 1000);
  timer.unref?.();
}

module.exports = {
  patchHistory,
  installCompletionRoutes,
  startMaintenance,
  pruneOperationalData,
  _test: { csvCell, eventPreview },
};
