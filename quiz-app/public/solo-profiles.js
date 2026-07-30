'use strict';

(() => {
  const startButton = document.querySelector('#startSoloButton');
  const hero = document.querySelector('.solo-hero');
  const topbar = document.querySelector('.solo-game-topbar');
  const DEFAULT_AVATARS = ['robot', 'fox', 'owl', 'rocket', 'crown', 'crystal'];
  let currentProfile = null;
  let currentStats = null;
  let profiles = [];
  let availableAvatars = [...DEFAULT_AVATARS];
  let registrationAvatar = 'robot';

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

  function avatarSvg(id = 'robot') {
    const avatar = availableAvatars.includes(id) ? id : 'robot';
    const common = 'viewBox="0 0 64 64" aria-hidden="true"';
    if (avatar === 'fox') return `<svg ${common}><defs><linearGradient id="foxGradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffb443"/><stop offset="1" stop-color="#ff5e77"/></linearGradient></defs><path d="M12 19 22 7l10 9L42 7l10 12-4 28-16 10-16-10Z" fill="url(#foxGradient)"/><path d="m18 21 8 5-10 3Zm28 0-8 5 10 3Z" fill="#26153d" opacity=".65"/><path d="M22 35c5 8 15 8 20 0l-4 14H26Z" fill="#fff1e4"/><circle cx="25" cy="31" r="2.5" fill="#171226"/><circle cx="39" cy="31" r="2.5" fill="#171226"/><path d="m29 40 3 3 3-3" fill="none" stroke="#171226" stroke-width="2.5" stroke-linecap="round"/></svg>`;
    if (avatar === 'owl') return `<svg ${common}><defs><linearGradient id="owlGradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8a69ff"/><stop offset="1" stop-color="#35c9ff"/></linearGradient></defs><path d="M14 20 22 8l10 8 10-8 8 12-3 29-15 9-15-9Z" fill="url(#owlGradient)"/><circle cx="24" cy="31" r="9" fill="#eaf8ff"/><circle cx="40" cy="31" r="9" fill="#eaf8ff"/><circle cx="24" cy="31" r="3.5" fill="#15152d"/><circle cx="40" cy="31" r="3.5" fill="#15152d"/><path d="m28 40 4 5 4-5-4-3Z" fill="#ffca55"/></svg>`;
    if (avatar === 'rocket') return `<svg ${common}><defs><linearGradient id="rocketGradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b764ff"/><stop offset="1" stop-color="#39c9ff"/></linearGradient></defs><path d="M32 5c12 8 16 22 10 35L32 51 22 40C16 27 20 13 32 5Z" fill="url(#rocketGradient)"/><circle cx="32" cy="25" r="7" fill="#dff8ff" stroke="#35255d" stroke-width="3"/><path d="m21 35-9 8 11 2Zm22 0 9 8-11 2Z" fill="#7d4ce1"/><path d="m26 49 6 11 6-11" fill="#ffb347"/><path d="m29 49 3 7 3-7" fill="#ff6a5d"/></svg>`;
    if (avatar === 'crown') return `<svg ${common}><defs><linearGradient id="crownGradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe170"/><stop offset="1" stop-color="#ff8b35"/></linearGradient></defs><path d="m8 19 13 9 11-19 11 19 13-9-6 30H14Z" fill="url(#crownGradient)" stroke="#fff0a6" stroke-width="2"/><circle cx="8" cy="18" r="4" fill="#b45cff"/><circle cx="32" cy="8" r="4" fill="#4fd6ff"/><circle cx="56" cy="18" r="4" fill="#b45cff"/><path d="M16 43h32" stroke="#6c3518" stroke-width="4" stroke-linecap="round"/></svg>`;
    if (avatar === 'crystal') return `<svg ${common}><defs><linearGradient id="crystalGradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#db7cff"/><stop offset=".5" stop-color="#6d73ff"/><stop offset="1" stop-color="#36dbff"/></linearGradient></defs><path d="M32 5 53 23 45 51 32 59 19 51 11 23Z" fill="url(#crystalGradient)" stroke="#e9d8ff" stroke-width="2"/><path d="M32 5v54M11 23h42M19 51l13-28 13 28M11 23l21 36 21-36" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2"/></svg>`;
    return `<svg ${common}><defs><linearGradient id="robotGradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#aa63ff"/><stop offset="1" stop-color="#37caff"/></linearGradient></defs><path d="M27 8h10v7H27Z" fill="#dff8ff"/><circle cx="32" cy="7" r="4" fill="#8d59ff"/><rect x="10" y="15" width="44" height="38" rx="17" fill="url(#robotGradient)" stroke="#dcf7ff" stroke-width="2"/><rect x="16" y="23" width="32" height="21" rx="10" fill="#11172d"/><circle cx="25" cy="32" r="4" fill="#70e7ff"/><circle cx="39" cy="32" r="4" fill="#dc82ff"/><path d="M25 39c4 3 10 3 14 0" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  }

  function badgeSvg(icon) {
    const paths = {
      game: '<path d="M9 20H6a4 4 0 0 1-4-4l2-8a4 4 0 0 1 4-3h8a4 4 0 0 1 4 3l2 8a4 4 0 0 1-4 4h-3l-3-3Z"/><path d="M7 11h5M9.5 8.5v5M16 10h.01M19 13h.01"/>',
      star: '<path d="m12 2 3.1 6.3L22 9.3l-5 4.9 1.2 6.8-6.2-3.3L5.8 21 7 14.2 2 9.3l6.9-1Z"/>',
      medal: '<circle cx="12" cy="14" r="7"/><path d="m8 8-3-6h5l2 4 2-4h5l-3 6M9 14l2 2 4-4"/>',
      trophy: '<path d="M7 3h10v7a5 5 0 0 1-10 0ZM7 6H3v2a5 5 0 0 0 5 5m9-7h4v2a5 5 0 0 1-5 5M12 15v6m-4 0h8"/>',
      target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
      rocket: '<path d="M14 4c4-2 6-2 6-2s0 2-2 6l-6 6-5-1-1-5Z"/><path d="m9 15-3 5-2-2 3-5m5 4-1 5 5-3M15 7l2 2"/>',
      level: '<path d="M4 20V9m6 11V4m6 16v-7m4 7H2"/>',
      flame: '<path d="M13 2s1 5-3 8c-3 3-4 5-2 8a5 5 0 0 0 9-2c0-3-2-5-1-8-3 1-4 3-4 5-2-3 1-6 1-11Z"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18m-9 3v5m-2-2h4"/>',
      brain: '<path d="M9 4a4 4 0 0 0-4 4v1a4 4 0 0 0-1 7 4 4 0 0 0 5 4m6-16a4 4 0 0 1 4 4v1a4 4 0 0 1 1 7 4 4 0 0 1-5 4M9 4v16m6-16v16M6 10h3m6 0h3M6 15h3m6 0h3"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[icon] || paths.star}</svg>`;
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
          <p class="muted">Wähle deinen Avatar. XP, Level, Serien und Auszeichnungen bleiben dauerhaft erhalten.</p>
          <form id="profileRegisterForm" class="profile-form">
            <div><span class="muted">Avatar auswählen</span><div id="registrationAvatarPicker" class="phase2-avatar-picker"></div></div>
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
    modal.className = 'profile-modal phase2-profile-modal hidden';
    modal.innerHTML = '<div class="profile-modal-card"><div id="profileStatsContent"></div></div>';
    document.body.appendChild(modal);

    document.querySelector('#profileLoginForm').addEventListener('submit', login);
    document.querySelector('#profileRegisterForm').addEventListener('submit', register);
    modal.addEventListener('click', event => { if (event.target === modal) closeDashboard(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDashboard(); });
    document.querySelectorAll('[data-profile-view]').forEach(button => button.addEventListener('click', () => openDashboard(button.dataset.profileView)));
    renderRegistrationAvatars();
  }

  function setMessage(text, bad = false) {
    const node = document.querySelector('#profileMessage');
    if (!node) return;
    node.textContent = text;
    node.className = `message ${bad ? 'bad-text' : ''}`;
  }

  function renderRegistrationAvatars() {
    const picker = document.querySelector('#registrationAvatarPicker');
    if (!picker) return;
    picker.innerHTML = availableAvatars.map(id => `<button class="phase2-avatar-choice ${id === registrationAvatar ? 'active' : ''}" type="button" data-register-avatar="${id}" aria-label="Avatar ${id} auswählen">${avatarSvg(id)}</button>`).join('');
    picker.querySelectorAll('[data-register-avatar]').forEach(button => button.addEventListener('click', () => {
      registrationAvatar = button.dataset.registerAvatar;
      renderRegistrationAvatars();
    }));
  }

  function renderProfileList() {
    const list = document.querySelector('#profileList');
    if (!list) return;
    list.innerHTML = profiles.length
      ? profiles.map(profile => `<button class="profile-choice" type="button" data-profile-name="${esc(profile.name)}"><span class="phase2-mini-avatar">${avatarSvg(profile.avatarId)}</span><span>${esc(profile.name)}${profile.games ? ` · ${profile.games} Spiele` : ''}</span></button>`).join('')
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

    const stats = currentStats || {};
    const level = Number(stats.level || 1);
    const title = stats.title || 'Wissenssammler';
    const xp = Number(stats.xp || 0);
    const levelSize = Number(stats.levelSize || 500);
    const xpIntoLevel = Number(stats.xpIntoLevel || 0);
    const progress = Number(stats.progressPercent || 0);
    const streak = Number(stats.currentStreak || 0);
    current.innerHTML = `<div class="profile-current phase2-profile-card">
      <div class="phase2-avatar">${avatarSvg(currentProfile.avatarId)}</div>
      <div class="phase2-profile-main">
        <div class="phase2-profile-name"><strong>${esc(currentProfile.name)}</strong><span class="phase2-level-chip">Level ${level}</span>${streak ? `<span class="phase2-streak-chip">Serie ${streak} Tage</span>` : ''}</div>
        <span class="phase2-subtitle">${esc(title)} · Fortschritt wird dauerhaft gespeichert</span>
        <div class="phase2-xp-track"><span style="--phase2-progress:${progress}%"></span></div>
        <div class="phase2-xp-meta"><span>${xp.toLocaleString('de-DE')} XP gesamt</span><span>${xpIntoLevel}/${levelSize} XP bis Level ${level + 1}</span></div>
      </div>
      <div class="profile-actions"><button id="openProfileStats" class="btn secondary small" type="button">Profil & Fortschritt</button><button id="logoutProfile" class="btn ghost small" type="button">Profil wechseln</button></div>
    </div>`;
    document.querySelector('#openProfileStats').addEventListener('click', () => openDashboard('profile'));
    document.querySelector('#logoutProfile').addEventListener('click', logout);
    if (startButton) startButton.disabled = false;

    if (topbar && !document.querySelector('#profileGameChip')) {
      const chip = document.createElement('span');
      chip.id = 'profileGameChip';
      chip.className = 'profile-game-chip';
      topbar.querySelector('.row')?.appendChild(chip);
    }
    const chip = document.querySelector('#profileGameChip');
    if (chip) chip.innerHTML = `<span class="phase2-mini-avatar">${avatarSvg(currentProfile.avatarId)}</span>${esc(currentProfile.name)} · L${level}`;
  }

  async function refresh() {
    installUi();
    try {
      const [listData, meData] = await Promise.all([
        api('/api/solo/profiles'),
        api('/api/solo/profiles/me'),
      ]);
      profiles = listData.profiles || [];
      availableAvatars = listData.avatars?.length ? listData.avatars : [...DEFAULT_AVATARS];
      currentProfile = meData.profile || null;
      currentStats = currentProfile ? await api('/api/solo/profiles/stats').catch(() => null) : null;
      if (currentStats?.profile) currentProfile = { ...currentProfile, ...currentStats.profile };
      const storageStatus = document.querySelector('#profileStorageStatus');
      if (storageStatus && !listData.enabled) storageStatus.textContent = 'Datenbank nicht verfügbar';
      renderRegistrationAvatars();
      renderProfileList();
      renderCurrent();
      window.currentSoloProfile = currentProfile;
      window.currentSoloStats = currentStats;
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
          avatarId: registrationAvatar,
        }),
      });
      currentProfile = data.profile;
      event.currentTarget.reset();
      registrationAvatar = 'robot';
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

  function closeDashboard() {
    document.querySelector('#profileStatsModal')?.classList.add('hidden');
    document.body.style.removeProperty('overflow');
  }

  function categoriesHtml(stats) {
    return stats.categories?.length
      ? stats.categories.map(category => `<div class="profile-category-row"><strong>${esc(category.category)}</strong><div class="profile-category-bar"><span style="--profile-width:${category.accuracy}%"></span></div><span>${category.correct}/${category.answers} · ${category.accuracy}%</span></div>`).join('')
      : '<p class="muted">Noch keine Kategorien gespielt.</p>';
  }

  function achievementsHtml(stats) {
    return stats.achievements?.length
      ? stats.achievements.map(item => `<div class="phase2-badge-card"><div class="phase2-badge-icon">${badgeSvg(item.icon)}</div><div><strong>${esc(item.title)}</strong><span>${esc(item.text)}</span></div></div>`).join('')
      : '<p class="muted">Die erste Auszeichnung wartet schon.</p>';
  }

  function recentGamesHtml(stats) {
    return stats.recentGames?.length
      ? stats.recentGames.map(game => `<tr><td>${new Date(game.finishedAt).toLocaleDateString('de-DE')}</td><td>${game.quizType === 'child' ? 'Kinder' : 'Erwachsene'}</td><td>${game.questions}</td><td>${game.score}</td><td>${game.accuracy}%</td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">Noch keine Spielrunden gespeichert.</td></tr>';
  }

  function weakQuestionsHtml(stats) {
    if (!stats.weakQuestions?.length) return '<p class="muted">Aktuell gibt es keine falsch oder nicht beantworteten Fragen zum Wiederholen.</p>';
    return stats.weakQuestions.slice(0, 8).map(question => `<div class="phase2-weak-row"><span>${question.timedOut ? '0' : '×'}</span><div><strong>${esc(question.text)}</strong><small>${esc(question.category)} · ${question.quizType === 'child' ? 'Kinderquiz' : 'Erwachsenenquiz'}</small></div><small>${new Date(question.lastAnsweredAt).toLocaleDateString('de-DE')}</small></div>`).join('');
  }

  function leaderboardHtml(entries, currentProfileId) {
    if (!entries?.length) return '<p class="muted">Die Bestenliste füllt sich nach den ersten gespeicherten Quizrunden.</p>';
    return entries.map(entry => `<div class="phase2-leader-row ${entry.id === currentProfileId ? 'current' : ''}">
      <span class="phase2-rank">${entry.rank}</span>
      <span class="phase2-mini-avatar">${avatarSvg(entry.avatarId)}</span>
      <div class="phase2-leader-name"><strong>${esc(entry.name)}</strong><span>${esc(entry.title)} · Level ${entry.level}</span></div>
      <div class="phase2-leader-stat"><strong>${Number(entry.xp).toLocaleString('de-DE')}</strong><span>XP</span></div>
      <div class="phase2-leader-stat"><strong>${entry.accuracy}%</strong><span>Treffer</span></div>
      <div class="phase2-leader-stat"><strong>${entry.games}</strong><span>Spiele</span></div>
    </div>`).join('');
  }

  function avatarPickerHtml(activeId) {
    return availableAvatars.map(id => `<button class="phase2-avatar-choice ${id === activeId ? 'active' : ''}" type="button" data-avatar-id="${id}" aria-label="Avatar ${id} auswählen">${avatarSvg(id)}</button>`).join('');
  }

  function dashboardHtml(stats, leaderboardData) {
    const task = stats.dailyTask || { progress: 0, target: 10, completed: false, correctToday: 0 };
    const taskProgress = Math.min(100, Math.round(task.progress / Math.max(1, task.target) * 100));
    const adultWrong = Number(stats.weakQuestionCounts?.adult || 0);
    const childWrong = Number(stats.weakQuestionCounts?.child || 0);
    return `<div class="phase2-modal-header">
      <div><h2>Profil & Fortschritt</h2><p>XP, Level, Lernfortschritt und persönliche Bestwerte</p></div>
      <button id="closeProfileStats" class="btn ghost small" type="button">Schließen</button>
    </div>
    <div class="phase2-modal-content">
      <section id="phase2ProfileSection" class="phase2-profile-hero phase2-section">
        <div class="phase2-avatar">${avatarSvg(stats.profile.avatarId)}</div>
        <div><span class="eyebrow">${esc(stats.title)}</span><h3>${esc(stats.profile.name)}</h3><p>${stats.games} Quizrunden · ${stats.correct} richtige Antworten · ${stats.currentStreak} Tage aktuelle Serie</p></div>
        <div class="phase2-level-panel"><strong>Level ${stats.level}</strong><span>${Number(stats.xp).toLocaleString('de-DE')} XP gesamt</span><div class="phase2-xp-track"><span style="--phase2-progress:${stats.progressPercent}%"></span></div><div class="phase2-xp-meta"><span>${stats.xpIntoLevel}/${stats.levelSize}</span><span>Noch ${stats.xpForNextLevel} XP</span></div></div>
      </section>

      <div class="phase2-dashboard-grid">
        <section class="phase2-dashboard-card">
          <div class="phase2-daily-head"><div><strong>Tägliche Aufgabe</strong><span>${esc(task.label)} · heute ${task.correctToday} richtig</span></div><div class="phase2-daily-value">${task.progress}/${task.target}</div></div>
          <div class="phase2-daily-track"><span style="--phase2-progress:${taskProgress}%"></span></div>
        </section>
        <section class="phase2-dashboard-card"><h3>Avatar auswählen</h3><div id="phase2AvatarPicker" class="phase2-avatar-picker">${avatarPickerHtml(stats.profile.avatarId)}</div></section>
      </div>

      <section class="profile-stat-grid phase2-section">
        <div class="profile-stat"><strong>${stats.games}</strong><span>Quizrunden</span></div>
        <div class="profile-stat"><strong>${stats.correct}</strong><span>Richtig</span></div>
        <div class="profile-stat"><strong>${stats.accuracy}%</strong><span>Trefferquote</span></div>
        <div class="profile-stat"><strong>${stats.bestScore}</strong><span>Bester Score</span></div>
        <div class="profile-stat"><strong>${stats.bestStreak}</strong><span>Beste Serie</span></div>
      </section>

      <section class="phase2-section"><div class="phase2-section-heading"><div><h3>Abzeichen</h3><p>Freigeschaltet durch Wissen, Ausdauer und gute Trefferquoten</p></div><span class="info-chip">${stats.achievements?.length || 0} erreicht</span></div><div class="phase2-badge-grid">${achievementsHtml(stats)}</div></section>

      <section id="phase2CategoriesSection" class="phase2-section"><div class="phase2-section-heading"><div><h3>Kategorien</h3><p>Deine Trefferquote nach Wissensgebiet</p></div></div><div class="profile-category-list">${categoriesHtml(stats)}</div></section>

      <section class="phase2-section"><div class="phase2-section-heading"><div><h3>Falsche Fragen üben</h3><p>Zuletzt falsch oder nicht beantwortete Fragen werden gezielt wiederholt</p></div></div><div class="phase2-dashboard-grid"><div class="phase2-dashboard-card"><div class="phase2-weak-list">${weakQuestionsHtml(stats)}</div></div><div class="phase2-dashboard-card"><h3>Training starten</h3><p class="muted">Das Training läuft entspannt ohne Minuspunkte. Korrekt beantwortete Fragen verschwinden automatisch aus der Wiederholungsliste.</p><button class="btn primary wide-button" type="button" data-wrong-practice="child" ${childWrong ? '' : 'disabled'}>Kinderfragen üben (${childWrong})</button><button class="btn secondary wide-button" style="margin-top:9px" type="button" data-wrong-practice="adult" ${adultWrong ? '' : 'disabled'}>Erwachsenenfragen üben (${adultWrong})</button></div></div></section>

      <section id="phase2LeaderboardSection" class="phase2-section"><div class="phase2-section-heading"><div><h3>Bestenliste</h3><p>Rangfolge nach dauerhaft erspielten XP</p></div><span class="info-chip">Top 50</span></div><div class="phase2-leaderboard">${leaderboardHtml(leaderboardData.leaderboard, leaderboardData.currentProfileId)}</div></section>

      <section class="phase2-section"><div class="phase2-section-heading"><div><h3>Letzte Runden</h3><p>Deine zuletzt gespeicherten Solo-Spiele</p></div></div><div class="table-wrap"><table class="data"><thead><tr><th>Datum</th><th>Quiz</th><th>Fragen</th><th>Punkte</th><th>Quote</th></tr></thead><tbody>${recentGamesHtml(stats)}</tbody></table></div></section>
    </div>`;
  }

  function publicLeaderboardHtml(leaderboardData) {
    return `<div class="phase2-modal-header"><div><h2>Bestenliste</h2><p>Die erfolgreichsten Ahnsen-Quiz-Profile nach XP</p></div><button id="closeProfileStats" class="btn ghost small" type="button">Schließen</button></div><div class="phase2-modal-content"><section id="phase2LeaderboardSection" class="phase2-section"><div class="phase2-leaderboard">${leaderboardHtml(leaderboardData.leaderboard, leaderboardData.currentProfileId)}</div></section><p class="muted">Öffne ein Profil, um eigene Statistiken, Level, Abzeichen und Lernfortschritt zu sehen.</p></div>`;
  }

  function bindDashboardActions() {
    document.querySelector('#closeProfileStats')?.addEventListener('click', closeDashboard);
    document.querySelectorAll('[data-avatar-id]').forEach(button => button.addEventListener('click', () => updateAvatar(button.dataset.avatarId)));
    document.querySelectorAll('[data-wrong-practice]').forEach(button => button.addEventListener('click', () => {
      closeDashboard();
      if (typeof window.startWrongAnswerPractice === 'function') window.startWrongAnswerPractice(button.dataset.wrongPractice);
      else setMessage('Das Fehlertraining konnte noch nicht gestartet werden.', true);
    }));
  }

  async function updateAvatar(avatarId) {
    try {
      const data = await api('/api/solo/profiles/me/avatar', { method: 'PATCH', body: JSON.stringify({ avatarId }) });
      currentProfile = { ...currentProfile, ...data.profile };
      if (currentStats?.profile) currentStats.profile = { ...currentStats.profile, ...data.profile };
      renderCurrent();
      document.querySelectorAll('[data-avatar-id]').forEach(button => button.classList.toggle('active', button.dataset.avatarId === avatarId));
      const heroAvatar = document.querySelector('#phase2ProfileSection .phase2-avatar');
      if (heroAvatar) heroAvatar.innerHTML = avatarSvg(avatarId);
      setMessage('Avatar wurde gespeichert.');
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function openDashboard(focus = 'profile') {
    const modal = document.querySelector('#profileStatsModal');
    const content = document.querySelector('#profileStatsContent');
    if (!modal || !content) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    content.innerHTML = '<div class="phase2-modal-content"><p class="muted">Fortschritt wird geladen …</p></div>';
    try {
      const leaderboardData = await api('/api/solo/leaderboard');
      if (!currentProfile) {
        content.innerHTML = publicLeaderboardHtml(leaderboardData);
        bindDashboardActions();
        if (focus !== 'leaderboard') {
          closeDashboard();
          document.querySelector('#soloProfilePanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setMessage('Bitte zuerst ein Profil öffnen, um deinen persönlichen Fortschritt zu sehen.', true);
        }
        return;
      }
      currentStats = await api('/api/solo/profiles/stats');
      currentProfile = { ...currentProfile, ...currentStats.profile };
      renderCurrent();
      content.innerHTML = dashboardHtml(currentStats, leaderboardData);
      bindDashboardActions();
      const target = focus === 'categories' ? '#phase2CategoriesSection' : focus === 'leaderboard' ? '#phase2LeaderboardSection' : '#phase2ProfileSection';
      requestAnimationFrame(() => content.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (error) {
      content.innerHTML = `<div class="phase2-modal-header"><div><h2>Profil</h2><p>Die Daten konnten nicht geladen werden.</p></div><button id="closeProfileStats" class="btn ghost small" type="button">Schließen</button></div><div class="phase2-modal-content"><p class="bad-text">${esc(error.message)}</p></div>`;
      bindDashboardActions();
    }
  }

  window.openSoloProfileDashboard = openDashboard;
  installUi();
  refresh();
})();
