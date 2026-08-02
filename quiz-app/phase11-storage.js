'use strict';

const crypto = require('crypto');
const db = require('./platform-db');
const accountStorage = require('./account-storage');
const phase10 = require('./phase10-storage');
const gameStorage = require('./platform-game-storage');
const questionCatalog = require('./question-catalog-service');
const emailService = require('./email-service');
const { runMigrations } = require('./migration-runner');

const ONBOARDING_STEPS = Object.freeze([
  { key: 'profile', title: 'Profil angelegt', text: 'Dein QuizTime-Profil ist einsatzbereit.', href: '/account' },
  { key: 'email', title: 'E-Mail bestätigt', text: 'Schütze dein Konto und schalte Community und Arena frei.', href: '/account' },
  { key: 'first-quiz', title: 'Erstes Quiz beendet', text: 'Spiele eine Solo-, Online- oder Eventrunde.', href: '/solo' },
  { key: 'arena', title: 'Arena entdeckt', text: 'Lerne Missionen, Ligen und Duelle kennen.', href: '/arena' },
  { key: 'friend', title: 'Ersten Freund hinzugefügt', text: 'Vernetze dich mit einem anderen QuizTime-Spieler.', href: '/community' },
  { key: 'competition', title: 'Wettbewerb gespielt', text: 'Nimm an einem offiziellen Event oder Turnier teil.', href: '/competitions' },
  { key: 'profile-style', title: 'Profil gestaltet', text: 'Lege Sichtbarkeit, Beschreibung oder Abzeichen fest.', href: '/account' },
]);

let readyPromise = null;
let patched = false;

function safeText(value, max = 300) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, max);
}

function hash(value) {
  const secret = String(process.env.PLATFORM_SECURITY_SECRET || process.env.PROFILE_SESSION_SECRET || 'quiztime-phase11');
  return crypto.createHmac('sha256', secret).update(String(value || '')).digest('base64url');
}

