'use strict';

(() => {
  const CREDENTIALS_KEY = 'ahnsen_online_credentials_v1';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let timer = null;
  let hostPanelBusy = false;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
    return data;
  }

  function credentials() {
    try { return JSON.parse(localStorage.getItem(CREDENTIALS_KEY) || 'null'); } catch { return null; }
  }

  function spectatorCode() {
    return String(new URLSearchParams(location.search).get('spectate') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  function phaseLabel(value) {
    return ({ lobby: 'Lobby', question: 'Frage läuft', revealed: 'Auflösung', finished: 'Beendet' })[value] || 'Online';
  }

  function spectatorMarkup(state) {
    const reveal = state.phase === 'revealed' || state.phase === 'finished';
    const question = state.question;
    return `<section class="online-room-view"><div class="online-room-header"><div class="online-room-identity"><span class="online-live-chip"><i></i>Zuschauer</span><div><span class="eyebrow">Raumcode</span><strong>${esc(state.code)}</strong></div></div><div class="online-room-title"><strong>${esc(state.title)}</strong><span>${esc(phaseLabel(state.phase))} · ${state.currentIndex + 1}/${Math.max(1, state.totalQuestions)}</span></div><a class="btn ghost small" href="/online">Zuschaueransicht schließen</a></div><div class="quiz-progress-track"><span style="width:${state.phase === 'finished' ? 100 : state.totalQuestions ? (state.currentIndex + (reveal ? 1 : 0)) / state.totalQuestions * 100 : 0}%"></span></div><div class="online-game-grid"><section class="online-stage">${state.phase === 'lobby' ? '<div class="online-waiting-card"><div><span class="online-waiting-symbol">⌛</span><h1>Warten auf den Start</h1><p>Der Gastgeber bereitet das Quiz vor.</p></div></div>' : question ? `<div class="online-question-view"><div class="online-question-top"><div><span class="eyebrow">${esc(question.category)}</span><h2>Frage ${state.currentIndex + 1} von ${state.totalQuestions}</h2></div><span class="status-chip">${state.answeredCount}/${state.players.length} geantwortet</span></div><div class="online-question-card"><h1>${esc(question.text)}</h1></div><div class="online-answer-grid">${question.options.map((option, index) => `<button class="online-answer-button ${reveal && question.correctIndex === index ? 'correct' : ''}" disabled><span class="online-answer-letter">${String.fromCharCode(65 + index)}</span><span class="online-answer-copy">${esc(option)}</span></button>`).join('')}</div>${reveal ? `<div class="online-explanation"><strong>Kurz erklärt</strong><p>${esc(question.explanation || '')}</p></div>` : '<div class="online-answer-saved">Zuschauer können nicht antworten.</div>'}</div>` : '<div class="online-waiting-card"><div><h1>Spiel beendet</h1></div></div>'}</section><aside class="online-side-column"><section class="panel online-players-panel"><div class="online-panel-heading"><div><span class="eyebrow">Live-Rangliste</span><h2>${state.players.length} Spieler</h2></div></div><div class="online-player-list">${state.players.map((player, index) => `<div class="online-player-row ${player.connected ? 'connected' : ''}"><span class="online-player-avatar">${index + 1}</span><div class="online-player-copy"><strong>${esc(player.name)}${player.isHost ? ' ♛' : ''}</strong><span>${player.correct} richtig · ${player.wrong} falsch</span></div><span class="online-ready-state">${player.score} Punkte</span></div>`).join('')}</div></section></aside></div></section>`;
  }

  async function updateSpectator() {
    const code = spectatorCode();
    if (!code) return;
    const main = document.querySelector('main');
    try {
      const data = await api(`/api/online/rooms/${code}/spectate`);
      main.innerHTML = spectatorMarkup(data.state);
    } catch (error) {
      main.innerHTML = `<section class="panel" style="margin-top:40px"><span class="app-kicker">Zuschaueransicht</span><h1>Raum nicht verfügbar</h1><p class="bad-text">${esc(error.message)}</p><a class="btn primary" href="/online">Zur Online-Auswahl</a></section>`;
      clearInterval(timer);
    }
  }

  function addShareButton() {
    const code = $('#onlineRoomCode')?.textContent?.trim();
    const actions = $('#onlineRoomView .online-room-header .row');
    if (!code || !actions || actions.querySelector('#shareSpectatorRoom')) return;
    const button = document.createElement('button');
    button.id = 'shareSpectatorRoom';
    button.className = 'btn ghost small';
    button.type = 'button';
    button.textContent = 'Zuschauerlink';
    button.onclick = async () => {
      const link = `${location.origin}/online?spectate=${encodeURIComponent(code)}`;
      if (navigator.share) await navigator.share({ title: 'QuizTime Zuschaueransicht', text: `Verfolge Raum ${code} live.`, url: link }).catch(() => null);
      else await navigator.clipboard.writeText(link);
      button.textContent = 'Link kopiert ✓';
      setTimeout(() => { button.textContent = 'Zuschauerlink'; }, 1800);
    };
    actions.prepend(button);
  }

  async function updateHostPanel() {
    if (hostPanelBusy) return;
    const creds = credentials();
    const room = $('#onlineRoomView');
    if (!creds?.code || !creds?.token || !room || room.classList.contains('hidden')) return;
    hostPanelBusy = true;
    try {
      const data = await api(`/api/online/rooms/${encodeURIComponent(creds.code)}/host-options?token=${encodeURIComponent(creds.token)}`);
      let panel = $('#onlineHostTransferPanel');
      if (!data.isHost) { panel?.remove(); return; }
      const candidates = data.players.filter(player => !player.isHost && player.connected);
      const side = $('.online-side-column');
      if (!side) return;
      if (!panel) {
        panel = document.createElement('section');
        panel.id = 'onlineHostTransferPanel';
        panel.className = 'panel';
        side.prepend(panel);
      }
      panel.innerHTML = `<div class="online-panel-heading"><div><span class="eyebrow">Gastgeberwechsel</span><h2>Leitung übertragen</h2></div></div><p class="muted">Die Leitung kann auch während eines laufenden Spiels an einen verbundenen Spieler übergeben werden.</p>${candidates.length ? `<select id="onlineHostTarget" style="width:100%;margin-bottom:10px"><option value="">Spieler auswählen</option>${candidates.map(player => `<option value="${esc(player.id)}">${esc(player.name)}</option>`).join('')}</select><button id="transferOnlineHost" class="btn secondary wide-button" type="button">Gastgeber übertragen</button>` : '<span class="info-chip">Kein weiterer verbundener Spieler</span>'}`;
      $('#transferOnlineHost')?.addEventListener('click', async () => {
        const playerId = $('#onlineHostTarget').value;
        if (!playerId || !confirm('Gastgeberrolle wirklich übertragen?')) return;
        const result = await api(`/api/online/rooms/${encodeURIComponent(creds.code)}/transfer-host`, { method: 'POST', body: JSON.stringify({ token: creds.token, playerId }) });
        alert(`${result.host.name} ist jetzt Gastgeber.`);
        panel.remove();
      });
    } catch { /* Hauptspiel bleibt ohne Zusatzsteuerung nutzbar. */ }
    finally { hostPanelBusy = false; }
  }

  if (spectatorCode()) {
    document.querySelector('#onlineLanding')?.classList.add('hidden');
    document.querySelector('#onlineRoomView')?.classList.add('hidden');
    updateSpectator();
    timer = setInterval(updateSpectator, 1500);
  } else {
    const observer = new MutationObserver(() => { addShareButton(); updateHostPanel(); });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    setInterval(() => { addShareButton(); updateHostPanel(); }, 5000);
  }
})();
