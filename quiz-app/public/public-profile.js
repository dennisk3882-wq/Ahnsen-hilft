'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const profileId = location.pathname.split('/').filter(Boolean).pop();
  const avatarIcons = { robot: '🤖', fox: '🦊', owl: '🦉', rocket: '🚀', crown: '👑', crystal: '💎' };
  const leagueIcons = { bronze: '🥉', silver: '🥈', gold: '🥇', master: '👑' };
  const visibilityLabels = { public: 'Für alle sichtbar', friends: 'Nur für Freunde sichtbar', private: 'Privates Profil' };
  const state = { data: null, settings: null };

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

  function badgeName(value) {
    return String(value || '').replace(/[-_]+/g, ' ').replace(/\b\w/gu, letter => letter.toUpperCase());
  }

  function resultLabel(value) {
    return ({ win: 'Sieg', loss: 'Niederlage', draw: 'Unentschieden', completed: 'Beendet' })[value] || value || 'Beendet';
  }

  function sourceLabel(value) {
    return ({ solo: 'Solo', online: 'Online', duel: 'Freundesduell', tournament: 'Turnier', event: 'Event', live: 'Live', offline: 'Offline' })[value] || value || 'Quiz';
  }

  function renderStats(data) {
    const stats = data.stats || {};
    const items = [
      ['Spiele', stats.games], ['Siege', stats.wins], ['Genauigkeit', `${stats.accuracy || 0} %`],
      ['Richtige Antworten', stats.correct], ['Punkte', stats.points], ['Beste Serie', data.progression?.bestStreak],
    ];
    $('#profileStats').innerHTML = items.map(([label, value]) => `<article class="profile-stat"><strong>${esc(number(value).replace(' %', '%'))}</strong><span>${esc(label)}</span></article>`).join('');
  }

  function renderBadges(data) {
    const featured = data.badges?.featured || [];
    const all = data.badges?.all || [];
    $('#featuredBadges').innerHTML = featured.length
      ? featured.map((badge, index) => `<article class="featured-badge"><span>${['🏅','🌟','🏆'][index % 3]}</span><strong>${esc(badgeName(badge))}</strong></article>`).join('')
      : '<div class="profile-empty">Noch keine hervorgehobenen Abzeichen.</div>';
    $('#allBadges').innerHTML = all.length ? all.map(badge => `<span class="badge-chip">${esc(badgeName(badge))}</span>`).join('') : '';
  }

  function renderCategories(data) {
    const values = data.favoriteCategories || [];
    $('#categoryPanel').classList.toggle('hidden', !data.privacy?.showFavoriteCategories);
    $('#favoriteCategories').innerHTML = values.length ? values.map(item => `<article class="category-profile-row"><strong>${esc(item.category)}</strong><div class="category-track"><span style="width:${Math.max(2, Math.min(100, Number(item.accuracy || 0)))}%"></span></div><small>${number(item.answers)} Antworten · ${number(item.accuracy)} %</small></article>`).join('') : '<div class="profile-empty">Noch nicht genügend Antworten für ein Wissensprofil.</div>';
  }

  function renderMatches(data) {
    const rows = data.recentMatches || [];
    $('#recentMatchesPanel').classList.toggle('hidden', !data.privacy?.showRecentMatches);
    $('#recentMatches').innerHTML = rows.length ? rows.map(item => {
      const title = item.source_type === 'solo' ? `${item.category || 'Gemischt'} · Solo` : item.opponent_name ? `gegen ${item.opponent_name}` : item.metadata?.title || sourceLabel(item.source_type);
      return `<article class="profile-match"><div><strong>${esc(title)}</strong><small>${esc(sourceLabel(item.source_type))} · ${esc(dateTime(item.played_at))}</small></div><div><strong class="result-${esc(item.result)}">${esc(resultLabel(item.result))}</strong><small>${number(item.score)} Punkte · ${number(item.correct)} richtig</small></div></article>`;
    }).join('') : '<div class="profile-empty">Noch keine sichtbaren Ergebnisse.</div>';
  }

  function renderSide(data) {
    const duels = data.duelStats || {};
    $('#duelStats').innerHTML = [
      ['Serien', duels.completed], ['Gewonnen', duels.won], ['Aktiv', duels.active],
    ].map(([label, value]) => `<article class="duel-profile-stat"><strong>${number(value)}</strong><small>${esc(label)}</small></article>`).join('');

    const archive = data.seasonArchive || [];
    $('#seasonArchive').innerHTML = archive.length ? archive.map(item => `<article class="profile-season"><div><strong>${esc(item.name)}</strong><small>${esc(item.league_id)} · Rang ${number(item.rank)} · ${esc(item.outcome)}</small></div><strong>${number(item.points)} P</strong></article>`).join('') : '<div class="profile-empty">Noch keine abgeschlossene Saison.</div>';

    const successes = [
      ...(data.tournamentWins || []).map(item => ({ title: `Turniersieg · ${item.name}`, detail: date(item.completed_at), icon: '🏆' })),
      ...(data.eventSuccesses || []).map(item => ({ title: item.title, detail: `${number(item.best_score)} Punkte · ${date(item.completed_at)}`, icon: '⭐' })),
    ].slice(0, 12);
    $('#competitionSuccesses').innerHTML = successes.length ? successes.map(item => `<article class="profile-success"><div><strong>${item.icon} ${esc(item.title)}</strong><small>${esc(item.detail)}</small></div></article>`).join('') : '<div class="profile-empty">Noch keine abgeschlossenen offiziellen Wettbewerbe.</div>';
  }

  function renderEditor(data) {
    const editor = $('#profileEditor');
    if (!data.viewer?.isSelf) { editor.classList.add('hidden'); return; }
    editor.classList.remove('hidden');
    const settings = state.settings || {
      profileVisibility: data.profile.visibility,
      bio: data.profile.bio,
      featuredBadges: data.badges?.featured || [],
      showRecentMatches: data.privacy?.showRecentMatches !== false,
      showFavoriteCategories: data.privacy?.showFavoriteCategories !== false,
    };
    $('#profileBioInput').value = settings.bio || '';
    $('#bioCounter').textContent = $('#profileBioInput').value.length;
    $('#profileVisibilityInput').value = settings.profileVisibility || 'public';
    $('#showRecentMatches').checked = settings.showRecentMatches !== false;
    $('#showFavoriteCategories').checked = settings.showFavoriteCategories !== false;
    const selected = new Set(settings.featuredBadges || []);
    const badges = data.badges?.all || [];
    $('#badgeSelection').innerHTML = badges.length ? badges.map(id => `<label class="badge-choice"><input type="checkbox" value="${esc(id)}" ${selected.has(id) ? 'checked' : ''}><span>${esc(badgeName(id))}</span></label>`).join('') : '<span class="muted">Noch keine Abzeichen verfügbar.</span>';
    $('#badgeSelection').querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
      const checked = [...$('#badgeSelection').querySelectorAll('input:checked')];
      if (checked.length > 3) { input.checked = false; alert('Du kannst höchstens drei Abzeichen hervorheben.'); }
    }));
  }

  function render(data) {
    state.data = data;
    document.title = `${data.profile.name} – QuizTime`;
    $('#profileAvatar').textContent = avatarIcons[data.profile.avatarId] || '🤖';
    $('#profileName').textContent = data.profile.name;
    $('#profileBio').textContent = data.profile.bio || 'Noch keine Profilbeschreibung.';
    $('#profileVisibility').textContent = visibilityLabels[data.profile.visibility] || 'Spielerprofil';
    $('#profileMemberSince').textContent = `Dabei seit ${date(data.profile.memberSince)}`;
    $('#profileLevel').textContent = `Level ${number(data.progression?.level || 1)}`;
    $('#profileLeague').textContent = data.league?.league?.name || 'Noch ohne Saisonwertung';
    const leagueId = data.league?.league?.id || 'bronze';
    $('#profileLeagueIcon').textContent = leagueIcons[leagueId] || '🥉';
    $('#profileLeagueName').textContent = data.league?.league?.name || 'Bronze-Liga';
    $('#profileLeaguePoints').textContent = `${number(data.league?.points || 0)} Saisonpunkte`;
    const actions = [];
    if (data.viewer?.isSelf) actions.push('<a class="btn primary small" href="/account">Kontocenter öffnen</a>');
    if (data.viewer?.canChallenge) actions.push('<a class="btn primary small" href="/arena?tab=duels">Zum Duell herausfordern</a>');
    actions.push('<a class="btn ghost small" href="/competitions">Saison & Wettbewerbe</a>');
    $('#profileActions').innerHTML = actions.join('');
    renderStats(data); renderBadges(data); renderCategories(data); renderMatches(data); renderSide(data); renderEditor(data);
  }

  async function load() {
    if (!/^[0-9a-f-]{36}$/iu.test(profileId || '')) throw new Error('Die Profiladresse ist ungültig.');
    const data = await api(`/api/platform/public/profiles/${encodeURIComponent(profileId)}`);
    if (data.viewer?.isSelf) {
      const settings = await api('/api/platform/public-profile/me/settings').catch(() => null);
      state.settings = settings?.settings || null;
    }
    render(data);
    $('#profileLoading').classList.add('hidden');
    $('#profileError').classList.add('hidden');
    $('#profileApp').classList.remove('hidden');
  }

  $('#profileBioInput')?.addEventListener('input', event => { $('#bioCounter').textContent = event.currentTarget.value.length; });
  $('#profileSettingsForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    $('#profileSettingsMessage').textContent = 'Profil wird gespeichert …';
    try {
      const featuredBadges = [...$('#badgeSelection').querySelectorAll('input:checked')].map(input => input.value).slice(0, 3);
      const response = await api('/api/platform/public-profile/me/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          bio: $('#profileBioInput').value,
          profileVisibility: $('#profileVisibilityInput').value,
          showRecentMatches: $('#showRecentMatches').checked,
          showFavoriteCategories: $('#showFavoriteCategories').checked,
          featuredBadges,
        }),
      });
      state.settings = response.settings;
      $('#profileSettingsMessage').textContent = 'Dein öffentliches Profil wurde gespeichert.';
      await load();
    } catch (error) {
      $('#profileSettingsMessage').textContent = error.message;
      $('#profileSettingsMessage').className = 'message bad-text';
    } finally { button.disabled = false; }
  });

  load().catch(error => {
    $('#profileLoading').classList.add('hidden');
    $('#profileApp').classList.add('hidden');
    $('#profileErrorText').textContent = error.message;
    $('#profileError').classList.remove('hidden');
  });
})();
