'use strict';
const $ = selector => document.querySelector(selector);
const els = {
  login: $('#adminLogin'), password: $('#adminPassword'), loginButton: $('#adminLoginButton'), loginMessage: $('#adminLoginMessage'), dashboard: $('#dashboard'),
  connection: $('#adminConnection'), connectionText: $('#adminConnectionText'), dbStatus: $('#dbStatus'), dbStatusDot: $('#dbStatusDot'), phase: $('#phaseStatus'), logout: $('#logoutButton'),
  openLive: $('#openLiveView'), setupView: $('#setupView'), liveView: $('#liveQuizView'), showSetup: $('#showSetupView'),
  navSetup: $('#navSetup'), navLive: $('#navLive'), navHistory: $('#navHistory'), navEditor: $('#navEditor'), quickHistory: $('#quickHistoryButton'),
  pageTitle: $('#adminPageTitle'), headerMeta: $('#headerQuizMeta'), sidebarPlayers: $('#sidebarPlayerCount'), historySection: $('#historySection'),
  quizType: $('#quizType'), category: $('#category'), count: $('#questionCount'), prepare: $('#prepareButton'), catalogInfo: $('#catalogInfo'), prepareMessage: $('#prepareMessage'),
  actionMessage: $('#actionMessage'), progress: $('#progressLabel'), answerCount: $('#answerCount'), categoryBadge: $('#questionCategoryBadge'), current: $('#currentQuestion'), primary: $('#primaryQuizButton'),
  adminTimer: $('#adminTimer'), adminTimerRing: $('#adminTimerRing'), timerCaption: $('#timerCaption'), liveSummary: $('#liveQuizSummary'), controls: $('#liveControls'), insight: $('#liveInsight'),
  playerCount: $('#playerCount'), players: $('#playersBody'), editorPanel: $('#editorPanel'), editorTitle: $('#editorTitle'), editorCategory: $('#editorCategory'), editorSearch: $('#editorSearch'), editorList: $('#editorList'), editorMessage: $('#editorMessage'), reloadEditor: $('#reloadEditor'), closeEditor: $('#closeEditor'), addQuestion: $('#addQuestion'), saveQuestions: $('#saveQuestions'),
  historyList: $('#historyList'), reloadHistory: $('#reloadHistory'), compareHistory: $('#compareHistory'), historyDetail: $('#historyDetail'),
};
let state = null;
let socket = null;
let busy = false;
let editorType = 'adult';
let editorQuestions = [];
let historyRuns = [];
let viewMode = 'setup';
let timerHandle = null;
let clockOffsetMs = 0;
const phaseNames = { lobby: 'Warteraum', ready: 'Frage bereit', question: 'Frage läuft', revealed: 'Aufgelöst', paused: 'Pause', finished: 'Beendet' };

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function icon(name) {
  const paths = {
    play: '<polygon points="5 3 19 12 5 21 5 3"></polygon>',
    check: '<path d="m5 12 4 4L19 6"></path>',
    next: '<path d="m5 4 10 8-10 8V4z"></path><path d="M19 5v14"></path>',
    trophy: '<path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"></path><path d="M7 6H4v2a4 4 0 0 0 4 4"></path><path d="M17 6h3v2a4 4 0 0 1-4 4"></path>',
    rotate: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v6h6"></path>',
    skip: '<path d="m5 4 10 8-10 8V4z"></path><path d="M19 5v14"></path>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect>',
    resume: '<polygon points="7 4 19 12 7 20 7 4"></polygon>',
    chart: '<path d="M4 19V9"></path><path d="M10 19V5"></path><path d="M16 19v-7"></path><path d="M22 19V3"></path>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v6h6"></path>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    restore: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v6h6"></path><path d="M12 8v8"></path><path d="M8 12h8"></path>',
    alert: '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
    clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21h-4v-.09a1.7 1.7 0 0 0-1.1-1.51 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.36.36.7.6 1 .29.29.64.43 1 .4H21v4h-.09A1.7 1.7 0 0 0 19.4 15z"></path>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="9" r="1.5"></circle><path d="m21 15-5-5L5 20"></path>',
  };
  return `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.settings}</svg>`;
}
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Fehler ${response.status}`);
  return data;
}
function commandId() { return `${Date.now()}-${crypto.randomUUID()}`; }
function setBusy(value) {
  busy = value;
  document.querySelectorAll('#dashboard button').forEach(button => { if (!button.dataset.always) button.disabled = value; });
  renderPrimaryButton();
}
function latencyClass(ms) { if (ms == null) return ''; if (ms < 100) return 'good'; if (ms < 250) return 'medium'; return 'bad'; }
function rankClass(rank) { return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : ''; }
function actionButton(label, action, css = 'btn', extra = {}, iconName = 'settings') {
  const data = Object.entries(extra).filter(([, value]) => value !== undefined).map(([key, value]) => `data-${key}="${esc(value)}"`).join(' ');
  return `<button class="${css}" data-action="${action}" ${data}>${icon(iconName)}<span>${esc(label)}</span></button>`;
}
function formatPause(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function setNavActive(mode) {
  [els.navSetup, els.navLive, els.navHistory, els.navEditor].forEach(node => node?.classList.remove('active'));
  if (mode === 'live') els.navLive?.classList.add('active');
  else if (!els.editorPanel.classList.contains('hidden')) els.navEditor?.classList.add('active');
  else els.navSetup?.classList.add('active');
}
function showView(mode) {
  viewMode = mode;
  els.setupView.classList.toggle('hidden', mode !== 'setup');
  els.liveView.classList.toggle('hidden', mode !== 'live');
  els.openLive.classList.toggle('hidden', !state?.preparedAt || mode === 'live');
  els.pageTitle.textContent = mode === 'live' ? 'Live-Quiz' : 'Quiz vorbereiten';
  setNavActive(mode);
  if (mode === 'live') window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderPrepare() {
  if (!state) return;
  const type = els.quizType.value || state.quizType || 'adult';
  const categories = state.categories?.[type] || [];
  const oldCategory = els.category.value;
  els.category.innerHTML = ['Gemischt', ...categories].map(category => `<option>${esc(category)}</option>`).join('');
  els.category.value = [...els.category.options].some(option => option.value === oldCategory) ? oldCategory : 'Gemischt';
  const category = els.category.value;
  const catalogMax = category === 'Gemischt' ? (state.catalogSizes?.[type] || 0) : Math.max(0, state.categoryCounts?.[type]?.[category] || 0);
  const standard = [10, 20, 25, 30, 50, 75, 100, 150, 200, 250, 300];
  const values = standard.filter(value => value <= catalogMax);
  if (catalogMax && !values.includes(catalogMax)) values.push(catalogMax);
  const prior = Number(els.count.value || 25);
  els.count.innerHTML = [...new Set(values)].sort((a, b) => a - b).map(value => `<option value="${value}">${value} Fragen</option>`).join('');
  els.count.value = values.includes(prior) ? String(prior) : (values.includes(25) ? '25' : String(values.at(-1) || 1));
  els.catalogInfo.textContent = `${state.catalogSizes?.[type] || 0} Fragen verfügbar`;
}
function primaryAction() {
  if (!state) return null;
  if (state.phase === 'ready') return { label: state.currentIndex === 0 ? 'Quiz starten' : 'Frage starten', action: 'start_question', icon: 'play' };
  if (state.phase === 'question') return { label: 'Frage stoppen und auflösen', action: 'reveal_question', icon: 'check' };
  if (state.phase === 'revealed') return state.currentIndex + 1 >= state.questionCount
    ? { label: 'Quiz beenden', action: 'finish_quiz', icon: 'trophy' }
    : { label: 'Nächste Frage vorbereiten', action: 'next_question', icon: 'next' };
  if (state.phase === 'paused') return { label: 'Pause sofort beenden', action: 'resume_pause', icon: 'resume' };
  return null;
}
function renderPrimaryButton() {
  const primary = primaryAction();
  els.primary.classList.toggle('hidden', !primary);
  if (!primary) return;
  els.primary.innerHTML = `${icon(primary.icon)}<span>${esc(primary.label)}</span>`;
  els.primary.dataset.action = primary.action;
  els.primary.disabled = busy;
}
function controlSections() {
  if (!state) return '';
  const phase = state.phase;
  const excluded = state.players.filter(player => player.excluded);
  const tied = state.tieCandidates || [];
  const tiebreak = state.phase === 'revealed' && tied.length >= 2
    ? actionButton(`Entscheidungsfrage für ${tied.map(player => player.name).join(', ')}`, 'start_tiebreak', 'btn success', {}, 'trophy')
    : '<p class="muted">Nach der letzten Frage erscheint hier eine Entscheidungsrunde, wenn der erste Platz punktgleich ist.</p>';
  const corrections = (state.scoreAdjustments || []).slice(-5).reverse();
  const correctionLog = corrections.length
    ? `<div class="adjustment-log">${corrections.map(item => `<div><strong>${esc(item.playerName)}</strong> <span class="${item.delta > 0 ? 'good-text' : 'bad-text'}">${item.delta > 0 ? '+' : ''}${item.delta}</span><small>${esc(item.reason)}</small></div>`).join('')}</div>`
    : '<p class="muted">Noch keine manuellen Korrekturen.</p>';
  const emergency = [];
  if (['question', 'revealed'].includes(phase)) emergency.push(actionButton('Laufende Frage abbrechen & wiederholen', 'repeat_question', 'btn danger', {}, 'rotate'));
  if (['ready', 'question', 'revealed'].includes(phase)) emergency.push(actionButton('Einzelne Frage überspringen', 'skip_question', 'btn warning', {}, 'skip'));
  const leaderboard = !['question', 'paused', 'lobby'].includes(phase)
    ? actionButton(state.overlay ? 'Zwischenstand ausblenden' : 'Zwischenstand einblenden', state.overlay ? 'hide_leaderboard' : 'show_leaderboard', 'btn secondary', {}, 'chart')
    : '<p class="muted">Nach einer aufgelösten Frage verfügbar.</p>';
  const pause = phase === 'paused'
    ? actionButton('Pause abbrechen', 'resume_pause', 'btn danger', {}, 'resume')
    : !['lobby', 'finished'].includes(phase)
      ? `<div class="muted">Pausendauer auswählen</div><div class="pause-choice">${actionButton('5 Min', 'pause', 'btn success', { minutes: 5 }, 'pause')}${actionButton('10 Min', 'pause', 'btn success', { minutes: 10 }, 'pause')}${actionButton('15 Min', 'pause', 'btn success', { minutes: 15 }, 'pause')}</div>`
      : '<p class="muted">Aktuell keine Pause möglich.</p>';
  const restore = excluded.length
    ? `<div class="restore-row"><select id="restorePlayerSelect">${excluded.map(player => `<option value="${player.id}">${esc(player.name)}</option>`).join('')}</select><button class="btn success" data-restore-selected="true">${icon('restore')}<span>Spieler wiederherstellen</span></button></div>`
    : '<p class="muted">Kein Spieler ist ausgeschlossen.</p>';
  return `
    <div class="control-group"><h3>${icon('check')} Quizablauf</h3><div class="control-buttons">${leaderboard}</div></div>
    <div class="control-group"><h3>${icon('trophy')} Gleichstand</h3><div class="control-buttons">${tiebreak}</div></div>
    <div class="control-group"><h3>${icon('alert')} Notfall & Aktionen</h3><div class="control-buttons">${emergency.join('') || '<p class="muted">Während einer Frage verfügbar.</p>'}</div></div>
    <div class="control-group"><h3>${icon('clock')} Quizpause</h3><div class="control-buttons">${pause}</div></div>
    <div class="control-group"><h3>${icon('reset')} Punkte & Sitzung</h3><div class="control-buttons">${actionButton('Punkte zurücksetzen', 'reset_scores', 'btn warning', {}, 'reset')}${actionButton('Quiz zurücksetzen', 'reset_quiz', 'btn danger', {}, 'reset')}${actionButton('Alle Spieler entfernen', 'remove_all_players', 'btn danger', {}, 'users')}</div>${correctionLog}</div>
    <div class="control-group"><h3>${icon('restore')} Ausgeschlossene Spieler</h3>${restore}</div>`;
}
function questionImageHtml(question, css = 'question-image') {
  const url = String(question?.imageUrl || '').trim();
  return url ? `<img class="${css}" src="${esc(url)}" alt="Optionales Bild zur Quizfrage" loading="lazy">` : '';
}
function renderQuestion() {
  const currentState = state;
  if (!currentState?.question) {
    els.categoryBadge.textContent = 'Noch nicht vorbereitet';
    els.current.innerHTML = '<div class="big-status compact"><div class="icon">?</div><h3>Noch kein Quiz vorbereitet</h3><p class="muted">Wähle in der Vorbereitung einen Fragenkatalog aus.</p></div>';
    return;
  }
  els.categoryBadge.textContent = currentState.question.category;
  els.current.innerHTML = `${questionImageHtml(currentState.question)}<h2>${esc(currentState.question.text)}</h2><div class="admin-answer-list">${currentState.question.options.map((option, index) => `<div class="admin-answer ${currentState.phase === 'revealed' && index === currentState.question.correctIndex ? 'correct' : ''}"><span class="answer-letter">${String.fromCharCode(65 + index)}</span><span>${esc(option)}</span></div>`).join('')}</div>${currentState.phase === 'revealed' && currentState.question.explanation ? `<div class="answer-feedback success"><strong>Warum?</strong><p>${esc(currentState.question.explanation)}</p></div>` : ''}`;
}
function distributionHtml(distribution) {
  const rows = distribution || [];
  const values = [0, 1, 2, 3].map(index => Number(rows.find(row => row.index === index)?.percent || 0));
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  return `<div class="distribution-layout"><div class="donut-chart" style="--a:${values[0]};--b:${values[1]};--c:${values[2]};--d:${values[3]}"><div class="donut-center"><strong>${total}</strong><span>Antworten</span></div></div><div class="dist-legend">${rows.map(row => `<div class="legend-row ${row.correct ? 'correct' : ''}"><span class="legend-letter">${String.fromCharCode(65 + row.index)}</span><span title="${esc(row.label)}">${esc(row.label)}</span><strong>${row.count} · ${row.percent}%</strong></div>`).join('')}</div></div>`;
}
function renderInsight() {
  if (!state) return;
  if (state.phase === 'revealed' && state.distribution) {
    els.insight.innerHTML = `<span class="eyebrow">Antwortanalyse</span><h3>Antwortverteilung</h3>${distributionHtml(state.distribution)}`;
    return;
  }
  const active = Number(state.activePlayerCount || 0);
  const answered = Number(state.responseCount || 0);
  const percent = active ? Math.round(answered / active * 100) : 0;
  els.insight.innerHTML = `<span class="eyebrow">Live-Statistik</span><h3>${answered} von ${active} geantwortet</h3><div class="quiz-progress-track"><span style="--width:${percent}%"></span></div><div class="insight-empty">${state.phase === 'question' ? `<div><strong style="font-size:2.4rem">${percent}%</strong><p>Antwortquote der laufenden Frage</p></div>` : '<div><p>Nach dem Auflösen erscheint hier die Antwortverteilung.</p></div>'}</div>`;
}
function renderPlayers() {
  const rankById = new Map((state.leaderboard || []).map(player => [player.id, player.rank]));
  els.playerCount.textContent = `${state.players.length} registriert · ${state.activePlayerCount} aktiv`;
  els.sidebarPlayers.textContent = String(state.activePlayerCount || 0);
  els.players.innerHTML = state.players.map(player => {
    const rank = player.excluded ? null : rankById.get(player.id);
    const statusClass = player.excluded ? 'excluded' : player.connected ? 'online' : '';
    const statusLabel = player.excluded ? 'Ausgeschlossen' : player.connected ? 'Online' : 'Offline';
    return `<tr class="${player.excluded ? 'excluded-row' : ''}"><td>${rank ? `<span class="rank-medal ${rankClass(rank)}">${rank}</span>` : '–'}</td><td><span class="connection-state ${statusClass}"><i></i>${statusLabel}</span></td><td class="player-name-cell">${esc(player.name)}</td><td><strong>${player.score}</strong></td><td>${player.correct}</td><td>${player.wrong}</td><td class="latency ${latencyClass(player.latencyMs)}">${player.latencyMs == null ? '–' : `${player.latencyMs} ms`}</td><td><div class="row"><button class="btn secondary small" data-score-adjust="${player.id}" data-player-name="${esc(player.name)}">Punkte</button>${player.excluded ? `<button class="btn success small" data-player-action="restore_player" data-player-id="${player.id}">Wiederherstellen</button>` : `<button class="btn danger small" data-player-action="exclude_player" data-player-id="${player.id}">Ausschließen</button>`}</div></td></tr>`;
  }).join('') || '<tr><td colspan="8" class="muted">Noch keine Teilnehmer angemeldet.</td></tr>';
}
function renderState(nextState) {
  state = nextState;
  clockOffsetMs = Number(nextState.serverNow || Date.now()) - Date.now();
  els.login.classList.add('hidden');
  els.dashboard.classList.remove('hidden');
  els.dbStatus.textContent = nextState.databaseConnected ? 'Verbunden' : 'Nicht verbunden';
  els.dbStatusDot.className = `status-dot ${nextState.databaseConnected ? 'online' : 'offline'}`;
  els.phase.textContent = phaseNames[nextState.phase] || nextState.phase;
  els.progress.textContent = nextState.progressLabel || 'Noch nicht vorbereitet';
  els.answerCount.textContent = `${nextState.responseCount}/${nextState.answerEligibleCount ?? nextState.activePlayerCount} Antworten`;
  els.liveSummary.textContent = nextState.preparedAt ? `${nextState.quizType === 'adult' ? 'Erwachsenenquiz' : 'Kinderquiz'} · ${nextState.category} · ${nextState.questionCount} Fragen` : 'Noch kein Quiz vorbereitet';
  els.headerMeta.textContent = els.liveSummary.textContent;
  renderQuestion();
  renderPrimaryButton();
  els.controls.innerHTML = controlSections();
  renderInsight();
  renderPlayers();
  renderPrepare();
  bindDynamic();
  if (nextState.preparedAt && viewMode === 'setup' && !els.editorPanel.classList.contains('hidden')) {
    // Im Editor bleiben.
  } else if (nextState.preparedAt && viewMode === 'setup' && !window.__manualSetup) {
    showView('live');
  }
  els.openLive.classList.toggle('hidden', !nextState.preparedAt || viewMode === 'live');
  resetAdminTimer();
}
function bindDynamic() {
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => confirmAndRun(button.dataset.action, { minutes: button.dataset.minutes ? Number(button.dataset.minutes) : undefined })));
  document.querySelectorAll('[data-player-action]').forEach(button => button.addEventListener('click', () => runAction(button.dataset.playerAction, { playerId: button.dataset.playerId })));
  document.querySelector('[data-restore-selected]')?.addEventListener('click', () => { const id = $('#restorePlayerSelect')?.value; if (id) runAction('restore_player', { playerId: id }); });
  document.querySelectorAll('[data-score-adjust]').forEach(button => button.addEventListener('click', () => { const raw = prompt(`Punktekorrektur für ${button.dataset.playerName}:\nPositive Zahl zum Addieren, negative Zahl zum Abziehen.`); if (raw === null) return; const delta = Number(raw); if (!Number.isInteger(delta) || delta === 0) { alert('Bitte eine ganze Zahl ungleich 0 eingeben.'); return; } const reason = prompt('Kurze Begründung für das Protokoll:'); if (!reason) return; runAction('adjust_score', { playerId: button.dataset.scoreAdjust, delta, reason }); }));
}
function confirmAndRun(action, extra = {}) {
  const messages = {
    reset_scores: 'Alle Punkte und Spielerstatistiken wirklich auf 0 setzen?',
    reset_quiz: 'Das vorbereitete Quiz wirklich vollständig zurücksetzen?',
    remove_all_players: 'Wirklich alle Spieler entfernen? Die Teilnehmer müssen sich danach neu anmelden.',
    skip_question: 'Diese Frage wirklich ohne Wertung überspringen?',
    start_tiebreak: 'Entscheidungsfrage jetzt nur für die punktgleichen Spieler vorbereiten?',
  };
  if (messages[action] && !confirm(messages[action])) return;
  runAction(action, extra);
}
async function runAction(action, extra = {}) {
  if (busy) return;
  setBusy(true);
  els.actionMessage.textContent = '';
  try { await api('/api/admin/action', { method: 'POST', body: JSON.stringify({ action, commandId: commandId(), ...extra }) }); }
  catch (error) { els.actionMessage.textContent = error.message; }
  finally { setBusy(false); }
}
async function prepare() {
  setBusy(true);
  els.prepareMessage.textContent = '';
  try {
    const prepared = await api('/api/admin/prepare', { method: 'POST', body: JSON.stringify({ quizType: els.quizType.value, category: els.category.value, questionCount: Number(els.count.value) }) });
    window.__manualSetup = false;
    renderState(prepared);
    showView('live');
  } catch (error) { els.prepareMessage.textContent = error.message; }
  finally { setBusy(false); }
}
function connect() {
  socket?.disconnect();
  socket = io({ auth: { role: 'admin' } });
  socket.on('connect', () => { els.connection.className = 'status-dot online'; els.connectionText.textContent = 'Verbunden'; });
  socket.on('disconnect', () => { els.connection.className = 'status-dot offline'; els.connectionText.textContent = 'Getrennt'; });
  socket.on('admin_state', renderState);
  socket.on('auth_error', message => { els.loginMessage.textContent = message; els.dashboard.classList.add('hidden'); els.login.classList.remove('hidden'); });
}
async function login() {
  els.loginButton.disabled = true;
  try { const data = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: els.password.value }) }); renderState(data.state); connect(); loadHistory(); }
  catch (error) { els.loginMessage.textContent = error.message; }
  finally { els.loginButton.disabled = false; }
}
async function init() { try { const initialState = await api('/api/admin/state'); renderState(initialState); connect(); loadHistory(); } catch { /* Login wird angezeigt. */ } }
function resetAdminTimer() { clearInterval(timerHandle); timerHandle = setInterval(updateAdminTimer, 100); updateAdminTimer(); }
function updateAdminTimer() {
  if (!state) return;
  els.adminTimer.classList.remove('critical');
  if (state.phase === 'paused') {
    const remaining = (state.pause?.until || 0) - (Date.now() + clockOffsetMs);
    els.adminTimer.textContent = formatPause(remaining);
    els.adminTimer.classList.add('pause');
    els.timerCaption.textContent = 'Verbleibende Quizpause';
    els.adminTimerRing.style.setProperty('--progress', '1');
    return;
  }
  els.adminTimer.classList.remove('pause');
  if (state.phase !== 'question') {
    els.adminTimer.textContent = String(state.questionDurationSec || 20);
    els.timerCaption.textContent = state.phase === 'revealed' ? 'Frage beendet' : state.phase === 'ready' ? 'Bereit zum Start' : 'Keine laufende Frage';
    els.adminTimerRing.style.setProperty('--progress', state.phase === 'revealed' ? '0' : '1');
    return;
  }
  const remaining = Math.max(0, state.questionDurationSec * 1000 - ((Date.now() + clockOffsetMs) - state.questionStartedAt));
  els.adminTimer.textContent = String(Math.ceil(remaining / 1000));
  els.timerCaption.textContent = 'Sekunden verbleibend';
  els.adminTimerRing.style.setProperty('--progress', String(remaining / (state.questionDurationSec * 1000)));
  els.adminTimer.classList.toggle('critical', remaining <= 5000);
}

// Editor
async function openEditor(type) {
  editorType = type;
  showView('setup');
  window.__manualSetup = true;
  els.editorPanel.classList.remove('hidden');
  setNavActive('editor');
  els.pageTitle.textContent = 'Frageneditor';
  els.editorPanel.scrollIntoView({ behavior: 'smooth' });
  await loadEditor();
}
async function loadEditor() {
  els.editorMessage.textContent = 'Lade Fragen …';
  try {
    const data = await api(`/api/admin/questions?type=${editorType}`);
    editorQuestions = data.questions;
    els.editorTitle.textContent = editorType === 'adult' ? 'Erwachsenenquiz bearbeiten' : 'Kinderquiz bearbeiten';
    const categories = [...new Set(editorQuestions.map(question => question.category))].sort((a, b) => a.localeCompare(b, 'de'));
    els.editorCategory.innerHTML = ['Alle', ...categories].map(category => `<option>${esc(category)}</option>`).join('');
    els.editorMessage.textContent = `${editorQuestions.length} Fragen geladen.`;
    renderEditor();
    renderPrepare();
  } catch (error) { els.editorMessage.textContent = error.message; }
}
function renderEditor() {
  const category = els.editorCategory.value || 'Alle';
  const search = els.editorSearch.value.trim().toLocaleLowerCase('de');
  const filtered = editorQuestions.map((question, index) => ({ question, index })).filter(({ question }) => (category === 'Alle' || question.category === category) && (!search || question.text.toLocaleLowerCase('de').includes(search) || String(question.explanation || '').toLocaleLowerCase('de').includes(search)));
  els.editorList.innerHTML = filtered.map(({ question, index }) => `<article class="editor-item" data-editor-index="${index}"><div class="row between"><strong>Frage ${index + 1}</strong><button class="btn danger small" data-delete-question="${index}">Löschen</button></div><div class="form-grid three"><label>Kategorie<input data-field="category" value="${esc(question.category)}"></label><label style="grid-column:span 2">Optionaler Bildlink<input data-field="imageUrl" value="${esc(question.imageUrl || '')}" placeholder="Leer lassen: Frage ohne Bild"></label></div><label>Frage<textarea data-field="text" rows="2">${esc(question.text)}</textarea></label><label>Erklärung nach der Auflösung<textarea data-field="explanation" rows="2" placeholder="Warum ist diese Antwort richtig?">${esc(question.explanation || '')}</textarea></label><div class="editor-options">${question.options.map((option, optionIndex) => `<label>Antwort ${String.fromCharCode(65 + optionIndex)}<input data-option="${optionIndex}" value="${esc(option)}"></label>`).join('')}</div><label>Richtige Antwort<select data-field="correctIndex">${[0, 1, 2, 3].map(optionIndex => `<option value="${optionIndex}" ${question.correctIndex === optionIndex ? 'selected' : ''}>${String.fromCharCode(65 + optionIndex)}</option>`).join('')}</select></label></article>`).join('') || '<p class="muted">Keine Fragen für diesen Filter.</p>';
  document.querySelectorAll('[data-editor-index]').forEach(card => {
    const index = Number(card.dataset.editorIndex);
    card.querySelectorAll('[data-field]').forEach(node => node.addEventListener('input', () => { editorQuestions[index][node.dataset.field] = node.dataset.field === 'correctIndex' ? Number(node.value) : node.value; }));
    card.querySelectorAll('[data-option]').forEach(node => node.addEventListener('input', () => { editorQuestions[index].options[Number(node.dataset.option)] = node.value; }));
  });
  document.querySelectorAll('[data-delete-question]').forEach(button => button.addEventListener('click', () => { editorQuestions.splice(Number(button.dataset.deleteQuestion), 1); renderEditor(); }));
}
function addQuestion() {
  const category = els.editorCategory.value && els.editorCategory.value !== 'Alle' ? els.editorCategory.value : 'Allgemeinwissen';
  editorQuestions.unshift({ id: `${editorType}-custom-${crypto.randomUUID()}`, category, text: 'Neue Frage', options: ['Antwort A', 'Antwort B', 'Antwort C', 'Antwort D'], correctIndex: 0, imageUrl: '', explanation: 'Die richtige Antwort ist Antwort A.' });
  els.editorCategory.value = 'Alle';
  renderEditor();
}
async function saveEditor() {
  setBusy(true);
  els.editorMessage.textContent = 'Speichere …';
  try { await api('/api/admin/questions', { method: 'PUT', body: JSON.stringify({ type: editorType, questions: editorQuestions }) }); els.editorMessage.textContent = 'Alle Änderungen wurden dauerhaft in Neon gespeichert.'; await loadEditor(); }
  catch (error) { els.editorMessage.textContent = error.message; }
  finally { setBusy(false); }
}

// Historie
async function loadHistory() {
  try {
    historyRuns = await api('/api/admin/history');
    els.historyList.innerHTML = historyRuns.map(run => `<div class="history-item"><div class="row between"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" class="history-check" value="${run.id}" style="width:auto"><strong>${new Date(run.finishedAt).toLocaleString('de-DE')}</strong></label><span class="info-chip">${run.quizType === 'adult' ? 'Erwachsene' : 'Kinder'}</span></div><div class="muted">${esc(run.category)} · ${run.questionCount} Fragen · ${run.playerCount} Spieler${run.winner ? ` · Sieger: ${esc(run.winner)}` : ''}</div><div class="row" style="margin-top:10px"><button class="btn ghost small" data-history-open="${run.id}">Öffnen</button><button class="btn danger small" data-history-delete="${run.id}">Löschen</button></div></div>`).join('') || '<p class="muted">Noch keine Quizabende gespeichert.</p>';
    document.querySelectorAll('[data-history-open]').forEach(button => button.addEventListener('click', () => openHistory(Number(button.dataset.historyOpen))));
    document.querySelectorAll('[data-history-delete]').forEach(button => button.addEventListener('click', () => deleteHistory(Number(button.dataset.historyDelete))));
  } catch (error) { els.historyList.innerHTML = `<p class="bad-text">${esc(error.message)}</p>`; }
}
function runStats(run) {
  const board = run.leaderboard || [];
  return { players: board.length, avgScore: board.length ? Math.round(board.reduce((sum, player) => sum + player.score, 0) / board.length) : 0, avgCorrect: board.length ? (board.reduce((sum, player) => sum + player.correct, 0) / board.length).toFixed(1) : '0.0', winner: board[0]?.name || '–' };
}
function csvFor(run) {
  const lines = [['Platz', 'Name', 'Punkte', 'Richtig', 'Falsch', 'Keine Antwort'], ...(run.leaderboard || []).map(player => [player.rank, player.name, player.score, player.correct, player.wrong, player.unanswered])];
  return lines.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
}
function download(name, text) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}
async function openHistory(id) {
  const run = await api(`/api/admin/history/${id}`);
  const stats = runStats(run);
  els.historyDetail.classList.remove('hidden');
  els.historyDetail.innerHTML = `<div class="panel-heading"><div><span class="eyebrow">Detailansicht</span><h2>Quiz vom ${new Date(run.finishedAt).toLocaleString('de-DE')}</h2></div><button id="closeHistoryDetail" class="btn danger small">Schließen</button></div><div class="form-grid three"><div class="history-item"><strong>${stats.players}</strong><div class="muted">Spieler</div></div><div class="history-item"><strong>${stats.avgScore}</strong><div class="muted">Ø Punkte</div></div><div class="history-item"><strong>${stats.avgCorrect}</strong><div class="muted">Ø richtige Antworten</div></div></div><div class="row" style="margin:14px 0"><button id="downloadHistoryCsv" class="btn secondary">CSV herunterladen</button></div><div class="table-wrap"><table class="data"><thead><tr><th>Platz</th><th>Name</th><th>Punkte</th><th>Richtig</th><th>Falsch</th><th>Ohne Antwort</th></tr></thead><tbody>${(run.leaderboard || []).map(player => `<tr><td>${player.rank}</td><td>${esc(player.name)}</td><td>${player.score}</td><td>${player.correct}</td><td>${player.wrong}</td><td>${player.unanswered}</td></tr>`).join('')}</tbody></table></div>`;
  $('#closeHistoryDetail').onclick = () => els.historyDetail.classList.add('hidden');
  $('#downloadHistoryCsv').onclick = () => download(`quiz-${id}.csv`, csvFor(run));
  els.historyDetail.scrollIntoView({ behavior: 'smooth' });
}
async function deleteHistory(id) { if (!confirm('Diesen gespeicherten Quizabend wirklich löschen?')) return; await api(`/api/admin/history/${id}`, { method: 'DELETE' }); loadHistory(); }
async function compareHistory() {
  const ids = [...document.querySelectorAll('.history-check:checked')].map(node => Number(node.value));
  if (ids.length !== 2) { alert('Bitte genau zwei Quizabende auswählen.'); return; }
  const [a, b] = await Promise.all(ids.map(id => api(`/api/admin/history/${id}`)));
  const statsA = runStats(a); const statsB = runStats(b);
  const names = new Set([...(a.leaderboard || []).map(player => player.name), ...(b.leaderboard || []).map(player => player.name)]);
  const rows = [...names].sort((x, y) => x.localeCompare(y, 'de')).map(name => { const playerA = (a.leaderboard || []).find(player => player.name === name); const playerB = (b.leaderboard || []).find(player => player.name === name); return `<tr><td>${esc(name)}</td><td>${playerA?.score ?? '–'}</td><td>${playerB?.score ?? '–'}</td><td>${playerA && playerB ? `${playerB.score - playerA.score > 0 ? '+' : ''}${playerB.score - playerA.score}` : '–'}</td></tr>`; }).join('');
  els.historyDetail.classList.remove('hidden');
  els.historyDetail.innerHTML = `<div class="panel-heading"><div><span class="eyebrow">Direktvergleich</span><h2>Quizvergleich</h2></div><button id="closeCompare" class="btn danger small">Schließen</button></div><div class="form-grid three"><div class="history-item"><h3>${new Date(a.finishedAt).toLocaleDateString('de-DE')}</h3><p>${statsA.players} Spieler · Ø ${statsA.avgScore} Punkte · Sieger ${esc(statsA.winner)}</p></div><div class="history-item"><h3>${new Date(b.finishedAt).toLocaleDateString('de-DE')}</h3><p>${statsB.players} Spieler · Ø ${statsB.avgScore} Punkte · Sieger ${esc(statsB.winner)}</p></div><div class="history-item"><h3>Differenz</h3><p>${statsB.avgScore - statsA.avgScore > 0 ? '+' : ''}${statsB.avgScore - statsA.avgScore} Ø Punkte</p></div></div><div class="table-wrap"><table class="data"><thead><tr><th>Spieler</th><th>Quiz A</th><th>Quiz B</th><th>Differenz</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  $('#closeCompare').onclick = () => els.historyDetail.classList.add('hidden');
  els.historyDetail.scrollIntoView({ behavior: 'smooth' });
}

els.loginButton.onclick = login;
els.password.addEventListener('keydown', event => { if (event.key === 'Enter') login(); });
els.logout.onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.reload(); };
els.prepare.onclick = prepare;
els.quizType.onchange = renderPrepare;
els.category.onchange = renderPrepare;
els.primary.onclick = () => { const action = els.primary.dataset.action; if (action) confirmAndRun(action); };
els.showSetup.onclick = () => { window.__manualSetup = true; showView('setup'); };
els.openLive.onclick = () => { window.__manualSetup = false; showView('live'); };
els.navSetup.onclick = () => { window.__manualSetup = true; els.editorPanel.classList.add('hidden'); showView('setup'); };
els.navLive.onclick = () => { if (!state?.preparedAt) { els.prepareMessage.textContent = 'Bitte zuerst ein Quiz vorbereiten.'; showView('setup'); return; } window.__manualSetup = false; showView('live'); };
els.navHistory.onclick = () => { window.__manualSetup = true; els.editorPanel.classList.add('hidden'); showView('setup'); els.pageTitle.textContent = 'Vergangene Quizze'; els.navSetup.classList.remove('active'); els.navHistory.classList.add('active'); els.historySection.scrollIntoView({ behavior: 'smooth' }); };
els.navEditor.onclick = () => openEditor(editorType);
els.quickHistory.onclick = () => { showView('setup'); els.historySection.scrollIntoView({ behavior: 'smooth' }); };
document.querySelectorAll('[data-open-editor]').forEach(button => button.onclick = () => openEditor(button.dataset.openEditor));
els.closeEditor.onclick = () => { els.editorPanel.classList.add('hidden'); els.pageTitle.textContent = 'Quiz vorbereiten'; setNavActive('setup'); };
els.reloadEditor.onclick = loadEditor;
els.editorCategory.onchange = renderEditor;
els.editorSearch.oninput = renderEditor;
els.addQuestion.onclick = addQuestion;
els.saveQuestions.onclick = saveEditor;
els.reloadHistory.onclick = loadHistory;
els.compareHistory.onclick = compareHistory;
init();
