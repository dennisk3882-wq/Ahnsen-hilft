'use strict';

const crypto = require('crypto');
const db = require('./platform-db');
const { runMigrations } = require('./migration-runner');
const catalog = require('./question-catalog-service');

const VERSION = '13.0.0';
let readyPromise;

async function ensureReady() {
  if (!db.enabled()) return false;
  if (!readyPromise) readyPromise = runMigrations().then(async () => {
    await db.query(`INSERT INTO quiz_retention_profiles(profile_id) SELECT id FROM quiz_solo_profiles ON CONFLICT(profile_id) DO NOTHING`);
    return true;
  }).catch(error => { readyPromise = null; throw error; });
  return readyPromise;
}
async function q(text, params = []) { await ensureReady(); return db.query(text, params); }
function text(value, max = 1000) { return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, max); }
function questionById(id) {
  for (const type of ['child', 'adult']) {
    const found = catalog.currentCatalog(type).find(item => item.id === id);
    if (found) return { ...found, quizType: type };
  }
  return null;
}

async function submitQuestionReport(profileId, body = {}) {
  const question = questionById(text(body.questionId, 160));
  if (!question) throw new Error('Die gemeldete Frage wurde nicht gefunden.');
  const reasons = new Set(['wrong_answer','unclear','typo','outdated','duplicate','other']);
  const reason = reasons.has(body.reason) ? body.reason : 'other';
  const id = crypto.randomUUID();
  await q(`INSERT INTO quiz_question_reports(id,profile_id,question_id,quiz_type,category,reason,details,page,app_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, profileId || null, question.id, question.quizType, question.category, reason, text(body.details, 1200), text(body.page, 200), VERSION]);
  return { id, status: 'open' };
}

async function submitFeedback(profileId, body = {}, meta = {}) {
  const message = text(body.message, 2500);
  if (message.length < 5) throw new Error('Bitte beschreibe das Problem etwas genauer.');
  const allowed = new Set(['problem','idea','question_feedback','praise']);
  const id = crypto.randomUUID();
  await q(`INSERT INTO quiz_beta_feedback(id,profile_id,kind,message,page,app_version,browser,device,viewport)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, profileId || null, allowed.has(body.kind) ? body.kind : 'problem', message, text(body.page, 200), VERSION, text(meta.browser, 80), text(meta.device, 80), text(body.viewport, 80)]);
  return { id, status: 'open' };
}

async function questionReports(status = 'open') {
  const { rows } = await q(`SELECT r.*,p.name reporter_name,
      COUNT(*) OVER(PARTITION BY r.question_id,r.status)::int report_count
    FROM quiz_question_reports r LEFT JOIN quiz_solo_profiles p ON p.id=r.profile_id
    WHERE ($1='all' OR r.status=$1) ORDER BY report_count DESC,r.created_at DESC LIMIT 500`, [status]);
  return rows.map(row => ({ ...row, question: questionById(row.question_id) }));
}
async function updateReport(id, values = {}, actor = 'admin') {
  const status = ['open','reviewing','resolved','dismissed'].includes(values.status) ? values.status : 'reviewing';
  const { rows } = await q(`UPDATE quiz_question_reports SET status=$2,resolution_note=$3,reviewed_at=CASE WHEN $2 IN ('resolved','dismissed') THEN NOW() ELSE reviewed_at END,reviewed_by=$4 WHERE id=$1 RETURNING *`, [id, status, text(values.note, 1000), actor]);
  return rows[0] || null;
}
async function reviseQuestion(id, body = {}, actor = 'admin') {
  const before = questionById(id);
  if (!before) throw new Error('Frage wurde nicht gefunden.');
  const options = Array.isArray(body.options) ? body.options.map(v => text(v, 300)) : before.options;
  const after = {
    ...before,
    text: text(body.text ?? before.text, 600),
    category: text(body.category ?? before.category, 120),
    options,
    correctIndex: Number.isInteger(Number(body.correctIndex)) ? Number(body.correctIndex) : before.correctIndex,
    explanation: text(body.explanation ?? before.explanation, 1200),
  };
  if (!after.text || options.length !== 4 || options.some(v => !v) || after.correctIndex < 0 || after.correctIndex > 3 || after.explanation.length < 20) throw new Error('Die korrigierte Frage ist unvollständig.');
  await q(`INSERT INTO quiz_question_revisions(id,question_id,quiz_type,before_data,after_data,reason,actor) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`, [crypto.randomUUID(), id, before.quizType, JSON.stringify(before), JSON.stringify(after), text(body.reason, 500) || 'Redaktionelle Korrektur', actor]);
  return after;
}
async function revisions(id) { return (await q('SELECT * FROM quiz_question_revisions WHERE question_id=$1 ORDER BY created_at DESC LIMIT 100', [id])).rows; }

