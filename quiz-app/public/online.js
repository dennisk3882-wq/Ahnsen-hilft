'use strict';

(() => {
  const CREDENTIALS_KEY = 'ahnsen_online_credentials_v1';
  const NAME_KEY = 'ahnsen_online_last_name';
  const TEAM_NAMES = { violet: 'Team Violett', blue: 'Team Blau' };
  const avatarGradients = [
    'linear-gradient(145deg,#a65cff,#465dff)',
    'linear-gradient(145deg,#2fc9df,#3272d0)',
    'linear-gradient(145deg,#31d196,#147d6d)',
    'linear-gradient(145deg,#ffad43,#d85c49)',
    'linear-gradient(145deg,#e967bd,#923ca0)',
    'linear-gradient(145deg,#9dcc4b,#478b47)',
    'linear-gradient(145deg,#ff737c,#b43d62)',
    'linear-gradient(145deg,#57d5c9,#4770d5)',
  ];

  const nodes = {
    landing: document.querySelector('#onlineLanding'),
    roomView: document.querySelector('#onlineRoomView'),
    connection: document.querySelector('#onlineConnection'),
    resumeCard: document.querySelector('#onlineResumeCard'),
    resumeTitle: document.querySelector('#onlineResumeTitle'),
    resumeText: document.querySelector('#onlineResumeText'),
    resumeButton: document.querySelector('#onlineResumeButton'),
    forgetButton: document.querySelector('#onlineForgetButton'),
    createPanel: document.querySelector('#onlineCreatePanel'),
    joinPanel: document.querySelector('#onlineJoinPanel'),
    createForm: document.querySelector('#onlineCreateForm'),
    joinForm: document.querySelector('#onlineJoinForm'),
    hostName: document.querySelector('#onlineHostName'),
    roomTitle: document.querySelector('#onlineRoomTitle'),
    visibility: document.querySelector('#onlineVisibility'),
    gameMode: document.querySelector('#onlineGameMode'),
    quizType: document.querySelector('#onlineQuizType'),
    category: document.querySelector('#onlineCategory'),
    questionCount: document.querySelector('#onlineQuestionCount'),
    maxPlayers: document.querySelector('#onlineMaxPlayers'),
    hostTeamLabel: document.querySelector('#onlineHostTeamLabel'),
    hostTeam: document.querySelector('#onlineHostTeam'),
    joinCode: document.querySelector('#onlineJoinCode'),
    joinName: document.querySelector('#onlineJoinName'),
    joinTeamLabel: document.querySelector('#onlineJoinTeamLabel'),
    joinTeam: document.querySelector('#onlineJoinTeam'),
    roomPreview: document.querySelector('#onlineRoomPreview'),
    landingMessage: document.querySelector('#onlineLandingMessage'),
    publicRooms: document.querySelector('#onlinePublicRooms'),
    refreshPublicRooms: document.querySelector('#refreshPublicRooms'),
    roomPhase: document.querySelector('#onlineRoomPhase'),
    roomCode: document.querySelector('#onlineRoomCode'),
    roomTitleView: document.querySelector('#onlineRoomTitleView'),
    roomMeta: document.querySelector('#onlineRoomMeta'),
    copyCode: document.querySelector('#copyOnlineCode'),
    shareRoom: document.querySelector('#shareOnlineRoom'),
    leaveRoom: document.querySelector('#leaveOnlineRoom'),
    progress: document.querySelector('#onlineProgress'),
    stage: document.querySelector('#onlineStage'),
    playerCount: document.querySelector('#onlinePlayerCount'),
    answeredCount: document.querySelector('#onlineAnsweredCount'),
    teamBoard: document.querySelector('#onlineTeamBoard'),
    playerList: document.querySelector('#onlinePlayerList'),
    chatMessages: document.querySelector('#onlineChatMessages'),
    chatForm: document.querySelector('#onlineChatForm'),
    chatInput: document.querySelector('#onlineChatInput'),
  };

  let config = null;
  let credentials = loadCredentials();
  let roomState = null;
  let roomPreview = null;
  let eventSource = null;
  let countdownHandle = null;
  let previewHandle = null;
  let pendingAnswerIndex = null;
  let lastQuestionKey = '';
  let publicRefreshHandle = null;
  let actionPending = false;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?';
  }

  function nameGradient(name) {
    let hash = 0;
    for (const character of String(name || '')) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return avatarGradients[Math.abs(hash) % avatarGradients.length];
  }

  function normalizeCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  function loadCredentials() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CREDENTIALS_KEY) || 'null');
      if (!parsed?.code || !parsed?.token) return null;
      return { code: normalizeCode(parsed.code), token: String(parsed.token), playerId: String(parsed.playerId || ''), name: String(parsed.name || '') };
    } catch {
      return null;
    }
  }

  function saveCredentials(next) {
    credentials = next;
    if (next) localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(next));
    else localStorage.removeItem(CREDENTIALS_KEY);
    renderResume();
  }

  function setConnection(text, status = 'idle') {
    nodes.connection.className = `online-connection ${status}`;
    nodes.connection.querySelector('span').textContent = text;
  }

  function setLandingMessage(text, bad = false) {
    nodes.landingMessage.textContent = text || '';
    nodes.landingMessage.className = `message ${bad ? 'bad-text' : ''}`;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Die Anfrage konnte nicht ausgeführt werden.');
    return data;
  }

  async function roomAction(path, body = {}, method = 'POST') {
    if (!credentials || actionPending) return null;
    actionPending = true;
    try {
      return await request(`/api/online/rooms/${encodeURIComponent(credentials.code)}/${path}`, {
        method,
        body: JSON.stringify({ token: credentials.token, ...body }),
      });
    } finally {
      actionPending = false;
    }
  }

  function setTab(tab) {
    const create = tab !== 'join';
    nodes.createPanel.classList.toggle('hidden', !create);
    nodes.joinPanel.classList.toggle('hidden', create);
    document.querySelectorAll('[data-online-tab]').forEach(button => {
      const active = button.dataset.onlineTab === (create ? 'create' : 'join');
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
  }

  function populateCategories() {
    if (!config) return;
    const type = nodes.quizType.value === 'adult' ? 'adult' : 'child';
    const current = nodes.category.value;
    const categories = config.catalogs?.[type]?.categories || [];
    nodes.category.innerHTML = ['Gemischt', ...categories].map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join('');
    nodes.category.value = categories.includes(current) || current === 'Gemischt' ? current : 'Gemischt';
  }

  function updateCreateMode() {
    nodes.hostTeamLabel.classList.toggle('hidden', nodes.gameMode.value !== 'teams');
  }

  async function loadConfig() {
    try {
      config = await request('/api/online/config');
      populateCategories();
    } catch (error) {
      setLandingMessage(`Online-Konfiguration konnte nicht geladen werden: ${error.message}`, true);
    }
  }

  async function createRoom(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    setLandingMessage('Online-Raum wird erstellt …');
    try {
      const hostName = nodes.hostName.value.trim();
      const data = await request('/api/online/rooms', {
        method: 'POST',
        body: JSON.stringify({
          hostName,
          title: nodes.roomTitle.value,
          visibility: nodes.visibility.value,
          gameMode: nodes.gameMode.value,
          quizType: nodes.quizType.value,
          category: nodes.category.value,
          questionCount: Number(nodes.questionCount.value),
          maxPlayers: Number(nodes.maxPlayers.value),
          team: nodes.hostTeam.value,
        }),
      });
      localStorage.setItem(NAME_KEY, hostName);
      enterRoom({ code: data.code, token: data.token, playerId: data.playerId, name: hostName }, data.state);
    } catch (error) {
      setLandingMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function previewJoinRoom() {
    const code = normalizeCode(nodes.joinCode.value);
    nodes.joinCode.value = code;
    roomPreview = null;
    nodes.roomPreview.classList.add('hidden');
    nodes.joinTeamLabel.classList.add('hidden');
    if (code.length !== 6) return;
    try {
      const data = await request(`/api/online/rooms/${encodeURIComponent(code)}/preview`);
      roomPreview = data.room;
      nodes.roomPreview.innerHTML = `<div><strong>${esc(roomPreview.title)}</strong><span>${roomPreview.playerCount}/${roomPreview.maxPlayers} Spieler · ${roomPreview.quizType === 'child' ? 'Kinderquiz' : 'Erwachsenenquiz'} · ${esc(roomPreview.category)} · ${roomPreview.questionCount} Fragen</span></div><span class="online-room-code-large-meta">${roomPreview.gameMode === 'teams' ? 'Teamspiel' : 'Einzelwertung'} · ${roomPreview.visibility === 'public' ? 'Öffentlich' : 'Privat'}</span>`;
      nodes.roomPreview.classList.remove('hidden');
      nodes.joinTeamLabel.classList.toggle('hidden', roomPreview.gameMode !== 'teams');
    } catch (error) {
      nodes.roomPreview.innerHTML = `<span class="bad-text">${esc(error.message)}</span>`;
      nodes.roomPreview.classList.remove('hidden');
    }
  }

  async function joinRoom(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    setLandingMessage('Verbindung zum Raum wird hergestellt …');
    try {
      const code = normalizeCode(nodes.joinCode.value);
      const name = nodes.joinName.value.trim();
      const data = await request(`/api/online/rooms/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        body: JSON.stringify({ name, team: nodes.joinTeam.value }),
      });
      localStorage.setItem(NAME_KEY, name);
      enterRoom({ code: data.code, token: data.token, playerId: data.playerId, name }, data.state);
    } catch (error) {
      setLandingMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  function renderResume() {
    nodes.resumeCard.classList.toggle('hidden', !credentials);
    if (!credentials) return;
    nodes.resumeTitle.textContent = `Raum ${credentials.code} wieder öffnen`;
    nodes.resumeText.textContent = credentials.name ? `Gespeicherter Spieler: ${credentials.name}` : 'Die letzte Online-Verbindung ist auf diesem Gerät gespeichert.';
  }

  async function resumeRoom() {
    if (!credentials) return;
    nodes.resumeButton.disabled = true;
    setLandingMessage('Gespeicherter Raum wird geprüft …');
    try {
      const state = await request(`/api/online/rooms/${encodeURIComponent(credentials.code)}/state?token=${encodeURIComponent(credentials.token)}`);
      enterRoom(credentials, state);
    } catch (error) {
      saveCredentials(null);
      setLandingMessage(`Die gespeicherte Verbindung ist nicht mehr gültig: ${error.message}`, true);
    } finally {
      nodes.resumeButton.disabled = false;
    }
  }

  function forgetRoom() {
    closeEvents();
    saveCredentials(null);
    roomState = null;
    setLandingMessage('Gespeicherte Online-Verbindung wurde entfernt.');
  }

  function enterRoom(nextCredentials, initialState) {
    saveCredentials(nextCredentials);
    roomState = initialState;
    nodes.landing.classList.add('hidden');
    nodes.roomView.classList.remove('hidden');
    setLandingMessage('');
    renderRoom();
    connectEvents();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showLanding() {
    closeEvents();
    clearInterval(countdownHandle);
    countdownHandle = null;
    roomState = null;
    nodes.roomView.classList.add('hidden');
    nodes.landing.classList.remove('hidden');
    setConnection('Bereit', 'idle');
    renderResume();
    loadPublicRooms();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeEvents() {
    eventSource?.close();
    eventSource = null;
  }

  function connectEvents() {
    closeEvents();
    if (!credentials) return;
    setConnection('Verbinden …', 'connecting');
    eventSource = new EventSource(`/api/online/rooms/${encodeURIComponent(credentials.code)}/events?token=${encodeURIComponent(credentials.token)}`);
    eventSource.addEventListener('open', () => setConnection('Live verbunden', 'connected'));
    eventSource.addEventListener('state', event => {
      try {
        const nextState = JSON.parse(event.data);
        const questionKey = `${nextState.room?.phase}:${nextState.room?.currentIndex}:${nextState.room?.question?.id || ''}`;
        if (questionKey !== lastQuestionKey) pendingAnswerIndex = null;
        lastQuestionKey = questionKey;
        roomState = nextState;
        renderRoom();
        setConnection('Live verbunden', 'connected');
      } catch {
        setConnection('Datenfehler', 'error');
      }
    });
    eventSource.addEventListener('removed', event => {
      let message = 'Du wurdest aus dem Raum entfernt.';
      try { message = JSON.parse(event.data).message || message; } catch { /* Standardtext */ }
      alert(message);
      saveCredentials(null);
      showLanding();
    });
    eventSource.onerror = () => setConnection('Verbindung wird erneuert …', 'connecting');
  }

  function roomPhaseLabel(phase) {
    if (phase === 'lobby') return 'Lobby';
    if (phase === 'question') return 'Frage läuft';
    if (phase === 'revealed') return 'Auflösung';
    if (phase === 'finished') return 'Beendet';
    return 'Online';
  }

  function renderHeader(room) {
    nodes.roomPhase.innerHTML = `<i></i>${esc(roomPhaseLabel(room.phase))}`;
    nodes.roomCode.textContent = room.code;
    nodes.roomTitleView.textContent = room.title;
    nodes.roomMeta.textContent = `${room.quizType === 'child' ? 'Kinderquiz' : 'Erwachsenenquiz'} · ${room.category} · ${room.questionCount} Fragen · ${room.gameMode === 'teams' ? 'Teams' : 'Einzelspieler'}`;
    let progress = 0;
    if (room.phase === 'question') progress = room.currentIndex / Math.max(1, room.totalQuestions) * 100;
    if (room.phase === 'revealed') progress = (room.currentIndex + 1) / Math.max(1, room.totalQuestions) * 100;
    if (room.phase === 'finished') progress = 100;
    nodes.progress.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }

  function renderPlayers(room, self) {
    nodes.playerCount.textContent = `Spieler (${room.players.length}/${room.maxPlayers})`;
    const showAnswered = room.phase === 'question';
    nodes.answeredCount.classList.toggle('hidden', !showAnswered);
    nodes.answeredCount.textContent = `${room.answeredCount}/${room.players.length} geantwortet`;

    nodes.teamBoard.classList.toggle('hidden', room.gameMode !== 'teams');
    if (room.gameMode === 'teams') {
      nodes.teamBoard.innerHTML = room.teams.map(team => `<div class="online-team-row ${team.id === 'blue' ? 'blue' : ''}"><div><strong>${esc(team.name)}</strong><span>${team.members.length ? esc(team.members.join(', ')) : 'Noch ohne Mitglied'}</span></div><span class="online-team-score">${team.score} P</span></div>`).join('');
    }

    nodes.playerList.innerHTML = room.players.map(player => {
      const isHost = player.id === room.hostPlayerId;
      const canKick = self?.isHost && room.phase === 'lobby' && player.id !== self.id;
      const stateText = room.phase === 'lobby'
        ? (player.ready ? 'Bereit' : 'Nicht bereit')
        : `${player.score} Punkte`;
      return `<div class="online-player-row ${player.connected ? 'connected' : ''} ${player.id === self?.id ? 'self' : ''}">
        <span class="online-player-avatar ${player.team === 'blue' ? 'blue' : ''}" style="background:${nameGradient(player.name)}">${esc(initials(player.name))}</span>
        <div class="online-player-copy"><strong>${esc(player.name)}${isHost ? ' ♛' : ''}</strong><span>${player.team ? esc(TEAM_NAMES[player.team]) : `${player.correct} richtig · ${player.wrong} falsch`}</span></div>
        <div><span class="online-ready-state ${room.phase === 'lobby' && !player.ready ? 'waiting' : ''}">${esc(stateText)}</span>${canKick ? `<button class="online-kick-button" type="button" data-kick-player="${player.id}" aria-label="Spieler entfernen">×</button>` : ''}</div>
      </div>`;
    }).join('');

    nodes.playerList.querySelectorAll('[data-kick-player]').forEach(button => button.addEventListener('click', async () => {
      const player = room.players.find(item => item.id === button.dataset.kickPlayer);
      if (!player || !confirm(`${player.name} wirklich aus dem Raum entfernen?`)) return;
      try { await roomAction('kick', { playerId: player.id }); } catch (error) { alert(error.message); }
    }));
  }

  function renderChat(room) {
    const messages = room.messages || [];
    nodes.chatMessages.innerHTML = messages.length
      ? messages.map(message => `<div class="online-chat-message ${message.type}">${message.type === 'system' ? esc(message.text) : `<strong>${esc(message.playerName)}:</strong> ${esc(message.text)}`}</div>`).join('')
      : '<div class="online-chat-message system">Noch keine Nachrichten im Raum.</div>';
    nodes.chatMessages.scrollTop = nodes.chatMessages.scrollHeight;
  }

  function allReady(room) {
    return room.players.length >= 2 && room.players.every(player => player.ready);
  }

  function teamsReady(room) {
    if (room.gameMode !== 'teams') return true;
    return room.players.some(player => player.team === 'violet') && room.players.some(player => player.team === 'blue');
  }

  function renderLobby(room, self) {
    const ready = allReady(room) && teamsReady(room);
    nodes.stage.innerHTML = `<div class="online-lobby">
      <div class="online-lobby-hero"><div><span class="app-kicker">Online-Lobby</span><h1>${esc(room.title)}</h1><p>Teile den Raumcode. Sobald alle Spieler verbunden und bereit sind, kann der Gastgeber das Quiz starten.</p></div><div class="online-room-code-large"><span>Raumcode</span><strong>${esc(room.code)}</strong></div></div>
      <div class="online-lobby-actions">
        <div class="online-action-card"><h3>${self.ready ? 'Du bist bereit' : 'Bist du startklar?'}</h3><p>${self.ready ? 'Die anderen Spieler sehen deinen Bereit-Status sofort.' : 'Bestätige, dass du für die erste Frage bereit bist.'}</p><button id="toggleOnlineReady" class="btn ${self.ready ? 'success' : 'primary'} wide-button" type="button">${self.ready ? 'Bereit ✓' : 'Auf Bereit setzen'}</button></div>
        ${room.gameMode === 'teams' ? `<div class="online-action-card"><h3>Dein Team</h3><p>Du kannst dein Team ändern, solange das Spiel noch nicht gestartet wurde.</p><div class="online-team-switch"><button class="${self.team === 'violet' ? 'active' : ''}" type="button" data-team="violet">Team Violett</button><button class="${self.team === 'blue' ? 'active' : ''}" type="button" data-team="blue">Team Blau</button></div></div>` : `<div class="online-action-card"><h3>Einzelwertung</h3><p>Jeder spielt für sich. Die Rangliste wird nach Punkten, richtigen Antworten und Namen sortiert.</p><span class="info-chip">${room.players.length}/${room.maxPlayers} Plätze belegt</span></div>`}
      </div>
      ${self.isHost ? `<div class="online-action-card"><h3>Gastgeber-Steuerung</h3><p>${ready ? 'Alle Voraussetzungen sind erfüllt. Das Quiz kann jetzt gestartet werden.' : 'Zum Start werden mindestens zwei bereite Spieler benötigt. Im Teammodus muss jedes Team besetzt sein.'}</p><button id="startOnlineGame" class="btn primary wide-button" type="button" ${ready ? '' : 'disabled'}>Online-Quiz starten</button></div>` : `<div class="online-waiting-card"><div><span class="online-waiting-symbol">⌛</span><h1>Warten auf den Gastgeber</h1><p>Sobald alle bereit sind, startet der Gastgeber die erste Frage.</p></div></div>`}
    </div>`;

    document.querySelector('#toggleOnlineReady')?.addEventListener('click', async () => {
      try { await roomAction('ready', { ready: !self.ready }); } catch (error) { alert(error.message); }
    });
    document.querySelectorAll('[data-team]').forEach(button => button.addEventListener('click', async () => {
      try { await roomAction('team', { team: button.dataset.team }, 'PATCH'); } catch (error) { alert(error.message); }
    }));
    document.querySelector('#startOnlineGame')?.addEventListener('click', async () => {
      try { await roomAction('start'); } catch (error) { alert(error.message); }
    });
  }

  function timerRemaining(room) {
    const serverOffset = Number(room.serverNow || Date.now()) - Date.now();
    const elapsed = Date.now() + serverOffset - Number(room.questionStartedAt || Date.now());
    return Math.max(0, Number(room.durationSec || 20) * 1000 - elapsed);
  }

  function renderQuestion(room, self) {
    const question = room.question;
    if (!question) {
      nodes.stage.innerHTML = '<div class="online-waiting-card"><div><span class="online-waiting-symbol">…</span><h1>Frage wird geladen</h1></div></div>';
      return;
    }
    nodes.stage.innerHTML = `<div class="online-question-view">
      <div class="online-question-top"><div><span class="eyebrow">${esc(question.category)}</span><h2>Frage ${room.currentIndex + 1} von ${room.totalQuestions}</h2></div><div id="onlineTimer" class="online-timer"><div><strong id="onlineTimerValue">20</strong><small>Sekunden</small></div></div></div>
      <div class="online-question-card"><h1>${esc(question.text)}</h1>${question.imageUrl ? `<img class="online-question-image" src="${esc(question.imageUrl)}" alt="Bild zur Quizfrage">` : ''}</div>
      <div class="online-answer-grid">${question.options.map((option, index) => `<button class="online-answer-button ${pendingAnswerIndex === index ? 'selected' : ''}" type="button" data-online-answer="${index}" ${self.answered ? 'disabled' : ''}><span class="online-answer-letter">${String.fromCharCode(65 + index)}</span><span class="online-answer-copy">${esc(option)}</span></button>`).join('')}</div>
      ${self.answered ? '<div class="online-answer-saved">Deine Antwort wurde sicher gespeichert. Warte auf die übrigen Spieler.</div>' : ''}
    </div>`;
    nodes.stage.querySelectorAll('[data-online-answer]').forEach(button => button.addEventListener('click', () => submitAnswer(Number(button.dataset.onlineAnswer))));
    startCountdown(room);
  }

  async function submitAnswer(answerIndex) {
    if (actionPending || roomState?.self?.answered) return;
    pendingAnswerIndex = answerIndex;
    renderRoom();
    try {
      await roomAction('answer', { answerIndex });
    } catch (error) {
      pendingAnswerIndex = null;
      alert(error.message);
      renderRoom();
    }
  }

  function startCountdown(room) {
    clearInterval(countdownHandle);
    const tick = () => {
      const remainingMs = timerRemaining(room);
      const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
      const timer = document.querySelector('#onlineTimer');
      const value = document.querySelector('#onlineTimerValue');
      if (timer) timer.style.setProperty('--online-timer', String(remainingMs / (Number(room.durationSec || 20) * 1000)));
      if (value) value.textContent = String(remaining);
      if (remainingMs <= 0) {
        clearInterval(countdownHandle);
        countdownHandle = null;
      }
    };
    tick();
    countdownHandle = setInterval(tick, 100);
  }

  function renderRevealed(room, self) {
    clearInterval(countdownHandle);
    countdownHandle = null;
    const question = room.question;
    const result = self.result;
    const resultTitle = result?.timedOut ? 'Zeit abgelaufen' : result?.correct ? 'Richtig beantwortet' : 'Leider falsch';
    const resultText = result?.timedOut ? 'Für diese Frage gibt es keine Punkte.' : result?.correct ? `10 Grundpunkte + ${result.remainingSeconds} Zeitpunkte` : 'Für die falsche Antwort werden 5 Punkte abgezogen.';
    nodes.stage.innerHTML = `<div class="online-question-view">
      <div class="online-question-top"><div><span class="eyebrow">Auflösung</span><h2>Frage ${room.currentIndex + 1} von ${room.totalQuestions}</h2></div><span class="status-chip">${room.answeredCount}/${room.players.length} Antworten</span></div>
      <div class="online-reveal-result ${result?.correct ? 'correct' : 'wrong'}"><span class="online-result-icon">${result?.correct ? '✓' : result?.timedOut ? '0' : '×'}</span><div><strong>${esc(resultTitle)}</strong><span>${esc(resultText)}</span></div><span class="online-result-points">${result?.delta > 0 ? '+' : ''}${Number(result?.delta || 0)} Punkte</span></div>
      <div class="online-question-card"><h1>${esc(question.text)}</h1></div>
      <div class="online-answer-grid">${question.options.map((option, index) => {
        const selected = result?.answerIndex === index;
        const correct = question.correctIndex === index;
        return `<button class="online-answer-button ${correct ? 'correct' : selected ? 'wrong' : ''}" type="button" disabled><span class="online-answer-letter">${String.fromCharCode(65 + index)}</span><span class="online-answer-copy">${esc(option)}</span></button>`;
      }).join('')}</div>
      <div class="online-explanation"><strong>Kurz erklärt</strong><p>${esc(question.explanation || 'Zu dieser Frage ist noch keine zusätzliche Erklärung hinterlegt.')}</p></div>
      ${self.isHost ? `<button id="onlineNextQuestion" class="btn primary wide-button" type="button">${room.currentIndex + 1 >= room.totalQuestions ? 'Endstand anzeigen' : 'Nächste Frage starten'}</button>` : '<div class="online-answer-saved">Warte, bis der Gastgeber die nächste Frage startet.</div>'}
    </div>`;
    document.querySelector('#onlineNextQuestion')?.addEventListener('click', async () => {
      try { await roomAction('next'); } catch (error) { alert(error.message); }
    });
  }

  function renderFinished(room, self) {
    clearInterval(countdownHandle);
    countdownHandle = null;
    const ranking = room.gameMode === 'teams' ? room.teams : room.players;
    const bestScore = ranking[0]?.score ?? 0;
    const winners = ranking.filter(item => item.score === bestScore);
    const winnerName = winners.map(item => item.name).join(' & ') || 'Quiz beendet';
    nodes.stage.innerHTML = `<div class="online-finish-view">
      <div class="online-winner-card"><div class="online-winner-symbol">1</div><span class="eyebrow">${winners.length > 1 ? 'Gemeinsamer Sieg' : 'Online-Quiz gewonnen'}</span><h1>${esc(winnerName)}</h1><p>${bestScore} Punkte nach ${room.totalQuestions} Fragen</p></div>
      <div class="online-final-list">${ranking.map((entry, index) => {
        const memberText = room.gameMode === 'teams' ? entry.members.join(', ') : `${entry.correct} richtig · ${entry.wrong} falsch · ${entry.unanswered} ohne Antwort`;
        return `<div class="online-final-row"><span class="online-final-rank">${index + 1}</span><span class="online-player-avatar ${entry.id === 'blue' || entry.team === 'blue' ? 'blue' : ''}" style="background:${nameGradient(entry.name)}">${esc(initials(entry.name))}</span><div class="online-player-copy"><strong>${esc(entry.name)}</strong><span>${esc(memberText)}</span></div><div class="online-final-stat"><strong>${entry.score}</strong><span>Punkte</span></div><div class="online-final-stat"><strong>${entry.correct}</strong><span>Richtig</span></div><div class="online-final-stat"><strong>${entry.wrong}</strong><span>Falsch</span></div></div>`;
      }).join('')}</div>
      <div class="online-final-actions">${self.isHost ? '<button id="restartOnlineRoom" class="btn primary" type="button">Neue Runde vorbereiten</button>' : ''}<button id="onlineReturnHome" class="btn ghost" type="button">Zur Startseite</button></div>
    </div>`;
    document.querySelector('#restartOnlineRoom')?.addEventListener('click', async () => {
      try { await roomAction('restart'); } catch (error) { alert(error.message); }
    });
    document.querySelector('#onlineReturnHome')?.addEventListener('click', () => { location.href = '/'; });
  }

  function renderRoom() {
    if (!roomState?.room || !roomState?.self) return;
    const { room, self } = roomState;
    renderHeader(room);
    renderPlayers(room, self);
    renderChat(room);
    if (room.phase === 'lobby') renderLobby(room, self);
    else if (room.phase === 'question') renderQuestion(room, self);
    else if (room.phase === 'revealed') renderRevealed(room, self);
    else renderFinished(room, self);
  }

  async function leaveCurrentRoom() {
    if (!credentials) return showLanding();
    if (!confirm('Online-Raum wirklich verlassen? Während eines laufenden Spiels bleibst du in der Wertung, wirst aber als getrennt angezeigt.')) return;
    try { await roomAction('leave'); } catch { /* lokale Verbindung wird trotzdem beendet */ }
    saveCredentials(null);
    showLanding();
  }

  async function copyText(text, confirmation = 'Kopiert') {
    try {
      await navigator.clipboard.writeText(text);
      setConnection(confirmation, 'connected');
      setTimeout(() => {
        if (roomState) setConnection('Live verbunden', 'connected');
        else setConnection('Bereit', 'idle');
      }, 1300);
    } catch {
      prompt('Bitte kopieren:', text);
    }
  }

  async function shareRoom() {
    if (!credentials) return;
    const text = `Tritt meinem Ahnsen-Quiz-Raum bei. Raumcode: ${credentials.code}`;
    const url = `${location.origin}/online?room=${credentials.code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Ahnsen Quiz', text, url }); return; } catch { /* Kopieren als Alternative */ }
    }
    copyText(`${text}\n${url}`, 'Einladung kopiert');
  }

  async function sendChat(event) {
    event.preventDefault();
    const message = nodes.chatInput.value.trim();
    if (!message) return;
    nodes.chatInput.value = '';
    try { await roomAction('chat', { message }); } catch (error) { alert(error.message); }
  }

  async function sendReaction(reaction) {
    try { await roomAction('chat', { reaction }); } catch (error) { alert(error.message); }
  }

  async function loadPublicRooms() {
    try {
      const data = await request('/api/online/rooms/public');
      const rooms = data.rooms || [];
      nodes.publicRooms.innerHTML = rooms.length
        ? rooms.map(room => `<article class="online-public-room"><div class="online-public-room-head"><div><strong>${esc(room.title)}</strong><span>${room.quizType === 'child' ? 'Kinderquiz' : 'Erwachsenenquiz'} · ${esc(room.category)}</span></div><span class="online-public-room-code">${esc(room.code)}</span></div><span>${room.playerCount}/${room.maxPlayers} Spieler · ${room.questionCount} Fragen · ${room.gameMode === 'teams' ? 'Teams' : 'Einzelwertung'}</span><button class="btn secondary small" type="button" data-public-room="${room.code}">Beitreten</button></article>`).join('')
        : '<div class="online-empty-card">Aktuell wartet kein öffentlicher Raum auf weitere Spieler.</div>';
      nodes.publicRooms.querySelectorAll('[data-public-room]').forEach(button => button.addEventListener('click', () => {
        setTab('join');
        nodes.joinCode.value = button.dataset.publicRoom;
        previewJoinRoom();
        document.querySelector('.online-entry-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
    } catch (error) {
      nodes.publicRooms.innerHTML = `<div class="online-empty-card bad-text">${esc(error.message)}</div>`;
    }
  }

  function bind() {
    document.querySelectorAll('[data-online-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.onlineTab)));
    nodes.createForm.addEventListener('submit', createRoom);
    nodes.joinForm.addEventListener('submit', joinRoom);
    nodes.gameMode.addEventListener('change', updateCreateMode);
    nodes.quizType.addEventListener('change', populateCategories);
    nodes.joinCode.addEventListener('input', () => {
      nodes.joinCode.value = normalizeCode(nodes.joinCode.value);
      clearTimeout(previewHandle);
      previewHandle = setTimeout(previewJoinRoom, 320);
    });
    nodes.resumeButton.addEventListener('click', resumeRoom);
    nodes.forgetButton.addEventListener('click', forgetRoom);
    nodes.refreshPublicRooms.addEventListener('click', loadPublicRooms);
    nodes.copyCode.addEventListener('click', () => credentials && copyText(credentials.code, 'Code kopiert'));
    nodes.shareRoom.addEventListener('click', shareRoom);
    nodes.leaveRoom.addEventListener('click', leaveCurrentRoom);
    nodes.chatForm.addEventListener('submit', sendChat);
    document.querySelectorAll('[data-reaction]').forEach(button => button.addEventListener('click', () => sendReaction(button.dataset.reaction)));
    window.addEventListener('beforeunload', closeEvents);
  }

  async function init() {
    bind();
    const savedName = localStorage.getItem(NAME_KEY) || '';
    nodes.hostName.value = savedName;
    nodes.joinName.value = savedName;
    updateCreateMode();
    renderResume();
    await loadConfig();
    await loadPublicRooms();
    publicRefreshHandle = setInterval(loadPublicRooms, 30000);
    const roomFromUrl = normalizeCode(new URLSearchParams(location.search).get('room'));
    if (roomFromUrl) {
      setTab('join');
      nodes.joinCode.value = roomFromUrl;
      previewJoinRoom();
      document.querySelector('.online-entry-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  init();
})();
