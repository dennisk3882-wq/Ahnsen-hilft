'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = path.join(root, 'quiz-app');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function write(relative, content) {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), content);
}

function replaceOnce(relative, from, to) {
  const content = read(relative);
  if (!content.includes(from)) throw new Error(`Erwarteter Text fehlt in ${relative}: ${from.slice(0, 100)}`);
  write(relative, content.replace(from, to));
}

const server = 'quiz-app/server.js';
replaceOnce(server,
  "const { calculateAnswerScore } = require('./lib/scoring');\nconst { installSoloRoutes } = require('./solo-routes');",
  "const { calculateAnswerScore } = require('./lib/scoring');\nconst { installSoloRoutes } = require('./solo-routes');\nconst { enrichQuestion } = require('./question-explanations');");
replaceOnce(server,
  "adult: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'adult-questions.json'), 'utf8')),\n  child: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'child-questions.json'), 'utf8')),
",
  "adult: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'adult-questions.json'), 'utf8')).map(enrichQuestion),\n  child: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'child-questions.json'), 'utf8')).map(enrichQuestion),
");
replaceOnce(server, 'schemaVersion: 6,', 'schemaVersion: 7,');
replaceOnce(server,
  "pause: null,\n    runUuid:",
  "pause: null,\n    tiebreak: null,\n    scoreAdjustments: [],\n    runUuid:");
replaceOnce(server,
  "function activePlayers() { return Object.values(state.players).filter(p => !p.excluded); }\nfunction currentRemainingMs()",
  `function activePlayers() { return Object.values(state.players).filter(p => !p.excluded); }
function eligiblePlayers() {
  if (!state.tiebreak?.active) return activePlayers();
  const eligible = new Set(state.tiebreak.eligiblePlayerIds || []);
  return activePlayers().filter(player => eligible.has(player.id));
}
function tieCandidates() {
  const board = leaderboard();
  const pool = state.tiebreak?.active
    ? board.filter(player => (state.tiebreak.eligiblePlayerIds || []).includes(player.id))
    : board;
  if (pool.length < 2) return pool.slice(0, 1);
  const topScore = pool[0].score;
  return pool.filter(player => player.score === topScore);
}
function currentRemainingMs()`);
replaceOnce(server,
  "...(reveal ? { correctIndex: question.correctIndex } : {}),",
  "...(reveal ? { correctIndex: question.correctIndex, explanation: enrichQuestion(question).explanation } : {}),");
replaceOnce(server,
  "activePlayerCount: activePlayers().length,\n    distribution:",
  "activePlayerCount: activePlayers().length,\n    answerEligibleCount: eligiblePlayers().length,\n    tiebreak: state.tiebreak ? { active: Boolean(state.tiebreak.active), round: state.tiebreak.round, playerNames: state.tiebreak.playerNames || [] } : null,\n    distribution:");
replaceOnce(server,
  "ownResponse: state.responses[playerId] || null,",
  "ownResponse: state.responses[playerId] || null,\n    eligibleForQuestion: !state.tiebreak?.active || (state.tiebreak.eligiblePlayerIds || []).includes(playerId),");
replaceOnce(server,
  "leaderboard: leaderboard(),\n    selectedQuestionIds:",
  "leaderboard: leaderboard(),\n    tieCandidates: tieCandidates(),\n    tiebreak: state.tiebreak,\n    scoreAdjustments: state.scoreAdjustments || [],\n    selectedQuestionIds:");
replaceOnce(server,
  "const responded = new Set(Object.keys(state.responses || {}));\n  for (const player of activePlayers()) {",
  "const responded = new Set(Object.keys(state.responses || {}));\n  for (const player of eligiblePlayers()) {");
replaceOnce(server,
  "async function finishQuiz() {\n  if (state.phase === 'question') revealQuestion();\n  state.phase = 'finished';",
  `async function finishQuiz() {
  if (state.phase === 'question') revealQuestion();
  if (state.tiebreak?.active) {
    const candidates = tieCandidates();
    state.tiebreak = {
      ...state.tiebreak,
      active: false,
      resolvedAt: now(),
      winnerId: candidates.length === 1 ? candidates[0].id : null,
      winnerName: candidates.length === 1 ? candidates[0].name : null,
    };
  }
  state.phase = 'finished';`);
replaceOnce(server,
  "settings: { skippedQuestionIds: state.skippedQuestionIds, selectedQuestionIds: state.selectedQuestionIds },",
  "settings: { skippedQuestionIds: state.skippedQuestionIds, selectedQuestionIds: state.selectedQuestionIds, scoreAdjustments: state.scoreAdjustments || [], tiebreak: state.tiebreak || null },");
replaceOnce(server,
  "if (player.excluded) return res.status(403).json({ error: 'Du wurdest vom Quiz ausgeschlossen.' });\n  if (state.phase !== 'question')",
  "if (player.excluded) return res.status(403).json({ error: 'Du wurdest vom Quiz ausgeschlossen.' });\n  if (state.tiebreak?.active && !(state.tiebreak.eligiblePlayerIds || []).includes(player.id)) return res.status(403).json({ error: 'Diese Entscheidungsfrage ist nur für die punktgleichen Spieler bestimmt.' });\n  if (state.phase !== 'question')");
replaceOnce(server, "version: '6.3.0'", "version: '7.0.0'");
replaceOnce(server,
  "      case 'finish_quiz':\n        await finishQuiz();\n        break;",
  `      case 'adjust_score': {
        if (state.phase === 'finished') throw new Error('Nach dem endgültigen Speichern kann die Punktzahl nicht mehr geändert werden. Bitte vorher korrigieren.');
        const player = state.players[String(req.body?.playerId || '')];
        const delta = Number(req.body?.delta);
        const reason = String(req.body?.reason || '').trim().slice(0, 160);
        if (!player) throw new Error('Spieler nicht gefunden.');
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 500) throw new Error('Die Korrektur muss eine ganze Zahl zwischen −500 und 500 sein und darf nicht 0 sein.');
        if (reason.length < 3) throw new Error('Bitte eine kurze Begründung für die Punktekorrektur angeben.');
        player.score += delta;
        state.scoreAdjustments ||= [];
        state.scoreAdjustments.push({ id: crypto.randomUUID(), playerId: player.id, playerName: player.name, delta, reason, scoreAfter: player.score, adjustedAt: now() });
        state.updatedAt = now();
        await persistNow();
        broadcastAll();
        break;
      }
      case 'start_tiebreak': {
        if (state.phase !== 'revealed') throw new Error('Eine Entscheidungsfrage kann nur nach einer aufgelösten Frage gestartet werden.');
        if (state.currentIndex + 1 < state.selectedQuestionIds.length) throw new Error('Entscheidungsfragen sind erst nach der letzten regulären Frage möglich.');
        const tied = tieCandidates();
        if (tied.length < 2) throw new Error('Auf dem ersten Platz besteht aktuell kein Gleichstand.');
        const allIds = chooseQuestions(state.quizType, 'Gemischt', questionSets[state.quizType].length);
        const nextId = allIds.find(id => !state.selectedQuestionIds.includes(id));
        if (!nextId) throw new Error('Es ist keine unbenutzte Frage für eine Entscheidungsrunde verfügbar.');
        state.selectedQuestionIds.push(nextId);
        state.questionCount = state.selectedQuestionIds.length;
        state.currentIndex = state.selectedQuestionIds.length - 1;
        state.phase = 'ready';
        state.responses = {};
        state.questionStartedAt = null;
        state.overlay = null;
        state.pause = null;
        state.tiebreak = {
          active: true,
          round: Number(state.tiebreak?.round || 0) + 1,
          eligiblePlayerIds: tied.map(player => player.id),
          playerNames: tied.map(player => player.name),
          startedAt: now(),
        };
        state.updatedAt = now();
        await persistNow();
        broadcastAll();
        break;
      }
      case 'finish_quiz':
        await finishQuiz();
        break;`);
replaceOnce(server,
  "const imageUrl = String(q.imageUrl || '').trim();",
  "const imageUrl = String(q.imageUrl || '').trim();\n    const explanation = String(q.explanation || '').trim();");
replaceOnce(server,
  "validated.push({ id, category, text, options, correctIndex, ...(imageUrl ? { imageUrl } : {}) });",
  "validated.push(enrichQuestion({ id, category, text, options, correctIndex, explanation, ...(imageUrl ? { imageUrl } : {}) }));");
replaceOnce(server,
  "state.overlay = null;\n        state.pause = null;\n        state.questionStartedAt = null;",
  "state.overlay = null;\n        state.pause = null;\n        state.tiebreak = null;\n        state.scoreAdjustments = [];\n        state.questionStartedAt = null;");
replaceOnce(server,
  "questionSets = initialized.questionSets;\n    dbConnected = initialized.enabled;",
  "questionSets = { adult: (initialized.questionSets.adult || []).map(enrichQuestion), child: (initialized.questionSets.child || []).map(enrichQuestion) };\n    dbConnected = initialized.enabled;");
replaceOnce(server,
  "state.skippedQuestionIds = state.skippedQuestionIds || [];\n      for (const player",
  "state.skippedQuestionIds = state.skippedQuestionIds || [];\n      state.scoreAdjustments = state.scoreAdjustments || [];\n      state.tiebreak = state.tiebreak || null;\n      for (const player");

const admin = 'quiz-app/public/admin.js';
replaceOnce(admin,
  "const excluded = state.players.filter(player => player.excluded);\n  const emergency = [];",
  `const excluded = state.players.filter(player => player.excluded);
  const tied = state.tieCandidates || [];
  const tiebreak = state.phase === 'revealed' && tied.length >= 2
    ? actionButton(\`Entscheidungsfrage für \${tied.map(player => player.name).join(', ')}\`, 'start_tiebreak', 'btn success', {}, 'trophy')
    : '<p class="muted">Nach der letzten Frage erscheint hier eine Entscheidungsrunde, wenn der erste Platz punktgleich ist.</p>';
  const corrections = (state.scoreAdjustments || []).slice(-5).reverse();
  const correctionLog = corrections.length
    ? \`<div class="adjustment-log">\${corrections.map(item => \`<div><strong>\${esc(item.playerName)}</strong> <span class="\${item.delta > 0 ? 'good-text' : 'bad-text'}">\${item.delta > 0 ? '+' : ''}\${item.delta}</span><small>\${esc(item.reason)}</small></div>\`).join('')}</div>\`
    : '<p class="muted">Noch keine manuellen Korrekturen.</p>';
  const emergency = [];`);
replaceOnce(admin,
  "<div class=\"control-group\"><h3>${icon('check')} Quizablauf</h3><div class=\"control-buttons\">${leaderboard}</div></div>",
  "<div class=\"control-group\"><h3>${icon('check')} Quizablauf</h3><div class=\"control-buttons\">${leaderboard}</div></div>\n    <div class=\"control-group\"><h3>${icon('trophy')} Gleichstand</h3><div class=\"control-buttons\">${tiebreak}</div></div>");
replaceOnce(admin,
  "<div class=\"control-group\"><h3>${icon('reset')} Punkte & Sitzung</h3><div class=\"control-buttons\">${actionButton('Punkte zurücksetzen', 'reset_scores', 'btn warning', {}, 'reset')}${actionButton('Quiz zurücksetzen', 'reset_quiz', 'btn danger', {}, 'reset')}${actionButton('Alle Spieler entfernen', 'remove_all_players', 'btn danger', {}, 'users')}</div></div>",
  "<div class=\"control-group\"><h3>${icon('reset')} Punkte & Sitzung</h3><div class=\"control-buttons\">${actionButton('Punkte zurücksetzen', 'reset_scores', 'btn warning', {}, 'reset')}${actionButton('Quiz zurücksetzen', 'reset_quiz', 'btn danger', {}, 'reset')}${actionButton('Alle Spieler entfernen', 'remove_all_players', 'btn danger', {}, 'users')}</div>${correctionLog}</div>");
replaceOnce(admin,
  "els.current.innerHTML = `${questionImageHtml(currentState.question)}<h2>${esc(currentState.question.text)}</h2><div class=\"admin-answer-list\">${currentState.question.options.map((option, index) => `<div class=\"admin-answer ${currentState.phase === 'revealed' && index === currentState.question.correctIndex ? 'correct' : ''}\"><span class=\"answer-letter\">${String.fromCharCode(65 + index)}</span><span>${esc(option)}</span></div>`).join('')}</div>`;",
  "els.current.innerHTML = `${questionImageHtml(currentState.question)}<h2>${esc(currentState.question.text)}</h2><div class=\"admin-answer-list\">${currentState.question.options.map((option, index) => `<div class=\"admin-answer ${currentState.phase === 'revealed' && index === currentState.question.correctIndex ? 'correct' : ''}\"><span class=\"answer-letter\">${String.fromCharCode(65 + index)}</span><span>${esc(option)}</span></div>`).join('')}</div>${currentState.phase === 'revealed' && currentState.question.explanation ? `<div class=\"answer-feedback success\"><strong>Warum?</strong><p>${esc(currentState.question.explanation)}</p></div>` : ''}`;");
replaceOnce(admin,
  "els.answerCount.textContent = `${nextState.responseCount}/${nextState.activePlayerCount} Antworten`;",
  "els.answerCount.textContent = `${nextState.responseCount}/${nextState.answerEligibleCount ?? nextState.activePlayerCount} Antworten`;" );
replaceOnce(admin,
  "return `<tr class=\"${player.excluded ? 'excluded-row' : ''}\"><td>${rank ? `<span class=\"rank-medal ${rankClass(rank)}\">${rank}</span>` : '–'}</td><td><span class=\"connection-state ${statusClass}\"><i></i>${statusLabel}</span></td><td class=\"player-name-cell\">${esc(player.name)}</td><td><strong>${player.score}</strong></td><td>${player.correct}</td><td>${player.wrong}</td><td class=\"latency ${latencyClass(player.latencyMs)}\">${player.latencyMs == null ? '–' : `${player.latencyMs} ms`}</td><td>${player.excluded ? `<button class=\"btn success small\" data-player-action=\"restore_player\" data-player-id=\"${player.id}\">Wiederherstellen</button>` : `<button class=\"btn danger small\" data-player-action=\"exclude_player\" data-player-id=\"${player.id}\">Ausschließen</button>`}</td></tr>`;",
  "return `<tr class=\"${player.excluded ? 'excluded-row' : ''}\"><td>${rank ? `<span class=\"rank-medal ${rankClass(rank)}\">${rank}</span>` : '–'}</td><td><span class=\"connection-state ${statusClass}\"><i></i>${statusLabel}</span></td><td class=\"player-name-cell\">${esc(player.name)}</td><td><strong>${player.score}</strong></td><td>${player.correct}</td><td>${player.wrong}</td><td class=\"latency ${latencyClass(player.latencyMs)}\">${player.latencyMs == null ? '–' : `${player.latencyMs} ms`}</td><td><div class=\"row\"><button class=\"btn secondary small\" data-score-adjust=\"${player.id}\" data-player-name=\"${esc(player.name)}\">Punkte</button>${player.excluded ? `<button class=\"btn success small\" data-player-action=\"restore_player\" data-player-id=\"${player.id}\">Wiederherstellen</button>` : `<button class=\"btn danger small\" data-player-action=\"exclude_player\" data-player-id=\"${player.id}\">Ausschließen</button>`}</div></td></tr>`;" );
replaceOnce(admin,
  "document.querySelector('[data-restore-selected]')?.addEventListener('click', () => { const id = $('#restorePlayerSelect')?.value; if (id) runAction('restore_player', { playerId: id }); });",
  "document.querySelector('[data-restore-selected]')?.addEventListener('click', () => { const id = $('#restorePlayerSelect')?.value; if (id) runAction('restore_player', { playerId: id }); });\n  document.querySelectorAll('[data-score-adjust]').forEach(button => button.addEventListener('click', () => { const raw = prompt(`Punktekorrektur für ${button.dataset.playerName}:\\nPositive Zahl zum Addieren, negative Zahl zum Abziehen.`); if (raw === null) return; const delta = Number(raw); if (!Number.isInteger(delta) || delta === 0) { alert('Bitte eine ganze Zahl ungleich 0 eingeben.'); return; } const reason = prompt('Kurze Begründung für das Protokoll:'); if (!reason) return; runAction('adjust_score', { playerId: button.dataset.scoreAdjust, delta, reason }); }));");
replaceOnce(admin,
  "skip_question: 'Diese Frage wirklich ohne Wertung überspringen?',",
  "skip_question: 'Diese Frage wirklich ohne Wertung überspringen?',\n    start_tiebreak: 'Entscheidungsfrage jetzt nur für die punktgleichen Spieler vorbereiten?',");
replaceOnce(admin,
  "(!search || question.text.toLocaleLowerCase('de').includes(search))",
  "(!search || question.text.toLocaleLowerCase('de').includes(search) || String(question.explanation || '').toLocaleLowerCase('de').includes(search))");
replaceOnce(admin,
  "</div><label>Frage<textarea data-field=\"text\" rows=\"2\">${esc(question.text)}</textarea></label><div class=\"editor-options\">",
  "</div><label>Frage<textarea data-field=\"text\" rows=\"2\">${esc(question.text)}</textarea></label><label>Erklärung nach der Auflösung<textarea data-field=\"explanation\" rows=\"2\" placeholder=\"Warum ist diese Antwort richtig?\">${esc(question.explanation || '')}</textarea></label><div class=\"editor-options\">" );
replaceOnce(admin,
  "correctIndex: 0, imageUrl: '' });",
  "correctIndex: 0, imageUrl: '', explanation: 'Die richtige Antwort ist Antwort A.' });");

const solo = 'quiz-app/public/solo.js';
replaceOnce(solo,
  "${feedbackHtml(currentState)}\n    ${currentState.answered ? `<button id=\"nextSoloButton\"",
  "${feedbackHtml(currentState)}\n    ${currentState.answered && question.explanation ? `<div class=\"solo-explanation answer-feedback success\"><strong>Warum?</strong><p>${escapeHtml(question.explanation)}</p></div>` : ''}\n    ${currentState.answered ? `<button id=\"nextSoloButton\"" );

const soloHtml = 'quiz-app/public/solo.html';
replaceOnce(soloHtml,
  '<link rel="stylesheet" href="/elevenlabs-speech.css">',
  '<link rel="stylesheet" href="/elevenlabs-speech.css">\n  <link rel="stylesheet" href="/solo-profiles.css">');
replaceOnce(soloHtml,
  '<button id="startSoloButton" class="btn primary wide-button" type="button">',
  '<button id="startSoloButton" class="btn primary wide-button" type="button" disabled>');
replaceOnce(soloHtml,
  '<script src="/solo.js"></script>\n  <script src="/elevenlabs-speech.js"></script>',
  '<script src="/solo-profiles.js"></script>\n  <script src="/solo.js"></script>\n  <script src="/elevenlabs-speech.js"></script>');

const screenHtml = 'quiz-app/public/screen.html';
replaceOnce(screenHtml,
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>',
  '<script src="/vendor/qrcode.min.js"></script>');

const screenJs = 'quiz-app/public/screen.js';
replaceOnce(screenJs,
  "const answeredPercent = nextState.activePlayerCount ? Math.round(nextState.responseCount / nextState.activePlayerCount * 100) : 0;",
  "const eligibleCount = nextState.answerEligibleCount ?? nextState.activePlayerCount;\n    const answeredPercent = eligibleCount ? Math.round(nextState.responseCount / eligibleCount * 100) : 0;");
replaceOnce(screenJs,
  "<p class=\"muted\">${nextState.responseCount} Antworten wurden gewertet.</p></div></div>` : `<div class=\"screen-response-line\"><span>${nextState.responseCount} von ${nextState.activePlayerCount} geantwortet</span>",
  "<p class=\"muted\">${nextState.responseCount} Antworten wurden gewertet.</p>${question.explanation ? `<div class=\"answer-feedback success\"><strong>Warum?</strong><p>${esc(question.explanation)}</p></div>` : ''}</div></div>` : `<div class=\"screen-response-line\"><span>${nextState.responseCount} von ${eligibleCount} geantwortet</span>" );
replaceOnce(screenJs,
  "<h2>${esc(nextState.progressLabel)} ist bereit</h2><p class=\"muted\" style=\"font-size:1.35rem\">${nextState.activePlayerCount} Spieler sind verbunden.</p>",
  "<h2>${nextState.tiebreak?.active ? `Entscheidungsrunde ${nextState.tiebreak.round}` : `${esc(nextState.progressLabel)} ist bereit`}</h2><p class=\"muted\" style=\"font-size:1.35rem\">${nextState.tiebreak?.active ? `Nur ${esc((nextState.tiebreak.playerNames || []).join(', '))} spielen diese Frage.` : `${nextState.activePlayerCount} Spieler sind verbunden.`}</p>" );

const player = 'quiz-app/public/player.js';
replaceOnce(player,
  "${responseFeedback(response, revealed, question)}\n  </div>`;",
  "${responseFeedback(response, revealed, question)}\n    ${revealed && question.explanation ? `<div class=\"answer-feedback success\"><strong>Warum?</strong><p>${escapeHtml(question.explanation)}</p></div>` : ''}\n  </div>`;" );
replaceOnce(player,
  "${state.phase !== 'question' || response ? 'disabled' : ''}",
  "${state.phase !== 'question' || response || state.eligibleForQuestion === false ? 'disabled' : ''}");
replaceOnce(player,
  "} else if (state.phase === 'paused') renderPause(state);\n  else if (state.phase === 'question' || state.phase === 'revealed') renderQuestion(state);",
  "} else if (state.tiebreak?.active && state.eligibleForQuestion === false && (state.phase === 'question' || state.phase === 'revealed' || state.phase === 'ready')) {\n    els.view.innerHTML = `<div class=\"big-status\"><div class=\"icon\">👀</div><span class=\"eyebrow\">Entscheidungsrunde</span><h2>Du schaust bei dieser Frage zu</h2><p class=\"muted\">Diese Frage ist nur für ${escapeHtml((state.tiebreak.playerNames || []).join(', '))} bestimmt.</p></div>`;\n  } else if (state.phase === 'paused') renderPause(state);\n  else if (state.phase === 'question' || state.phase === 'revealed') renderQuestion(state);" );

const profileAuth = 'quiz-app/solo-profile-auth.js';
replaceOnce(profileAuth,
  "async function requireProfile(req, res, next) {\n  try {\n    const profile = await profileForRequest(req);",
  "async function requireProfile(req, res, next) {\n  try {\n    if (!storage.enabled()) { req.soloProfile = { id: '00000000-0000-0000-0000-000000000000', name: 'Gast' }; return next(); }\n    const profile = await profileForRequest(req);" );

const pkgPath = path.join(app, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = '7.0.0';
pkg.scripts.check = "node --check server.js && node --check db.js && node --check solo-routes.js && node --check elevenlabs.js && node --check extended-storage.js && node --check solo-profile-auth.js && node --check question-explanations.js && node --check public/player.js && node --check public/admin.js && node --check public/screen.js && node --check public/solo.js && node --check public/elevenlabs-speech.js && node --check public/solo-profiles.js";
pkg.scripts['test:core'] = "node test/core.test.js && node test/solo.test.js && node test/start-page.test.js && node test/elevenlabs.test.js && node test/screen-qr.test.js && node test/v70.test.js";
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

write('quiz-app/test/elevenlabs.test.js', `'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildSpeechText, feedbackPhrase, _test } = require('../elevenlabs');
const question = { id: 'test-1', category: 'Natur & Tiere', text: 'Welches Tier ist das größte Landtier?', options: ['Elefant', 'Pferd', 'Löwe', 'Nashorn'], correctIndex: 0, explanation: 'Der Elefant ist das größte heute lebende Landtier.' };
assert.strictEqual(buildSpeechText(question, 'question'), 'Frage. Welches Tier ist das größte Landtier?');
assert(buildSpeechText(question, 'all').includes('Antwort A. Elefant.'));
assert(buildSpeechText(question, 'result-correct-0').includes('Erklärung.'));
assert(buildSpeechText(question, 'result-correct-0').includes('größte heute lebende Landtier'));
assert.notStrictEqual(feedbackPhrase('correct', 0), feedbackPhrase('correct', 1));
assert(_test.resultScope('result-wrong-2'));
assert(_test.isVoiceReadPermissionError('missing the permission voices_read'));
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'solo.html'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'elevenlabs-speech.js'), 'utf8');
assert(html.includes('/elevenlabs-speech.js'));
assert(client.includes('result-${type}-'));
assert(client.includes('persistentCache'));
console.log('ElevenLabs speech tests passed.');
`);

write('quiz-app/test/v70.test.js', `'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildExplanation, enrichCatalog } = require('../question-explanations');
const { _test: profileTest } = require('../solo-profile-auth');
const root = path.join(__dirname, '..');
for (const type of ['adult', 'child']) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', type + '-questions.json'), 'utf8'));
  const enriched = enrichCatalog(catalog);
  assert.strictEqual(enriched.length, catalog.length);
  enriched.forEach((question, index) => assert(buildExplanation(question).length >= 18, type + ' Frage ' + (index + 1) + ' hat keine brauchbare Erklärung.'));
}
(async () => {
  const secured = await profileTest.makePassword('testpasswort');
  assert(await profileTest.verifyPassword('testpasswort', secured.salt, secured.hash));
  assert(!(await profileTest.verifyPassword('falsch', secured.salt, secured.hash)));
  const token = profileTest.createToken('profile-id');
  assert.strictEqual(profileTest.readToken(token).profileId, 'profile-id');
  const soloHtml = fs.readFileSync(path.join(root, 'public', 'solo.html'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'public', 'admin.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const screen = fs.readFileSync(path.join(root, 'public', 'screen.html'), 'utf8');
  assert(soloHtml.includes('/solo-profiles.js'));
  assert(admin.includes("start_tiebreak"));
  assert(admin.includes('data-score-adjust'));
  assert(server.includes("case 'adjust_score'"));
  assert(server.includes("case 'start_tiebreak'"));
  assert(screen.includes('/vendor/qrcode.min.js'));
  assert(!screen.includes('cdnjs.cloudflare.com'));
  console.log('Version 7 profile, explanation and live-admin tests passed.');
})().catch(error => { console.error(error); process.exit(1); });
`);

const qrTest = 'quiz-app/test/screen-qr.test.js';
let qrContent = read(qrTest);
qrContent = qrContent.replace("assert(html.includes('qrcode-generator/1.4.4/qrcode.min.js'), 'QR-Code-Bibliothek fehlt auf der Beamerseite.');", "assert(html.includes('/vendor/qrcode.min.js'), 'Lokale QR-Code-Bibliothek fehlt auf der Beamerseite.');");
write(qrTest, qrContent);

fs.rmSync(path.join(root, 'tools', 'apply-v70.js'));
fs.rmSync(path.join(root, '.github', 'workflows', 'apply-v70.yml'));
console.log('Version 7 wurde angewendet.');
