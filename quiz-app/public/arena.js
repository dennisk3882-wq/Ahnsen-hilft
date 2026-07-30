'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const state = { profile: null, tab: 'duels', overview: null, eventSession: null, refreshTimer: null };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const date = value => value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '–';
  const number = value => new Intl.NumberFormat('de-DE').format(Number(value || 0));

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Anfrage fehlgeschlagen.'), { status: response.status });
    return data;
  }

  function message(target, text, bad = false) {
    const node = typeof target === 'string' ? $(target) : target;
    if (!node) return;
    node.textContent = text || '';
    node.className = `message ${bad ? 'bad-text' : ''}`;
  }

  function statusLabel(value) {
    return ({ pending: 'Anfrage offen', active: 'Serie läuft', completed: 'Abgeschlossen', declined: 'Abgelehnt', cancelled: 'Abgebrochen', ready: 'Spielbereit', playing: 'Läuft', waiting: 'Wartet', open: 'Offen', running: 'Läuft', finished: 'Beendet' })[value] || value;
  }

  function openOnline(credentials) {
    if (!credentials?.code || !credentials?.token) return alert('Die Raumverbindung ist noch nicht verfügbar.');
    localStorage.setItem('ahnsen_online_credentials_v1', JSON.stringify(credentials));
    location.href = '/online';
  }

  function setTab(tab) {
    const valid = ['duels', 'missions', 'history', 'tournaments', 'league', 'events'];
    state.tab = valid.includes(tab) ? tab : 'duels';
    $$('[data-arena-tab]').forEach(button => button.classList.toggle('active', button.dataset.arenaTab === state.tab));
    $$('[data-arena-view]').forEach(view => view.classList.toggle('hidden', view.dataset.arenaView !== state.tab));
    const url = new URL(location.href);
    url.searchParams.set('tab', state.tab);
    history.replaceState(null, '', url);
    loadTab().catch(error => showGlobalError(error));
  }

  function showGlobalError(error) {
    console.error(error);
    const target = $(`[data-arena-view="${state.tab}"] .panel`) || $('#arenaApp');
    if (target) target.insertAdjacentHTML('afterbegin', `<div class="message bad-text">${esc(error.message || error)}</div>`);
  }

  async function loadMe() {
    try {
      const data = await api('/api/platform/me');
      state.profile = data.profile;
      $('#arenaProfile').textContent = data.profile.name;
      $('#arenaLoginRequired').classList.add('hidden');
      $('#arenaApp').classList.remove('hidden');
      return true;
    } catch {
      $('#arenaProfile').textContent = 'Kein Profil';
      $('#arenaLoginRequired').classList.remove('hidden');
      return false;
    }
  }

  async function loadOverview() {
    const data = await api('/api/platform/phase10/overview');
    state.overview = data;
    const me = data.league?.me;
    const allMissions = [...(data.missions?.daily || []), ...(data.missions?.weekly || [])];
    const completed = allMissions.filter(item => item.completed).length;
    const activeDuels = (data.duels || []).filter(item => ['pending', 'active'].includes(item.status)).length;
    $('#arenaSummary').innerHTML = [
      ['Bonus-XP', number(data.rewards?.bonus_xp), 'durch Missionen & Events'],
      ['Liga', me?.league?.name || 'Bronze-Liga', me ? `${number(me.points)} Saisonpunkte` : 'Noch ohne Wertung'],
      ['Missionen', `${completed}/${allMissions.length}`, 'aktuell abgeschlossen'],
      ['Duelle', activeDuels, 'offen oder aktiv'],
      ['Events', (data.events || []).length, 'derzeit verfügbar'],
    ].map(([label, value, detail]) => `<article class="arena-summary-card"><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(detail)}</small></article>`).join('');
  }

  async function loadFriendsForDuel() {
    const data = await api('/api/platform/friends');
    const friends = (data.friends || []).filter(friend => friend.status === 'accepted');
    $('#duelOpponent').innerHTML = '<option value="">Freund auswählen</option>' + friends.map(friend => `<option value="${esc(friend.id)}">${esc(friend.name)}</option>`).join('');
  }

  function duelOpponent(duel) {
    const mine = duel.challenger_id === state.profile.id;
    return { mine, id: mine ? duel.opponent_id : duel.challenger_id, name: mine ? duel.opponent_name : duel.challenger_name };
  }

  async function loadDuels() {
    const [data] = await Promise.all([api('/api/platform/phase10/duels'), loadFriendsForDuel()]);
    const duels = data.duels || [];
    $('#duelList').innerHTML = duels.length ? duels.map(duel => {
      const opponent = duelOpponent(duel);
      const needed = Math.floor(Number(duel.best_of) / 2) + 1;
      const myWins = opponent.mine ? duel.challenger_wins : duel.opponent_wins;
      const otherWins = opponent.mine ? duel.opponent_wins : duel.challenger_wins;
      const incoming = !opponent.mine && duel.status === 'pending';
      const actions = [];
      if (incoming) actions.push(`<button class="btn primary small" data-duel-respond="${duel.id}" data-accept="true">Annehmen</button><button class="btn ghost small" data-duel-respond="${duel.id}" data-accept="false">Ablehnen</button>`);
      if (duel.status === 'pending' && opponent.mine) actions.push(`<button class="btn ghost small" data-duel-cancel="${duel.id}">Anfrage zurückziehen</button>`);
      if (duel.status === 'active' && duel.credentials) actions.push(`<button class="btn primary small" data-duel-open="${duel.id}">Runde ${duel.current_round} öffnen</button>`);
      if (duel.status === 'active' && !duel.active_room_code) actions.push(`<button class="btn primary small" data-duel-round="${duel.id}">${duel.current_round ? 'Nächste Runde vorbereiten' : 'Erste Runde starten'}</button>`);
      if (duel.status === 'active') actions.push(`<button class="btn ghost small" data-duel-cancel="${duel.id}">Serie abbrechen</button>`);
      actions.push(`<button class="btn secondary small" data-duel-details="${duel.id}">Details</button>`);
      return `<article class="duel-card"><div class="duel-head"><div><span class="eyebrow">Best of ${duel.best_of} · ${esc(duel.category)}</span><h3>${esc(state.profile.name)} gegen ${esc(opponent.name)}</h3></div><span class="arena-status ${esc(duel.status)}">${esc(statusLabel(duel.status))}</span></div><div class="duel-score"><span>${esc(state.profile.name)}</span><strong>${myWins} : ${otherWins}</strong><span>${esc(opponent.name)}</span></div><p>${duel.status === 'completed' ? `${myWins >= needed ? 'Du hast die Serie gewonnen.' : `${opponent.name} hat die Serie gewonnen.`}` : `Zum Gesamtsieg sind ${needed} Rundensiege erforderlich.`}</p><div class="arena-actions">${actions.join('')}</div></article>`;
    }).join('') : '<div class="arena-empty">Noch keine Freundesduelle. Wähle oben einen Freund aus und starte die erste Serie.</div>';
    bindDuelActions(duels);
  }

  function bindDuelActions(duels) {
    $$('[data-duel-respond]').forEach(button => button.onclick = async () => {
      await api(`/api/platform/phase10/duels/${button.dataset.duelRespond}/respond`, { method: 'POST', body: JSON.stringify({ accept: button.dataset.accept === 'true' }) });
      await loadDuels();
    });
    $$('[data-duel-cancel]').forEach(button => button.onclick = async () => {
      if (!confirm('Duellserie wirklich abbrechen?')) return;
      await api(`/api/platform/phase10/duels/${button.dataset.duelCancel}/cancel`, { method: 'POST', body: '{}' });
      await loadDuels();
    });
    $$('[data-duel-round]').forEach(button => button.onclick = async () => {
      button.disabled = true;
      try {
        const data = await api(`/api/platform/phase10/duels/${button.dataset.duelRound}/round`, { method: 'POST', body: '{}' });
        openOnline(data.credentials);
      } catch (error) { alert(error.message); button.disabled = false; }
    });
    $$('[data-duel-open]').forEach(button => button.onclick = () => {
      const duel = duels.find(item => item.id === button.dataset.duelOpen);
      openOnline(duel?.credentials);
    });
    $$('[data-duel-details]').forEach(button => button.onclick = () => showDuelDetails(button.dataset.duelDetails));
  }

  async function showDuelDetails(id) {
    const data = await api(`/api/platform/phase10/duels/${id}`);
    const duel = data.duel;
    const opponent = duelOpponent(duel);
    const rounds = duel.rounds || [];
    alert(`${state.profile.name} gegen ${opponent.name}\nBest of ${duel.best_of}\n${rounds.length ? rounds.map(round => `Runde ${round.round_no}: ${round.winner_name || 'Unentschieden'}`).join('\n') : 'Noch keine abgeschlossene Runde.'}`);
  }

  async function createDuel(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/platform/phase10/duels', { method: 'POST', body: JSON.stringify({ opponentId: $('#duelOpponent').value, bestOf: Number($('#duelBestOf').value), quizType: $('#duelQuizType').value, category: $('#duelCategory').value }) });
      message('#duelMessage', 'Duellanfrage wurde versendet.');
      await loadDuels();
    } catch (error) { message('#duelMessage', error.message, true); }
    finally { button.disabled = false; }
  }

  function renderMission(mission) {
    const percent = Math.min(100, Math.round(Number(mission.progress || 0) / Math.max(1, Number(mission.target || 1)) * 100));
    const action = mission.claimed ? '<span class="arena-status completed">Abgeholt ✓</span>' : mission.completed ? `<button class="btn primary small" data-claim-mission="${esc(mission.key)}">Belohnung abholen</button>` : '<span class="arena-status waiting">In Arbeit</span>';
    return `<article class="mission-card ${mission.completed ? 'completed' : ''}"><div class="duel-head"><span class="mission-icon">${mission.icon}</span>${action}</div><div><h3>${esc(mission.title)}</h3><p>${esc(mission.text)}</p></div><div class="mission-progress-track"><span style="width:${percent}%"></span></div><strong>${mission.progress}/${mission.target}</strong><div class="mission-reward"><span>+${mission.xp} XP</span><span>+${mission.seasonPoints} Saisonpunkte</span></div></article>`;
  }

  async function loadMissions() {
    const data = await api('/api/platform/phase10/missions');
    $('#dailyMissionKey').textContent = data.missions.dayKey;
    $('#weeklyMissionKey').textContent = data.missions.weekKey;
    $('#dailyMissions').innerHTML = data.missions.daily.map(renderMission).join('');
    $('#weeklyMissions').innerHTML = data.missions.weekly.map(renderMission).join('');
    $$('[data-claim-mission]').forEach(button => button.onclick = async () => {
      button.disabled = true;
      try { await api(`/api/platform/phase10/missions/${encodeURIComponent(button.dataset.claimMission)}/claim`, { method: 'POST', body: '{}' }); await Promise.all([loadMissions(), loadOverview()]); }
      catch (error) { alert(error.message); button.disabled = false; }
    });
  }

  async function loadHistory(event) {
    event?.preventDefault?.();
    const type = $('#historyType').value;
    const days = $('#historyDays').value;
    const data = await api(`/api/platform/phase10/history?type=${encodeURIComponent(type)}&days=${encodeURIComponent(days)}&limit=200`);
    const rows = data.history || [];
    const wins = rows.filter(item => item.result === 'win').length;
    const losses = rows.filter(item => item.result === 'loss').length;
    const totalScore = rows.reduce((sum, item) => sum + Number(item.score || 0), 0);
    const correct = rows.reduce((sum, item) => sum + Number(item.correct || 0), 0);
    $('#historyStats').innerHTML = [['Spiele', rows.length], ['Siege', wins], ['Niederlagen', losses], ['Richtige Antworten', correct]].map(([label, value]) => `<article class="history-stat"><strong>${number(value)}</strong><span>${label}</span></article>`).join('');
    const icons = { solo: '▶', online: '◎', duel: '⚔️', tournament: '🏆', event: '⭐' };
    $('#historyList').innerHTML = rows.length ? rows.map(item => `<article class="history-row"><span class="history-icon">${icons[item.source_type] || 'Q'}</span><div class="history-copy"><strong>${item.source_type === 'solo' ? `${esc(item.category)} · Solo` : item.opponent_name ? `gegen ${esc(item.opponent_name)}` : esc(item.metadata?.title || item.source_type)}</strong><span>${esc(item.quiz_type || '')} · ${esc(item.category || 'Gemischt')} · ${date(item.played_at)}</span></div><div class="history-value"><strong>${number(item.score)}</strong><span>Punkte</span></div><div class="history-value"><strong>${number(item.correct)}</strong><span>Richtig</span></div><div class="history-value"><strong class="${item.result === 'win' ? 'good-text' : item.result === 'loss' ? 'bad-text' : ''}">${esc(item.result === 'completed' ? 'Beendet' : item.result)}</strong><span>Ergebnis</span></div></article>`).join('') : '<div class="arena-empty">Für diesen Filter wurden noch keine Spiele gefunden.</div>';
    void totalScore;
  }

  async function loadTournaments() {
    const data = await api('/api/platform/tournaments');
    const tournaments = (data.tournaments || []).filter(item => item.format === 'knockout');
    $('#arenaTournamentList').innerHTML = tournaments.length ? tournaments.map(item => `<article class="tournament-card"><div class="duel-head"><div><span class="eyebrow">${item.player_count} Teilnehmer</span><h3>${esc(item.name)}</h3></div><span class="arena-status ${esc(item.status)}">${esc(statusLabel(item.status))}</span></div><p>${esc(item.description || 'K.-o.-Turnier')}</p><code>${esc(item.code)}</code><button class="btn secondary small" data-bracket-open="${esc(item.code)}">Turnierbaum öffnen</button></article>`).join('') : '<div class="arena-empty">Noch kein K.-o.-Turnier vorhanden. Neue Turniere werden im Community-Bereich erstellt.</div>';
    $$('[data-bracket-open]').forEach(button => button.onclick = () => loadBracket(button.dataset.bracketOpen));
    const requested = new URLSearchParams(location.search).get('code');
    if (requested) loadBracket(requested).catch(() => {});
  }

  async function loadBracket(code) {
    const data = await api(`/api/platform/phase10/tournaments/${encodeURIComponent(code)}/bracket`);
    renderBracket(data.bracket);
  }

  function renderBracket(bracket) {
    const tournament = bracket.tournament;
    const matches = bracket.matches || [];
    const owner = tournament.owner_id === state.profile.id;
    if (!matches.length) {
      $('#bracketPanel').innerHTML = `<div class="panel-heading"><div><span class="eyebrow">${esc(tournament.code)}</span><h2>${esc(tournament.name)}</h2></div></div><div class="arena-empty">Der Turnierbaum wurde noch nicht erzeugt.${owner ? '<br><button id="generateBracket" class="btn primary" type="button">Teilnehmer setzen & Turnier starten</button>' : ''}</div>`;
      $('#generateBracket')?.addEventListener('click', async () => {
        const data = await api(`/api/platform/phase10/tournaments/${encodeURIComponent(tournament.code)}/bracket`, { method: 'POST', body: '{}' });
        renderBracket(data.bracket);
      });
      return;
    }
    const maxRound = Math.max(...matches.map(match => Number(match.round_no)));
    const roundName = round => round === maxRound ? 'Finale' : round === maxRound - 1 ? 'Halbfinale' : round === maxRound - 2 ? 'Viertelfinale' : `Runde ${round}`;
    const rounds = [];
    for (let round = 1; round <= maxRound; round += 1) rounds.push(`<section class="bracket-round"><h3>${roundName(round)}</h3><div class="bracket-matches">${matches.filter(match => Number(match.round_no) === round).map(match => {
      const canCreate = match.status === 'ready' && [match.profile_a, match.profile_b, tournament.owner_id].includes(state.profile.id);
      const canOpen = Boolean(match.credentials);
      return `<article class="bracket-match"><div class="bracket-player ${match.winner_id === match.profile_a ? 'winner' : ''}"><span>${esc(match.profile_a_name || 'Freilos / offen')}</span><strong>${match.score_a ?? '–'}</strong></div><div class="bracket-player ${match.winner_id === match.profile_b ? 'winner' : ''}"><span>${esc(match.profile_b_name || 'Freilos / offen')}</span><strong>${match.score_b ?? '–'}</strong></div><span class="arena-status ${esc(match.status)}">${esc(statusLabel(match.status))}</span>${canOpen ? `<button class="btn primary small" data-match-open="${match.id}">Partie öffnen</button>` : canCreate ? `<button class="btn secondary small" data-match-room="${match.id}">Raum erstellen</button>` : ''}</article>`;
    }).join('')}</div></section>`);
    $('#bracketPanel').innerHTML = `<div class="panel-heading"><div><span class="eyebrow">${esc(tournament.code)} · ${esc(statusLabel(tournament.status))}</span><h2>${esc(tournament.name)}</h2></div><button id="refreshBracket" class="btn ghost small">Aktualisieren</button></div><div class="bracket">${rounds.join('')}</div>`;
    $('#refreshBracket').onclick = () => loadBracket(tournament.code);
    $$('[data-match-room]').forEach(button => button.onclick = async () => {
      button.disabled = true;
      try { const data = await api(`/api/platform/phase10/tournament-matches/${button.dataset.matchRoom}/room`, { method: 'POST', body: '{}' }); openOnline(data.credentials); }
      catch (error) { alert(error.message); button.disabled = false; }
    });
    $$('[data-match-open]').forEach(button => button.onclick = () => openOnline(matches.find(item => item.id === button.dataset.matchOpen)?.credentials));
  }

  async function loadLeague() {
    const data = await api('/api/platform/phase10/league?limit=200');
    const me = data.me;
    $('#leagueName').textContent = me?.league?.name || 'Bronze-Liga';
    $('#leagueEmblem').textContent = me?.league?.icon || '🥉';
    $('#leaguePeriod').textContent = `${date(data.season.starts_at)} bis ${date(data.season.ends_at)}`;
    const floor = Number(me?.league?.floor || 0);
    const next = me?.league?.next;
    const progress = next ? Math.min(100, Math.round((Number(me?.points || 0) - floor) / Math.max(1, next - floor) * 100)) : 100;
    $('#leagueProgress').innerHTML = `<div class="league-progress-copy"><span>${number(me?.points || 0)} Punkte</span><span>${next ? `${number(next)} bis zum nächsten Rang` : 'Höchste Liga erreicht'}</span></div><div class="league-progress-track"><span style="width:${progress}%"></span></div>`;
    $('#leagueBoard').innerHTML = data.leaderboard.length ? data.leaderboard.map(entry => `<article class="league-row ${entry.id === state.profile.id ? 'me' : ''}"><span class="league-rank">${entry.league.icon} ${entry.rank}</span><div class="league-player"><strong>${esc(entry.name)}</strong><span>${esc(entry.league.name)}</span></div><div class="history-value"><strong>${number(entry.points)}</strong><span>Punkte</span></div><div class="history-value"><strong>${entry.wins}</strong><span>Siege</span></div><div class="history-value"><strong>${entry.online_games}</strong><span>Online</span></div><span class="league-outcome ${entry.outcome}">${entry.outcome === 'promotion' ? 'Aufstiegszone' : entry.outcome === 'relegation' ? 'Abstiegszone' : 'Gesichert'}</span></article>`).join('') : '<div class="arena-empty">Noch keine Saisonwertung vorhanden.</div>';
  }

  async function loadEvents() {
    const data = await api('/api/platform/phase10/events');
    const events = data.events || [];
    $('#eventList').innerHTML = events.length ? events.map(event => {
      const progress = event.community_target ? Math.min(100, Math.round(Number(event.community_progress || 0) / event.community_target * 100)) : 0;
      const completed = Boolean(event.completed_at);
      return `<article class="event-card ${event.settings?.featured ? 'featured' : ''}"><div class="event-head"><div><span class="eyebrow">${event.event_type === 'weekly' ? 'Quiz der Woche' : event.event_type === 'monthly' ? 'Monats-Event' : 'Spezialevent'}</span><h3>${esc(event.title)}</h3></div><span class="arena-status active">Aktiv</span></div><p>${esc(event.description || '')}</p><div class="event-meta"><span>${event.question_count} Fragen</span><span>${esc(event.category)}</span><span>bis ${date(event.ends_at)}</span><span>${event.attempts} Versuche</span></div>${event.community_target ? `<div class="event-community"><small>Community-Ziel: ${number(event.community_progress)}/${number(event.community_target)} richtige Antworten</small><div class="mission-progress-track"><span style="width:${progress}%"></span></div></div>` : ''}<div class="mission-reward"><span>+${event.reward_xp} XP</span><span>+${event.reward_season_points} Saisonpunkte</span></div><div class="arena-actions"><button class="btn primary small" data-event-start="${event.id}">${completed ? 'Erneut spielen' : 'Event starten'}</button><button class="btn secondary small" data-event-board="${event.id}" data-event-title="${esc(event.title)}">Rangliste</button>${completed && !event.reward_claimed ? `<button class="btn ghost small" data-event-claim="${event.id}">Belohnung abholen</button>` : completed ? '<span class="arena-status completed">Belohnung abgeholt</span>' : ''}</div>${completed ? `<small>Dein Bestwert: ${event.best_score} Punkte · ${event.best_correct} richtig</small>` : ''}</article>`;
    }).join('') : '<div class="arena-empty">Derzeit ist kein offizielles Event aktiv.</div>';
    $$('[data-event-start]').forEach(button => button.onclick = () => startEvent(button.dataset.eventStart));
    $$('[data-event-board]').forEach(button => button.onclick = () => loadEventLeaderboard(button.dataset.eventBoard, button.dataset.eventTitle));
    $$('[data-event-claim]').forEach(button => button.onclick = async () => {
      button.disabled = true;
      try { await api(`/api/platform/phase10/events/${button.dataset.eventClaim}/claim`, { method: 'POST', body: '{}' }); await Promise.all([loadEvents(), loadOverview(), loadMissions()]); }
      catch (error) { alert(error.message); button.disabled = false; }
    });
  }

  async function startEvent(id) {
    const data = await api(`/api/platform/phase10/events/${id}/start`, { method: 'POST', body: '{}' });
    state.eventSession = data;
    $('#eventPlayer').classList.remove('hidden');
    renderEventPlayer();
  }

  function renderEventPlayer() {
    const data = state.eventSession;
    if (!data) return;
    if (data.completed) {
      $('#eventPlayerContent').innerHTML = `<div class="event-finish"><span class="app-kicker">Event abgeschlossen</span><h2>${esc(data.event.title)}</h2><strong>${data.score}</strong><p>Punkte · ${data.correct} richtig · ${data.wrong} falsch</p><div class="arena-actions" style="justify-content:center"><button id="finishEventClose" class="btn primary">Zur Eventübersicht</button></div></div>`;
      $('#finishEventClose').onclick = closeEventPlayer;
      return;
    }
    const question = data.question;
    $('#eventPlayerContent').innerHTML = `<div class="event-question"><div class="duel-head"><div><span class="eyebrow">${esc(data.event.title)}</span><h3>Frage ${data.currentIndex + 1} von ${data.totalQuestions}</h3></div><span class="info-chip">${data.score} Punkte</span></div><h2>${esc(question.text)}</h2><div class="event-answer-grid">${question.options.map((option, index) => `<button class="event-answer ${data.answered && question.correctIndex === index ? 'correct' : data.answered && data.result?.answerIndex === index ? 'wrong' : ''}" data-event-answer="${index}" ${data.answered ? 'disabled' : ''}><strong>${String.fromCharCode(65 + index)}</strong> ${esc(option)}</button>`).join('')}</div>${data.answered ? `<div class="event-result"><strong>${data.result.correct ? 'Richtig! +10 Punkte' : 'Leider falsch.'}</strong><p>${esc(question.explanation || 'Die richtige Antwort ist markiert.')}</p></div><button id="eventNext" class="btn primary wide-button">${data.currentIndex + 1 >= data.totalQuestions ? 'Ergebnis anzeigen' : 'Nächste Frage'}</button>` : ''}</div>`;
    $$('[data-event-answer]').forEach(button => button.onclick = async () => {
      const updated = await api(`/api/platform/phase10/event-sessions/${data.sessionId}/answer`, { method: 'POST', body: JSON.stringify({ answerIndex: Number(button.dataset.eventAnswer) }) });
      state.eventSession = updated;
      renderEventPlayer();
    });
    $('#eventNext')?.addEventListener('click', async () => {
      const updated = await api(`/api/platform/phase10/event-sessions/${data.sessionId}/next`, { method: 'POST', body: '{}' });
      state.eventSession = updated;
      renderEventPlayer();
      if (updated.completed) Promise.all([loadEvents(), loadOverview(), loadMissions()]).catch(() => {});
    });
  }

  async function loadEventLeaderboard(id, title) {
    const data = await api(`/api/platform/phase10/events/${id}/leaderboard?limit=100`);
    $('#eventLeaderboardPanel').classList.remove('hidden');
    $('#eventLeaderboardPanel').innerHTML = `<div class="panel-heading"><div><span class="eyebrow">Event-Rangliste</span><h2>${esc(title)}</h2></div><button id="closeEventBoard" class="btn ghost small">Schließen</button></div><div class="league-board">${data.leaderboard.length ? data.leaderboard.map(entry => `<article class="league-row ${entry.id === state.profile.id ? 'me' : ''}"><span class="league-rank">${entry.rank}</span><div class="league-player"><strong>${esc(entry.name)}</strong><span>${entry.attempts} Versuche</span></div><div class="history-value"><strong>${entry.best_score}</strong><span>Punkte</span></div><div class="history-value"><strong>${entry.best_correct}</strong><span>Richtig</span></div><div></div><span></span></article>`).join('') : '<div class="arena-empty">Noch keine abgeschlossenen Versuche.</div>'}</div>`;
    $('#closeEventBoard').onclick = () => $('#eventLeaderboardPanel').classList.add('hidden');
    $('#eventLeaderboardPanel').scrollIntoView({ behavior: 'smooth' });
  }

  function closeEventPlayer() {
    $('#eventPlayer').classList.add('hidden');
    state.eventSession = null;
  }

  async function loadTab() {
    if (state.tab === 'duels') await loadDuels();
    else if (state.tab === 'missions') await loadMissions();
    else if (state.tab === 'history') await loadHistory();
    else if (state.tab === 'tournaments') await loadTournaments();
    else if (state.tab === 'league') await loadLeague();
    else if (state.tab === 'events') await loadEvents();
  }

  async function init() {
    $$('[data-arena-tab]').forEach(button => button.onclick = () => setTab(button.dataset.arenaTab));
    $('#duelCreateForm').onsubmit = createDuel;
    $('#refreshDuels').onclick = loadDuels;
    $('#refreshMissions').onclick = loadMissions;
    $('#historyFilters').onsubmit = loadHistory;
    $('#refreshLeague').onclick = loadLeague;
    $('#refreshEvents').onclick = loadEvents;
    $('#closeEventPlayer').onclick = closeEventPlayer;
    $('#eventPlayer').addEventListener('click', event => { if (event.target === $('#eventPlayer')) closeEventPlayer(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeEventPlayer(); });
    if (!await loadMe()) return;
    await loadOverview();
    setTab(new URLSearchParams(location.search).get('tab') || 'duels');
    state.refreshTimer = setInterval(() => {
      if (document.hidden) return;
      loadOverview().catch(() => {});
      if (state.tab === 'duels') loadDuels().catch(() => {});
    }, 30000);
  }

  init().catch(showGlobalError);
})();
