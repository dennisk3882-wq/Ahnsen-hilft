'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const date = value => value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '–';

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Phase-10-Anfrage fehlgeschlagen.');
    return data;
  }

  function metric(label, value, detail) {
    return `<article class="admin-metric"><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(detail || '')}</small></article>`;
  }

  function groupCounts(rows = []) {
    return Object.fromEntries(rows.map(row => [row.status || row.source_type, Number(row.count || 0)]));
  }

  async function loadPhase10Admin() {
    const target = $('#adminPhase10Content');
    if (!target || $('#adminDashboard')?.classList.contains('hidden')) return;
    target.innerHTML = '<div class="admin-empty">Arena-, Event- und Ligadaten werden geladen …</div>';
    try {
      const data = await api('/api/platform/admin/phase10/summary');
      const duelCounts = groupCounts(data.duels);
      const historyCounts = groupCounts(data.history);
      const leagueRows = data.league?.leaderboard || [];
      target.innerHTML = `
        <div class="admin-metric-grid phase10-admin-metrics">
          ${metric('Aktive Duellserien', (duelCounts.active || 0) + (duelCounts.pending || 0), `${duelCounts.completed || 0} abgeschlossen`)}
          ${metric('Spiele/30 Tage', Object.values(historyCounts).reduce((sum, value) => sum + value, 0), `${historyCounts.duel || 0} Duelle · ${historyCounts.tournament || 0} Turniere`)}
          ${metric('Aktive Events', (data.events || []).filter(event => event.active && new Date(event.ends_at) > new Date()).length, `${data.events?.length || 0} insgesamt`)}
          ${metric('Ligaspieler', leagueRows.length, data.league?.season?.name || 'Aktuelle Saison')}
        </div>
        <div class="admin-main-grid">
          <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Redaktion</span><h2>Offizielle Events</h2></div><button id="newOfficialEvent" class="btn primary small" type="button">Event erstellen</button></div><div id="adminOfficialEvents" class="admin-list"></div></section>
          <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Saisonbetrieb</span><h2>Ligen & Saisonabschluss</h2></div></div><div id="adminLeagueSummary" class="admin-list"></div><button id="settleSeason" class="btn danger wide-button" type="button">Saison archivieren und neue Saison starten</button><p class="muted">Der Abschluss archiviert Rang, Liga und Auf-/Abstiegsstatus. Eine neue Saison wird anschließend automatisch angelegt.</p></section>
        </div>
        <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Wettbewerbsaktivität</span><h2>Duelle und Match-Historie</h2></div></div><div id="adminCompetitionSummary" class="phase10-admin-summary"></div></section>`;
      renderEvents(data.events || []);
      renderLeague(data.league);
      renderCompetition(duelCounts, historyCounts);
      $('#newOfficialEvent').onclick = () => editEvent(null);
      $('#settleSeason').onclick = settleSeason;
    } catch (error) {
      target.innerHTML = `<div class="admin-empty bad-text">${esc(error.message)}</div>`;
    }
  }

  function renderEvents(events) {
    const target = $('#adminOfficialEvents');
    target.innerHTML = events.length ? events.map(event => `<article class="admin-item"><div class="admin-item-head"><div><strong>${esc(event.title)}</strong><small>${esc(event.event_type)} · ${esc(event.category)} · ${event.question_count} Fragen</small></div><span class="admin-status ${event.active ? 'active' : 'cancelled'}">${event.active ? 'Aktiv' : 'Deaktiviert'}</span></div><p>${esc(event.description || '')}</p><div class="admin-item-grid"><div class="admin-item-stat"><strong>${event.participants}</strong><span>Teilnehmer</span></div><div class="admin-item-stat"><strong>${event.community_progress}</strong><span>Community-Fortschritt</span></div><div class="admin-item-stat"><strong>${event.reward_xp}</strong><span>XP</span></div><div class="admin-item-stat"><strong>${event.reward_season_points}</strong><span>Saisonpunkte</span></div></div><small>${date(event.starts_at)} bis ${date(event.ends_at)}</small><div class="admin-item-actions"><button class="btn secondary small" data-event-edit="${event.id}" type="button">Bearbeiten</button><a class="btn ghost small" href="/arena?tab=events" target="_blank" rel="noopener">In Arena ansehen</a></div></article>`).join('') : '<div class="admin-empty">Keine offiziellen Events vorhanden.</div>';
    $$('[data-event-edit]').forEach(button => button.onclick = () => editEvent(events.find(event => event.id === button.dataset.eventEdit)));
  }

  function inputDate(value, fallbackHours = 0) {
    const dateValue = value ? new Date(value) : new Date(Date.now() + fallbackHours * 3600000);
    const offset = dateValue.getTimezoneOffset() * 60000;
    return new Date(dateValue.getTime() - offset).toISOString().slice(0, 16);
  }

  async function editEvent(event) {
    const modal = document.createElement('div');
    modal.className = 'admin-phase10-modal';
    modal.innerHTML = `<section class="admin-phase10-modal-card"><div class="panel-heading"><div><span class="eyebrow">${event ? 'Event bearbeiten' : 'Neues offizielles Event'}</span><h2>${esc(event?.title || 'QuizTime Spezialevent')}</h2></div><button id="closePhase10Modal" class="btn ghost small" type="button">Schließen</button></div><form id="officialEventForm" class="admin-phase10-form"><label>Titel<input id="eventAdminTitle" maxlength="120" required value="${esc(event?.title || '')}"></label><label>Beschreibung<textarea id="eventAdminDescription" maxlength="600">${esc(event?.description || '')}</textarea></label><div class="admin-phase10-form-grid"><label>Typ<select id="eventAdminType"><option value="weekly">Quiz der Woche</option><option value="monthly">Monats-Event</option><option value="special">Spezialevent</option></select></label><label>Fragenwelt<select id="eventAdminQuizType"><option value="adult">Erwachsene</option><option value="child">Kinder</option></select></label><label>Kategorie<input id="eventAdminCategory" maxlength="50" value="${esc(event?.category || 'Gemischt')}"></label><label>Fragenzahl<input id="eventAdminQuestionCount" type="number" min="5" max="25" value="${event?.question_count || 10}"></label><label>Start<input id="eventAdminStart" type="datetime-local" required value="${inputDate(event?.starts_at, 0)}"></label><label>Ende<input id="eventAdminEnd" type="datetime-local" required value="${inputDate(event?.ends_at, 168)}"></label><label>XP-Belohnung<input id="eventAdminXp" type="number" min="0" max="5000" value="${event?.reward_xp || 250}"></label><label>Saisonpunkte<input id="eventAdminSeason" type="number" min="0" max="2000" value="${event?.reward_season_points || 100}"></label><label>Abzeichen-ID<input id="eventAdminBadge" maxlength="80" value="${esc(event?.badge_id || '')}" placeholder="z. B. sommer-2026"></label><label>Community-Ziel<input id="eventAdminTarget" type="number" min="0" value="${event?.community_target || 0}"></label></div><label class="account-toggle"><input id="eventAdminActive" type="checkbox" ${event?.active === false ? '' : 'checked'}><span><strong>Event aktiv</strong><small>Nur aktive Events werden in der Arena angezeigt.</small></span></label><button class="btn primary wide-button" type="submit">${event ? 'Event speichern' : 'Event veröffentlichen'}</button><div id="officialEventMessage" class="message"></div></form></section>`;
    document.body.appendChild(modal);
    $('#eventAdminType').value = event?.event_type || 'special';
    $('#eventAdminQuizType').value = event?.quiz_type || 'adult';
    const close = () => modal.remove();
    $('#closePhase10Modal').onclick = close;
    modal.addEventListener('click', click => { if (click.target === modal) close(); });
    $('#officialEventForm').onsubmit = async submit => {
      submit.preventDefault();
      const button = submit.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const payload = {
          title: $('#eventAdminTitle').value,
          description: $('#eventAdminDescription').value,
          eventType: $('#eventAdminType').value,
          quizType: $('#eventAdminQuizType').value,
          category: $('#eventAdminCategory').value,
          questionCount: Number($('#eventAdminQuestionCount').value),
          startsAt: new Date($('#eventAdminStart').value).toISOString(),
          endsAt: new Date($('#eventAdminEnd').value).toISOString(),
          rewardXp: Number($('#eventAdminXp').value),
          rewardSeasonPoints: Number($('#eventAdminSeason').value),
          badgeId: $('#eventAdminBadge').value,
          communityTarget: Number($('#eventAdminTarget').value),
          active: $('#eventAdminActive').checked,
        };
        await api(event ? `/api/platform/admin/phase10/events/${event.id}` : '/api/platform/admin/phase10/events', { method: event ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
        close();
        await loadPhase10Admin();
      } catch (error) {
        $('#officialEventMessage').textContent = error.message;
        $('#officialEventMessage').className = 'message bad-text';
        button.disabled = false;
      }
    };
  }

  function renderLeague(league) {
    const target = $('#adminLeagueSummary');
    const counts = Object.entries(league?.leagues || {}).map(([id, rows]) => ({ id, count: rows.length }));
    target.innerHTML = `<article class="admin-item"><div class="admin-item-head"><div><strong>${esc(league?.season?.name || 'Aktuelle Saison')}</strong><small>${date(league?.season?.starts_at)} bis ${date(league?.season?.ends_at)}</small></div><span class="admin-status active">Aktiv</span></div>${counts.map(item => `<div class="admin-item-stat"><strong>${item.count}</strong><span>${esc(item.id)}</span></div>`).join('')}</article>`;
  }

  function renderCompetition(duels, history) {
    $('#adminCompetitionSummary').innerHTML = `<div><strong>${duels.pending || 0}</strong><span>Offene Duellanfragen</span></div><div><strong>${duels.active || 0}</strong><span>Laufende Serien</span></div><div><strong>${duels.completed || 0}</strong><span>Beendete Serien</span></div><div><strong>${history.online || 0}</strong><span>Online-Spiele</span></div><div><strong>${history.duel || 0}</strong><span>Duellrunden</span></div><div><strong>${history.tournament || 0}</strong><span>Turnierpartien</span></div>`;
  }

  async function settleSeason() {
    if (!confirm('Saison wirklich abschließen? Rang, Liga und Auf-/Abstieg werden archiviert und eine neue Saison wird gestartet.')) return;
    const button = $('#settleSeason');
    button.disabled = true;
    try {
      const data = await api('/api/platform/admin/phase10/seasons/settle', { method: 'POST', body: '{}' });
      alert(`Neue Saison gestartet: ${data.nextSeason?.name || 'QuizTime Saison'}`);
      await loadPhase10Admin();
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
  }

  function install() {
    const tab = document.querySelector('[data-admin-tab="phase10"]');
    if (!tab) return;
    tab.addEventListener('click', () => setTimeout(loadPhase10Admin, 0));
    document.addEventListener('quiztime-admin-refresh', loadPhase10Admin);
    const observer = new MutationObserver(() => {
      const view = document.querySelector('[data-admin-view="phase10"]');
      if (view && !view.classList.contains('hidden') && !view.dataset.loaded) {
        view.dataset.loaded = 'true';
        loadPhase10Admin();
      }
    });
    observer.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }

  install();
})();
