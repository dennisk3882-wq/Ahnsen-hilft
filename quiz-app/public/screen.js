'use strict';

const content = document.querySelector('#screenContent');
const overlay = document.querySelector('#screenOverlay');
const overlayInner = document.querySelector('#screenOverlayInner');
const fullscreenButton = document.querySelector('#fullscreenButton');
const screenStatus = document.querySelector('#screenStatus');
let state = null;
let timer = null;
let audioContext = null;
let beeped = new Set();
let lastQuestionKey = '';
let clockOffsetMs = 0;

function unlockAudio() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
  } catch {}
}

function beep(second) {
  if (!audioContext) return;
  try {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = second === 1 ? 1080 : 790;
    gain.gain.setValueAtTime(.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.16, audioContext.currentTime + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .13);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + .14);
  } catch {}
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function clock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
}

function podium(board) {
  return `<div class="podium">${(board || []).slice(0, 3).map(player => `<div class="podium-place"><div class="podium-avatar">${esc(initials(player.name))}</div><div class="podium-name">${esc(player.name)}</div><div class="podium-score">${player.score} Punkte</div><div class="podium-block">${player.rank}</div></div>`).join('')}</div>`;
}

function boardHtml(board, title) {
  return `<div class="leaderboard-card"><div class="leaderboard-heading"><span class="eyebrow">Ahnsen Quizabend</span><h1>${esc(title)}</h1><p class="muted">${title === 'Endergebnis' ? 'Herzlichen Glückwunsch!' : 'Der aktuelle Stand nach der letzten Frage'}</p></div>${podium(board)}<div class="table-wrap"><table class="leaderboard"><thead><tr><th>Platz</th><th>Name</th><th>Punkte</th><th>Richtig</th></tr></thead><tbody>${(board || []).map(player => `<tr><td>${player.rank}</td><td>${esc(player.name)}</td><td><strong>${player.score}</strong></td><td>${player.correct}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function questionImageHtml(question) {
  const url = String(question?.imageUrl || '').trim();
  return url ? `<img class="question-image" src="${esc(url)}" alt="Optionales Bild zur Quizfrage" loading="lazy">` : '';
}

function distributionHtml(distribution) {
  const rows = distribution || [];
  const values = [0, 1, 2, 3].map(index => Number(rows.find(row => row.index === index)?.percent || 0));
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  return `<div class="distribution-layout"><div class="donut-chart" style="--a:${values[0]};--b:${values[1]};--c:${values[2]};--d:${values[3]}"><div class="donut-center"><strong>${total}</strong><span>Antworten</span></div></div><div class="dist-legend">${rows.map(row => `<div class="legend-row ${row.correct ? 'correct' : ''}"><span class="legend-letter">${String.fromCharCode(65 + row.index)}</span><span>${esc(row.label)}</span><strong>${row.count} · ${row.percent}%</strong></div>`).join('')}</div></div>`;
}

function renderQrCode(url) {
  const target = document.querySelector('#screenJoinQr');
  if (!target) return;
  try {
    if (typeof window.qrcode !== 'function') throw new Error('QR-Bibliothek nicht geladen');
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    target.innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
  } catch {
    target.innerHTML = '<div class="screen-qr-fallback">QR-Code konnte nicht geladen werden.<br>Bitte die Adresse verwenden.</div>';
  }
}

function render(nextState) {
  state = nextState;
  clockOffsetMs = Number(nextState.serverNow || Date.now()) - Date.now();
  screenStatus.innerHTML = `<i></i>${nextState.phase === 'question' ? 'Frage läuft' : nextState.phase === 'paused' ? 'Pause' : nextState.phase === 'revealed' ? 'Auflösung' : nextState.phase === 'finished' ? 'Beendet' : 'Bereit'}`;
  const showOverlay = nextState.overlay?.type === 'leaderboard' || nextState.phase === 'finished';
  overlay.classList.toggle('hidden', !showOverlay);
  overlayInner.innerHTML = showOverlay ? boardHtml(nextState.leaderboard || [], nextState.phase === 'finished' ? 'Endergebnis' : 'Zwischenrangliste') : '';

  if (nextState.phase === 'paused') {
    content.innerHTML = `<div class="pause-view"><div><span class="eyebrow">Ahnsen Quizabend</span><h1>Quizpause</h1><div id="screenPauseClock" class="pause-clock">${clock((nextState.pause?.until || 0) - (Date.now() + clockOffsetMs))}</div><p class="muted" style="font-size:1.35rem">Die Pause endet automatisch.</p></div></div>`;
  } else if (nextState.phase === 'question' || nextState.phase === 'revealed') {
    const question = nextState.question;
    const eligibleCount = nextState.answerEligibleCount ?? nextState.activePlayerCount;
    const answeredPercent = eligibleCount ? Math.round(nextState.responseCount / eligibleCount * 100) : 0;
    content.innerHTML = `<div class="screen-question-layout"><section class="screen-question-stage screen-question"><div class="screen-question-header"><div class="row"><span class="info-chip">${esc(nextState.progressLabel)}</span><span class="category-chip">${esc(question.category)}</span></div></div>${questionImageHtml(question)}<h1>${esc(question.text)}</h1><div class="screen-answers">${question.options.map((option, index) => `<div class="screen-answer ${nextState.phase === 'revealed' && question.correctIndex === index ? 'correct' : ''}"><span class="answer-letter">${String.fromCharCode(65 + index)}</span><span>${esc(option)}</span></div>`).join('')}</div>${nextState.phase === 'revealed' ? `<div class="screen-reveal-grid"><div class="screen-distribution-panel"><span class="eyebrow">Live-Auswertung</span><h2>Antwortverteilung</h2>${distributionHtml(nextState.distribution)}</div><div class="screen-distribution-panel"><span class="eyebrow">Richtige Antwort</span><h2 style="font-size:2rem;color:var(--green)">${String.fromCharCode(65 + question.correctIndex)} – ${esc(question.options[question.correctIndex])}</h2><p class="muted">${nextState.responseCount} Antworten wurden gewertet.</p>${question.explanation ? `<div class="answer-feedback success"><strong>Warum?</strong><p>${esc(question.explanation)}</p></div>` : ''}</div></div>` : `<div class="screen-response-line"><span>${nextState.responseCount} von ${eligibleCount} geantwortet</span><div class="screen-response-progress"><span style="--width:${answeredPercent}%"></span></div><strong>${answeredPercent}%</strong></div>`}</section><aside class="screen-timer-panel"><span class="eyebrow">Verbleibende Zeit</span><div id="screenTimer" class="timer-ring"><strong id="screenTimerText">${nextState.questionDurationSec}</strong></div><p class="muted">${nextState.phase === 'revealed' ? 'Frage beendet' : 'Sekunden'}</p></aside></div>`;
  } else if (nextState.phase === 'ready') {
    content.innerHTML = `<div class="big-status"><div class="icon">🎯</div><span class="eyebrow">Nächste Runde</span><h2>${nextState.tiebreak?.active ? `Entscheidungsrunde ${nextState.tiebreak.round}` : `${esc(nextState.progressLabel)} ist bereit`}</h2><p class="muted" style="font-size:1.35rem">${nextState.tiebreak?.active ? `Nur ${esc((nextState.tiebreak.playerNames || []).join(', '))} spielen diese Frage.` : `${nextState.activePlayerCount} Spieler sind verbunden.`}</p></div>`;
  } else {
    const joinUrl = location.origin;
    content.innerHTML = `<div class="screen-waiting"><span class="eyebrow">Willkommen</span><h1>${esc(nextState.title)}</h1><div class="screen-join-layout"><div id="screenJoinQr" class="screen-qr-card" aria-label="QR-Code zur Quiz-Startseite"></div><div class="screen-join-copy"><span class="eyebrow">Mit dem Handy mitspielen</span><h2>QR-Code scannen</h2><p class="muted">Kamera öffnen, QR-Code erfassen und anschließend Live-Quiz oder Solo-Quiz auswählen.</p><div class="screen-url large">${esc(joinUrl)}</div><div class="screen-scan-hint">📱 Alternativ die Adresse im Browser eingeben</div><p class="muted" style="margin-top:22px">Teilnehmer im Warteraum: <strong style="color:white">${nextState.activePlayerCount}</strong></p></div></div></div>`;
    renderQrCode(joinUrl);
  }

  const key = `${nextState.question?.id || ''}:${nextState.questionStartedAt || ''}`;
  if (key !== lastQuestionKey) {
    lastQuestionKey = key;
    beeped = new Set();
  }
  clearInterval(timer);
  timer = setInterval(tick, 100);
  tick();
}

function tick() {
  if (!state) return;
  if (state.phase === 'paused') {
    const node = document.querySelector('#screenPauseClock');
    if (node) node.textContent = clock((state.pause?.until || 0) - (Date.now() + clockOffsetMs));
    return;
  }
  if (state.phase !== 'question') return;
  const remaining = Math.max(0, state.questionDurationSec * 1000 - ((Date.now() + clockOffsetMs) - state.questionStartedAt));
  const timerText = document.querySelector('#screenTimerText');
  const ring = document.querySelector('#screenTimer');
  const seconds = Math.ceil(remaining / 1000);
  if (timerText) timerText.textContent = seconds;
  if (ring) ring.style.setProperty('--progress', String(remaining / (state.questionDurationSec * 1000)));
  if (seconds <= 5 && seconds >= 1 && !beeped.has(seconds)) {
    beeped.add(seconds);
    beep(seconds);
  }
}

fullscreenButton.addEventListener('click', async () => {
  unlockAudio();
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
});

document.addEventListener('fullscreenchange', () => {
  fullscreenButton.textContent = document.fullscreenElement ? '⛶ Vollbild verlassen' : '⛶ Vollbild';
});

const socket = io({ auth: { role: 'screen' } });
socket.on('screen_state', render);
socket.on('connect', () => { screenStatus.innerHTML = '<i></i> Verbunden'; });