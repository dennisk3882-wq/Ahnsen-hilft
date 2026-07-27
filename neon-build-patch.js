const fs = require('fs');
const path = require('path');

const appDir = path.resolve(process.argv[2] || 'quiz-app');
const pkgPath = path.join(appDir, 'package.json');
const serverPath = path.join(appDir, 'server.js');
if (!fs.existsSync(pkgPath) || !fs.existsSync(serverPath)) throw new Error('Quiz-App wurde nicht gefunden.');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.dependencies = { ...(pkg.dependencies || {}), pg: '8.13.1' };
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

fs.writeFileSync(path.join(appDir, 'db.js'), `const { Pool } = require('pg');
const rawUrl = String(process.env.DATABASE_URL || '').trim();

function databaseUrlWithStrictTls(value) {
  if (!value) return '';
  const parsed = new URL(value);
  parsed.searchParams.set('sslmode', 'verify-full');
  return parsed.toString();
}

const url = databaseUrlWithStrictTls(rawUrl);
const pool = url ? new Pool({ connectionString: url, max: 5 }) : null;

async function initDatabase(defaultSets) {
  if (!pool) return { enabled: false, questionSets: defaultSets };
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS quiz_question_sets (
      quiz_type TEXT PRIMARY KEY,
      questions JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS quiz_runs (
      id BIGSERIAL PRIMARY KEY,
      quiz_type TEXT NOT NULL,
      title TEXT NOT NULL,
      finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      leaderboard JSONB NOT NULL,
      answer_history JSONB NOT NULL
    );
  \`);
  for (const [type, questions] of Object.entries(defaultSets)) {
    await pool.query(\`INSERT INTO quiz_question_sets (quiz_type, questions) VALUES ($1,$2::jsonb) ON CONFLICT (quiz_type) DO NOTHING\`, [type, JSON.stringify(questions)]);
  }
  const { rows } = await pool.query('SELECT quiz_type, questions FROM quiz_question_sets');
  const questionSets = { ...defaultSets };
  for (const row of rows) questionSets[row.quiz_type] = row.questions;
  return { enabled: true, questionSets };
}
async function saveQuestionSet(type, questions) {
  if (!pool) return false;
  await pool.query(\`INSERT INTO quiz_question_sets (quiz_type, questions, updated_at) VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (quiz_type) DO UPDATE SET questions=EXCLUDED.questions, updated_at=NOW()\`, [type, JSON.stringify(questions)]);
  return true;
}
async function saveQuizRun(data) {
  if (!pool) return false;
  await pool.query(\`INSERT INTO quiz_runs (quiz_type,title,leaderboard,answer_history) VALUES ($1,$2,$3::jsonb,$4::jsonb)\`, [data.quizType, data.title, JSON.stringify(data.leaderboard), JSON.stringify(data.answerHistory)]);
  return true;
}
module.exports = { initDatabase, saveQuestionSet, saveQuizRun, databaseEnabled: Boolean(pool) };
`);

let s = fs.readFileSync(serverPath, 'utf8');
if (!s.includes("require('./db')")) {
  const anchor = "const { calculateAnswerScore } = require('./lib/scoring');";
  s = s.replace(anchor, anchor + "\nconst { initDatabase, saveQuestionSet, saveQuizRun, databaseEnabled } = require('./db');");
}

// Make the question-save endpoint asynchronous and persist its selected set in Neon.
s = s.replace(/app\.put\('\/api\/admin\/questions',\s*ensureAdmin,\s*\(req, res\)\s*=>/g,
  "app.put('/api/admin/questions', ensureAdmin, async (req, res) =>");
if (!s.includes('await saveQuestionSet(quizType, validated)')) {
  s = s.replace(/(fs\.writeFileSync\([^;]+;\s*)(resetScoresAndRound)/,
    "$1await saveQuestionSet(quizType, validated);\n    $2");
}

s = s.replace(/res\.json\(\{\s*quizType,\s*questions:\s*questionSets\[quizType\]\s*\}\);/,
  'res.json({ quizType, questions: questionSets[quizType], databaseEnabled });');

if (!s.includes('Neon-Datenbank verbunden.')) {
  const listenMarker = /server\.listen\(PORT, '0\.0\.0\.0', \(\) => \{[\s\S]*?\n\}\);\s*$/;
  const match = s.match(listenMarker);
  if (!match) throw new Error('Server-Startblock konnte nicht erkannt werden.');
  const originalListen = match[0];
  s = s.replace(listenMarker, `async function bootstrap() {
  try {
    const initialized = await initDatabase(questionSets);
    questionSets = initialized.questionSets;
    console.log(initialized.enabled ? 'Neon-Datenbank verbunden.' : 'Keine DATABASE_URL: lokale Speicherung aktiv.');
  } catch (error) {
    console.error('Neon-Verbindung fehlgeschlagen; lokale Fragen bleiben aktiv:', error.message);
  }
  ${originalListen.trim()}
}
bootstrap();
`);
}

fs.writeFileSync(serverPath, s);
console.log('Neon-Patch für das Ahnsen-Quiz wurde angewendet.');
