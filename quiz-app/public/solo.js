'use strict';

const els = {
  setupView: document.querySelector('#setupView'),
  gameView: document.querySelector('#gameView'),
  categorySelect: document.querySelector('#categorySelect'),
  countChoices: document.querySelector('#countChoices'),
  availabilityHint: document.querySelector('#availabilityHint'),
  speechToggle: document.querySelector('#speechToggle'),
  selectionSummary: document.querySelector('#selectionSummary'),
  recordSummary: document.querySelector('#recordSummary'),
  startButton: document.querySelector('#startSoloButton'),
  setupMessage: document.querySelector('#setupMessage'),
  progressLabel: document.querySelector('#soloProgressLabel'),
  category: document.querySelector('#soloCategory'),
  modePill: document.querySelector('#soloModePill'),
  score: document.querySelector('#soloScore'),
  progress: document.querySelector('#soloProgress'),
  stage: document.querySelector('#soloStage'),
  speakButton: document.querySelector('#speakButton'),
};

const savedSettings = JSON.parse(localStorage.getItem('ahnsen_solo_settings') || '{}');
const settings = {
  quizType: savedSettings.quizType === 'adult' ? 'adult' : 'child',
  category: savedSettings.category || 'Gemischt',
  questionCount: [5, 10, 15, 25, 50].includes(Number(savedSettings.questionCount)) ? Number(savedSettings.questionCount) : 10,
  mode: savedSettings.mode === 'timed' ? 'timed' : 'relaxed',
  speech: savedSettings.speech !== false,
};

let config = null;
let state = null;
let timerHandle = null;
let clockOffsetMs = 0;
let audioContext = null;
let beepedSeconds = new Set();
let lastQuestionKey = '';
let submitting = false;
let recordStoredForSession = '';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Die Anfrage konnte nicht ausgeführt werden.');
  return data;
}

function persistSettings() {
  localStorage.setItem('ahnsen_solo_settings', JSON.stringify(settings));
}

function recordKey(customState = null) {
  const source = customState || settings;
  return `ahnsen_solo_record:${source.quizType}:${source.category}:${source.totalQuestions || source.questionCount}:${source.mode}`;
}

function getRecord(customState = null) {
  try { return JSON.parse(localStorage.getItem(recordKey(customState)) || 'null'); }
  catch { return null; }
}

function storeRecord(completedState) {
  if (!completedState.finished || recordStoredForSession === completedState.sessionId) return getRecord(completedState);
  recordStoredForSession = completedState.sessionId;
  const previous = getRecord(completedState);
  const candidate = {
    score: completedState.summary.score,
    correct: completedState.summary.correct,
    accuracy: completedState.summary.accuracy,
    completedAt: Date.now(),
  };
  const isBetter = !previous
    || candidate.score > previous.score
    || (candidate.score === previous.score && candidate.correct > previous.correct)
    || (candidate.score === previous.score && candidate.correct === previous.correct && candidate.accuracy > previous.accuracy);
  if (isBetter) localStorage.setItem(recordKey(completedState), JSON.stringify(candidate));
  return isBetter ? candidate : previous;
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
    gain.gain.exponentialRampToValueAtTime(0.16, audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.13);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.14);
  } catch { /* Ton ist nur eine Komfortfunktion */ }
}

