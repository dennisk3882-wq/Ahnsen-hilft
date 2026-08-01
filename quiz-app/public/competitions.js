'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const state = { data: null, filter: 'all', profile: null };
  const leagueIcons = { bronze: '🥉', silver: '🥈', gold: '🥇', master: '👑' };
  const avatarIcons = { robot: '🤖', fox: '🦊', owl: '🦉', rocket: '🚀', crown: '👑', crystal: '💎' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const number = value => new Intl.NumberFormat('de-DE').format(Number(value || 0));
  const date = value => value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(value)) : '–';
  const dateTime = value => value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '–';

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Die Anfrage konnte nicht ausgeführt werden.'), { status: response.status });
    return data;
  }

  function remaining(value) {
    const difference = new Date(value).getTime() - Date.now();
    const absolute = Math.max(0, difference);
    const days = Math.floor(absolute / 86400000);
    const hours = Math.floor((absolute % 86400000) / 3600000);
    if (days) return `${days} T ${hours} Std.`;
    const minutes = Math.max(1, Math.ceil(absolute / 60000));
    return `${hours} Std. ${minutes % 60} Min.`;
  }

  function renderCurrentSeason() {
    const board = state.data.current || {};
    const season = board.season || {};
    const me = board.me;
    const league = me?.league || { id: 'bronze', name: 'Bronze-Liga', min: 0, next: 500 };
    const next = Number(league.next || league.min || 0);
    const minimum = Number(league.min || 0);
    const progress = next > minimum ? Math.max(0, Math.min(100, (Number(me?.points || 0) - minimum) / (next - minimum) * 100)) : 100;
    $('#currentSeason').innerHTML = `<div class="season-main"><div class="season-icon">${leagueIcons[league.id] || '🥉'}</div><div><span class="eyebrow">${esc(season.name || 'Aktuelle Saison')}</span><h2>${esc(league.name || 'Bronze-Liga')}</h2><p class="muted">${date(season.starts_at)} bis ${date(season.ends_at)}</p><div class="season-progress"><div class="season-progress-track"><span style="width:${progress}%"></span></div><div class="season-progress-meta"><span>${number(me?.points || 0)} Punkte</span><span>${next ? `${number(next)} bis zur nächsten Stufe` : 'Höchste Liga'}</span></div></div></div></div><div class="season-personal"><article><strong>${me ? number(me.rank) : '–'}</strong><span>Ligaplatz</span></article><article><strong>${number(me?.wins || 0)}</strong><span>Siege</span></article><article><strong>${esc(me?.outcome === 'promotion' ? 'Aufstieg' : me?.outcome === 'relegation' ? 'Abstieg' : 'Halten')}</strong><span>Zone</span></article></div>`;
  }

  function eventAudience(event) {
    return event.quiz_type === 'child' ? 'Kinder' : event.settings?.audience === 'all' ? 'Alle' : 'Erwachsene';
  }

  function eventCard(event) {
    const maximum = Number(event.settings?.maxAttempts || 5);
    const target = Math.max(0, Number(event.community_target || 0));
    const progress = target ? Math.min(100, Number(event.community_progress || 0) / target * 100) : 0;
    const statusText = event.status === 'live' ? `Noch ${remaining(event.ends_at)}` : event.status === 'upcoming' ? `Start in ${remaining(event.starts_at)}` : `Beendet am ${date(event.ends_at)}`;
    const leaders = (event.leaders || []).map(item => `<span class="event-leader">${number(item.rank)}. ${esc(item.name)}</span>`).join('');
    const play = event.status === 'live' ? '<a class="btn primary small" href="/arena?tab=events">Event spielen</a>' : event.status === 'upcoming' ? '<span class="event-status upcoming">Countdown läuft</span>' : '<a class="btn ghost small" href="/arena?tab=events">Ergebnis ansehen</a>';
    return `<article class="competition-event ${esc(event.status)}" data-status="${esc(event.status)}" data-audience="${event.quiz_type === 'child' ? 'child' : 'adult'}"><div class="event-status-row"><span class="event-status ${esc(event.status)}">${esc(statusText)}</span><span class="event-audience">${esc(eventAudience(event))}</span></div><h3>${esc(event.title)}</h3><p>${esc(event.description || 'Offizieller QuizTime-Wettbewerb')}</p><div class="event-facts"><span>🧠 ${number(event.question_count)} Fragen</span><span>🎯 ${esc(event.category)}</span><span>⭐ ${number(event.reward_xp)} XP</span><span>👑 ${number(event.reward_season_points)} Saisonpunkte</span><span>🔁 ${number(event.attempts)}/${number(maximum)} Versuche</span><span>👥 ${number(event.participants)} Teilnehmer</span></div>${target ? `<div class="event-progress"><div class="event-progress-track"><span style="width:${progress}%"></span></div><small>Community-Ziel: ${number(event.community_progress)}/${number(target)} richtige Antworten</small></div>` : ''}<div class="event-leaders">${leaders}</div><div class="event-actions">${play}${Number(event.best_score || 0) ? `<span class="event-status">Bestwert: ${number(event.best_score)}</span>` : ''}</div></article>`;
  }

  function renderEvents() {
    const calendar = state.data.calendar || {};
    const all = [...(calendar.live || []), ...(calendar.upcoming || []), ...(calendar.recent || []).slice(0, 6)];
    const filtered = all.filter(event => state.filter === 'all' || event.status === state.filter || event.quiz_type === state.filter);
    $('#eventCalendar').innerHTML = filtered.length ? filtered.map(eventCard).join('') : '<div class="competition-empty">Für diesen Filter sind derzeit keine Wettbewerbe vorhanden.</div>';
  }

  function renderLeaders() {
    const rows = (state.data.current?.leaderboard || []).slice(0, 12);
    $('#currentLeaders').innerHTML = rows.length ? rows.map((item, index) => `<a class="competition-leader" href="/profile/${encodeURIComponent(item.id)}"><span class="leader-rank">${index + 1}</span><div><strong>${avatarIcons[item.avatar_id] || '🤖'} ${esc(item.name)}</strong><small>${esc(item.league?.name || 'Liga')} · ${number(item.wins)} Siege</small></div><strong>${number(item.points)} P</strong></a>`).join('') : '<div class="competition-empty">Noch keine Saisonwertungen.</div>';
  }

  function renderChampions() {
    const rows = state.data.tournamentChampions || [];
    $('#tournamentChampions').innerHTML = rows.length ? rows.map(item => `<a class="champion-row" href="/profile/${encodeURIComponent(item.profile_id)}"><span class="leader-rank">🏆</span><div><strong>${avatarIcons[item.avatar_id] || '🤖'} ${esc(item.name)}</strong><small>${esc(item.name ? item.description || item.code : item.code)} · ${date(item.completed_at)}</small></div><span>${esc(item.name ? item.name : 'Champion')}</span></a>`).join('') : '<div class="competition-empty">Noch kein abgeschlossenes K.-o.-Turnier.</div>';
  }

  function archiveCard(season) {
    const podium = (season.leaders || []).map((item, index) => `<div class="podium-row"><span>${['🥇','🥈','🥉'][index] || number(index + 1)}</span><a href="/profile/${encodeURIComponent(item.profile_id)}">${esc(item.name)}</a><strong>${number(item.points)} P</strong></div>`).join('');
    return `<article class="season-archive-card"><div class="season-archive-meta"><span>${date(season.starts_at)} – ${date(season.ends_at)}</span><span>${number(season.participants)} Spieler</span></div><h3>${esc(season.name)}</h3><div class="season-podium">${podium || '<div class="competition-empty">Keine Platzierungen</div>'}</div><button class="btn secondary small" data-season-open="${esc(season.id)}" type="button">Abschlusstabelle öffnen</button></article>`;
  }

  function renderArchive() {
    const seasons = state.data.archive || [];
    $('#seasonArchiveCards').innerHTML = seasons.length ? seasons.map(archiveCard).join('') : '<div class="competition-empty">Die erste Saison ist noch nicht abgeschlossen.</div>';
    $$('[data-season-open]').forEach(button => button.onclick = () => openSeason(button.dataset.seasonOpen));
  }

  async function openSeason(id) {
    const data = await api(`/api/platform/phase105/seasons/${encodeURIComponent(id)}`);
    $('#seasonDetailsTitle').textContent = data.season.name;
    $('#seasonDetailsTable').innerHTML = data.leaderboard.length ? data.leaderboard.map(item => `<article class="season-detail-row"><strong>#${number(item.rank)}</strong><a href="/profile/${encodeURIComponent(item.profile_id)}">${avatarIcons[item.avatar_id] || '🤖'} ${esc(item.name)}</a><span>${esc(item.league_id)}</span><strong>${number(item.points)} P</strong><span>${esc(item.outcome)}</span></article>`).join('') : '<div class="competition-empty">Keine Abschlusstabelle vorhanden.</div>';
    $('#seasonDetailsPanel').classList.remove('hidden');
    $('#seasonDetailsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render() {
    renderCurrentSeason(); renderEvents(); renderLeaders(); renderChampions(); renderArchive();
  }

  async function load() {
    const me = await api('/api/platform/me');
    state.profile = me.profile;
    $('#myPublicProfile').href = `/profile/${encodeURIComponent(me.profile.id)}`;
    $('#myPublicProfile').classList.remove('hidden');
    state.data = await api('/api/platform/phase105/competitions');
    render();
    $('#competitionsLoading').classList.add('hidden');
    $('#competitionsLogin').classList.add('hidden');
    $('#competitionsApp').classList.remove('hidden');
  }

  $$('[data-event-filter]').forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.eventFilter;
    $$('[data-event-filter]').forEach(item => item.classList.toggle('active', item === button));
    renderEvents();
  }));
  $('#refreshCompetitions').addEventListener('click', () => load().catch(error => alert(error.message)));
  $('#closeSeasonDetails').addEventListener('click', () => $('#seasonDetailsPanel').classList.add('hidden'));

  load().catch(error => {
    $('#competitionsLoading').classList.add('hidden');
    if (error.status === 401 || error.status === 403) {
      $('#competitionsLogin').classList.remove('hidden');
    } else {
      $('#competitionsLogin').classList.remove('hidden');
      $('#competitionsLogin').innerHTML = `<h1>Wettbewerbe nicht verfügbar</h1><p class="bad-text">${esc(error.message)}</p><a class="btn secondary" href="/">Zur Startseite</a>`;
    }
  });
})();