async function feedback(status = 'open') { return (await q(`SELECT f.*,p.name reporter_name FROM quiz_beta_feedback f LEFT JOIN quiz_solo_profiles p ON p.id=f.profile_id WHERE ($1='all' OR f.status=$1) ORDER BY f.created_at DESC LIMIT 500`, [status])).rows; }
async function updateFeedback(id, body = {}) {
  const status = ['open','reviewing','resolved','dismissed'].includes(body.status) ? body.status : 'reviewing';
  return (await q(`UPDATE quiz_beta_feedback SET status=$2,admin_note=$3,reviewed_at=CASE WHEN $2 IN ('resolved','dismissed') THEN NOW() ELSE reviewed_at END WHERE id=$1 RETURNING *`, [id, status, text(body.note, 1200)])).rows[0] || null;
}

async function releaseReadiness() {
  const tables = ['quiz_question_reports','quiz_beta_feedback','quiz_retention_profiles','quiz_weekly_goals','quiz_data_requests'];
  const checks = [];
  try { await db.query('SELECT 1'); checks.push({ key: 'database', ok: true, label: 'PostgreSQL erreichbar' }); } catch (error) { checks.push({ key: 'database', ok: false, label: error.message }); }
  for (const name of tables) {
    const exists = Boolean((await db.query('SELECT to_regclass($1) AS name', [`public.${name}`])).rows[0]?.name);
    checks.push({ key: `table:${name}`, ok: exists, label: `${name} vorhanden` });
  }
  checks.push({ key: 'child-catalog', ok: catalog.currentCatalog('child').length >= 500, label: `${catalog.currentCatalog('child').length} Kinderfragen` });
  checks.push({ key: 'adult-catalog', ok: catalog.currentCatalog('adult').length >= 500, label: `${catalog.currentCatalog('adult').length} Erwachsenenfragen` });
  const supportEmail = text(process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || '', 200);
  checks.push({ key: 'support-email', ok: /@/.test(supportEmail), warning: !/@/.test(supportEmail), label: /@/.test(supportEmail) ? 'Support-E-Mail konfiguriert' : 'SUPPORT_EMAIL fehlt' });
  const failures = checks.filter(c => !c.ok && !c.warning).length;
  const warnings = checks.filter(c => c.warning).length;
  return { version: VERSION, status: failures ? 'fail' : warnings ? 'warning' : 'pass', checks, operator: { name: 'Dennis Koch', address: 'In der Flöte 19, 31708 Ahnsen', supportEmail: supportEmail || null } };
}
async function saveReleaseCheck() {
  const result = await releaseReadiness();
  await q(`INSERT INTO quiz_release_checks(id,version,commit_sha,status,checks) VALUES($1,$2,$3,$4,$5::jsonb)`, [crypto.randomUUID(), VERSION, process.env.RENDER_GIT_COMMIT || null, result.status, JSON.stringify(result.checks)]);
  return result;
}
async function releaseHistory() { return (await q('SELECT * FROM quiz_release_checks ORDER BY created_at DESC LIMIT 50')).rows; }