function speakQuestion() {
  if (!state?.question || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const letters = ['A', 'B', 'C', 'D'];
  const text = `${state.question.text}. ${state.question.options.map((option, index) => `${letters[index]}: ${option}`).join('. ')}`;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-DE';
  utterance.rate = state.quizType === 'child' ? 0.88 : 0.96;
  const voices = window.speechSynthesis.getVoices();
  const germanVoice = voices.find(voice => /^de/i.test(voice.lang));
  if (germanVoice) utterance.voice = germanVoice;
  window.speechSynthesis.speak(utterance);
}

function catalogConfig() {
  return config?.catalogs?.[settings.quizType] || { size: 0, categories: [], categoryCounts: {} };
}

function availableCount() {
  const catalog = catalogConfig();
  return settings.category === 'Gemischt'
    ? catalog.size
    : Number(catalog.categoryCounts?.[settings.category] || 0);
}

function updateSetup() {
  document.querySelectorAll('[data-quiz-type]').forEach(button => {
    const active = button.dataset.quizType === settings.quizType;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-mode]').forEach(button => {
    const active = button.dataset.mode === settings.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  els.speechToggle.checked = settings.speech;

  const catalog = catalogConfig();
  const categories = ['Gemischt', ...(catalog.categories || [])];
  if (!categories.includes(settings.category)) settings.category = 'Gemischt';
  els.categorySelect.innerHTML = categories.map(category => `<option value="${escapeHtml(category)}" ${category === settings.category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('');

  const available = availableCount();
  const counts = config?.questionCounts || [5, 10, 15, 25, 50];
  if (settings.questionCount > available) {
    settings.questionCount = [...counts].reverse().find(count => count <= available) || Math.min(5, available);
  }
  els.countChoices.innerHTML = counts.map(count => {
    const disabled = count > available;
    const active = count === settings.questionCount;
    return `<button type="button" class="solo-count-choice ${active ? 'active' : ''}" data-count="${count}" aria-pressed="${active}" ${disabled ? 'disabled' : ''}>${count}</button>`;
  }).join('');
  els.countChoices.querySelectorAll('[data-count]').forEach(button => button.addEventListener('click', () => {
    settings.questionCount = Number(button.dataset.count);
    persistSettings();
    updateSetup();
  }));

  els.availabilityHint.textContent = settings.category === 'Gemischt'
    ? `${catalog.size} Fragen im Katalog – bei „Gemischt“ werden die Kategorien möglichst gleichmäßig verteilt.`
    : `${available} Fragen in der Kategorie „${settings.category}“ verfügbar.`;

  const typeLabel = settings.quizType === 'child' ? 'Kinderquiz' : 'Erwachsenenquiz';
  const modeLabel = settings.mode === 'timed' ? 'Zeitmodus' : 'Entspannter Modus';
  els.selectionSummary.innerHTML = `
    <div><span>Quiz</span><strong>${typeLabel}</strong></div>
    <div><span>Kategorie</span><strong>${escapeHtml(settings.category)}</strong></div>
    <div><span>Umfang</span><strong>${settings.questionCount} Fragen</strong></div>
    <div><span>Modus</span><strong>${modeLabel}</strong></div>`;

  const record = getRecord();
  els.recordSummary.innerHTML = record
    ? `<span>Persönlicher Rekord</span><strong>${record.score} Punkte</strong><small>${record.correct} richtig · ${record.accuracy} %</small>`
    : '<span>Persönlicher Rekord</span><strong>Noch keiner</strong><small>Dein erster Durchgang wartet.</small>';
  persistSettings();
}

function questionImageHtml(question) {
  const url = String(question?.imageUrl || '').trim();
  return url ? `<img class="question-image" src="${escapeHtml(url)}" alt="Optionales Bild zur Quizfrage" loading="lazy">` : '';
}

function feedbackHtml(currentState) {
  const result = currentState.result;
  if (!result) return '<div class="solo-prompt"><strong>Wähle eine Antwort aus.</strong><span>Du kannst jede Antwort nur einmal antippen.</span></div>';
  if (result.timedOut) {
    return `<div class="answer-feedback error"><strong>⏰ Die Zeit ist abgelaufen</strong><p class="muted">Richtig war ${String.fromCharCode(65 + result.correctIndex)} – ${escapeHtml(currentState.question.options[result.correctIndex])}</p></div>`;
  }
  if (result.correct) {
    const bonus = currentState.mode === 'timed' ? `<small>10 Grundpunkte + ${result.remainingSeconds} Zeitpunkte</small>` : '<small>Richtig beantwortet</small>';
    return `<div class="answer-feedback success"><strong>✓ Richtig! ${result.delta > 0 ? `+${result.delta}` : result.delta} Punkte</strong>${bonus}</div>`;
  }
  return `<div class="answer-feedback error"><strong>✕ Leider falsch ${result.delta ? `(${result.delta} Punkte)` : ''}</strong><p class="muted">Richtig war ${String.fromCharCode(65 + result.correctIndex)} – ${escapeHtml(currentState.question.options[result.correctIndex])}</p></div>`;
}

function renderQuestion(currentState) {
  const question = currentState.question;
  const result = currentState.result;
  const timer = currentState.mode === 'timed'
    ? `<div id="soloTimerRing" class="timer-ring solo-timer-ring"><strong id="soloTimerText">${currentState.durationSec}</strong></div>`
    : '<div class="solo-no-timer">∞<small>Kein Zeitdruck</small></div>';

  els.stage.innerHTML = `<div class="question-card solo-question-card">
    <div class="player-question-header"><div class="row"><span class="info-chip">${escapeHtml(currentState.progressLabel)}</span><span class="category-chip">${escapeHtml(question.category)}</span></div>${timer}</div>
    ${questionImageHtml(question)}
    <div class="solo-question-title"><button class="solo-speak-inline" type="button" data-speak aria-label="Frage vorlesen">🔊</button><h2>${escapeHtml(question.text)}</h2></div>
    <div class="answers">${question.options.map((option, index) => {
      let css = 'answer-btn';
      if (result?.answerIndex === index) css += ' selected';
      if (currentState.answered && result?.correctIndex === index) css += ' correct';
      if (currentState.answered && result?.answerIndex === index && !result.correct) css += ' wrong';
      return `<button class="${css}" type="button" data-answer="${index}" ${currentState.answered ? 'disabled' : ''}><span class="answer-letter">${String.fromCharCode(65 + index)}</span><span class="answer-text">${escapeHtml(option)}</span></button>`;
    }).join('')}</div>
    ${feedbackHtml(currentState)}
    ${currentState.answered ? `<button id="nextSoloButton" class="btn primary wide-button solo-next-button" type="button">${currentState.currentIndex + 1 >= currentState.totalQuestions ? 'Ergebnis anzeigen' : 'Nächste Frage'} →</button>` : ''}
  </div>`;

  els.stage.querySelectorAll('[data-answer]').forEach(button => button.addEventListener('click', () => submitAnswer(Number(button.dataset.answer))));
  els.stage.querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', speakQuestion));
  document.querySelector('#nextSoloButton')?.addEventListener('click', nextQuestion);
}

function renderFinished(currentState) {
  clearInterval(timerHandle);
  window.speechSynthesis?.cancel();
  const record = storeRecord(currentState);
  const newRecord = record?.score === currentState.summary.score && recordStoredForSession === currentState.sessionId;
  els.stage.innerHTML = `<div class="solo-result-view">
    <div class="solo-result-trophy">🏆</div>
    <span class="eyebrow">Solo-Quiz beendet</span>
    <h1>${newRecord ? 'Neuer persönlicher Rekord!' : 'Stark gespielt!'}</h1>
    <div class="solo-final-score">${currentState.summary.score}<small>Punkte</small></div>
    <div class="solo-result-stats">
      <div><strong>${currentState.summary.correct}</strong><span>Richtig</span></div>
      <div><strong>${currentState.summary.wrong}</strong><span>Falsch</span></div>
      <div><strong>${currentState.summary.unanswered}</strong><span>Ohne Antwort</span></div>
      <div><strong>${currentState.summary.accuracy} %</strong><span>Trefferquote</span></div>
    </div>
    <div class="solo-record-finish"><span>Bestwert für diese Auswahl</span><strong>${record?.score ?? currentState.summary.score} Punkte</strong></div>
    <div class="solo-result-actions"><button id="playAgainButton" class="btn primary" type="button">Noch einmal spielen</button><button id="newSettingsButton" class="btn ghost" type="button">Neue Auswahl</button></div>
  </div>`;
  document.querySelector('#playAgainButton').addEventListener('click', startSolo);
  document.querySelector('#newSettingsButton').addEventListener('click', leaveGame);
}

function renderState(nextState) {
  state = nextState;
  clockOffsetMs = Number(state.serverNow || Date.now()) - Date.now();
  localStorage.setItem('ahnsen_solo_session', state.sessionId);
  els.setupView.classList.add('hidden');
  els.gameView.classList.remove('hidden');
  els.progressLabel.textContent = state.progressLabel;
  els.category.textContent = state.category;
  els.modePill.textContent = state.mode === 'timed' ? '⏱️ Zeitmodus' : '🌿 Entspannt';
  els.score.textContent = `${state.summary.score} Punkte`;
  const completed = state.currentIndex + (state.answered || state.finished ? 1 : 0);
  els.progress.style.setProperty('--width', `${Math.min(100, completed / state.totalQuestions * 100)}%`);

  if (state.finished) renderFinished(state);
  else renderQuestion(state);
  resetTimer();

  const questionKey = `${state.sessionId}:${state.question?.id || ''}`;
  if (!state.answered && questionKey !== lastQuestionKey) {
    lastQuestionKey = questionKey;
    beepedSeconds = new Set();
    if (settings.speech) setTimeout(speakQuestion, 350);
  }
}

function resetTimer() {
  clearInterval(timerHandle);
  if (!state || state.finished || state.answered || state.mode !== 'timed') return;
  timerHandle = setInterval(updateTimer, 100);
  updateTimer();
}

function updateTimer() {
  if (!state || state.finished || state.answered || state.mode !== 'timed') return;
  const elapsed = (Date.now() + clockOffsetMs) - state.questionStartedAt;
  const remainingMs = Math.max(0, state.durationSec * 1000 - elapsed);
  const seconds = Math.ceil(remainingMs / 1000);
  const timerText = document.querySelector('#soloTimerText');
  const ring = document.querySelector('#soloTimerRing');
  if (timerText) timerText.textContent = seconds;
  if (ring) ring.style.setProperty('--progress', String(remainingMs / (state.durationSec * 1000)));
  if (seconds <= 5 && seconds >= 1 && !beepedSeconds.has(seconds)) {
    beepedSeconds.add(seconds);
    beep(seconds);
  }
  if (remainingMs <= 0 && !submitting) submitAnswer(null);
}

async function submitAnswer(answerIndex) {
  if (submitting || state?.answered || state?.finished) return;
  submitting = true;
  unlockAudio();
  window.speechSynthesis?.cancel();
  document.querySelectorAll('[data-answer]').forEach(button => { button.disabled = true; });
  try {
    renderState(await api('/api/solo/answer', {
      method: 'POST',
      body: JSON.stringify({ sessionId: state.sessionId, answerIndex }),
    }));
  } catch (error) {
    els.setupMessage.textContent = error.message;
    document.querySelectorAll('[data-answer]').forEach(button => { button.disabled = false; });
  } finally {
    submitting = false;
  }
}

async function nextQuestion() {
  if (submitting) return;
  submitting = true;
  try {
    renderState(await api('/api/solo/next', {
      method: 'POST',
      body: JSON.stringify({ sessionId: state.sessionId }),
    }));
  } catch (error) {
    els.setupMessage.textContent = error.message;
  } finally {
    submitting = false;
  }
}

async function startSolo() {
  if (submitting) return;
  submitting = true;
  unlockAudio();
  els.startButton.disabled = true;
  els.setupMessage.textContent = '';
  window.speechSynthesis?.cancel();
  try {
    const nextState = await api('/api/solo/start', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
    recordStoredForSession = '';
    renderState(nextState);
  } catch (error) {
    els.setupMessage.textContent = error.message;
  } finally {
    submitting = false;
    els.startButton.disabled = false;
  }
}

async function leaveGame() {
  clearInterval(timerHandle);
  window.speechSynthesis?.cancel();
  const sessionId = state?.sessionId || localStorage.getItem('ahnsen_solo_session');
  if (sessionId) fetch(`/api/solo/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {});
  localStorage.removeItem('ahnsen_solo_session');
  state = null;
  els.gameView.classList.add('hidden');
  els.setupView.classList.remove('hidden');
  updateSetup();
}

async function restoreSession() {
  const sessionId = localStorage.getItem('ahnsen_solo_session');
  if (!sessionId) return false;
  try {
    const restored = await api(`/api/solo/state/${encodeURIComponent(sessionId)}`);
    settings.quizType = restored.quizType;
    settings.category = restored.category;
    settings.questionCount = restored.totalQuestions;
    settings.mode = restored.mode;
    persistSettings();
    renderState(restored);
    return true;
  } catch {
    localStorage.removeItem('ahnsen_solo_session');
    return false;
  }
}

async function init() {
  els.setupMessage.textContent = 'Solo-Quiz wird geladen …';
  try {
    config = await api('/api/solo/config');
    els.setupMessage.textContent = '';
    updateSetup();
    await restoreSession();
  } catch (error) {
    els.setupMessage.textContent = error.message;
    els.startButton.disabled = true;
  }
}

document.querySelectorAll('[data-quiz-type]').forEach(button => button.addEventListener('click', () => {
  settings.quizType = button.dataset.quizType;
  settings.category = 'Gemischt';
  updateSetup();
}));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  settings.mode = button.dataset.mode;
  updateSetup();
}));
els.categorySelect.addEventListener('change', () => { settings.category = els.categorySelect.value; updateSetup(); });
els.speechToggle.addEventListener('change', () => { settings.speech = els.speechToggle.checked; persistSettings(); });
els.startButton.addEventListener('click', startSolo);
els.speakButton.addEventListener('click', () => { unlockAudio(); speakQuestion(); });
window.addEventListener('beforeunload', () => window.speechSynthesis?.cancel());

init();
