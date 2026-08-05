'use strict';

const questionCatalog = require('./question-catalog-service');
const { crypto, db, safeText, q } = require('./phase12-shared');

function resolveQuestion({ questionId, questionText, quizType }) {
  const types = quizType ? [quizType === 'child' ? 'child' : 'adult'] : ['child', 'adult'];
  for (const type of types) {
    const catalog = questionCatalog.currentCatalog(type);
    const question = questionId
      ? catalog.find(item => item.id === questionId)
      : catalog.find(item => item.text === safeText(questionText, 500));
    if (question) return { ...question, quizType: type };
  }
  return null;
}

async function reportQuestion(profileId, values = {}) {
  const reportType = ['wrong-answer', 'unclear', 'duplicate', 'outdated', 'typo', 'other'].includes(values.reportType)
    ? values.reportType
    : 'other';
  const resolved = resolveQuestion(values);
  const questionText = safeText(resolved?.text || values.questionText, 600);
  if (!questionText) throw new Error('Die betroffene Frage konnte nicht erkannt werden.');
  const id = crypto.randomUUID();
  await q(`INSERT INTO quiz_phase12_question_reports(id,profile_id,question_id,question_text,quiz_type,category,report_type,comment,page_path,app_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
    id,
    profileId || null,
    resolved?.id || safeText(values.questionId, 160) || null,
    questionText,
    resolved?.quizType || (values.quizType === 'child' ? 'child' : values.quizType === 'adult' ? 'adult' : null),
    resolved?.category || safeText(values.category, 120) || null,
    reportType,
    safeText(values.comment, 1200) || null,
    safeText(values.pagePath, 300) || null,
    safeText(values.appVersion, 40) || '13.0.0',
  ]);
  return { id, status: 'open' };
}

async function questionReports(status = 'open') {
  const safeStatus = ['open', 'reviewing', 'resolved', 'dismissed', 'all'].includes(status) ? status : 'open';
  return (await q(`SELECT r.*,p.name AS reporter_name,COALESCE(s.answers,0)::int AS answers,COALESCE(s.correct,0)::int AS correct,COALESCE(s.wrong,0)::int AS wrong,COALESCE(s.accuracy,0)::int AS accuracy
    FROM quiz_phase12_question_reports r
    LEFT JOIN quiz_solo_profiles p ON p.id=r.profile_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS answers,
        COUNT(*) FILTER(WHERE a.correct)::int AS correct,
        COUNT(*) FILTER(WHERE NOT a.correct AND NOT a.timed_out)::int AS wrong,
        CASE WHEN COUNT(*)>0 THEN ROUND(COUNT(*) FILTER(WHERE a.correct)*100.0/COUNT(*))::int ELSE 0 END AS accuracy
      FROM quiz_solo_attempts a
      WHERE (r.question_id IS NOT NULL AND a.question_id=r.question_id)
         OR (r.question_id IS NULL AND a.question_text=r.question_text)
    ) s ON TRUE
    WHERE ($1='all' OR r.status=$1)
    ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,r.created_at DESC
    LIMIT 500`, [safeStatus])).rows;
}

async function updateQuestionReport(id, values = {}, actor = 'platform-admin') {
  const status = ['open', 'reviewing', 'resolved', 'dismissed'].includes(values.status) ? values.status : 'reviewing';
  return (await q(`UPDATE quiz_phase12_question_reports
    SET status=$2,resolution_note=$3,resolved_by=$4,updated_at=NOW()
    WHERE id=$1 RETURNING *`, [id, status, safeText(values.note, 1000) || null, actor])).rows[0] || null;
}

async function questionStatistics(query = '') {
  const term = `%${safeText(query, 120)}%`;
  return (await q(`WITH attempt_stats AS (
      SELECT question_id,MAX(question_text) AS question_text,MAX(category) AS category,MAX(quiz_type) AS quiz_type,
        COUNT(*)::int AS answers,
        COUNT(*) FILTER(WHERE correct)::int AS correct,
        COUNT(*) FILTER(WHERE NOT correct AND NOT timed_out)::int AS wrong,
        COUNT(*) FILTER(WHERE timed_out)::int AS timed_out,
        ROUND(AVG(CASE WHEN correct THEN 1 ELSE 0 END)*100)::int AS accuracy,
        MAX(answered_at) AS last_answered_at
      FROM quiz_solo_attempts
      WHERE ($1='%%' OR question_text ILIKE $1 OR category ILIKE $1 OR question_id ILIKE $1)
      GROUP BY question_id
    ), timing AS (
      SELECT question_key,ROUND(AVG(response_ms))::int AS average_response_ms,COUNT(*)::int AS measured_answers
      FROM quiz_phase11_answer_events
      WHERE accepted AND response_ms IS NOT NULL
      GROUP BY question_key
    )
    SELECT a.*,t.average_response_ms,COALESCE(t.measured_answers,0)::int AS measured_answers
    FROM attempt_stats a
    LEFT JOIN timing t ON t.question_key=a.question_id
    ORDER BY a.accuracy ASC,a.answers DESC
    LIMIT 500`, [term])).rows;
}

async function editQuestion(questionId, values = {}, actor = 'platform-admin') {
  const type = values.quizType === 'child' ? 'child' : 'adult';
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT questions FROM quiz_question_sets WHERE quiz_type=$1 FOR UPDATE', [type]);
    const questions = Array.isArray(result.rows[0]?.questions) ? result.rows[0].questions : questionCatalog.canonicalCatalog(type);
    const index = questions.findIndex(question => question.id === questionId);
    if (index < 0) throw new Error('Frage wurde im gewählten Katalog nicht gefunden.');
    const original = questions[index];
    const options = Array.isArray(values.options) ? values.options.map(option => safeText(option, 200)) : original.options;
    const requestedIndex = Number(values.correctIndex);
    const updated = {
      ...original,
      text: safeText(values.text ?? original.text, 600),
      category: safeText(values.category ?? original.category, 120),
      options,
      correctIndex: Number.isInteger(requestedIndex) ? requestedIndex : original.correctIndex,
      explanation: safeText(values.explanation ?? original.explanation, 1200),
    };
    if (!updated.text || !updated.category || options.length !== 4 || options.some(option => !option)
      || new Set(options.map(option => option.toLocaleLowerCase('de-DE'))).size !== 4
      || !Number.isInteger(updated.correctIndex) || updated.correctIndex < 0 || updated.correctIndex > 3
      || updated.explanation.length < 15) {
      throw new Error('Die korrigierte Frage ist unvollständig oder ungültig.');
    }
    await client.query(`INSERT INTO quiz_phase12_question_versions(id,question_id,quiz_type,snapshot,change_type,actor,note)
      VALUES($1,$2,$3,$4::jsonb,'edit',$5,$6)`, [
      crypto.randomUUID(), questionId, type, JSON.stringify(original), actor, safeText(values.note, 500) || null,
    ]);
    questions[index] = updated;
    await client.query(`INSERT INTO quiz_question_sets(quiz_type,questions,updated_at)
      VALUES($1,$2::jsonb,NOW())
      ON CONFLICT(quiz_type) DO UPDATE SET questions=EXCLUDED.questions,updated_at=NOW()`, [type, JSON.stringify(questions)]);
    await client.query('COMMIT');
    await questionCatalog.reloadFromDatabase();
    return updated;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function questionVersions(questionId) {
  return (await q(`SELECT * FROM quiz_phase12_question_versions WHERE question_id=$1 ORDER BY created_at DESC LIMIT 100`, [questionId])).rows;
}

module.exports = {
  resolveQuestion,
  reportQuestion,
  questionReports,
  updateQuestionReport,
  questionStatistics,
  editQuestion,
  questionVersions,
};
