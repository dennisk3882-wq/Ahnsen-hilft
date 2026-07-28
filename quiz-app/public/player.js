'use strict';

const els = {
  title: document.querySelector('#title'), topModeBadge: document.querySelector('#topModeBadge'), modeChooser: document.querySelector('#modeChooser'),
  resumeLiveButton: document.querySelector('#resumeLiveButton'), openLiveLoginButton: document.querySelector('#openLiveLoginButton'), forgetLiveButton: document.querySelector('#forgetLiveButton'),
  loginCard: document.querySelector('#loginCard'), backToModesButton: document.querySelector('#backToModesButton'), game: document.querySelector('#game'),
  playerName: document.querySelector('#playerName'), eventPassword: document.querySelector('#eventPassword'), loginButton: document.querySelector('#loginButton'),
  loginMessage: document.querySelector('#loginMessage'), connectionPill: document.querySelector('#connectionPill'), playerPill: document.querySelector('#playerPill'),
  scorePill: document.querySelector('#scorePill'), quizProgress: document.querySelector('#quizProgress'), view: document.querySelector('#view'),
  exitLiveViewButton: document.querySelector('#exitLiveViewButton'), logoutLiveButton: document.querySelector('#logoutLiveButton'),
  overlay: document.querySelector('#overlay'), overlayInner: document.querySelector('#overlayInner'),
};

let playerToken = localStorage.getItem('ahnsen_player_token') || '';
let socket = null;
let latestState = null;
let resumableState = null;
let timerHandle = null;
let latencyHandle = null;
let audioContext = null;
let lastQuestionKey = '';
let beepedSeconds = new Set();
let clockOffsetMs = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatClock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}

function unlockAudio() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
  } catch { /* Browser ohne Web Audio */ }
}

function beep(second) {
  if (!audioContext) return;
  try {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = second === 1 ? 1080 : 790;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + .01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + .13);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + .14);
  } catch { /* ignorieren */ }
}

function setTopMode(label, live = false) {
  els.topModeBadge.className = `mode-badge${live ? ' live' : ''}`;
  els.topModeBadge.innerHTML = `<i></i>${escapeHtml(label)}`;
}

function setConnection(connected) {
  els.connectionPill.className = `status-chip ${connected ? 'online' : 'offline'}`;
  els.connectionPill.innerHTML = `<i></i>${connected ? 'Verbunden' : 'Getrennt'}`;
}

function disconnectLiveSocket() {
  clearInterval(latencyHandle);
  latencyHandle = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  setConnection(false);
}

function updateResumeControls() {
  const player = resumableState?.player;
  if (player && playerToken) {
    els.resumeLiveButton.classList.remove('hidden');
    els.resumeLiveButton.textContent = `Live-Quiz als ${player.name} fortsetzen`;
    els.forgetLiveButton.classList.remove('hidden');
    els.openLiveLoginButton.textContent = 'Mit anderem Namen anmelden';
    els.playerName.value = player.name || '';
  } else {
    els.resumeLiveButton.classList.add('hidden');
    els.forgetLiveButton.classList.add('hidden');
    els.openLiveLoginButton.textContent = 'Live-Quiz beitreten';
  }
}

function hideOverlay() {
  els.overlay.classList.add('hidden');
  els.overlayInner.innerHTML = '';
}

function showModeChooser() {
  clearInterval(timerHandle);
  disconnectLiveSocket();
  hideOverlay();
  els.game.classList.add('hidden');
  els.loginCard.classList.add('hidden');
  els.modeChooser.classList.remove('hidden');
  setTopMode('Quiz-Auswahl');
  updateResumeControls();
}

function showLiveLogin() {
  clearInterval(timerHandle);
  disconnectLiveSocket();
  hideOverlay();
  els.modeChooser.classList.add('hidden');
  els.game.classList.add('hidden');
  els.loginCard.classList.remove('hidden');
  els.loginMessage.textContent = '';
  els.eventPassword.value = '';
  setTopMode('Live-Quiz', true);
  setTimeout(() => els.playerName.focus(), 0);
}

