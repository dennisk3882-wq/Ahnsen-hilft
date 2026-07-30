'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  let timer = null;
  let activeTab = 'overview';
  let latestSummary = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const date = value => value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '–';

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Anfrage fehlgeschlagen.'), { status: response.status, data });
    return data;
  }

  function showDashboard() {
    $('#adminLogin').classList.add('hidden');
    $('#adminDashboard').classList.remove('hidden');
    $('#adminLogout').classList.remove('hidden');
    if (!timer) timer = setInterval(() => refreshCurrent(false), 15000);
  }

  function showLogin(message = '') {
    clearInterval(timer);
    timer = null;
    $('#adminLogin').classList.remove('hidden');
    $('#adminDashboard').classList.add('hidden');
    $('#adminLogout').classList.add('hidden');
    $('#adminLoginMessage').textContent = message;
  }

  function metric(label, value, sub = '') {
    return `<article class="admin-metric"><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(sub)}</small></article>`;
  }

  function status(value) {
    return `<span class="admin-status ${esc(value)}">${esc(value)}</span>`;
  }

  function empty(text) {
    return `<div class="admin-empty">${esc(text)}</div>`;
  }

  function setTab(tab) {
    activeTab = tab;
    $$('[data-admin-tab]').forEach(button => button.classList.toggle('active', button.dataset.adminTab === tab));
    $$('[data-admin-view]').forEach(view => view.classList.toggle('hidden', view.dataset.adminView !== tab));
    refreshCurrent(true);
  }

  async function login(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      await api('/api/platform/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#adminPassword').value }) });
      $('#adminPassword').value = '';
      showDashboard();
      setTab('overview');
    } catch (error) {
      showLogin(error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function logout() {
    await api('/api/platform/admin/logout', { method: 'POST', body: '{}' }).catch(() => {});
    showLogin('Abgemeldet.');
  }

  async function loadSummary() {
    const [summary, metrics] = await Promise.all([
      api('/api/platform/admin/summary'),
      api('/api/platform/admin/metrics?hours=24'),
    ]);
    latestSummary = summary;
    showDashboard();
    $('#adminUpdated').textContent = `Zuletzt aktualisiert: ${date(new Date())}`;
    $('#adminMetrics').innerHTML = [
      metric('Profile', summary.profiles?.total || 0, `${summary.profiles?.active_day || 0} heute aktiv`),
      metric('Online-Räume', summary.rooms?.total || 0, `${summary.rooms?.playing || 0} laufen`),
      metric('Online-Spieler', summary.rooms?.players || 0, 'in gespeicherten Räumen'),
      metric('Offene Meldungen', summary.reports?.open || 0, 'Moderation'),
      metric('API-Anfragen/24h', summary.activity?.requests || 0, `${summary.activity?.avg_ms || 0} ms Ø`),
      metric('Serverfehler/24h', summary.activity?.server_errors || 0, `${summary.push?.subscriptions || 0} Push-Abos`),
      metric('Turniere', summary.tournaments?.total || 0, `${summary.tournaments?.active || 0} aktiv`),
      metric('Alte Quizpakete', summary.packs?.total || 0, 'Nutzerfunktion deaktiviert'),
      metric('Matchmaking', summary.queue?.waiting || 0, 'wartende Spieler'),
    ].join('');
    renderServiceChecks(summary);
    renderMetricTimeline(metrics.metrics || []);
    renderErrors(summary.errors || []);
    renderAudit(summary.audit || []);
  }

  function renderServiceChecks(summary) {
    const checks = [
      ['PostgreSQL und Kontotabellen', true, 'Profile, Räume und Kontoeinstellungen werden dauerhaft gespeichert.'],
      ['E-Mail-Versand', Boolean(summary.email?.configured), summary.email?.configured ? `${summary.email.provider} · ${summary.email.from}` : 'BREVO_API_KEY oder RESEND_API_KEY fehlt.'],
      ['Kurzlebige Echtzeit-Tickets', true, 'Raumtokens stehen nicht in der EventSource-Adresse.'],
      ['Nutzer-Quizpakete', true, 'Erstellung und Veröffentlichung sind deaktiviert.'],
      ['Fehler- und Audit-Erfassung', true, 'API-, Browser- und Moderationsereignisse werden protokolliert.'],
      ['JSON-Datenexport', true, 'Sicherheitsfelder und Passwort-Hashes werden nicht exportiert.'],
    ];
    $('#adminServiceChecks').innerHTML = checks.map(([label, ok, detail]) => `<div><i class="${ok ? '' : 'warning'}"></i><span><strong>${esc(label)}</strong><br><small>${esc(detail)}</small></span></div>`).join('');
  }

  function renderMetricTimeline(rows) {
    if (!rows.length) {
      $('#adminMetricTimeline').innerHTML = empty('Noch keine stündlichen Messwerte vorhanden.');
      return;
    }
    const max = Math.max(1, ...rows.map(row => Number(row.requests || 0)));
    $('#adminMetricTimeline').innerHTML = rows.map(row => {
      const width = Math.max(2, Math.round(Number(row.requests || 0) / max * 100));
      return `<article class="admin-timeline-row"><strong>${new Date(row.bucket).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</strong><div class="admin-timeline-bar"><span style="width:${width}%"></span></div><span>${row.requests} Aufrufe</span><span>${row.errors} Fehler</span><span>${row.average_ms} ms Ø</span></article>`;
    }).join('');
  }

  async function loadProfiles() {
    const query = encodeURIComponent($('#adminProfileQuery').value.trim());
    const state = encodeURIComponent($('#adminProfileStatus').value);
    const data = await api(`/api/platform/admin/profiles?q=${query}&status=${state}&limit=200`);
    const rows = data.profiles || [];
    $('#adminProfiles').innerHTML = rows.length ? rows.map(profile => `<article class="admin-item" data-profile-card="${profile.id}"><div class="admin-item-head"><div><strong>${esc(profile.name)}</strong><small>${esc(profile.email || 'Keine bestätigte E-Mail')}</small></div>${status(profile.account_status)}</div><div class="admin-item-grid"><div class="admin-item-stat"><strong>${profile.games}</strong><span>Spiele</span></div><div class="admin-item-stat"><strong>${profile.points}</strong><span>Punkte</span></div><div class="admin-item-stat"><strong>${profile.reports}</strong><span>Meldungen</span></div><div class="admin-item-stat"><strong>${date(profile.last_login_at)}</strong><span>Letzter Login</span></div></div><div class="admin-item-actions"><button class="btn secondary small" data-profile-open="${profile.id}" type="button">Details</button><button class="btn ghost small" data-profile-suspend="${profile.id}" type="button">Zeitweise sperren</button><button class="btn ghost small" data-profile-ban="${profile.id}" type="button">Dauerhaft sperren</button></div></article>`).join('') : empty('Keine passenden Profile gefunden.');
    $$('[data-profile-open]').forEach(button => button.onclick = () => openProfile(button.dataset.profileOpen));
    $$('[data-profile-suspend]').forEach(button => button.onclick = () => setProfileStatus(button.dataset.profileSuspend, 'suspended'));
    $$('[data-profile-ban]').forEach(button => button.onclick = () => setProfileStatus(button.dataset.profileBan, 'banned'));
  }

  async function openProfile(id) {
    const data = await api(`/api/platform/admin/profiles/${id}`);
    const profile = data.profile;
    const account = profile.account;
    const target = $('#adminProfileDetails');
    target.classList.remove('hidden');
    target.innerHTML = `<div class="panel-heading"><div><span class="eyebrow">Profil ${esc(account.id)}</span><h2>${esc(account.name)}</h2><p>${esc(account.email || 'Keine bestätigte E-Mail')} · erstellt ${date(account.createdAt)}</p></div>${status(account.status)}</div><div class="admin-profile-detail-grid"><div><strong>${profile.stats.games}</strong><span>Spiele</span></div><div><strong>${profile.stats.answers}</strong><span>Antworten</span></div><div><strong>${profile.stats.correct}</strong><span>Richtig</span></div><div><strong>${profile.stats.points}</strong><span>Punkte</span></div></div><p class="muted">Statusgrund: ${esc(account.statusReason || 'Keiner')} · Ende: ${date(account.statusUntil)}</p><div class="admin-item-actions"><button class="btn primary small" data-paction="activate">Freigeben</button><button class="btn secondary small" data-paction="suspend">Zeitweise sperren</button><button class="btn ghost small" data-paction="ban">Dauerhaft sperren</button><button class="btn ghost small" data-paction="rename">Namen ändern</button><button class="btn ghost small" data-paction="reset">Reset-Link senden</button><button class="btn danger small" data-paction="delete">Profil löschen</button></div><details><summary>Letzte Antworten und Meldungen</summary><code>${esc(JSON.stringify({ recentAnswers: profile.recentAnswers, reports: profile.reports, friendships: profile.friendships }, null, 2))}</code></details>`;
    target.querySelector('[data-paction="activate"]').onclick = () => setProfileStatus(id, 'active');
    target.querySelector('[data-paction="suspend"]').onclick = () => setProfileStatus(id, 'suspended');
    target.querySelector('[data-paction="ban"]').onclick = () => setProfileStatus(id, 'banned');
    target.querySelector('[data-paction="rename"]').onclick = () => renameProfile(id, account.name);
    target.querySelector('[data-paction="reset"]').onclick = () => sendProfileReset(id);
    target.querySelector('[data-paction="delete"]').onclick = () => deleteProfile(id, account.name);
    $$('[data-profile-card]').forEach(card => card.classList.toggle('selected', card.dataset.profileCard === id));
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function setProfileStatus(id, nextStatus) {
    let reason = '';
    let until = null;
    if (nextStatus !== 'active') {
      reason = prompt('Grund für die Sperre:', nextStatus === 'banned' ? 'Verstoß gegen die Nutzungsregeln' : 'Vorübergehende Prüfung') || '';
      if (!reason) return;
    }
    if (nextStatus === 'suspended') {
      const hours = Number(prompt('Sperrdauer in Stunden:', '24'));
      if (!Number.isFinite(hours) || hours <= 0) return;
      until = new Date(Date.now() + Math.min(24 * 365, hours) * 60 * 60 * 1000).toISOString();
    }
    if (!confirm(nextStatus === 'active' ? 'Profil wieder freigeben?' : `Profil wirklich auf „${nextStatus}“ setzen?`)) return;
    await api(`/api/platform/admin/profiles/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus, reason, until }) });
    await loadProfiles();
    await openProfile(id).catch(() => $('#adminProfileDetails').classList.add('hidden'));
  }

  async function renameProfile(id, currentName) {
    const name = prompt('Neuer Profilname:', currentName);
    if (!name || name === currentName) return;
    await api(`/api/platform/admin/profiles/${id}/name`, { method: 'PATCH', body: JSON.stringify({ name }) });
    await loadProfiles();
    await openProfile(id);
  }

  async function sendProfileReset(id) {
    if (!confirm('Passwort-Reset-Link an die bestätigte E-Mail-Adresse senden?')) return;
    const data = await api(`/api/platform/admin/profiles/${id}/password-reset`, { method: 'POST', body: '{}' });
    alert(data.emailSent ? 'Reset-Link wurde versendet.' : 'Reset wurde erzeugt, aber der E-Mail-Dienst ist nicht konfiguriert oder der Versand ist fehlgeschlagen.');
  }

  async function deleteProfile(id, name) {
    const confirmation = prompt(`Zum endgültigen Löschen „${name}“ eingeben:`);
    if (confirmation !== name) return;
    const reason = prompt('Interne Löschbegründung:', 'Administrativer Löschvorgang') || '';
    await api(`/api/platform/admin/profiles/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
    $('#adminProfileDetails').classList.add('hidden');
    await loadProfiles();
  }

  async function loadRooms() {
    const data = await api('/api/platform/admin/rooms');
    const rows = data.rooms || [];
    $('#adminRooms').innerHTML = rows.length ? rows.map(room => `<article class="admin-item"><div class="admin-item-head"><div><strong>${esc(room.title)}</strong><small>Code ${esc(room.code)} · ${esc(room.quizType)} · ${esc(room.category)}</small></div>${status(room.phase)}</div><p>${room.players.length} Spieler · Frage ${room.currentIndex + 1}/${room.questionCount} · zuletzt ${date(room.updatedAt)}</p><div class="admin-room-players">${room.players.map(player => `<div class="admin-room-player"><span><strong>${esc(player.name)}</strong><small>${player.connected ? 'Verbunden' : 'Getrennt'} · ${player.score} Punkte${player.team ? ` · ${esc(player.team)}` : ''}</small></span><button class="btn ghost small" data-room-kick="${room.code}" data-player-id="${player.id}" data-player-name="${esc(player.name)}" type="button">Entfernen</button></div>`).join('')}</div><div class="admin-item-actions"><button class="btn danger small" data-room-close="${room.code}" type="button">Raum schließen</button></div></article>`).join('') : empty('Keine aktiven Online-Räume gespeichert.');
    $$('[data-room-close]').forEach(button => button.onclick = () => closeRoom(button.dataset.roomClose));
    $$('[data-room-kick]').forEach(button => button.onclick = () => kickPlayer(button.dataset.roomKick, button.dataset.playerId, button.dataset.playerName));
  }

  async function closeRoom(code) {
    const reason = prompt(`Grund für Schließung von Raum ${code}:`, 'Durch Plattform-Moderation geschlossen');
    if (!reason || !confirm(`Raum ${code} wirklich schließen?`)) return;
    await api(`/api/platform/admin/rooms/${code}/close`, { method: 'POST', body: JSON.stringify({ reason }) });
    await loadRooms();
  }

  async function kickPlayer(code, playerId, playerName) {
    const reason = prompt(`Warum soll ${playerName} entfernt werden?`, 'Durch Plattform-Moderation entfernt');
    if (!reason) return;
    await api(`/api/platform/admin/rooms/${code}/kick`, { method: 'POST', body: JSON.stringify({ playerId, reason }) });
    await loadRooms();
  }

  async function loadReports() {
    const data = await api(`/api/platform/admin/reports?status=${encodeURIComponent($('#reportFilter').value)}`);
    renderReports(data.reports || []);
  }

  function renderReports(rows) {
    $('#adminReports').innerHTML = rows.length ? rows.map(report => `<article class="admin-item"><div class="admin-item-head"><strong>#${report.id} · ${esc(report.reason)}</strong>${status(report.status)}</div><p>Gemeldet: ${esc(report.target_profile_name || report.target_name || 'Unbekannt')} · von ${esc(report.reporter_name || 'Anonym')} · Raum ${esc(report.room_code || '–')}</p><p>${esc(report.details || 'Keine Details')}</p><small>${date(report.created_at)}</small><div class="admin-item-actions"><button class="btn secondary small" data-report-status="reviewing" data-report-id="${report.id}">Prüfen</button><button class="btn primary small" data-report-status="resolved" data-report-id="${report.id}">Erledigt</button><button class="btn ghost small" data-report-status="dismissed" data-report-id="${report.id}">Verwerfen</button>${report.target_profile_id ? `<button class="btn ghost small" data-report-profile="${report.target_profile_id}">Profil öffnen</button>` : ''}</div></article>`).join('') : empty('Keine Meldungen in diesem Status.');
    $$('[data-report-id]').forEach(button => button.onclick = () => resolveReport(button.dataset.reportId, button.dataset.reportStatus));
    $$('[data-report-profile]').forEach(button => button.onclick = () => { setTab('profiles'); setTimeout(() => openProfile(button.dataset.reportProfile), 100); });
  }

  async function resolveReport(id, nextStatus) {
    const note = prompt('Admin-Notiz (optional):', '') || '';
    await api(`/api/platform/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus, note }) });
    await loadReports();
  }

  async function loadTournaments() {
    const data = await api('/api/platform/admin/tournaments');
    const rows = data.tournaments || [];
    $('#adminTournaments').innerHTML = rows.length ? rows.map(item => `<article class="admin-item"><div class="admin-item-head"><div><strong>${esc(item.name)}</strong><small>${esc(item.code)} · Besitzer ${esc(item.owner_name)}</small></div>${status(item.status)}</div><p>${item.player_count} Teilnehmer · ${esc(item.format)} · erstellt ${date(item.created_at)}</p><div class="admin-item-actions"><button class="btn secondary small" data-tournament-status="open" data-tournament-code="${item.code}">Öffnen</button><button class="btn secondary small" data-tournament-status="running" data-tournament-code="${item.code}">Laufend</button><button class="btn primary small" data-tournament-status="finished" data-tournament-code="${item.code}">Beenden</button><button class="btn danger small" data-tournament-delete="${item.code}" type="button">Löschen</button></div></article>`).join('') : empty('Keine Turniere vorhanden.');
    $$('[data-tournament-status]').forEach(button => button.onclick = () => updateTournament(button.dataset.tournamentCode, button.dataset.tournamentStatus));
    $$('[data-tournament-delete]').forEach(button => button.onclick = () => deleteTournament(button.dataset.tournamentDelete));
  }

  async function updateTournament(code, nextStatus) {
    await api(`/api/platform/admin/tournaments/${code}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
    await loadTournaments();
  }

  async function deleteTournament(code) {
    if (!confirm(`Turnier ${code} dauerhaft löschen?`)) return;
    await api(`/api/platform/admin/tournaments/${code}`, { method: 'DELETE', body: '{}' });
    await loadTournaments();
  }

  async function loadPacks() {
    const data = await api('/api/platform/admin/legacy-packs');
    const rows = data.packs || [];
    $('#adminPacks').innerHTML = rows.length ? rows.map(item => `<article class="admin-item"><div class="admin-item-head"><div><strong>${esc(item.title)}</strong><small>Code ${esc(item.code)} · Besitzer ${esc(item.owner_name)}</small></div><span class="admin-status">${item.question_count} Fragen</span></div><p>${esc(item.description || 'Keine Beschreibung')} · ${item.plays} Aufrufe · ${esc(item.visibility)}</p><div class="admin-item-actions"><button class="btn danger small" data-pack-delete="${item.code}" type="button">Datensatz löschen</button></div></article>`).join('') : empty('Keine alten Nutzer-Quizpakete mehr vorhanden.');
    $$('[data-pack-delete]').forEach(button => button.onclick = () => deletePack(button.dataset.packDelete));
  }

  async function deletePack(code) {
    if (!confirm(`Altes Quizpaket ${code} endgültig löschen?`)) return;
    await api(`/api/platform/admin/legacy-packs/${code}`, { method: 'DELETE', body: '{}' });
    await loadPacks();
  }

  async function loadSecurity() {
    const [summary, bans] = await Promise.all([
      latestSummary ? Promise.resolve(latestSummary) : api('/api/platform/admin/summary'),
      api('/api/platform/admin/bans'),
    ]);
    renderErrors(summary.errors || []);
    renderAudit(summary.audit || []);
    $('#adminBans').innerHTML = bans.bans?.length ? bans.bans.map(item => `<article class="admin-item"><div class="admin-item-head"><strong>${esc(item.reason)}</strong><span>${date(item.expires_at)}</span></div><code>${esc(item.key_hash)}</code><div class="admin-item-actions"><button class="btn ghost small" data-ban-remove="${esc(item.key_hash)}" type="button">Sperre aufheben</button></div></article>`).join('') : empty('Keine aktiven Netzsperren.');
    $$('[data-ban-remove]').forEach(button => button.onclick = () => removeBan(button.dataset.banRemove));
  }

  async function removeBan(keyHash) {
    if (!confirm('Diese Netzsperre vorzeitig aufheben?')) return;
    await api(`/api/platform/admin/bans/${encodeURIComponent(keyHash)}`, { method: 'DELETE', body: '{}' });
    await loadSecurity();
  }

  function renderErrors(rows) {
    $('#adminErrors').innerHTML = rows.length ? rows.map(error => `<article class="admin-item"><div class="admin-item-head"><strong>${esc(error.event_type)}</strong><span>${date(error.created_at)}</span></div><p>${esc(error.route || 'Unbekannte Route')} · Status ${esc(error.status_code ?? '–')} · ${esc(error.duration_ms ?? '–')} ms</p><code>${esc(JSON.stringify(error.details || {}, null, 2))}</code></article>`).join('') : empty('Keine aktuellen Fehler erfasst.');
  }

  function renderAudit(rows) {
    $('#adminAudit').innerHTML = rows.length ? rows.map(entry => `<article class="admin-item"><div class="admin-item-head"><strong>${esc(entry.action)}</strong><span>${date(entry.created_at)}</span></div><p>${esc(entry.actor_type)} ${esc(entry.actor_id || '')} → ${esc(entry.target || '')}</p><code>${esc(JSON.stringify(entry.details || {}))}</code></article>`).join('') : empty('Noch keine Audit-Einträge.');
  }

  async function refreshCurrent(forceSummary = false) {
    try {
      if (forceSummary || activeTab === 'overview' || activeTab === 'security') await loadSummary();
      if (activeTab === 'profiles') await loadProfiles();
      else if (activeTab === 'rooms') await loadRooms();
      else if (activeTab === 'reports') await loadReports();
      else if (activeTab === 'tournaments') await loadTournaments();
      else if (activeTab === 'packs') await loadPacks();
      else if (activeTab === 'security') await loadSecurity();
    } catch (error) {
      if (error.status === 401 || /Admin-Anmeldung/.test(error.message)) showLogin('Bitte anmelden.');
      else $('#adminUpdated').textContent = `Fehler: ${error.message}`;
    }
  }

  $('#adminLoginForm').addEventListener('submit', login);
  $('#adminLogout').addEventListener('click', logout);
  $('#refreshAdmin').addEventListener('click', () => refreshCurrent(true));
  $('#adminProfileSearch').addEventListener('submit', event => { event.preventDefault(); loadProfiles().catch(error => alert(error.message)); });
  $('#adminProfileStatus').addEventListener('change', () => loadProfiles().catch(error => alert(error.message)));
  $('#refreshRooms').addEventListener('click', () => loadRooms().catch(error => alert(error.message)));
  $('#reportFilter').addEventListener('change', () => loadReports().catch(error => alert(error.message)));
  $('#refreshTournamentsAdmin').addEventListener('click', () => loadTournaments().catch(error => alert(error.message)));
  $('#refreshPacksAdmin').addEventListener('click', () => loadPacks().catch(error => alert(error.message)));
  $$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.adminTab)));
  refreshCurrent(true);
})();
