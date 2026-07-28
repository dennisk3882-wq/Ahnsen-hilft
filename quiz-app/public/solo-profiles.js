'use strict';

(() => {
  const startButton = document.querySelector('#startSoloButton');
  const hero = document.querySelector('.solo-hero');
  const topbar = document.querySelector('.solo-game-topbar');
  let currentProfile = null;
  let profiles = [];

  if (startButton) startButton.disabled = true;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
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

  function initials(name) {
    return String(name || '?').split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  }

  function installUi() {
    if (!hero || document.querySelector('#soloProfilePanel')) return;
    const panel = document.createElement('section');
    panel.id = 'soloProfilePanel';
    panel.className = 'panel solo-profile-panel';
    panel.innerHTML = `
      <div class="panel-heading compact">
        <div><span class="eyebrow">Dein persönlicher Spielstand</span><h2>Solo-Profil auswählen</h2></div>
        <span id="profileStorageStatus" class="info-chip">Dauerhaft in Neon gespeichert</span>
      </div>
      <div id="profileCurrent"></div>
      <div id="profileLoginArea" class="profile-login-grid">
        <div class="profile-box">
          <h3>Vorhandenes Profil</h3>
          <p class="muted">Profil auswählen und mit dem selbst vergebenen Passwort anmelden.</p>
          <div id="profileList" class="profile-list"></div>
          <form id="profileLoginForm" class="profile-form">
            <label>Profilname<input id="profileLoginName" autocomplete="username" placeholder="Zum Beispiel Louis"></label>
            <label>Passwort<input id="profileLoginPassword" type="password" autocomplete="current-password" placeholder="Passwort"></label>
            <button class="btn primary" type="submit">Profil öffnen</button>
          </form>
        </div>
        <div class="profile-box">
          <h3>Neues Profil anlegen</h3>
          <p class="muted">Statistiken, Rekorde und Auszeichnungen bleiben dauerhaft erhalten.</p>
          <form id="profileRegisterForm" class="profile-form">
            <label>Neuer Profilname<input id="profileRegisterName" autocomplete="username" maxlength="30" placeholder="Profilname"></label>
            <label>Passwort<input id="profileRegisterPassword" type="password" autocomplete="new-password" placeholder="Mindestens 4 Zeichen"></label>
            <label>Passwort wiederholen<input id="profileRegisterConfirmation" type="password" autocomplete="new-password" placeholder="Noch einmal eingeben"></label>
            <button class="btn success" type="submit">Profil erstellen</button>
          </form>
        </div>
      </div>
      <div id="profileMessage" class="message" aria-live="polite"></div>
      <p class="profile-required-note">Vor dem Start muss ein Profil geöffnet sein. Das Passwort wird niemals im Browser gespeichert.</p>`;
    hero.insertAdjacentElement('afterend', panel);

    const modal = document.createElement('div');
    modal.id = 'profileStatsModal';
    modal.className = 'profile-modal hidden';
    modal.innerHTML = '<div class="profile-modal-card"><div id="profileStatsContent"></div></div>';
    document.body.appendChild(modal);

    document.querySelector('#profileLoginForm').addEventListener('submit', login);
    document.querySelector('#profileRegisterForm').addEventListener('submit', register);
    modal.addEventListener('click', event => { if (event.target === modal) closeStats(); });
  }

  function setMessage(text, bad = false) {
    const node = document.querySelector('#profileMessage');
    if (!node) return;
    node.textContent = text;
    node.className = `message ${bad ? 'bad-text' : ''}`;
  }

  function renderProfileList() {
    const list = document.querySelector('#profileList');
    if (!list) return;
    list.innerHTML = profiles.length
      ? profiles.map(profile => `<button class="profile-choice" type="button" data-profile-name="${esc(profile.name)}"><span>${esc(profile.name)}</span>${profile.games ? ` · ${profile.games} Spiele` : ''}</button>`).join('')
      : '<span class="muted">Noch kein Profil vorhanden.</span>';
    list.querySelectorAll('[data-profile-name]').forEach(button => button.addEventListener('click', () => {
      document.querySelector('#profileLoginName').value = button.dataset.profileName;
      list.querySelectorAll('.profile-choice').forEach(item => item.classList.toggle('active', item === button));
      document.querySelector('#profileLoginPassword').focus();
    }));
  }

  function renderCurrent() {
    const current = document.querySelector('#profileCurrent');
    const loginArea = document.querySelector('#profileLoginArea');
    if (!current || !loginArea) return;
    loginArea.classList.toggle('hidden', Boolean(currentProfile));
    if (!currentProfile) {
      current.innerHTML = '';
      if (startButton) startButton.disabled = true;
      document.querySelector('#profileGameChip')?.remove();
      return;
    }

    current.innerHTML = `<div class="profile-current">
      <div class="profile-identity"><div class="profile-avatar">${esc(initials(currentProfile.name))}</div><div><strong>${esc(currentProfile.name)}</strong><span>Profil ist geöffnet · Fortschritt wird dauerhaft gespeichert</span></div></div>
      <div class="profile-actions"><button id="openProfileStats" class="btn secondary small" type="button">📊 Profil & Statistik</button><button id="logoutProfile" class="btn ghost small" type="button">Profil wechseln</button></div>
    </div>`;
    document.querySelector('#openProfileStats').addEventListener('click', openStats);
    document.querySelector('#logoutProfile').addEventListener('click', logout);
    if (startButton) startButton.disabled = false;

    if (topbar && !document.querySelector('#profileGameChip')) {
      const chip = document.createElement('span');
      chip.id = 'profileGameChip';
      chip.className = 'profile-game-chip';
      topbar.querySelector('.row')?.appendChild(chip);
    }
    const chip = document.querySelector('#profileGameChip');
    if (chip) chip.innerHTML = `👤 ${esc(currentProfile.name)}`;
  }

  async function refresh() {
    installUi();
    try {
      const [listData, meData] = await Promise.all([
        api('/api/solo/profiles'),
        api('/api/solo/profiles/me'),
      ]);
      profiles = listData.profiles || [];
      currentProfile = meData.profile || null;
      const storageStatus = document.querySelector('#profileStorageStatus');
      if (storageStatus && !listData.enabled) storageStatus.textContent = 'Datenbank nicht verfügbar';
      renderProfileList();
      renderCurrent();
      window.currentSoloProfile = currentProfile;
      window.dispatchEvent(new CustomEvent('solo-profile-changed', { detail: currentProfile }));
    } catch (error) {
      setMessage(error.message, true);
      if (startButton) startButton.disabled = true;
    }
  }

  async function login(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    setMessage('Profil wird geöffnet …');
    try {
      const data = await api('/api/solo/profiles/login', {
        method: 'POST',
        body: JSON.stringify({
          name: document.querySelector('#profileLoginName').value,
          password: document.querySelector('#profileLoginPassword').value,
        }),
      });
      currentProfile = data.profile;
      document.querySelector('#profileLoginPassword').value = '';
      setMessage(`Willkommen, ${currentProfile.name}!`);
      await refresh();
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function register(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    setMessage('Profil wird erstellt …');
    try {
      const data = await api('/api/solo/profiles/register', {
        method: 'POST',
        body: JSON.stringify({
          name: document.querySelector('#profileRegisterName').value,
          password: document.querySelector('#profileRegisterPassword').value,
          passwordConfirmation: document.querySelector('#profileRegisterConfirmation').value,
        }),
      });
      currentProfile = data.profile;
      event.currentTarget.reset();
      setMessage(`Das Profil „${currentProfile.name}“ wurde erstellt.`);
      await refresh();
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function logout() {
    if (!confirm('Profil wirklich schließen? Eine laufende Solo-Runde wird beendet.')) return;
    try {
      await api('/api/solo/profiles/logout', { method: 'POST' });
      localStorage.removeItem('ahnsen_solo_session');
      location.reload();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  function closeStats() {
    document.querySelector('#profileStatsModal')?.classList.add('hidden');
  }

  function statsHtml(stats) {
    const categories = stats.categories?.length
      ? stats.categories.map(category => `<div class="profile-category-row"><strong>${esc(category.category)}</strong><div class="profile-category-bar"><span style="--profile-width:${category.accuracy}%"></span></div><span>${category.correct}/${category.answers} · ${category.accuracy}%</span></div>`).join('')
      : '<p class="muted">Noch keine Kategorien gespielt.</p>';
    const achievements = stats.achievements?.length
      ? stats.achievements.map(item => `<div class="achievement-card"><b>${item.icon}</b><strong>${esc(item.title)}</strong><span>${esc(item.text)}</span></div>`).join('')
      : '<p class="muted">Die erste Auszeichnung wartet schon.</p>';
    const games = stats.recentGames?.length
      ? stats.recentGames.map(game => `<tr><td>${new Date(game.finishedAt).toLocaleDateString('de-DE')}</td><td>${game.quizType === 'child' ? 'Kinder' : 'Erwachsene'}</td><td>${game.questions}</td><td>${game.score}</td><td>${game.accuracy}%</td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">Noch keine Spielrunden gespeichert.</td></tr>';
    return `<div class="panel-heading"><div><span class="eyebrow">Dauerhaftes Solo-Profil</span><h2>${esc(stats.profile.name)}</h2></div><button id="closeProfileStats" class="btn ghost small" type="button">Schließen</button></div>
      <div class="profile-stat-grid">
        <div class="profile-stat"><strong>${stats.games}</strong><span>Quizrunden</span></div>
        <div class="profile-stat"><strong>${stats.correct}</strong><span>Richtig</span></div>
        <div class="profile-stat"><strong>${stats.accuracy}%</strong><span>Trefferquote</span></div>
        <div class="profile-stat"><strong>${stats.points}</strong><span>Gesamtpunkte</span></div>
        <div class="profile-stat"><strong>${stats.bestScore}</strong><span>Bester Rundenscore</span></div>
      </div>
      <h3>Auszeichnungen</h3><div class="achievement-grid">${achievements}</div>
      <h3 style="margin-top:24px">Kategorien</h3><div class="profile-category-list">${categories}</div>
      <h3 style="margin-top:24px">Letzte Runden</h3><div class="table-wrap"><table class="data"><thead><tr><th>Datum</th><th>Quiz</th><th>Fragen</th><th>Punkte</th><th>Quote</th></tr></thead><tbody>${games}</tbody></table></div>`;
  }

  async function openStats() {
    const modal = document.querySelector('#profileStatsModal');
    const content = document.querySelector('#profileStatsContent');
    modal.classList.remove('hidden');
    content.innerHTML = '<p class="muted">Statistik wird geladen …</p>';
    try {
      const stats = await api('/api/solo/profiles/stats');
      content.innerHTML = statsHtml(stats);
      document.querySelector('#closeProfileStats').addEventListener('click', closeStats);
    } catch (error) {
      content.innerHTML = `<div class="panel-heading"><h2>Statistik</h2><button id="closeProfileStats" class="btn ghost small">Schließen</button></div><p class="bad-text">${esc(error.message)}</p>`;
      document.querySelector('#closeProfileStats').addEventListener('click', closeStats);
    }
  }

  installUi();
  refresh();
})();