async function requestDataAction(profileId, type) {
  if (!['export','delete'].includes(type)) throw new Error('Unbekannte Datenschutzanfrage.');
  const existing = await q(`SELECT id,status FROM quiz_data_requests WHERE profile_id=$1 AND request_type=$2 AND status IN ('requested','processing') ORDER BY requested_at DESC LIMIT 1`, [profileId, type]);
  if (existing.rowCount) return existing.rows[0];
  const id = crypto.randomUUID();
  await q(`INSERT INTO quiz_data_requests(id,profile_id,request_type) VALUES($1,$2,$3)`, [id, profileId, type]);
  return { id, status: 'requested' };
}
async function myDataRequests(profileId) { return (await q('SELECT id,request_type,status,requested_at,completed_at,note FROM quiz_data_requests WHERE profile_id=$1 ORDER BY requested_at DESC', [profileId])).rows; }

function isoWeekStart(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - day + 1); return d.toISOString().slice(0, 10);
}
async function streak(profileId) {
  const { rows } = await q(`SELECT DISTINCT answered_at::date day FROM quiz_solo_attempts WHERE profile_id=$1 AND answered_at>=CURRENT_DATE-INTERVAL '370 days' ORDER BY day DESC`, [profileId]);
  const days = new Set(rows.map(r => String(r.day).slice(0,10)));
  let current = 0; const cursor = new Date(); cursor.setHours(0,0,0,0);
  if (!days.has(cursor.toISOString().slice(0,10))) cursor.setDate(cursor.getDate()-1);
  while (days.has(cursor.toISOString().slice(0,10))) { current += 1; cursor.setDate(cursor.getDate()-1); }
  const existing = (await q('SELECT best_streak,reminder_enabled,reminder_hour,preferred_categories FROM quiz_retention_profiles WHERE profile_id=$1', [profileId])).rows[0] || {};
  const best = Math.max(current, Number(existing.best_streak || 0));
  await q(`INSERT INTO quiz_retention_profiles(profile_id,current_streak,best_streak,last_active_day) VALUES($1,$2,$3,CURRENT_DATE)
    ON CONFLICT(profile_id) DO UPDATE SET current_streak=$2,best_streak=GREATEST(quiz_retention_profiles.best_streak,$3),updated_at=NOW()`, [profileId,current,best]);
  return { current, best, reminderEnabled: Boolean(existing.reminder_enabled), reminderHour: Number(existing.reminder_hour ?? 19), preferredCategories: existing.preferred_categories || [] };
}
async function weeklyGoals(profileId) {
  const week = isoWeekStart();
  const stats = (await q(`SELECT COUNT(DISTINCT session_id)::int quizzes,COUNT(*) FILTER(WHERE correct)::int correct,COUNT(DISTINCT category)::int categories FROM quiz_solo_attempts WHERE profile_id=$1 AND answered_at::date>=$2::date`, [profileId,week])).rows[0];
  const definitions = [
    { key:'play-3', title:'Drei Quizrunden', target:3, progress:Number(stats.quizzes||0), reward:150 },
    { key:'correct-50', title:'50 richtige Antworten', target:50, progress:Number(stats.correct||0), reward:250 },
    { key:'categories-3', title:'Drei Kategorien spielen', target:3, progress:Number(stats.categories||0), reward:200 },
  ];
  for (const goal of definitions) await q(`INSERT INTO quiz_weekly_goals(profile_id,week_start,goal_key,target,progress,completed_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $5>=$4 THEN NOW() ELSE NULL END)
    ON CONFLICT(profile_id,week_start,goal_key) DO UPDATE SET progress=$5,completed_at=CASE WHEN $5>=quiz_weekly_goals.target THEN COALESCE(quiz_weekly_goals.completed_at,NOW()) ELSE NULL END`, [profileId,week,goal.key,goal.target,goal.progress]);
  const stored = (await q('SELECT * FROM quiz_weekly_goals WHERE profile_id=$1 AND week_start=$2 ORDER BY goal_key', [profileId,week])).rows;
  return stored.map(row => ({ ...row, ...definitions.find(d=>d.key===row.goal_key), complete:Number(row.progress)>=Number(row.target) }));
}
async function claimGoal(profileId, key) {
  const week = isoWeekStart();
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const goal = (await client.query(`UPDATE quiz_weekly_goals SET reward_claimed=TRUE WHERE profile_id=$1 AND week_start=$2 AND goal_key=$3 AND completed_at IS NOT NULL AND reward_claimed=FALSE RETURNING *`, [profileId,week,key])).rows[0];
    if (!goal) throw new Error('Diese Wochenbelohnung ist noch nicht verfügbar oder bereits abgeholt.');
    const xp = key==='correct-50'?250:key==='categories-3'?200:150;
    await client.query(`INSERT INTO quiz_phase10_rewards(profile_id,bonus_xp) VALUES($1,$2) ON CONFLICT(profile_id) DO UPDATE SET bonus_xp=quiz_phase10_rewards.bonus_xp+$2,updated_at=NOW()`, [profileId,xp]);
    await client.query('COMMIT'); return { key, xp };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
async function recommendations(profileId) {
  const { rows } = await q(`SELECT category,COUNT(*)::int answers,ROUND(AVG(CASE WHEN correct THEN 100 ELSE 0 END))::int accuracy FROM quiz_solo_attempts WHERE profile_id=$1 GROUP BY category HAVING COUNT(*)>=2 ORDER BY accuracy ASC,answers DESC LIMIT 5`, [profileId]);
  const played = new Set(rows.map(r=>r.category));
  const all = [...new Set([...catalog.currentCatalog('child'),...catalog.currentCatalog('adult')].map(x=>x.category))];
  return { improve: rows, discover: all.filter(c=>!played.has(c)).slice(0,5) };
}
async function personalRecords(profileId) {
  const { rows } = await q(`SELECT COALESCE(MAX(delta),0)::int best_answer,COUNT(*) FILTER(WHERE correct)::int total_correct,COUNT(DISTINCT session_id)::int quizzes,COALESCE(MAX(answered_at),NOW()) last_played FROM quiz_solo_attempts WHERE profile_id=$1`, [profileId]);
  const s = await streak(profileId);
  return { bestAnswerScore:Number(rows[0].best_answer||0), totalCorrect:Number(rows[0].total_correct||0), quizzes:Number(rows[0].quizzes||0), bestStreak:s.best };
}
async function friendActivity(profileId) {
  const { rows } = await q(`WITH friends AS (
    SELECT CASE WHEN profile_low=$1 THEN profile_high ELSE profile_low END id FROM quiz_platform_friendships WHERE status='accepted' AND (profile_low=$1 OR profile_high=$1)
  ), recent AS (
    SELECT a.profile_id,MAX(a.answered_at) played_at,COUNT(*) FILTER(WHERE a.correct)::int correct FROM quiz_solo_attempts a JOIN friends f ON f.id=a.profile_id WHERE a.answered_at>NOW()-INTERVAL '14 days' GROUP BY a.profile_id
  ) SELECT p.id,p.name,p.avatar_id,r.played_at,r.correct FROM recent r JOIN quiz_solo_profiles p ON p.id=r.profile_id ORDER BY r.played_at DESC LIMIT 30`, [profileId]);
  return rows;
}
async function updateRetention(profileId, body={}) {
  const cats = Array.isArray(body.preferredCategories) ? body.preferredCategories.map(v=>text(v,120)).filter(Boolean).slice(0,8) : [];
  const hour = Math.max(0,Math.min(23,Number(body.reminderHour??19)));
  await q(`INSERT INTO quiz_retention_profiles(profile_id,reminder_enabled,reminder_hour,preferred_categories) VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT(profile_id) DO UPDATE SET reminder_enabled=$2,reminder_hour=$3,preferred_categories=$4::jsonb,updated_at=NOW()`, [profileId,Boolean(body.reminderEnabled),hour,JSON.stringify(cats)]);
  return retentionOverview(profileId);
}
async function retentionOverview(profileId) {
  return { version:VERSION, streak:await streak(profileId), goals:await weeklyGoals(profileId), records:await personalRecords(profileId), recommendations:await recommendations(profileId), friendActivity:await friendActivity(profileId) };
}

module.exports = { VERSION,ensureReady,submitQuestionReport,submitFeedback,questionReports,updateReport,reviseQuestion,revisions,feedback,updateFeedback,releaseReadiness,saveReleaseCheck,releaseHistory,requestDataAction,myDataRequests,retentionOverview,updateRetention,claimGoal,questionById };
