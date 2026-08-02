'use strict';

(() => {
  const root = document.querySelector('#adminPhase11Content');
  if (!root) return;

  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const number = value => new Intl.NumberFormat('de-DE').format(Number(value || 0));
  const date = value => value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '–';
  const state = { view: 'readiness', events: [], analyticsDays: 30 };
  const categories = {
    adult: ['Gemischt','Allgemeinwissen','Geografie','Geschichte','Natur & Wissenschaft','Musik','Sport','Film & Fernsehen','Technik','Essen & Trinken'],
    child: ['Gemischt','Mathematik','Sprache','Natur & Tiere','Technik & Wissenschaft','Geografie','Alltag & Verkehr','Essen & Gesundheit','Allgemeinwissen','Geschichte','Musik','Sport','Film & Fernsehen'],
  };

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Anfrage fehlgeschlagen.'), { status: response.status, data });
    return data;
  }

  function localDateTime(value) {
    if (!value) return '';
    const dateValue = new Date(value);
    const offset = dateValue.getTimezoneOffset() * 60000;
    return new Date(dateValue.getTime() - offset).toISOString().slice(0, 16);
  }

  function empty(text) { return `<div class="phase11-empty">${esc(text)}</div>`; }
  function statusClass(status) { return ['pass','warning','fail'].includes(status) ? status : 'warning'; }

  function shell() {
    root.innerHTML = `<div class="phase11-admin">
      <section class="panel"><div class="panel-heading"><div><span class="eyebrow">QuizTime 11.0</span><h2>Launch-Reife, Schutz und Betriebsanalyse</h2><p>Produktionschecks, Einführung, Manipulationsschutz, Eventsteuerung und Kennzahlen in einem Bereich.</p></div><span class="info-chip">Phase 11</span></div>
        <nav class="phase11-admin-nav" aria-label="Phase-11-Bereiche">
          <button class="active" data-phase11-view="readiness" type="button">Bereitschaft</button>
          <button data-phase11-view="analytics" type="button">Analytics</button>
          <button data-phase11-view="risks" type="button">Manipulationsschutz</button>
          <button data-phase11-view="events" type="button">Events</button>
          <button data-phase11-view="questions" type="button">Fragen</button>
          <button data-phase11-view="operations" type="button">Saison & Betrieb</button>
        </nav>
      </section>
      <section class="phase11-view" data-phase11-content="readiness"><div class="phase11-empty">Produktionsbereitschaft wird geladen …</div></section>
      <section class="phase11-view hidden" data-phase11-content="analytics"><div class="phase11-empty">Kennzahlen werden geladen …</div></section>
      <section class="phase11-view hidden" data-phase11-content="risks"><div class="phase11-empty">Risikohinweise werden geladen …</div></section>
      <section class="phase11-view hidden" data-phase11-content="events"><div class="phase11-empty">Eventverwaltung wird geladen …</div></section>
      <section class="phase11-view hidden" data-phase11-content="questions"><div class="phase11-empty">Fragenverwaltung wird geladen …</div></section>
      <section class="phase11-view hidden" data-phase11-content="operations"></section>
    </div>`;
    $$('[data-phase11-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.phase11View)));
    renderOperations();
  }

  function setView(view) {
    state.view = view;
    $$('[data-phase11-view]').forEach(button => button.classList.toggle('active', button.dataset.phase11View === view));
    $$('[data-phase11-content]').forEach(section => section.classList.toggle('hidden', section.dataset.phase11Content !== view));
    loadView(view).catch(showError);
  }

  function showError(error) {
    const target = $(`[data-phase11-content="${state.view}"]`);
    if (target) target.insertAdjacentHTML('afterbegin', `<div class="message bad-text">${esc(error.message || error)}</div>`);
  }

  async function loadReadiness() {
    const data = await api('/api/platform/admin/phase11/readiness');
    const current = data.current;
    const target = $('[data-phase11-content="readiness"]');
    target.innerHTML = `<section class="panel"><div class="panel-heading"><div><span class="eyebrow">Produktionsabnahme</span><h2>Aktueller Bereitschaftsstatus</h2><p>Geprüft werden Datenbank, Migrationen, Kataloge, Kerntabellen und E-Mail-Konfiguration.</p></div><button id="runPhase11Readiness" class="btn primary" type="button">Prüfung jetzt ausführen</button></div>
      <div class="phase11-status-grid"><article class="phase11-status-card ${statusClass(current.status)}"><strong>${esc(current.status.toUpperCase())}</strong><span>Gesamtstatus</span></article><article class="phase11-status-card"><strong>${esc(current.version)}</strong><span>Serverversion</span></article><article class="phase11-status-card"><strong>${current.checks.filter(item => item.ok).length}/${current.checks.length}</strong><span>Prüfungen bestanden</span></article><article class="phase11-status-card"><strong>${date(current.checkedAt)}</strong><span>Letzte Prüfung</span></article></div>
      <div class="phase11-check-list">${current.checks.map(check => `<div class="phase11-check ${check.ok ? '' : check.required ? 'fail' : 'warning'}"><i></i><div><strong>${esc(check.label)}</strong><small>${esc(check.detail)}</small></div></div>`).join('')}</div></section>
      <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Historie</span><h2>Letzte gespeicherte Prüfungen</h2></div></div>${(data.history || []).length ? `<table class="phase11-table"><thead><tr><th>Zeit</th><th>Status</th><th>Version</th><th>Commit</th><th>Adresse</th></tr></thead><tbody>${data.history.map(item => `<tr><td>${date(item.created_at)}</td><td><span class="admin-status ${statusClass(item.status)}">${esc(item.status)}</span></td><td>${esc(item.version)}</td><td><code>${esc(item.commit_sha?.slice(0, 10) || '–')}</code></td><td>${esc(item.base_url || '–')}</td></tr>`).join('')}</tbody></table>` : empty('Noch keine gespeicherte Produktionsprüfung.')}</section>`;
    $('#runPhase11Readiness').onclick = async event => {
      event.currentTarget.disabled = true;
      try { await api('/api/platform/admin/phase11/readiness/run', { method: 'POST', body: JSON.stringify({ baseUrl: location.origin }) }); await loadReadiness(); }
      catch (error) { alert(error.message); event.currentTarget.disabled = false; }
    };
  }

  function renderBars(rows, key = 'games') {
    if (!rows?.length) return empty('Für diesen Zeitraum liegen noch keine Tageswerte vor.');
    const max = Math.max(1, ...rows.map(row => Number(row[key] || 0)));
    return `<div class="phase11-chart">${rows.map(row => `<div class="phase11-chart-column" title="${esc(row.day)}: ${number(row[key])}"><span style="height:${Math.max(3, Number(row[key] || 0) / max * 135)}px"></span><small>${String(row.day).slice(5)}</small></div>`).join('')}</div>`;
  }

  async function loadAnalytics() {
    const data = await api(`/api/platform/admin/phase11/analytics?days=${state.analyticsDays}`);
    const o = data.overview || {};
    const target = $('[data-phase11-content="analytics"]');
    target.innerHTML = `<section class="panel"><div class="panel-heading"><div><span class="eyebrow">Betriebsdaten</span><h2>QuizTime-Nutzung</h2></div><div class="phase11-filter-row"><select id="phase11AnalyticsDays"><option value="7">7 Tage</option><option value="30">30 Tage</option><option value="90">90 Tage</option><option value="365">365 Tage</option></select><button id="phase11Snapshot" class="btn ghost small" type="button">Tagesstand speichern</button></div></div>
      <div class="phase11-kpi-grid"><article class="phase11-kpi"><strong>${number(o.profiles)}</strong><span>Profile gesamt</span></article><article class="phase11-kpi"><strong>${number(o.active_today)}</strong><span>Heute aktiv</span></article><article class="phase11-kpi"><strong>${number(o.new_profiles)}</strong><span>Neue Profile</span></article><article class="phase11-kpi"><strong>${number(o.verified_profiles)}</strong><span>E-Mail bestätigt</span></article><article class="phase11-kpi"><strong>${number(o.completionRate)} %</strong><span>Abschlussquote</span></article><article class="phase11-kpi"><strong>${number(o.abandonmentRate)} %</strong><span>Abbruchquote</span></article><article class="phase11-kpi"><strong>${number(o.averageSessionMinutes)} min</strong><span>Ø Sitzungsdauer</span></article><article class="phase11-kpi"><strong>${number((data.events || []).reduce((sum,item)=>sum+Number(item.participants||0),0))}</strong><span>Eventteilnahmen</span></article></div></section>
      <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Verlauf</span><h2>Gespielte Runden pro Tag</h2></div></div>${renderBars(data.daily, 'games')}</section>
      <div class="phase11-two-column"><section class="panel"><div class="panel-heading"><div><span class="eyebrow">Kategorien</span><h2>Beliebtheit und Trefferquote</h2></div></div>${(data.categories || []).length ? `<table class="phase11-table"><thead><tr><th>Kategorie</th><th>Antworten</th><th>Quote</th></tr></thead><tbody>${data.categories.map(row => `<tr><td>${esc(row.category)}</td><td>${number(row.answers)}</td><td>${number(row.accuracy)} %</td></tr>`).join('')}</tbody></table>` : empty('Noch keine Kategorieauswertung.')}</section>
      <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Fragenqualität</span><h2>Schwierigste Fragen</h2></div></div>${(data.hardestQuestions || []).length ? `<table class="phase11-table"><thead><tr><th>Frage</th><th>Antworten</th><th>Quote</th></tr></thead><tbody>${data.hardestQuestions.map(row => `<tr><td>${esc(row.question_text)}<small>${esc(row.category)}</small></td><td>${number(row.answers)}</td><td>${number(row.accuracy)} %</td></tr>`).join('')}</tbody></table>` : empty('Mindestens drei Antworten pro Frage sind nötig.')}</section></div>
      <div class="phase11-two-column"><section class="panel"><div class="panel-heading"><div><span class="eyebrow">Geräte</span><h2>Browser und Gerätetypen</h2></div></div>${(data.devices || []).length ? `<table class="phase11-table"><thead><tr><th>Browser</th><th>Gerät</th><th>Antworten</th><th>Nutzer</th></tr></thead><tbody>${data.devices.map(row => `<tr><td>${esc(row.browser)}</td><td>${esc(row.device)}</td><td>${number(row.events)}</td><td>${number(row.users)}</td></tr>`).join('')}</tbody></table>` : empty('Noch keine Gerätewerte.')}</section>
      <section class="panel"><div class="panel-heading"><div><span class="eyebrow">Offizielle Wettbewerbe</span><h2>Eventleistung</h2></div></div>${(data.events || []).length ? `<table class="phase11-table"><thead><tr><th>Event</th><th>Teilnehmer</th><th>Versuche</th><th>Ø Punkte</th></tr></thead><tbody>${data.events.map(row => `<tr><td>${esc(row.title)}</td><td>${number(row.participants)}</td><td>${number(row.attempts)}</td><td>${number(row.average_score)}</td></tr>`).join('')}</tbody></table>` : empty('Keine Events im Zeitraum.')}</section></div>`;
    $('#phase11AnalyticsDays').value = String(state.analyticsDays);
    $('#phase11AnalyticsDays').onchange = event => { state.analyticsDays = Number(event.target.value); loadAnalytics().catch(showError); };
    $('#phase11Snapshot').onclick = async event => { event.currentTarget.disabled = true; try { await api('/api/platform/admin/phase11/analytics/snapshot', { method: 'POST', body: '{}' }); alert('Tagesstand wurde gespeichert.'); } finally { event.currentTarget.disabled = false; } };
  }

  async function loadRisks() {
    const data = await api('/api/platform/admin/phase11/risks?status=all');
    const target = $('[data-phase11-content="risks"]');
    const flags = data.flags || [];
    target.innerHTML = `<section class="panel"><div class="panel-heading"><div><span class="eyebrow">Manipulationsschutz</span><h2>Antworttempo, Parallelspiele und Auffälligkeiten</h2><p>Hinweise werden nicht automatisch als Betrug gewertet. Kritische Maßnahmen erfordern eine administrative Prüfung.</p></div><button id="refreshPhase11Risks" class="btn ghost small" type="button">Aktualisieren</button></div>
      ${flags.length ? flags.map(flag => `<article class="phase11-risk-card"><div class="phase11-card-head"><div><span class="phase11-severity ${esc(flag.severity)}">${esc(flag.severity)} · ${number(flag.score)}</span><h3>${esc(flag.name || 'Unbekanntes Profil')}</h3><p>${esc(flag.flag_type)} · ${esc(flag.source_type || '')} ${esc(flag.source_id || '')}</p></div><span class="admin-status ${esc(flag.status)}">${esc(flag.status)}</span></div><small>${date(flag.last_seen_at)} · ${esc(JSON.stringify(flag.details || {}))}</small><div class="phase11-card-actions"><button class="btn secondary small" data-risk-status="reviewing" data-risk-id="${flag.id}">In Prüfung</button><button class="btn primary small" data-risk-status="resolved" data-risk-id="${flag.id}">Erledigt</button><button class="btn ghost small" data-risk-status="dismissed" data-risk-id="${flag.id}">Verwerfen</button>${flag.profile_id ? `<button class="btn ghost small" data-risk-notice="${flag.profile_id}">Spielerhinweis</button><button class="btn danger small" data-risk-sanction="${flag.profile_id}" data-ranking="${Boolean(flag.ranking_blocked)}" data-competition="${Boolean(flag.competition_blocked)}">Sanktion</button>` : ''}</div></article>`).join('') : empty('Keine Risikohinweise vorhanden.')}</section>`;
    $('#refreshPhase11Risks').onclick = () => loadRisks().catch(showError);
    $$('[data-risk-status]').forEach(button => button.onclick = async () => {
      const note = prompt('Interne Prüfnotiz:', '') ?? '';
      await api(`/api/platform/admin/phase11/risks/${button.dataset.riskId}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.riskStatus, note }) });
      await loadRisks();
    });
    $$('[data-risk-notice]').forEach(button => button.onclick = async () => {
      const title = prompt('Titel der Nachricht:', 'Hinweis zu deinem QuizTime-Konto');
      if (!title) return;
      const body = prompt('Nachricht an den Spieler:', 'Uns ist eine ungewöhnliche Spielaktivität aufgefallen. Bitte beachte die fairen Wettbewerbsregeln.');
      if (!body) return;
      await api(`/api/platform/admin/phase11/profiles/${button.dataset.riskNotice}/notice`, { method: 'POST', body: JSON.stringify({ type: 'warning', title, body }) });
      alert('Hinweis wurde hinterlegt.');
    });
    $$('[data-risk-sanction]').forEach(button => button.onclick = async () => {
      const rankingBlocked = confirm('Profil aus Ranglisten ausschließen?');
      const competitionBlocked = confirm('Profil für Wettbewerbe sperren?');
      const reason = prompt('Grund der Sanktion:', 'Prüfung ungewöhnlicher Spielaktivität');
      if (!reason) return;
      const hours = Number(prompt('Dauer in Stunden; 0 bedeutet unbefristet:', '24'));
      await api(`/api/platform/admin/phase11/profiles/${button.dataset.riskSanction}/sanction`, { method: 'PUT', body: JSON.stringify({ rankingBlocked, competitionBlocked, reason, hours }) });
      await loadRisks();
    });
  }

  function eventForm(event = null) {
    const type = event?.quiz_type === 'child' ? 'child' : 'adult';
    const status = event?.publication_status || event?.settings?.publicationStatus || (event?.active ? 'published' : 'draft');
    return `<form id="phase11EventForm" class="phase11-admin-form"><input id="phase11EventId" type="hidden" value="${esc(event?.id || '')}"><label class="span-2">Titel<input id="phase11EventTitle" required maxlength="120" value="${esc(event?.title || '')}"></label><label>Eventtyp<select id="phase11EventType"><option value="weekly">Wöchentlich</option><option value="monthly">Monatlich</option><option value="special">Spezialevent</option></select></label><label>Status<select id="phase11EventStatus"><option value="draft">Entwurf</option><option value="published">Veröffentlicht</option><option value="paused">Pausiert</option><option value="cancelled">Abgebrochen</option></select></label><label>Quiztyp<select id="phase11EventQuizType"><option value="adult">Erwachsene</option><option value="child">Kinder</option></select></label><label>Kategorie<select id="phase11EventCategory"></select></label><label>Fragenzahl<input id="phase11EventQuestions" type="number" min="5" max="50" value="${number(event?.question_count || 10)}"></label><label>Max. Versuche<input id="phase11EventAttempts" type="number" min="1" max="100" value="${number(event?.max_attempts || event?.settings?.maxAttempts || 5)}"></label><label>Start<input id="phase11EventStart" type="datetime-local" required value="${localDateTime(event?.starts_at || new Date(Date.now()+3600000))}"></label><label>Ende<input id="phase11EventEnd" type="datetime-local" required value="${localDateTime(event?.ends_at || new Date(Date.now()+8*86400000))}"></label><label>XP<input id="phase11EventXp" type="number" min="0" max="10000" value="${number(event?.reward_xp || 250)}"></label><label>Saisonpunkte<input id="phase11EventSeason" type="number" min="0" max="5000" value="${number(event?.reward_season_points || 100)}"></label><label>Abzeichen-ID<input id="phase11EventBadge" maxlength="100" value="${esc(event?.badge_id || '')}"></label><label>Community-Ziel<input id="phase11EventTarget" type="number" min="0" value="${number(event?.community_target || 0)}"></label><label class="span-4">Beschreibung<textarea id="phase11EventDescription" rows="3" maxlength="800">${esc(event?.description || '')}</textarea></label><label class="span-4"><span><input id="phase11EventFeatured" type="checkbox" ${event?.settings?.featured ? 'checked' : ''}> Im Wettbewerbskalender hervorheben</span></label><div class="phase11-form-actions"><button class="btn primary" type="submit">${event ? 'Event speichern' : 'Event erstellen'}</button><button id="phase11EventReset" class="btn ghost" type="button">Formular leeren</button></div></form>`;
  }

  function setEventCategory(type, selected = 'Gemischt') {
    const select = $('#phase11EventCategory');
    if (!select) return;
    select.innerHTML = categories[type].map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    select.value = categories[type].includes(selected) ? selected : 'Gemischt';
  }

  async function loadEvents(editEvent = null) {
    const data = await api('/api/platform/admin/phase11/events');
    state.events = data.events || [];
    const target = $('[data-phase11-content="events"]');
    target.innerHTML = `<section class="panel"><div class="panel-heading"><div><span class="eyebrow">Offizielle Wettbewerbe</span><h2>Event erstellen oder bearbeiten</h2></div></div>${eventForm(editEvent)}</section><section class="panel"><div class="panel-heading"><div><span class="eyebrow">Kalender</span><h2>Alle Events</h2></div></div><div id="phase11EventList">${state.events.length ? state.events.map(item => `<article class="phase11-event-card"><div class="phase11-card-head"><div><span class="eyebrow">${esc(item.quiz_type)} · ${esc(item.category)} · ${number(item.question_count)} Fragen</span><h3>${esc(item.title)}</h3><p>${date(item.starts_at)} bis ${date(item.ends_at)} · ${number(item.participants)} Teilnehmer · ${number(item.max_attempts)} Versuche</p></div><span class="admin-status ${esc(item.publication_status || (item.active ? 'published' : 'draft'))}">${esc(item.publication_status || (item.active ? 'published' : 'draft'))}</span></div><div class="phase11-card-actions"><button class="btn secondary small" data-event-edit="${item.id}">Bearbeiten</button><button class="btn ghost small" data-event-board="${item.id}" data-event-title="${esc(item.title)}">Rangliste</button></div></article>`).join('') : empty('Keine Events vorhanden.')}</div></section>`;
    $('#phase11EventType').value = editEvent?.event_type || 'special';
    $('#phase11EventStatus').value = editEvent?.publication_status || editEvent?.settings?.publicationStatus || (editEvent?.active ? 'published' : 'draft');
    $('#phase11EventQuizType').value = editEvent?.quiz_type || 'adult';
    setEventCategory($('#phase11EventQuizType').value, editEvent?.category || 'Gemischt');
    $('#phase11EventQuizType').onchange = event => setEventCategory(event.target.value);
    $('#phase11EventReset').onclick = () => loadEvents().catch(showError);
    $('#phase11EventForm').onsubmit = saveEvent;
    $$('[data-event-edit]').forEach(button => button.onclick = () => loadEvents(state.events.find(item => item.id === button.dataset.eventEdit)).catch(showError));
    $$('[data-event-board]').forEach(button => button.onclick = () => openEventLeaderboard(button.dataset.eventBoard, button.dataset.eventTitle));
  }

  async function saveEvent(event) {
    event.preventDefault();
    const id = $('#phase11EventId').value;
    const body = {
      title: $('#phase11EventTitle').value,
      description: $('#phase11EventDescription').value,
      eventType: $('#phase11EventType').value,
      status: $('#phase11EventStatus').value,
      quizType: $('#phase11EventQuizType').value,
      category: $('#phase11EventCategory').value,
      questionCount: Number($('#phase11EventQuestions').value),
      maxAttempts: Number($('#phase11EventAttempts').value),
      startsAt: new Date($('#phase11EventStart').value).toISOString(),
      endsAt: new Date($('#phase11EventEnd').value).toISOString(),
      rewardXp: Number($('#phase11EventXp').value),
      rewardSeasonPoints: Number($('#phase11EventSeason').value),
      badgeId: $('#phase11EventBadge').value,
      communityTarget: Number($('#phase11EventTarget').value),
      featured: $('#phase11EventFeatured').checked,
    };
    await api(id ? `/api/platform/admin/phase11/events/${id}` : '/api/platform/admin/phase11/events', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    await loadEvents();
  }

  async function openEventLeaderboard(id, title) {
    const data = await api(`/api/platform/admin/phase11/events/${id}/leaderboard`);
    const rows = data.leaderboard || [];
    if (!rows.length) return alert(`${title}: Noch keine abgeschlossenen Teilnahmen.`);
    const choice = prompt(`${title}\nSpieler-ID für eine Korrektur eingeben:\n\n${rows.slice(0,20).map(row => `${row.rank}. ${row.name} · ${row.best_score} Punkte · ${row.id}`).join('\n')}`, rows[0].id);
    if (!choice) return;
    const row = rows.find(item => item.id === choice);
    if (!row) return alert('Spieler-ID wurde nicht gefunden.');
    const remove = confirm('Eintrag vollständig entfernen? „Abbrechen“ öffnet die Werteberichtigung.');
    if (remove) {
      await api(`/api/platform/admin/phase11/events/${id}/leaderboard/${row.id}`, { method: 'PUT', body: JSON.stringify({ remove: true }) });
      return alert('Eintrag wurde entfernt.');
    }
    const score = Number(prompt('Neuer Punktestand:', String(row.best_score)));
    const correct = Number(prompt('Neue Anzahl richtiger Antworten:', String(row.best_correct)));
    const attempts = Number(prompt('Neue Anzahl Versuche:', String(row.attempts)));
    await api(`/api/platform/admin/phase11/events/${id}/leaderboard/${row.id}`, { method: 'PUT', body: JSON.stringify({ score, correct, attempts }) });
    alert('Ranglisteneintrag wurde korrigiert.');
  }

  async function loadQuestions(query = '') {
    const data = await api(`/api/platform/admin/phase11/questions?q=${encodeURIComponent(query)}`);
    const target = $('[data-phase11-content="questions"]');
    target.innerHTML = `<section class="panel"><div class="panel-heading"><div><span class="eyebrow">Redaktion</span><h2>Fragen prüfen und deaktivieren</h2><p>Deaktivierte Fragen werden zentral aus Solo, Online, Offline, Duellen, Turnieren und Events entfernt.</p></div></div><form id="phase11QuestionSearch" class="phase11-filter-row"><input id="phase11QuestionQuery" placeholder="Fragen-ID, Text oder Kategorie" value="${esc(query)}"><button class="btn primary" type="submit">Suchen</button></form><div id="phase11Questions">${(data.questions || []).length ? data.questions.map(item => `<article class="phase11-question-row ${item.disabled ? 'disabled' : ''}"><div><strong>${esc(item.text)}</strong><p>${esc(item.type)} · ${esc(item.category)} · <code>${esc(item.id)}</code></p>${item.reason ? `<small>Grund: ${esc(item.reason)}</small>` : ''}</div><button class="btn ${item.disabled ? 'primary' : 'danger'} small" data-question-toggle="${esc(item.id)}" data-disabled="${item.disabled}">${item.disabled ? 'Reaktivieren' : 'Deaktivieren'}</button></article>`).join('') : empty('Keine passenden Fragen gefunden.')}</div></section>`;
    $('#phase11QuestionSearch').onsubmit = event => { event.preventDefault(); loadQuestions($('#phase11QuestionQuery').value).catch(showError); };
    $$('[data-question-toggle]').forEach(button => button.onclick = async () => {
      const disabled = button.dataset.disabled !== 'true';
      const reason = disabled ? prompt('Warum soll diese Frage deaktiviert werden?', 'Redaktionelle Prüfung') : '';
      if (disabled && !reason) return;
      await api(`/api/platform/admin/phase11/questions/${encodeURIComponent(button.dataset.questionToggle)}`, { method: 'PUT', body: JSON.stringify({ disabled, reason }) });
      await loadQuestions($('#phase11QuestionQuery').value);
    });
  }

  function renderOperations() {
    const target = $('[data-phase11-content="operations"]');
    target.innerHTML = `<section class="panel phase11-danger-panel"><div class="panel-heading"><div><span class="eyebrow">Saisonbetrieb</span><h2>Saison kontrolliert abschließen</h2><p>Der Abschluss archiviert Platzierungen, Auf- und Abstiege und startet anschließend die nächste Saison. Eine laufende Saison benötigt zusätzlich die Force-Freigabe.</p></div></div><form id="phase11SeasonForm" class="phase11-admin-form"><label class="span-2">Bestätigungstext<input id="phase11SeasonConfirmation" placeholder="SAISON ABSCHLIESSEN"></label><label><span><input id="phase11SeasonForce" type="checkbox"> Laufende Saison vorzeitig beenden</span></label><div class="phase11-form-actions"><button class="btn danger" type="submit">Saison endgültig abschließen</button></div></form><div id="phase11SeasonMessage" class="message"></div></section><section class="panel"><div class="panel-heading"><div><span class="eyebrow">Betriebsroutine</span><h2>Empfohlene Reihenfolge vor einem Release</h2></div></div><div class="phase11-check-list"><div class="phase11-check"><i></i><div><strong>Bereitschaftsprüfung ausführen</strong><small>Datenbank, Migrationen, Katalog und E-Mail-Konfiguration kontrollieren.</small></div></div><div class="phase11-check"><i></i><div><strong>Analytics-Tagesstand speichern</strong><small>Vergleichswert vor dem Deployment sichern.</small></div></div><div class="phase11-check"><i></i><div><strong>Offene Risikohinweise prüfen</strong><small>Keine unbegründeten automatischen Sanktionen auslösen.</small></div></div><div class="phase11-check"><i></i><div><strong>Eventkalender prüfen</strong><small>Startzeit, Endzeit, Versuche, Belohnungen und Status kontrollieren.</small></div></div></div></section>`;
    $('#phase11SeasonForm').onsubmit = async event => {
      event.preventDefault();
      if (!confirm('Saisonabschluss wirklich ausführen? Dieser Vorgang verändert Ranglisten und Ligen.')) return;
      const button = event.currentTarget.querySelector('button');
      button.disabled = true;
      try {
        const data = await api('/api/platform/admin/phase11/seasons/settle', { method: 'POST', body: JSON.stringify({ confirmation: $('#phase11SeasonConfirmation').value, force: $('#phase11SeasonForce').checked }) });
        $('#phase11SeasonMessage').textContent = `Saison „${data.settledSeason.name}“ wurde abgeschlossen. Neue Saison: ${data.nextSeason.name}.`;
      } catch (error) {
        $('#phase11SeasonMessage').textContent = error.message;
        $('#phase11SeasonMessage').className = 'message bad-text';
      } finally { button.disabled = false; }
    };
  }

  async function loadView(view) {
    if (view === 'readiness') return loadReadiness();
    if (view === 'analytics') return loadAnalytics();
    if (view === 'risks') return loadRisks();
    if (view === 'events') return loadEvents();
    if (view === 'questions') return loadQuestions();
    if (view === 'operations') return renderOperations();
  }

  shell();
  document.querySelector('[data-admin-tab="phase11"]')?.addEventListener('click', () => loadView(state.view).catch(showError));
})();