function browserFamily(value) {
  const ua = String(value || '');
  if (/Edg\//u.test(ua)) return 'Edge';
  if (/Firefox\//u.test(ua)) return 'Firefox';
  if (/Chrome\//u.test(ua) && !/Edg\//u.test(ua)) return 'Chrome';
  if (/Safari\//u.test(ua) && !/Chrome\//u.test(ua)) return 'Safari';
  return ua ? 'Andere' : 'Unbekannt';
}

function deviceFamily(value) {
  const ua = String(value || '');
  if (/iPad|Tablet/u.test(ua)) return 'Tablet';
  if (/Mobile|Android|iPhone/u.test(ua)) return 'Smartphone';
  return ua ? 'Desktop' : 'Unbekannt';
}

async function ensureReady() {
  if (!db.enabled()) return false;
  if (!readyPromise) {
    readyPromise = (async () => {
      await accountStorage.ensureReady();
      await phase10.ensureReady();
      await runMigrations();
      await db.query(`
        INSERT INTO quiz_phase11_onboarding(profile_id)
        SELECT id FROM quiz_solo_profiles
        ON CONFLICT(profile_id) DO NOTHING
      `);
      return true;
    })().catch(error => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

async function q(text, params = []) {
  await ensureReady();
  return db.query(text, params);
}

async function tableExists(name) {
  const { rows } = await db.query('SELECT to_regclass($1) AS name', [`public.${name}`]);
  return Boolean(rows[0]?.name);
}

async function inferredOnboarding(profileId) {
  const [profile, quiz, friendship, competition, styled] = await Promise.all([
    q('SELECT email_verified_at FROM quiz_solo_profiles WHERE id=$1', [profileId]),
    q(`SELECT EXISTS(
      SELECT 1 FROM quiz_solo_attempts WHERE profile_id=$1
      UNION ALL
      SELECT 1 FROM quiz_phase10_match_history WHERE profile_id=$1
    ) AS done`, [profileId]).catch(() => ({ rows: [{ done: false }] })),
    q(`SELECT EXISTS(SELECT 1 FROM quiz_platform_friendships WHERE status='accepted' AND (profile_low=$1 OR profile_high=$1)) AS done`, [profileId]).catch(() => ({ rows: [{ done: false }] })),
    q(`SELECT EXISTS(
      SELECT 1 FROM quiz_phase10_event_entries WHERE profile_id=$1 AND completed_at IS NOT NULL
      UNION ALL
      SELECT 1 FROM quiz_phase10_tournament_matches WHERE winner_id=$1 OR profile_a=$1 OR profile_b=$1
    ) AS done`, [profileId]).catch(() => ({ rows: [{ done: false }] })),
    q(`SELECT EXISTS(
      SELECT 1 FROM quiz_phase105_profile_settings s
      JOIN quiz_account_preferences p ON p.profile_id=s.profile_id
      WHERE s.profile_id=$1 AND (s.bio<>'' OR jsonb_array_length(s.featured_badges)>0 OR p.profile_visibility<>'public')
    ) AS done`, [profileId]).catch(() => ({ rows: [{ done: false }] })),
  ]);
  return new Set([
    'profile',
    ...(profile.rows[0]?.email_verified_at ? ['email'] : []),
    ...(quiz.rows[0]?.done ? ['first-quiz'] : []),
    ...(friendship.rows[0]?.done ? ['friend'] : []),
    ...(competition.rows[0]?.done ? ['competition'] : []),
    ...(styled.rows[0]?.done ? ['profile-style'] : []),
  ]);
}

async function onboarding(profileId) {
  await q('INSERT INTO quiz_phase11_onboarding(profile_id) VALUES($1) ON CONFLICT(profile_id) DO NOTHING', [profileId]);
  const { rows } = await q('SELECT * FROM quiz_phase11_onboarding WHERE profile_id=$1', [profileId]);
  const stored = rows[0] || { completed_steps: [] };
  const completed = await inferredOnboarding(profileId);
  for (const key of Array.isArray(stored.completed_steps) ? stored.completed_steps : []) completed.add(key);
  const steps = ONBOARDING_STEPS.map(step => ({ ...step, completed: completed.has(step.key) }));
  const completedCount = steps.filter(step => step.completed).length;
  const complete = completedCount === steps.length;
  if (complete && !stored.completed_at) {
    await q('UPDATE quiz_phase11_onboarding SET completed_at=NOW(),updated_at=NOW() WHERE profile_id=$1', [profileId]);
  }
  return {
    steps,
    completedCount,
    total: steps.length,
    progress: Math.round(completedCount / steps.length * 100),
    complete,
    rewardClaimed: Boolean(stored.reward_claimed),
    dismissed: Boolean(stored.dismissed_at),
    reward: { xp: 500, seasonPoints: 100, badgeId: 'quiztime-ready' },
  };
}

async function completeOnboardingStep(profileId, key) {
  if (!ONBOARDING_STEPS.some(step => step.key === key)) throw new Error('Unbekannter Einführungsschritt.');
  await q(`
    INSERT INTO quiz_phase11_onboarding(profile_id,completed_steps)
    VALUES($1,jsonb_build_array($2::text))
    ON CONFLICT(profile_id) DO UPDATE SET
      completed_steps=(SELECT jsonb_agg(DISTINCT value) FROM jsonb_array_elements_text(quiz_phase11_onboarding.completed_steps || EXCLUDED.completed_steps) value),
      updated_at=NOW()
  `, [profileId, key]);
  return onboarding(profileId);
}

async function dismissOnboarding(profileId, dismissed) {
  await q(`
    INSERT INTO quiz_phase11_onboarding(profile_id,dismissed_at)
    VALUES($1,CASE WHEN $2 THEN NOW() ELSE NULL END)
    ON CONFLICT(profile_id) DO UPDATE SET dismissed_at=CASE WHEN $2 THEN NOW() ELSE NULL END,updated_at=NOW()
  `, [profileId, Boolean(dismissed)]);
  return onboarding(profileId);
}

async function claimOnboardingReward(profileId) {
  const state = await onboarding(profileId);
  if (!state.complete) throw new Error('Schließe zuerst alle Einführungsschritte ab.');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const claim = await client.query(`
      UPDATE quiz_phase11_onboarding SET reward_claimed=TRUE,updated_at=NOW()
      WHERE profile_id=$1 AND reward_claimed=FALSE RETURNING profile_id
    `, [profileId]);
    if (!claim.rowCount) throw new Error('Die Einführungsbelohnung wurde bereits abgeholt.');
    const season = await client.query(`SELECT id FROM quiz_platform_seasons WHERE active AND starts_at<=NOW() AND ends_at>NOW() ORDER BY starts_at DESC LIMIT 1`);
    await client.query(`
      INSERT INTO quiz_phase10_reward_ledger(reward_key,profile_id,reward_type,xp,season_points,badge_id,reason)
      VALUES('phase11-onboarding',$1,'onboarding',500,100,'quiztime-ready','QuizTime-Einführung abgeschlossen')
      ON CONFLICT DO NOTHING
    `, [profileId]);
    await client.query(`
      INSERT INTO quiz_phase10_rewards(profile_id,bonus_xp,badges)
      VALUES($1,500,'["quiztime-ready"]'::jsonb)
      ON CONFLICT(profile_id) DO UPDATE SET
        bonus_xp=quiz_phase10_rewards.bonus_xp+500,
        badges=(SELECT jsonb_agg(DISTINCT value) FROM jsonb_array_elements_text(quiz_phase10_rewards.badges || '["quiztime-ready"]'::jsonb) value),
        updated_at=NOW()
    `, [profileId]);
    if (season.rows[0]) {
      await client.query(`
        INSERT INTO quiz_phase10_season_points(season_id,profile_id,points)
        VALUES($1,$2,100)
        ON CONFLICT(season_id,profile_id) DO UPDATE SET points=quiz_phase10_season_points.points+100,updated_at=NOW()
      `, [season.rows[0].id, profileId]);
    }
    await client.query('COMMIT');
    return onboarding(profileId);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function answerSource(req) {
  const path = String(req.path || req.originalUrl || '');
  if (path === '/api/solo/answer') return { type: 'solo', id: safeText(req.body?.sessionId, 100), question: safeText(req.body?.questionId || req.body?.questionKey || 'current', 160) };
  const event = path.match(/\/api\/platform\/phase10\/event-sessions\/([^/]+)\/answer$/u);
  if (event) return { type: 'event', id: safeText(event[1], 100), question: safeText(req.body?.questionId || req.body?.questionKey || 'current', 160) };
  const online = path.match(/\/api\/online\/rooms\/([^/]+)\/answer$/u);
  if (online) return { type: 'online', id: safeText(online[1], 100), question: safeText(req.body?.questionId || req.body?.questionIndex || 'current', 160) };
  return null;
}

async function activeSanction(profileId) {
  const { rows } = await q(`
    SELECT * FROM quiz_phase11_player_sanctions
    WHERE profile_id=$1 AND (expires_at IS NULL OR expires_at>NOW())
  `, [profileId]);
  return rows[0] || null;
}

async function createRiskFlag({ profileId, type, score, source, reasons, details = {} }) {
  const severity = score >= 90 ? 'critical' : score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  const existing = await q(`
    SELECT id FROM quiz_phase11_risk_flags
    WHERE profile_id=$1 AND flag_type=$2 AND source_type=$3 AND source_id=$4
      AND status IN ('open','reviewing') AND last_seen_at>NOW()-INTERVAL '10 minutes'
    ORDER BY last_seen_at DESC LIMIT 1
  `, [profileId, type, source.type, source.id]);
  if (existing.rows[0]) {
    await q(`UPDATE quiz_phase11_risk_flags SET score=GREATEST(score,$2),severity=$3,last_seen_at=NOW(),details=$4::jsonb WHERE id=$1`,
      [existing.rows[0].id, score, severity, JSON.stringify({ ...details, reasons })]);
    return existing.rows[0].id;
  }
  const id = crypto.randomUUID();
  await q(`
    INSERT INTO quiz_phase11_risk_flags(id,profile_id,severity,flag_type,score,source_type,source_id,details)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
  `, [id, profileId, severity, type, score, source.type, source.id, JSON.stringify({ ...details, reasons })]);
  return id;
}

async function beginAnswerEvent(req, profileId) {
  const source = answerSource(req);
  if (!source || !profileId) return null;
  const sanction = await activeSanction(profileId);
  if (sanction?.competition_blocked && ['event', 'online'].includes(source.type)) {
    const error = new Error(`Wettbewerbsteilnahme gesperrt${sanction.reason ? `: ${sanction.reason}` : '.'}`);
    error.code = 'COMPETITION_BLOCKED';
    throw error;
  }

  const clientEventId = safeText(req.body?.clientEventId, 120) || null;
  if (clientEventId) {
    const duplicate = await q('SELECT id FROM quiz_phase11_answer_events WHERE client_event_id=$1', [clientEventId]);
    if (duplicate.rowCount) {
      const error = new Error('Diese Antwort wurde bereits übermittelt.');
      error.code = 'DUPLICATE_ANSWER_EVENT';
      throw error;
    }
  }

  const responseMs = Number.isFinite(Number(req.body?.responseMs)) ? Math.max(0, Math.min(3600000, Math.round(Number(req.body.responseMs)))) : null;
  const recent = await q(`
    SELECT source_type,source_id,created_at FROM quiz_phase11_answer_events
    WHERE profile_id=$1 AND created_at>NOW()-INTERVAL '1 minute'
    ORDER BY created_at DESC LIMIT 30
  `, [profileId]);
  let score = 0;
  const reasons = [];
  if (responseMs !== null && responseMs < 250) { score += 45; reasons.push('Antwort unter 250 ms'); }
  else if (responseMs !== null && responseMs < 500) { score += 20; reasons.push('Antwort unter 500 ms'); }
  if (recent.rows.length >= 12) { score += 25; reasons.push('Mehr als zwölf Antworten pro Minute'); }
  const last = recent.rows[0];
  if (last && (last.source_type !== source.type || last.source_id !== source.id) && Date.now() - new Date(last.created_at).getTime() < 1500) {
    score += 45;
    reasons.push('Parallele Antworten in unterschiedlichen Spielen');
  }

  const userAgent = String(req.get?.('user-agent') || '');
  const id = crypto.randomUUID();
  await q(`
    INSERT INTO quiz_phase11_answer_events
      (id,client_event_id,profile_id,source_type,source_id,question_key,answer_index,response_ms,risk_score,risk_reasons,ip_hash,user_agent_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
  `, [id, clientEventId, profileId, source.type, source.id, source.question,
    Number.isInteger(Number(req.body?.answerIndex)) ? Number(req.body.answerIndex) : null,
    responseMs, score, JSON.stringify(reasons), hash(req.ip), hash(userAgent)]);

  if (score >= 40) {
    await createRiskFlag({
      profileId,
      type: reasons.includes('Parallele Antworten in unterschiedlichen Spielen') ? 'parallel-play' : 'answer-speed',
      score,
      source,
      reasons,
      details: { responseMs, browser: browserFamily(userAgent), device: deviceFamily(userAgent) },
    });
  }
  return { id, source, score };
}

async function finishAnswerEvent(eventId, statusCode) {
  if (!eventId) return false;
  await q(`
    UPDATE quiz_phase11_answer_events SET accepted=$2,status_code=$3,finished_at=NOW()
    WHERE id=$1
  `, [eventId, Number(statusCode) >= 200 && Number(statusCode) < 400, Number(statusCode) || null]);
  return true;
}

async function riskFlags(filters = {}) {
  const status = ['open', 'reviewing', 'resolved', 'dismissed'].includes(filters.status) ? filters.status : 'open';
  const { rows } = await q(`
    SELECT f.*,p.name,p.email,s.ranking_blocked,s.competition_blocked,s.expires_at sanction_expires_at
    FROM quiz_phase11_risk_flags f
    LEFT JOIN quiz_solo_profiles p ON p.id=f.profile_id
    LEFT JOIN quiz_phase11_player_sanctions s ON s.profile_id=f.profile_id
    WHERE ($1='all' OR f.status=$1)
    ORDER BY CASE f.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,f.last_seen_at DESC
    LIMIT 300
  `, [filters.status === 'all' ? 'all' : status]);
  return rows;
}

async function updateRiskFlag(id, data, actor = 'admin') {
  const status = ['open', 'reviewing', 'resolved', 'dismissed'].includes(data.status) ? data.status : 'reviewing';
  const { rows } = await q(`
    UPDATE quiz_phase11_risk_flags SET status=$2,review_note=$3,reviewed_by=$4,
      reviewed_at=CASE WHEN $2 IN ('resolved','dismissed') THEN NOW() ELSE reviewed_at END,last_seen_at=NOW()
    WHERE id=$1 RETURNING *
  `, [id, status, safeText(data.note, 800) || null, safeText(actor, 80)]);
  if (!rows[0]) throw new Error('Risikohinweis wurde nicht gefunden.');
  return rows[0];
}

async function setSanction(profileId, data, actor = 'admin') {
  const hours = Number(data.hours);
  const expiresAt = Number.isFinite(hours) && hours > 0 ? new Date(Date.now() + Math.min(hours, 24 * 365) * 3600000) : null;
  const { rows } = await q(`
    INSERT INTO quiz_phase11_player_sanctions(profile_id,ranking_blocked,competition_blocked,reason,expires_at,updated_by)
    VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(profile_id) DO UPDATE SET ranking_blocked=EXCLUDED.ranking_blocked,
      competition_blocked=EXCLUDED.competition_blocked,reason=EXCLUDED.reason,expires_at=EXCLUDED.expires_at,
      updated_at=NOW(),updated_by=EXCLUDED.updated_by
    RETURNING *
  `, [profileId, Boolean(data.rankingBlocked), Boolean(data.competitionBlocked), safeText(data.reason, 500) || null, expiresAt, safeText(actor, 80)]);
  return rows[0];
}

async function addPlayerNotice(profileId, data, actor = 'admin') {
  const id = crypto.randomUUID();
  const type = ['info', 'warning', 'sanction'].includes(data.type) ? data.type : 'warning';
  const title = safeText(data.title, 120);
  const body = safeText(data.body, 600);
  if (!title || !body) throw new Error('Titel und Nachricht sind erforderlich.');
  await q(`INSERT INTO quiz_phase11_player_notices(id,profile_id,notice_type,title,body,created_by) VALUES($1,$2,$3,$4,$5,$6)`,
    [id, profileId, type, title, body, safeText(actor, 80)]);
  return id;
}

async function playerNotices(profileId) {
  const { rows } = await q('SELECT * FROM quiz_phase11_player_notices WHERE profile_id=$1 ORDER BY created_at DESC LIMIT 100', [profileId]);
  return rows;
}

async function acknowledgeNotice(profileId, id) {
  const { rows } = await q('UPDATE quiz_phase11_player_notices SET acknowledged_at=COALESCE(acknowledged_at,NOW()) WHERE id=$1 AND profile_id=$2 RETURNING *', [id, profileId]);
  return rows[0] || null;
}

async function blockedRankingProfiles() {
  const { rows } = await q(`SELECT profile_id FROM quiz_phase11_player_sanctions WHERE ranking_blocked AND (expires_at IS NULL OR expires_at>NOW())`);
  return new Set(rows.map(row => row.profile_id));
}

function filterLeaderboardRows(rows, blocked) {
  return (Array.isArray(rows) ? rows : []).filter(row => !blocked.has(row.id || row.profile_id)).map((row, index) => ({ ...row, rank: index + 1 }));
}

function patchLeaderboards() {
  if (patched) return;
  patched = true;
  const originalEventLeaderboard = phase10.eventLeaderboard;
  phase10.eventLeaderboard = async (...args) => filterLeaderboardRows(await originalEventLeaderboard(...args), await blockedRankingProfiles());
  const originalLeagueBoard = phase10.leagueBoard;
  phase10.leagueBoard = async (...args) => {
    const result = await originalLeagueBoard(...args);
    const blocked = await blockedRankingProfiles();
    result.leaderboard = filterLeaderboardRows(result.leaderboard, blocked);
    for (const key of Object.keys(result.leagues || {})) result.leagues[key] = filterLeaderboardRows(result.leagues[key], blocked);
    result.me = result.me && blocked.has(result.me.id) ? null : result.me;
    return result;
  };
}

async function disabledQuestionIds() {
  if (!db.enabled()) return new Set();
  await ensureReady();
  const { rows } = await db.query('SELECT question_id FROM quiz_phase11_question_controls WHERE disabled');
  return new Set(rows.map(row => row.question_id));
}

async function questionControls(query = '') {
  const search = safeText(query, 120).toLocaleLowerCase('de-DE');
  const disabled = await q('SELECT * FROM quiz_phase11_question_controls ORDER BY updated_at DESC');
  const controls = new Map(disabled.rows.map(row => [row.question_id, row]));
  const result = [];
  for (const type of ['adult', 'child']) {
    for (const question of questionCatalog.currentCatalog(type)) {
      if (search && !`${question.id} ${question.text} ${question.category}`.toLocaleLowerCase('de-DE').includes(search)) continue;
      const control = controls.get(question.id);
      result.push({ id: question.id, type, category: question.category, text: question.text, disabled: Boolean(control?.disabled), reason: control?.reason || null });
      if (result.length >= 300) return result;
    }
  }
  return result;
}

async function setQuestionControl(questionId, data, actor = 'admin') {
  const id = safeText(questionId, 180);
  if (!id) throw new Error('Fragen-ID fehlt.');
  await q(`
    INSERT INTO quiz_phase11_question_controls(question_id,disabled,reason,updated_by)
    VALUES($1,$2,$3,$4)
    ON CONFLICT(question_id) DO UPDATE SET disabled=EXCLUDED.disabled,reason=EXCLUDED.reason,updated_at=NOW(),updated_by=EXCLUDED.updated_by
  `, [id, Boolean(data.disabled), safeText(data.reason, 500) || null, safeText(actor, 80)]);
  await questionCatalog.reloadFromDatabase();
  return { questionId: id, disabled: Boolean(data.disabled) };
}

async function adminEvents() {
  const { rows } = await q(`
    SELECT e.*,
      COALESCE((e.settings->>'maxAttempts')::int,5) max_attempts,
      COALESCE(e.settings->>'publicationStatus',CASE WHEN e.active THEN 'published' ELSE 'paused' END) publication_status,
      (SELECT COUNT(*)::int FROM quiz_phase10_event_entries x WHERE x.event_id=e.id) participants
    FROM quiz_phase10_events e ORDER BY e.starts_at DESC LIMIT 300
  `);
  return rows;
}

async function saveAdminEvent(data, id = null) {
  const type = data.quizType === 'child' ? 'child' : 'adult';
  const categories = new Set(['Gemischt', ...questionCatalog.currentCatalog(type).map(question => question.category)]);
  const category = safeText(data.category || 'Gemischt', 80);
  if (!categories.has(category)) throw new Error('Diese Kategorie existiert im ausgewählten Fragenkatalog nicht.');
  const title = safeText(data.title, 120);
  const description = safeText(data.description, 800);
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (!title || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error('Eventdaten sind unvollständig.');
  const status = ['draft', 'published', 'paused', 'cancelled'].includes(data.status) ? data.status : 'draft';
  const settings = {
    maxAttempts: Math.max(1, Math.min(100, Number(data.maxAttempts) || 5)),
    featured: Boolean(data.featured),
    publicationStatus: status,
  };
  const values = [title, description || null, ['weekly', 'monthly', 'special'].includes(data.eventType) ? data.eventType : 'special', type, category,
    Math.max(5, Math.min(50, Number(data.questionCount) || 10)), startsAt, endsAt,
    Math.max(0, Math.min(10000, Number(data.rewardXp) || 250)), Math.max(0, Math.min(5000, Number(data.rewardSeasonPoints) || 100)),
    safeText(data.badgeId, 100) || null, Math.max(0, Number(data.communityTarget) || 0), status === 'published', JSON.stringify(settings)];
  if (id) {
    const { rows } = await q(`
      UPDATE quiz_phase10_events SET title=$2,description=$3,event_type=$4,quiz_type=$5,category=$6,question_count=$7,
        starts_at=$8,ends_at=$9,reward_xp=$10,reward_season_points=$11,badge_id=$12,community_target=$13,
        active=$14,settings=COALESCE(settings,'{}'::jsonb)||$15::jsonb,updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [id, ...values]);
    if (!rows[0]) throw new Error('Event wurde nicht gefunden.');
    return rows[0];
  }
  const eventId = crypto.randomUUID();
  const slug = `phase11-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const { rows } = await q(`
    INSERT INTO quiz_phase10_events(id,slug,title,description,event_type,quiz_type,category,question_count,starts_at,ends_at,
      reward_xp,reward_season_points,badge_id,community_target,active,settings)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb) RETURNING *
  `, [eventId, slug, ...values]);
  return rows[0];
}

async function correctEventEntry(eventId, profileId, data) {
  if (data.remove === true) {
    await q('DELETE FROM quiz_phase10_event_entries WHERE event_id=$1 AND profile_id=$2', [eventId, profileId]);
    return null;
  }
  const { rows } = await q(`
    INSERT INTO quiz_phase10_event_entries(event_id,profile_id,best_score,best_correct,attempts,completed_at)
    VALUES($1,$2,$3,$4,$5,NOW())
    ON CONFLICT(event_id,profile_id) DO UPDATE SET best_score=EXCLUDED.best_score,best_correct=EXCLUDED.best_correct,
      attempts=EXCLUDED.attempts,completed_at=NOW()
    RETURNING *
  `, [eventId, profileId, Math.max(0, Number(data.score) || 0), Math.max(0, Number(data.correct) || 0), Math.max(0, Number(data.attempts) || 0)]);
  return rows[0];
}

async function analytics(days = 30) {
  const range = Math.max(1, Math.min(365, Number(days) || 30));
  const safe = async (text, params = [], fallback = []) => {
    try { return (await q(text, params)).rows; } catch { return fallback; }
  };
  const [overview, daily, categories, hardest, events, duration, errors, browsers, flags] = await Promise.all([
    safe(`SELECT
      COUNT(*)::int profiles,
      COUNT(*) FILTER(WHERE created_at>NOW()-($1::int*INTERVAL '1 day'))::int new_profiles,
      COUNT(*) FILTER(WHERE email_verified_at IS NOT NULL)::int verified_profiles,
      COUNT(*) FILTER(WHERE last_login_at>NOW()-INTERVAL '24 hours')::int active_today
      FROM quiz_solo_profiles`, [range], [{}]),
    safe(`WITH days AS (SELECT generate_series(CURRENT_DATE-($1::int-1),CURRENT_DATE,'1 day')::date day),
      regs AS (SELECT created_at::date day,COUNT(*)::int value FROM quiz_solo_profiles WHERE created_at>NOW()-($1::int*INTERVAL '1 day') GROUP BY 1),
      solo AS (SELECT completed_at::date day,COUNT(*)::int value FROM quiz_solo_sessions WHERE completed_at>NOW()-($1::int*INTERVAL '1 day') GROUP BY 1),
      online AS (SELECT played_at::date day,COUNT(DISTINCT COALESCE(room_code,source_id))::int value FROM quiz_phase10_match_history WHERE played_at>NOW()-($1::int*INTERVAL '1 day') GROUP BY 1),
      active AS (SELECT day,COUNT(DISTINCT profile_id)::int value FROM (
        SELECT answered_at::date day,profile_id FROM quiz_solo_attempts WHERE answered_at>NOW()-($1::int*INTERVAL '1 day')
        UNION ALL SELECT played_at::date,profile_id FROM quiz_phase10_match_history WHERE played_at>NOW()-($1::int*INTERVAL '1 day')
      ) x GROUP BY day)
      SELECT d.day,COALESCE(r.value,0) registrations,COALESCE(s.value,0)+COALESCE(o.value,0) games,COALESCE(a.value,0) active_users
      FROM days d LEFT JOIN regs r USING(day) LEFT JOIN solo s USING(day) LEFT JOIN online o USING(day) LEFT JOIN active a USING(day) ORDER BY d.day`, [range]),
    safe(`SELECT category,COUNT(*)::int answers,COUNT(*) FILTER(WHERE correct)::int correct,
      ROUND(100.0*COUNT(*) FILTER(WHERE correct)/NULLIF(COUNT(*),0),1) accuracy
      FROM quiz_solo_attempts WHERE answered_at>NOW()-($1::int*INTERVAL '1 day') GROUP BY category ORDER BY answers DESC LIMIT 20`, [range]),
    safe(`SELECT question_id,MAX(question_text) question_text,MAX(category) category,COUNT(*)::int answers,
      COUNT(*) FILTER(WHERE correct)::int correct,ROUND(100.0*COUNT(*) FILTER(WHERE correct)/NULLIF(COUNT(*),0),1) accuracy
      FROM quiz_solo_attempts WHERE answered_at>NOW()-($1::int*INTERVAL '1 day') GROUP BY question_id HAVING COUNT(*)>=3
      ORDER BY accuracy ASC,answers DESC LIMIT 30`, [range]),
    safe(`SELECT e.id,e.title,e.quiz_type,e.starts_at,e.ends_at,COUNT(ee.profile_id)::int participants,
      COALESCE(SUM(ee.attempts),0)::int attempts,COALESCE(ROUND(AVG(ee.best_score),1),0) average_score
      FROM quiz_phase10_events e LEFT JOIN quiz_phase10_event_entries ee ON ee.event_id=e.id
      WHERE e.starts_at>NOW()-($1::int*INTERVAL '1 day') GROUP BY e.id ORDER BY e.starts_at DESC LIMIT 30`, [range]),
    safe(`SELECT COUNT(*)::int started,COUNT(*) FILTER(WHERE completed_at IS NOT NULL)::int completed,
      COUNT(*) FILTER(WHERE completed_at IS NULL AND created_at<NOW()-INTERVAL '2 hours')::int abandoned,
      COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (completed_at-created_at))/60) FILTER(WHERE completed_at IS NOT NULL),1),0) average_minutes
      FROM quiz_solo_sessions WHERE created_at>NOW()-($1::int*INTERVAL '1 day')`, [range], [{}]),
    safe(`SELECT date_trunc('day',created_at)::date day,COUNT(*)::int errors
      FROM quiz_platform_metrics WHERE created_at>NOW()-($1::int*INTERVAL '1 day') AND (status_code>=400 OR event_type='client_error') GROUP BY 1 ORDER BY 1`, [range]),
    safe(`SELECT COALESCE(details->>'browser','Unbekannt') browser,COALESCE(details->>'device','Unbekannt') device,COUNT(*)::int events
      FROM quiz_phase11_risk_flags WHERE last_seen_at>NOW()-($1::int*INTERVAL '1 day') GROUP BY 1,2 ORDER BY events DESC`, [range]),
    safe(`SELECT severity,COUNT(*)::int total FROM quiz_phase11_risk_flags WHERE status IN ('open','reviewing') GROUP BY severity`, []),
  ]);
  const started = Number(duration[0]?.started || 0);
  const completed = Number(duration[0]?.completed || 0);
  return {
    rangeDays: range,
    overview: {
      ...overview[0],
      completionRate: started ? Math.round(completed / started * 100) : 0,
      abandonmentRate: started ? Math.round(Number(duration[0]?.abandoned || 0) / started * 100) : 0,
      averageSessionMinutes: Number(duration[0]?.average_minutes || 0),
    },
    daily,
    categories,
    hardestQuestions: hardest,
    events,
    errors,
    devices: browsers,
    risk: flags,
  };
}

async function snapshotAnalytics() {
  const value = await analytics(30);
  await q(`
    INSERT INTO quiz_phase11_daily_snapshots(snapshot_day,metrics)
    VALUES(CURRENT_DATE,$1::jsonb)
    ON CONFLICT(snapshot_day) DO UPDATE SET metrics=EXCLUDED.metrics,updated_at=NOW()
  `, [JSON.stringify(value)]);
  return value;
}

async function readinessChecks(baseUrl = null) {
  const checks = [];
  const add = (key, label, ok, detail, required = true) => checks.push({ key, label, ok: Boolean(ok), detail, required });
  try {
    const ping = await db.query('SELECT NOW() server_time');
    add('database', 'PostgreSQL erreichbar', Boolean(ping.rows[0]?.server_time), 'Datenbankabfrage erfolgreich.');
  } catch (error) { add('database', 'PostgreSQL erreichbar', false, error.message); }
  try {
    const migration = await db.query(`SELECT version FROM quiz_schema_migrations WHERE version='110_phase11_launch_readiness.sql'`);
    add('migration', 'Phase-11-Migration angewendet', migration.rowCount === 1, migration.rowCount ? 'Migration ist registriert.' : 'Migration fehlt.');
  } catch (error) { add('migration', 'Phase-11-Migration angewendet', false, error.message); }
  const catalog = await questionCatalog.diagnostics().catch(error => ({ consistent: false, error: error.message, byType: {} }));
  add('catalog', 'Fragenkatalog konsistent', catalog.consistent && Number(catalog.byType?.adult?.runtime || 0) >= 500 && Number(catalog.byType?.child?.runtime || 0) >= 500,
    catalog.error || `${catalog.byType?.adult?.runtime || 0} Erwachsenen- und ${catalog.byType?.child?.runtime || 0} Kinderfragen.`);
  const mail = emailService.status();
  add('email', 'E-Mail-Versand konfiguriert', Boolean(mail.configured), mail.configured ? `${mail.provider} ist aktiv.` : 'E-Mail-Anbieter ist nicht konfiguriert.', false);
  const requiredTables = ['quiz_solo_profiles', 'quiz_online_rooms', 'quiz_phase10_events', 'quiz_phase11_onboarding', 'quiz_phase11_risk_flags'];
  for (const table of requiredTables) add(`table:${table}`, `Tabelle ${table}`, await tableExists(table), 'Schema-Prüfung.');
  const status = checks.some(item => item.required && !item.ok) ? 'fail' : checks.some(item => !item.ok) ? 'warning' : 'pass';
  return { status, version: '11.0.0', checkedAt: new Date().toISOString(), baseUrl: baseUrl || process.env.APP_BASE_URL || null, checks };
}

async function runReadinessChecks(baseUrl = null) {
  const result = await readinessChecks(baseUrl);
  const id = crypto.randomUUID();
  await q(`INSERT INTO quiz_phase11_production_checks(id,status,version,commit_sha,base_url,checks) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [id, result.status, result.version, safeText(process.env.RENDER_GIT_COMMIT, 100) || null, safeText(result.baseUrl, 500) || null, JSON.stringify(result.checks)]);
  return { id, ...result };
}

async function readinessHistory() {
  const { rows } = await q('SELECT * FROM quiz_phase11_production_checks ORDER BY created_at DESC LIMIT 50');
  return rows;
}

module.exports = {
  ensureReady,
  ONBOARDING_STEPS,
  onboarding,
  completeOnboardingStep,
  dismissOnboarding,
  claimOnboardingReward,
  answerSource,
  beginAnswerEvent,
  finishAnswerEvent,
  riskFlags,
  updateRiskFlag,
  activeSanction,
  setSanction,
  addPlayerNotice,
  playerNotices,
  acknowledgeNotice,
  blockedRankingProfiles,
  patchLeaderboards,
  disabledQuestionIds,
  questionControls,
  setQuestionControl,
  adminEvents,
  saveAdminEvent,
  correctEventEntry,
  analytics,
  snapshotAnalytics,
  readinessChecks,
  runReadinessChecks,
  readinessHistory,
  _test: { browserFamily, deviceFamily, answerSource, filterLeaderboardRows },
};
