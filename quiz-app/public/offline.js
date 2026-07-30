'use strict';

(() => {
  const CATALOG_KEY = 'ahnsen_offline_catalog_v1';
  const GAME_KEY = 'ahnsen_offline_game_v1';
  const SETUP_KEY = 'ahnsen_offline_setup_v1';
  const PARTY_SECONDS = 20;
  const participantGradients = [
    'linear-gradient(145deg,#a65cff,#465dff)',
    'linear-gradient(145deg,#28bde9,#2369cc)',
    'linear-gradient(145deg,#2fcf91,#137d6a)',
    'linear-gradient(145deg,#ffb148,#d86445)',
    'linear-gradient(145deg,#ed68b9,#9a3d9e)',
    'linear-gradient(145deg,#9dca4c,#488c45)',
    'linear-gradient(145deg,#ff7479,#b63f62)',
    'linear-gradient(145deg,#57d5cb,#4571d4)',
  ];

  const nodes = {
    setup: document.querySelector('#offlineSetup'),
    game: document.querySelector('#offlineGame'),
    catalogStatus: document.querySelector('#catalogStatus'),
    catalogHint: document.querySelector('#offlineCatalogHint'),
    participants: document.querySelector('#offlineParticipants'),
    participantLimit: document.querySelector('#participantLimit'),
    addParticipant: document.querySelector('#addOfflineParticipant'),
    quizType: document.querySelector('#offlineQuizType'),
    category: document.querySelector('#offlineCategory'),
    rounds: document.querySelector('#offlineRounds'),
    summary: document.querySelector('#offlineSetupSummary'),
    setupMessage: document.querySelector('#offlineSetupMessage'),
    startButton: document.querySelector('#startOfflineButton'),
    resumeCard: document.querySelector('#resumeOfflineCard'),
    resumeTitle: document.querySelector('#resumeOfflineTitle'),
    resumeText: document.querySelector('#resumeOfflineText'),
    resumeButton: document.querySelector('#resumeOfflineButton'),
    discardButton: document.querySelector('#discardOfflineButton'),
    roundChip: document.querySelector('#offlineRoundChip'),
    turnChip: document.querySelector('#offlineTurnChip'),
    modeChip: document.querySelector('#offlineModeChip'),
    progress: document.querySelector('#offlineProgress'),
    stage: document.querySelector('#offlineStage'),
    scoreboard: document.querySelector('#offlineScoreboard'),
    leaveButton: document.querySelector('#leaveOfflineGame'),
  };

  let catalog = null;
  let game = null;
  let timerHandle = null;
  let setupState = loadSetup() || {
    kind: 'players',
    quizType: 'child',
    category: 'Gemischt',
    rounds: 5,
    mode: 'family',
    participants: [makeParticipant(0, 'Spieler 1'), makeParticipant(1, 'Spieler 2')],
  };

  function id() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function makeParticipant(index, name) {
    return {
      id: id(),
      name: name || `Spieler ${index + 1}`,
      gradient: participantGradients[index % participantGradients.length],
    };
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?';
  }

  function shuffle(values) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function loadSetup() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETUP_KEY) || 'null');
      if (!parsed || !Array.isArray(parsed.participants) || parsed.participants.length < 2) return null;
      parsed.kind = parsed.kind === 'teams' ? 'teams' : 'players';
      parsed.quizType = parsed.quizType === 'adult' ? 'adult' : 'child';
      parsed.category = String(parsed.category || 'Gemischt');
      parsed.rounds = [3, 5, 8, 10].includes(Number(parsed.rounds)) ? Number(parsed.rounds) : 5;
      parsed.mode = parsed.mode === 'party' ? 'party' : 'family';
      parsed.participants = parsed.participants.slice(0, parsed.kind === 'teams' ? 4 : 8).map((participant, index) => ({
        id: participant.id || id(),
        name: String(participant.name || `${parsed.kind === 'teams' ? 'Team' : 'Spieler'} ${index + 1}`).slice(0, 30),
        gradient: participant.gradient || participantGradients[index % participantGradients.length],
      }));
      return parsed;
    } catch {
      return null;
    }
  }

  function saveSetup() {
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(setupState)); } catch { /* optionale Komfortfunktion */ }
  }

  function loadSavedGame() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GAME_KEY) || 'null');
      if (!parsed || !Array.isArray(parsed.participants) || !Array.isArray(parsed.questions)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveGame() {
    if (!game) return;
    game.savedAt = Date.now();
    try { localStorage.setItem(GAME_KEY, JSON.stringify(game)); } catch { /* Spiel läuft dennoch weiter */ }
    renderResumeCard();
  }

  function clearGame() {
    game = null;
    clearInterval(timerHandle);
    timerHandle = null;
    localStorage.removeItem(GAME_KEY);
    renderResumeCard();
  }

  function setMessage(text, bad = false) {
    nodes.setupMessage.textContent = text || '';
    nodes.setupMessage.className = `message ${bad ? 'bad-text' : ''}`;
  }

  function setCatalogStatus(text, status = '') {
    nodes.catalogStatus.className = `offline-status ${status}`.trim();
    nodes.catalogStatus.innerHTML = `<i></i>${esc(text)}`;
  }

  function validCatalog(value) {
    return value?.catalogs?.adult?.length && value?.catalogs?.child?.length;
  }

  async function loadCatalog() {
    let cached = null;
    try {
      const parsed = JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null');
      if (validCatalog(parsed)) {
        cached = parsed;
        catalog = parsed;
        setCatalogStatus('Offline-Katalog verfügbar', 'cached');
        refreshSetup();
      }
    } catch { /* ungültiger Cache wird überschrieben */ }

    try {
      const response = await fetch('/api/offline/catalog', { cache: 'no-store' });
      if (!response.ok) throw new Error('Fragenkatalog konnte nicht geladen werden.');
      const fresh = await response.json();
      if (!validCatalog(fresh)) throw new Error('Der Fragenkatalog ist unvollständig.');
      catalog = fresh;
      try { localStorage.setItem(CATALOG_KEY, JSON.stringify(fresh)); } catch { /* Online-Spiel bleibt möglich */ }
      setCatalogStatus('500 Fragen offline bereit', 'ready');
      refreshSetup();
    } catch (error) {
      if (cached) {
        setCatalogStatus('Gespeicherter Katalog aktiv', 'cached');
        nodes.catalogHint.textContent = 'Keine Internetverbindung erkannt. Der zuletzt gespeicherte Fragenkatalog wird verwendet.';
      } else {
        setCatalogStatus('Katalog nicht verfügbar', 'error');
        nodes.catalogHint.textContent = `${error.message} Öffne diese Seite einmal mit Internetverbindung, damit die Fragen auf dem Gerät gespeichert werden.`;
        nodes.startButton.disabled = true;
      }
    }
  }

  function maxParticipants() {
    return setupState.kind === 'teams' ? 4 : 8;
  }

  function labelSingular() {
    return setupState.kind === 'teams' ? 'Team' : 'Spieler';
  }

  function labelPlural() {
    return setupState.kind === 'teams' ? 'Teams' : 'Spieler';
  }

  function renderParticipants() {
    const minimumReached = setupState.participants.length <= 2;
    nodes.participants.innerHTML = setupState.participants.map((participant, index) => `<div class="offline-participant-row">
      <span class="offline-participant-avatar" style="--participant-gradient:${participant.gradient}">${esc(initials(participant.name))}</span>
      <input type="text" maxlength="30" value="${esc(participant.name)}" data-participant-id="${participant.id}" aria-label="Name von ${labelSingular()} ${index + 1}">
      <button class="offline-remove-participant" type="button" data-remove-participant="${participant.id}" ${minimumReached ? 'disabled' : ''} aria-label="${labelSingular()} entfernen">×</button>
    </div>`).join('');

    nodes.participants.querySelectorAll('[data-participant-id]').forEach(input => input.addEventListener('input', () => {
      const participant = setupState.participants.find(item => item.id === input.dataset.participantId);
      if (!participant) return;
      participant.name = input.value.slice(0, 30);
      input.closest('.offline-participant-row').querySelector('.offline-participant-avatar').textContent = initials(participant.name);
      saveSetup();
      renderSummary();
    }));

    nodes.participants.querySelectorAll('[data-remove-participant]').forEach(button => button.addEventListener('click', () => {
      if (setupState.participants.length <= 2) return;
      setupState.participants = setupState.participants.filter(item => item.id !== button.dataset.removeParticipant);
      saveSetup();
      refreshSetup();
    }));

    nodes.participantLimit.textContent = `${setupState.participants.length} von ${maxParticipants()}`;
    nodes.addParticipant.disabled = setupState.participants.length >= maxParticipants();
    nodes.addParticipant.querySelector('strong').textContent = `Weiteren ${labelSingular()} hinzufügen`;
  }

  function renderKind() {
    document.querySelectorAll('[data-offline-kind]').forEach(button => {
      const active = button.dataset.offlineKind === setupState.kind;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
  }

  function availableQuestions() {
    if (!catalog) return [];
    const source = catalog.catalogs[setupState.quizType] || [];
    return setupState.category === 'Gemischt' ? source : source.filter(question => question.category === setupState.category);
  }

  function renderCategories() {
    const source = catalog?.catalogs?.[setupState.quizType] || [];
    const categories = [...new Set(source.map(question => question.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    if (setupState.category !== 'Gemischt' && !categories.includes(setupState.category)) setupState.category = 'Gemischt';
    nodes.category.innerHTML = ['Gemischt', ...categories].map(category => `<option value="${esc(category)}" ${category === setupState.category ? 'selected' : ''}>${esc(category)}</option>`).join('');
    const count = availableQuestions().length;
    const totalNeeded = setupState.participants.length * setupState.rounds;
    nodes.catalogHint.textContent = catalog
      ? `${count} Fragen in dieser Auswahl gespeichert. Für das Spiel werden ${totalNeeded} Fragen benötigt${count < totalNeeded ? '; einzelne Fragen können sich daher wiederholen' : ''}.`
      : 'Der Fragenkatalog wird vorbereitet …';
  }

  function renderMode() {
    document.querySelectorAll('[data-offline-mode]').forEach(button => {
      const active = button.dataset.offlineMode === setupState.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setupValidation() {
    const names = setupState.participants.map(participant => participant.name.trim());
    if (!catalog) return { ok: false, error: 'Der Fragenkatalog ist noch nicht verfügbar.' };
    if (names.some(name => name.length < 1)) return { ok: false, error: `Bitte für jeden ${labelSingular()} einen Namen eintragen.` };
    if (new Set(names.map(name => name.toLocaleLowerCase('de-DE'))).size !== names.length) return { ok: false, error: 'Jeder Name darf nur einmal vorkommen.' };
    if (!availableQuestions().length) return { ok: false, error: 'Für diese Auswahl sind keine Fragen vorhanden.' };
    return { ok: true, error: '' };
  }

  function renderSummary() {
    const totalQuestions = setupState.participants.length * setupState.rounds;
    nodes.summary.innerHTML = `
      <div class="offline-summary-row"><span>Teilnehmer</span><strong>${setupState.participants.length} ${labelPlural()}</strong></div>
      <div class="offline-summary-row"><span>Fragenwelt</span><strong>${setupState.quizType === 'child' ? 'Kinderquiz' : 'Erwachsenenquiz'} · ${esc(setupState.category)}</strong></div>
      <div class="offline-summary-row"><span>Umfang</span><strong>${setupState.rounds} Runden · ${totalQuestions} Fragen</strong></div>
      <div class="offline-summary-row"><span>Spielstil</span><strong>${setupState.mode === 'party' ? 'Party mit 20-Sekunden-Timer' : 'Familie ohne Zeitdruck'}</strong></div>`;
    const validation = setupValidation();
    nodes.startButton.disabled = !validation.ok;
    if (validation.ok && nodes.setupMessage.classList.contains('bad-text')) setMessage('');
  }

  function refreshSetup() {
    nodes.quizType.value = setupState.quizType;
    nodes.rounds.value = String(setupState.rounds);
    renderKind();
    renderParticipants();
    renderCategories();
    renderMode();
    renderSummary();
  }

  function buildQuestionSet() {
    const pool = availableQuestions();
    const total = setupState.participants.length * setupState.rounds;
    const selected = [];
    let batch = shuffle(pool);
    while (selected.length < total) {
      if (!batch.length) batch = shuffle(pool);
      selected.push(structuredClone(batch.pop()));
    }
    return selected;
  }

  function newGame() {
    const validation = setupValidation();
    if (!validation.ok) {
      setMessage(validation.error, true);
      return;
    }
    const participants = setupState.participants.map(participant => ({
      ...structuredClone(participant),
      score: 0,
      correct: 0,
      wrong: 0,
      unanswered: 0,
      answers: 0,
    }));
    game = {
      id: id(),
      kind: setupState.kind,
      quizType: setupState.quizType,
      category: setupState.category,
      rounds: setupState.rounds,
      mode: setupState.mode,
      participants,
      questions: buildQuestionSet(),
      turnIndex: 0,
      phase: 'handoff',
      questionStartedAt: null,
      result: null,
      answers: [],
      startedAt: Date.now(),
      completedAt: null,
    };
    saveGame();
    showGame();
  }

  function currentParticipant() {
    return game?.participants?.[game.turnIndex % game.participants.length] || null;
  }

  function currentQuestion() {
    return game?.questions?.[game.turnIndex] || null;
  }

  function currentRound() {
    return game ? Math.floor(game.turnIndex / game.participants.length) + 1 : 1;
  }

  function sortedParticipants() {
    return [...game.participants].sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name, 'de'));
  }

  function renderScoreboard() {
    const activeId = game.phase === 'finished' ? null : currentParticipant()?.id;
    nodes.scoreboard.innerHTML = sortedParticipants().map((participant, index) => `<div class="offline-score-row ${participant.id === activeId ? 'active' : ''}">
      <span class="offline-score-rank">${index + 1}</span>
      <span class="offline-score-avatar" style="--participant-gradient:${participant.gradient}">${esc(initials(participant.name))}</span>
      <div class="offline-score-name"><strong>${esc(participant.name)}</strong><span>${participant.correct} richtig · ${participant.wrong} falsch</span></div>
      <span class="offline-score-points">${participant.score}</span>
    </div>`).join('');
  }

  function updateGameHeader() {
    const participant = currentParticipant();
    const totalTurns = game.questions.length;
    const completedTurns = game.phase === 'finished' ? totalTurns : game.turnIndex;
    nodes.roundChip.textContent = game.phase === 'finished' ? 'Spiel beendet' : `Runde ${currentRound()} von ${game.rounds}`;
    nodes.turnChip.textContent = game.phase === 'finished' ? 'Endstand' : participant.name;
    nodes.modeChip.textContent = game.mode === 'party' ? 'Party-Modus' : 'Familien-Modus';
    nodes.progress.style.width = `${Math.round(completedTurns / totalTurns * 100)}%`;
  }

  function showGame() {
    clearInterval(timerHandle);
    timerHandle = null;
    nodes.setup.classList.add('hidden');
    nodes.game.classList.remove('hidden');
    renderGame();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showSetup() {
    clearInterval(timerHandle);
    timerHandle = null;
    nodes.game.classList.add('hidden');
    nodes.setup.classList.remove('hidden');
    refreshSetup();
    renderResumeCard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderHandoff() {
    const participant = currentParticipant();
    nodes.stage.innerHTML = `<div class="offline-handoff"><div class="offline-handoff-inner">
      <span class="eyebrow">Runde ${currentRound()} von ${game.rounds}</span>
      <div class="offline-handoff-avatar" style="--participant-gradient:${participant.gradient}">${esc(initials(participant.name))}</div>
      <h1>${esc(participant.name)} ist dran</h1>
      <p>Gib das Gerät jetzt an ${game.kind === 'teams' ? 'das Team' : 'die Person'}. Die Frage wird erst sichtbar, wenn auf „Bereit“ gedrückt wird.</p>
      <button id="offlineReadyButton" class="btn primary wide-button" type="button">Bereit – Frage anzeigen</button>
    </div></div>`;
    document.querySelector('#offlineReadyButton').addEventListener('click', beginQuestion);
  }

  function beginQuestion() {
    game.phase = 'question';
    game.questionStartedAt = Date.now();
    game.result = null;
    saveGame();
    renderGame();
  }

  function timerRemaining() {
    if (game.mode !== 'party' || game.phase !== 'question') return null;
    return Math.max(0, PARTY_SECONDS - (Date.now() - game.questionStartedAt) / 1000);
  }

  function timerHtml() {
    if (game.mode !== 'party') return '<span class="status-chip">Ohne Zeitdruck</span>';
    const remaining = Math.max(0, Math.ceil(timerRemaining()));
    return `<div id="offlineTimer" class="offline-timer" style="--timer-progress:${remaining / PARTY_SECONDS}"><div><strong id="offlineTimerValue">${remaining}</strong><small>Sekunden</small></div></div>`;
  }

  function renderQuestion() {
    const question = currentQuestion();
    const participant = currentParticipant();
    nodes.stage.innerHTML = `<div class="offline-question-view">
      <div class="offline-question-meta"><div><span class="eyebrow">${esc(question.category)}</span><h2>${esc(participant.name)} beantwortet Frage ${game.turnIndex + 1}</h2></div>${timerHtml()}</div>
      <div class="offline-question-card"><h1>${esc(question.text)}</h1>${question.imageUrl ? `<img class="offline-question-image" src="${esc(question.imageUrl)}" alt="Bild zur Quizfrage">` : ''}</div>
      <div class="offline-answer-grid">${question.options.map((option, index) => `<button class="offline-answer-button" type="button" data-offline-answer="${index}"><span class="offline-answer-letter">${String.fromCharCode(65 + index)}</span><span class="offline-answer-text">${esc(option)}</span></button>`).join('')}</div>
    </div>`;
    nodes.stage.querySelectorAll('[data-offline-answer]').forEach(button => button.addEventListener('click', () => answerQuestion(Number(button.dataset.offlineAnswer))));
    startTimer();
  }

  function startTimer() {
    clearInterval(timerHandle);
    timerHandle = null;
    if (game.mode !== 'party' || game.phase !== 'question') return;
    const tick = () => {
      const remaining = timerRemaining();
      const timer = document.querySelector('#offlineTimer');
      const value = document.querySelector('#offlineTimerValue');
      if (timer) timer.style.setProperty('--timer-progress', String(Math.max(0, remaining / PARTY_SECONDS)));
      if (value) value.textContent = String(Math.max(0, Math.ceil(remaining)));
      if (remaining <= 0) {
        clearInterval(timerHandle);
        timerHandle = null;
        answerQuestion(null);
      }
    };
    tick();
    timerHandle = setInterval(tick, 120);
  }

  function answerQuestion(answerIndex) {
    if (!game || game.phase !== 'question') return;
    clearInterval(timerHandle);
    timerHandle = null;
    const question = currentQuestion();
    const participant = currentParticipant();
    const rawRemaining = game.mode === 'party' ? timerRemaining() : 0;
    const timedOut = game.mode === 'party' && rawRemaining <= 0;
    const selectedIndex = timedOut ? null : (Number.isInteger(answerIndex) ? answerIndex : null);
    const correct = selectedIndex !== null && selectedIndex === question.correctIndex;
    const remainingSeconds = game.mode === 'party' ? Math.max(0, Math.ceil(rawRemaining)) : 0;
    const delta = timedOut ? 0 : game.mode === 'party' ? (correct ? 10 + remainingSeconds : -5) : (correct ? 10 : 0);

    participant.score += delta;
    participant.answers += 1;
    if (timedOut) participant.unanswered += 1;
    else if (correct) participant.correct += 1;
    else participant.wrong += 1;

    game.result = {
      participantId: participant.id,
      answerIndex: selectedIndex,
      correctIndex: question.correctIndex,
      correct,
      timedOut,
      remainingSeconds,
      delta,
    };
    game.answers.push({
      turnIndex: game.turnIndex,
      participantId: participant.id,
      questionId: question.id,
      category: question.category,
      correct,
      timedOut,
      delta,
    });
    game.phase = 'feedback';
    saveGame();
    renderGame();
  }

  function renderFeedback() {
    const question = currentQuestion();
    const result = game.result;
    const participant = currentParticipant();
    const status = result.timedOut ? 'Zeit abgelaufen' : result.correct ? 'Richtig beantwortet' : 'Leider falsch';
    const detail = result.timedOut
      ? 'Für diese Frage gibt es keine Punkte.'
      : result.correct
        ? (game.mode === 'party' ? `10 Grundpunkte + ${result.remainingSeconds} Zeitpunkte` : '10 Punkte im Familien-Modus')
        : (game.mode === 'party' ? 'Im Party-Modus werden 5 Punkte abgezogen.' : 'Im Familien-Modus gibt es keine Minuspunkte.');
    nodes.stage.innerHTML = `<div class="offline-feedback">
      <div class="offline-feedback-result ${result.correct ? 'correct' : 'wrong'}"><span class="offline-feedback-icon">${result.correct ? '✓' : result.timedOut ? '0' : '×'}</span><div><strong>${esc(status)}</strong><span>${esc(detail)}</span></div><span class="offline-feedback-points">${result.delta > 0 ? '+' : ''}${result.delta} Punkte</span></div>
      <div class="offline-question-card"><span class="eyebrow">Richtige Antwort</span><h1>${String.fromCharCode(65 + question.correctIndex)} – ${esc(question.options[question.correctIndex])}</h1></div>
      <div class="offline-explanation"><strong>Kurz erklärt</strong><p>${esc(question.explanation || 'Zu dieser Frage ist noch keine zusätzliche Erklärung hinterlegt.')}</p></div>
      <button id="offlineNextTurn" class="btn primary wide-button" type="button">${game.turnIndex + 1 >= game.questions.length ? 'Endstand anzeigen' : `Weiter zu ${esc(game.participants[(game.turnIndex + 1) % game.participants.length].name)}`}</button>
    </div>`;
    document.querySelector('#offlineNextTurn').addEventListener('click', nextTurn);
  }

  function nextTurn() {
    if (game.turnIndex + 1 >= game.questions.length) {
      game.phase = 'finished';
      game.completedAt = Date.now();
      saveGame();
      renderGame();
      return;
    }
    game.turnIndex += 1;
    game.phase = 'handoff';
    game.questionStartedAt = null;
    game.result = null;
    saveGame();
    renderGame();
  }

  function renderResult() {
    const ranking = sortedParticipants();
    const topScore = ranking[0]?.score ?? 0;
    const winners = ranking.filter(participant => participant.score === topScore);
    const winnerText = winners.length > 1 ? winners.map(item => item.name).join(' & ') : winners[0]?.name || 'Niemand';
    nodes.stage.innerHTML = `<div class="offline-result-view">
      <div class="offline-winner-card"><div class="offline-winner-symbol">1</div><span class="eyebrow">${winners.length > 1 ? 'Gemeinsamer Sieg' : 'Quiz gewonnen'}</span><h1>${esc(winnerText)}</h1><p>${topScore} Punkte nach ${game.rounds} Runden pro ${game.kind === 'teams' ? 'Team' : 'Spieler'}</p></div>
      <div class="offline-final-list">${ranking.map((participant, index) => {
        const accuracy = participant.answers ? Math.round(participant.correct / participant.answers * 100) : 0;
        return `<div class="offline-final-row"><span class="offline-score-rank">${index + 1}</span><span class="offline-score-avatar" style="--participant-gradient:${participant.gradient}">${esc(initials(participant.name))}</span><div class="offline-score-name"><strong>${esc(participant.name)}</strong><span>${participant.correct} richtig · ${participant.wrong} falsch · ${participant.unanswered} ohne Antwort</span></div><div class="offline-final-stat"><strong>${participant.score}</strong><span>Punkte</span></div><div class="offline-final-stat"><strong>${accuracy}%</strong><span>Treffer</span></div><div class="offline-final-stat"><strong>${participant.correct}</strong><span>Richtig</span></div></div>`;
      }).join('')}</div>
      <div class="offline-result-actions"><button id="offlinePlayAgain" class="btn primary" type="button">Noch einmal spielen</button><button id="offlineNewSettings" class="btn secondary" type="button">Neue Einstellungen</button><button id="offlineBackHome" class="btn ghost" type="button">Zur Startseite</button></div>
    </div>`;
    document.querySelector('#offlinePlayAgain').addEventListener('click', () => {
      clearGame();
      newGame();
    });
    document.querySelector('#offlineNewSettings').addEventListener('click', () => {
      clearGame();
      showSetup();
    });
    document.querySelector('#offlineBackHome').addEventListener('click', () => { location.href = '/'; });
  }

  function renderGame() {
    if (!game) return showSetup();
    updateGameHeader();
    renderScoreboard();
    if (game.phase === 'handoff') renderHandoff();
    else if (game.phase === 'question') renderQuestion();
    else if (game.phase === 'feedback') renderFeedback();
    else renderResult();
  }

  function renderResumeCard() {
    const saved = game || loadSavedGame();
    nodes.resumeCard.classList.toggle('hidden', !saved);
    if (!saved) return;
    const participantCount = saved.participants?.length || 0;
    const completed = saved.phase === 'finished';
    nodes.resumeTitle.textContent = completed ? 'Endstand erneut ansehen' : 'Gespeichertes Spiel fortsetzen';
    nodes.resumeText.textContent = `${participantCount} ${saved.kind === 'teams' ? 'Teams' : 'Spieler'} · ${saved.rounds} Runden · ${saved.mode === 'party' ? 'Party-Modus' : 'Familien-Modus'}${completed ? ' · beendet' : ` · Runde ${Math.floor(saved.turnIndex / participantCount) + 1}`}`;
  }

  function resumeGame() {
    game = loadSavedGame();
    if (!game) return showSetup();
    showGame();
  }

  function discardSavedGame() {
    if (!confirm('Gespeichertes Offline-Spiel wirklich verwerfen?')) return;
    clearGame();
    showSetup();
  }

  function bindSetup() {
    document.querySelectorAll('[data-offline-kind]').forEach(button => button.addEventListener('click', () => {
      const nextKind = button.dataset.offlineKind === 'teams' ? 'teams' : 'players';
      if (nextKind === setupState.kind) return;
      setupState.kind = nextKind;
      setupState.participants = [
        makeParticipant(0, `${nextKind === 'teams' ? 'Team' : 'Spieler'} 1`),
        makeParticipant(1, `${nextKind === 'teams' ? 'Team' : 'Spieler'} 2`),
      ];
      saveSetup();
      refreshSetup();
    }));

    nodes.addParticipant.addEventListener('click', () => {
      if (setupState.participants.length >= maxParticipants()) return;
      const index = setupState.participants.length;
      setupState.participants.push(makeParticipant(index, `${labelSingular()} ${index + 1}`));
      saveSetup();
      refreshSetup();
    });

    nodes.quizType.addEventListener('change', () => {
      setupState.quizType = nodes.quizType.value === 'adult' ? 'adult' : 'child';
      setupState.category = 'Gemischt';
      saveSetup();
      refreshSetup();
    });

    nodes.category.addEventListener('change', () => {
      setupState.category = nodes.category.value || 'Gemischt';
      saveSetup();
      refreshSetup();
    });

    nodes.rounds.addEventListener('change', () => {
      setupState.rounds = [3, 5, 8, 10].includes(Number(nodes.rounds.value)) ? Number(nodes.rounds.value) : 5;
      saveSetup();
      refreshSetup();
    });

    document.querySelectorAll('[data-offline-mode]').forEach(button => button.addEventListener('click', () => {
      setupState.mode = button.dataset.offlineMode === 'party' ? 'party' : 'family';
      saveSetup();
      refreshSetup();
    }));

    nodes.startButton.addEventListener('click', newGame);
    nodes.resumeButton.addEventListener('click', resumeGame);
    nodes.discardButton.addEventListener('click', discardSavedGame);
    nodes.leaveButton.addEventListener('click', () => {
      if (!confirm('Das Spiel wird gespeichert und kann später fortgesetzt werden. Jetzt verlassen?')) return;
      saveGame();
      showSetup();
    });
  }

  bindSetup();
  game = null;
  renderResumeCard();
  refreshSetup();
  loadCatalog();
})();