function forgetLiveIdentity() {
  disconnectLiveSocket();
  localStorage.removeItem('ahnsen_player_token');
  playerToken = '';
  latestState = null;
  resumableState = null;
  els.playerName.value = '';
  els.eventPassword.value = '';
  updateResumeControls();
}

function podiumHtml(board) {
  const top = (board || []).slice(0, 3);
  if (!top.length) return '<div class="big-status compact"><h2>Noch keine Platzierungen</h2></div>';
  return `<div class="podium">${top.map(player => `<div class="podium-place"><div class="podium-avatar">${escapeHtml(initials(player.name))}</div><div class="podium-name">${escapeHtml(player.name)}</div><div class="podium-score">${player.score} Punkte</div><div class="podium-block">${player.rank}</div></div>`).join('')}</div>`;
}

function leaderboardHtml(board, title = 'Zwischenrangliste') {
  return `<div class="leaderboard-card"><div class="leaderboard-heading"><span class="eyebrow">Ahnsen Quizabend</span><h1>${escapeHtml(title)}</h1><p class="muted">So sieht der aktuelle Stand aus</p></div>${podiumHtml(board)}<div class="table-wrap"><table class="leaderboard"><thead><tr><th>Platz</th><th>Name</th><th>Punkte</th><th>Richtig</th></tr></thead><tbody>${(board || []).map(player => `<tr class="${latestState?.player?.id === player.id ? 'me' : ''}"><td>${player.rank}</td><td>${escapeHtml(player.name)}</td><td><strong>${player.score}</strong></td><td>${player.correct}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function renderOverlay(state) {
  if (state.overlay?.type === 'leaderboard' || state.phase === 'finished') {
    els.overlay.classList.remove('hidden');
    els.overlayInner.innerHTML = leaderboardHtml(state.leaderboard || [], state.phase === 'finished' ? 'Endergebnis' : 'Zwischenrangliste');
  } else hideOverlay();
}

function renderPause(state) {
  els.view.innerHTML = `<div class="pause-view"><div><span class="eyebrow">Quizpause</span><h1>Kurze Pause</h1><div id="pauseClock" class="pause-clock">${formatClock((state.pause?.until || Date.now()) - Date.now())}</div><p class="muted">Du kannst auf dem Handy sehen, wann es weitergeht.</p></div></div>`;
}

function questionImageHtml(question) {
  const url = String(question?.imageUrl || '').trim();
  return url ? `<img class="question-image" src="${escapeHtml(url)}" alt="Optionales Bild zur Quizfrage" loading="lazy">` : '';
}

function responseFeedback(response, revealed, question) {
  if (response) {
    const success = response.correct;
    return `<div class="answer-feedback ${success ? 'success' : 'error'}"><strong>${success ? '✓ Richtig beantwortet' : revealed ? '✕ Leider falsch' : '✓ Antwort gespeichert'}</strong><div class="${success ? 'good-text' : 'bad-text'}" style="margin-top:5px;font-size:1.25rem">${response.delta > 0 ? '+' : ''}${response.delta} Punkte</div>${revealed && !success ? `<p class="muted" style="margin:7px 0 0">Richtig war ${String.fromCharCode(65 + question.correctIndex)} – ${escapeHtml(question.options[question.correctIndex])}</p>` : ''}</div>`;
  }
  if (revealed) return `<div class="answer-feedback success"><strong>Richtige Antwort: ${String.fromCharCode(65 + question.correctIndex)} – ${escapeHtml(question.options[question.correctIndex])}</strong></div>`;
  return '<div class="answer-feedback"><strong>Wähle eine Antwort</strong><p class="muted" style="margin:6px 0 0">Nach dem Antippen kann sie nicht mehr geändert werden.</p></div>';
}

function renderQuestion(state) {
  const question = state.question;
  const response = state.ownResponse;
  const revealed = state.phase === 'revealed';
  els.view.innerHTML = `<div class="question-card">
    <div class="player-question-header"><div class="row"><span class="info-chip">${escapeHtml(state.progressLabel)}</span><span class="category-chip">${escapeHtml(question.category)}</span></div><div id="timerRing" class="timer-ring"><strong id="timerText">${state.questionDurationSec}</strong></div></div>
    ${questionImageHtml(question)}
    <h2>${escapeHtml(question.text)}</h2>
    <div class="answers">${question.options.map((option, index) => {
      let css = 'answer-btn';
      if (response?.answerIndex === index) css += ' selected';
      if (revealed && question.correctIndex === index) css += ' correct';
      if (revealed && response?.answerIndex === index && !response.correct) css += ' wrong';
      return `<button class="${css}" data-answer="${index}" ${state.phase !== 'question' || response ? 'disabled' : ''}><span class="answer-letter">${String.fromCharCode(65 + index)}</span><span class="answer-text">${escapeHtml(option)}</span></button>`;
    }).join('')}</div>
    ${responseFeedback(response, revealed, question)}
  </div>`;
  document.querySelectorAll('[data-answer]').forEach(button => button.addEventListener('click', () => submitAnswer(Number(button.dataset.answer))));
}

function renderState(state) {
  latestState = state;
  resumableState = state;
  clockOffsetMs = Number(state.serverNow || Date.now()) - Date.now();
  document.title = state.title || 'Ahnsen Quizabend';
  if (!state.player) return;
  els.modeChooser.classList.add('hidden');
  els.loginCard.classList.add('hidden');
  els.game.classList.remove('hidden');
  setTopMode('Live-Quiz', true);
  els.playerPill.textContent = state.player.name;
  els.scorePill.textContent = `${state.player.score} Punkte`;
  const completed = state.currentIndex + (state.phase === 'revealed' || state.phase === 'finished' ? 1 : 0);
  els.quizProgress.style.setProperty('--width', state.questionCount ? `${Math.min(100, completed / state.questionCount * 100)}%` : '0%');
  renderOverlay(state);
  if (state.player.excluded) {
    els.view.innerHTML = '<div class="big-status"><div class="icon">⛔</div><h2>Du bist derzeit ausgeschlossen</h2><p class="muted">Der Quizmaster kann dich wieder in das Quiz aufnehmen.</p></div>';
  } else if (state.phase === 'paused') renderPause(state);
  else if (state.phase === 'question' || state.phase === 'revealed') renderQuestion(state);
  else if (state.phase === 'ready') els.view.innerHTML = `<div class="big-status"><div class="icon">🎯</div><span class="eyebrow">Gleich geht es weiter</span><h2>Bereit für ${escapeHtml(state.progressLabel)}</h2><p class="muted">Der Quizmaster startet gleich die nächste Frage.</p></div>`;
  else if (state.phase === 'finished') els.view.innerHTML = '<div class="big-status"><div class="icon">🏆</div><h2>Quiz beendet</h2><p class="muted">Die Endrangliste wird angezeigt.</p></div>';
  else els.view.innerHTML = '<div class="big-status"><div class="icon">⌛</div><span class="eyebrow">Warteraum</span><h2>Willkommen beim Ahnsen Quizabend</h2><p class="muted">Das Quiz wird in Kürze vorbereitet.</p></div>';
  updateResumeControls();
  resetTimerLoop();
}

function resetTimerLoop() {
  clearInterval(timerHandle);
  const key = `${latestState?.question?.id || ''}:${latestState?.questionStartedAt || ''}`;
  if (key !== lastQuestionKey) {
    lastQuestionKey = key;
    beepedSeconds = new Set();
  }
  timerHandle = setInterval(updateTimers, 100);
  updateTimers();
}

function updateTimers() {
  const state = latestState;
  if (!state) return;
  if (state.phase === 'paused') {
    const node = document.querySelector('#pauseClock');
    if (node) node.textContent = formatClock((state.pause?.until || 0) - (Date.now() + clockOffsetMs));
    return;
  }
  if (state.phase !== 'question') return;
  const elapsed = (Date.now() + clockOffsetMs) - state.questionStartedAt;
  const remainingMs = Math.max(0, state.questionDurationSec * 1000 - elapsed);
  const seconds = Math.ceil(remainingMs / 1000);
  const timerText = document.querySelector('#timerText');
  const ring = document.querySelector('#timerRing');
  if (timerText) timerText.textContent = seconds;
  if (ring) ring.style.setProperty('--progress', String(remainingMs / (state.questionDurationSec * 1000)));
  if (seconds <= 5 && seconds >= 1 && !beepedSeconds.has(seconds)) {
    beepedSeconds.add(seconds);
    beep(seconds);
  }
}

async function submitAnswer(answerIndex) {
  unlockAudio();
  document.querySelectorAll('[data-answer]').forEach(button => { button.disabled = true; });
  try {
    const response = await fetch('/api/player/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': playerToken },
      body: JSON.stringify({ answerIndex }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Antwort konnte nicht gespeichert werden.');
  } catch (error) {
    els.loginMessage.textContent = error.message;
    document.querySelectorAll('[data-answer]').forEach(button => { button.disabled = false; });
  }
}

function connectSocket() {
  disconnectLiveSocket();
  socket = io({ auth: { role: 'player', playerToken } });
  socket.on('connect', () => setConnection(true));
  socket.on('disconnect', () => setConnection(false));
  socket.on('auth_error', message => {
    els.loginMessage.textContent = message;
    forgetLiveIdentity();
    showLiveLogin();
  });
  socket.on('state', renderState);
  latencyHandle = setInterval(() => {
    if (!socket?.connected) return;
    const start = performance.now();
    socket.emit('latency_ping', Date.now(), () => socket.emit('latency_report', Math.round(performance.now() - start)));
  }, 5000);
}

async function login() {
  unlockAudio();
  els.loginButton.disabled = true;
  els.loginMessage.textContent = '';
  try {
    const response = await fetch('/api/player/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: els.playerName.value, password: els.eventPassword.value, playerToken }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Anmeldung fehlgeschlagen.');
    playerToken = data.playerToken;
    localStorage.setItem('ahnsen_player_token', playerToken);
    resumableState = data.state;
    renderState(data.state);
    connectSocket();
  } catch (error) {
    els.loginMessage.textContent = error.message;
  } finally {
    els.loginButton.disabled = false;
  }
}

async function resumeLiveQuiz() {
  unlockAudio();
  els.resumeLiveButton.disabled = true;
  try {
    let state = resumableState;
    if (!state && playerToken) {
      const response = await fetch('/api/player/state', { headers: { 'x-player-token': playerToken } });
      if (!response.ok) throw new Error('Die gespeicherte Live-Anmeldung ist nicht mehr gültig.');
      state = await response.json();
    }
    if (!state?.player) throw new Error('Es wurde keine gültige Live-Anmeldung gefunden.');
    renderState(state);
    connectSocket();
  } catch (error) {
    forgetLiveIdentity();
    els.loginMessage.textContent = error.message;
    showLiveLogin();
  } finally {
    els.resumeLiveButton.disabled = false;
  }
}

els.resumeLiveButton.addEventListener('click', resumeLiveQuiz);
els.openLiveLoginButton.addEventListener('click', () => {
  if (resumableState) forgetLiveIdentity();
  showLiveLogin();
});
els.forgetLiveButton.addEventListener('click', () => {
  forgetLiveIdentity();
  showModeChooser();
});
els.backToModesButton.addEventListener('click', showModeChooser);
els.exitLiveViewButton.addEventListener('click', () => {
  resumableState = latestState;
  showModeChooser();
});
els.logoutLiveButton.addEventListener('click', () => {
  forgetLiveIdentity();
  showModeChooser();
});
els.loginButton.addEventListener('click', login);
els.eventPassword.addEventListener('keydown', event => { if (event.key === 'Enter') login(); });

(async () => {
  const config = await fetch('/api/config').then(response => response.json()).catch(() => ({}));
  if (config.title) document.title = config.title;

  if (playerToken) {
    const response = await fetch('/api/player/state', { headers: { 'x-player-token': playerToken } }).catch(() => null);
    if (response?.ok) resumableState = await response.json();
    else forgetLiveIdentity();
  }

  showModeChooser();
})();
