'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Einfügestelle nicht gefunden: ${label}`);
  return source.replace(search, replacement);
}

const serverPath = 'quiz-app/server.js';
let server = fs.readFileSync(serverPath, 'utf8');
server = replaceOnce(
  server,
  "const { calculateAnswerScore } = require('./lib/scoring');",
  "const { calculateAnswerScore } = require('./lib/scoring');\nconst { installSoloRoutes } = require('./solo-routes');",
  'Solo-Routen importieren'
);
server = replaceOnce(
  server,
  "app.get('/screen', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));",
  "app.get('/screen', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));\n\ninstallSoloRoutes(app, {\n  getQuestionSets: () => questionSets,\n  chooseQuestions,\n  questionSeconds: QUESTION_SECONDS,\n  now,\n});",
  'Solo-Routen registrieren'
);
server = server.replace("version: '6.0.0'", "version: '6.3.0'");
fs.writeFileSync(serverPath, server);

const playerPath = 'quiz-app/public/player.js';
let player = fs.readFileSync(playerPath, 'utf8');
player = replaceOnce(
  player,
  "title: document.querySelector('#title'), loginCard: document.querySelector('#loginCard'), game: document.querySelector('#game'),",
  "title: document.querySelector('#title'), soloEntry: document.querySelector('#soloEntry'), loginCard: document.querySelector('#loginCard'), game: document.querySelector('#game'),",
  'Solo-Startkarte referenzieren'
);
player = replaceOnce(
  player,
  "els.loginCard.classList.add('hidden');\n  els.game.classList.remove('hidden');",
  "els.loginCard.classList.add('hidden');\n  els.soloEntry?.classList.add('hidden');\n  els.game.classList.remove('hidden');",
  'Solo-Startkarte im Live-Spiel ausblenden'
);
fs.writeFileSync(playerPath, player);

const soloRoutesPath = 'quiz-app/solo-routes.js';
let soloRoutes = fs.readFileSync(soloRoutesPath, 'utf8');
soloRoutes = replaceOnce(
  soloRoutes,
  "const isTimedOut = timedOut || (session.mode === 'timed' && remainingMs(session) <= 0 && !validAnswer);\n    const correct = validAnswer && answerIndex === question.correctIndex;",
  "const isTimedOut = timedOut || (session.mode === 'timed' && remainingMs(session) <= 0 && !validAnswer);\n    const correct = !isTimedOut && validAnswer && answerIndex === question.correctIndex;",
  'Zeitablauf korrekt als unbeantwortet werten'
);
fs.writeFileSync(soloRoutesPath, soloRoutes);

fs.rmSync('scripts/apply-solo-mode.js');
fs.rmSync('.github/workflows/apply-solo-mode.yml');

execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
execFileSync('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
execFileSync('git', ['add', '-A']);
execFileSync('git', ['commit', '-m', 'Integriere Solo-Quiz in Server und Live-Startseite'], { stdio: 'inherit' });
execFileSync('git', ['push', 'origin', 'HEAD:quiz-solo-mode'], { stdio: 'inherit' });
