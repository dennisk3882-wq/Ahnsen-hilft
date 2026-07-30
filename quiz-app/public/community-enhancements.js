'use strict';

(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const date = value => value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '–';
  let busy = false;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
    return data;
  }

  function credentials() {
    try { return JSON.parse(localStorage.getItem('ahnsen_online_credentials_v1') || 'null'); } catch { return null; }
  }

  function enhanceRows() {
    document.querySelectorAll('#friendList [data-invite]').forEach(invite => {
      const id = invite.dataset.invite;
      const actions = invite.parentElement;
      if (!actions || actions.querySelector(`[data-friend-profile="${CSS.escape(id)}"]`)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn secondary small';
      button.dataset.friendProfile = id;
      button.textContent = 'Profil';
      actions.prepend(button);
    });
  }

  async function showProfile(id) {
    const data = await api(`/api/platform/friends/${encodeURIComponent(id)}/insights`);
    const modal = document.createElement('div');
    modal.className = 'app-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const p = data.profile;
    const d = data.duelStats || {};
    modal.innerHTML = `<section class="app-modal-card" style="width:min(680px,100%)"><div class="panel-heading"><div><span class="app-kicker">Freundesprofil</span><h2>${esc(p.name)}</h2></div><button class="btn ghost small" data-close-friend-profile type="button">Schließen</button></div><div class="app-profile-preview"><div class="app-avatar">${data.online.online ? '🟢' : '👤'}</div><div><h3>${esc(p.name)}</h3><p>${data.online.online ? `Online${data.online.roomTitle ? ` · ${esc(data.online.roomTitle)}` : ''}` : `Zuletzt gesehen: ${date(data.online.lastSeenAt || p.lastLoginAt)}`}</p><div class="app-xp-bar"><span style="width:${Math.min(100, Number(p.xp || 0) % 500 / 5)}%"></span></div></div><span class="app-badge">Level ${p.level}</span></div><div class="admin-metric-grid" style="margin:18px 0"><article class="admin-metric"><strong>${p.games}</strong><span>Spiele</span><small>${p.accuracy}% Genauigkeit</small></article><article class="admin-metric"><strong>${d.my_wins || 0}:${d.friend_wins || 0}</strong><span>Duellserien</span><small>${d.series || 0} abgeschlossen</small></article><article class="admin-metric"><strong>${p.achievements}</strong><span>Abzeichen</span><small>seit ${date(p.memberSince)}</small></article></div><h3>Letzte gemeinsame Spiele</h3><div class="admin-list">${data.recentSharedMatches?.length ? data.recentSharedMatches.map(item => `<article class="admin-item"><strong>${esc(item.source_type)} · ${esc(item.result)}</strong><small>${item.score}:${item.opponent_score} Punkte · ${date(item.played_at)}</small></article>`).join('') : '<div class="community-empty">Noch keine gemeinsamen Spiele.</div>'}</div><div class="arena-actions" style="margin-top:18px"><button class="btn primary" data-direct-friend-invite="${esc(id)}" type="button">In aktuellen Raum einladen</button><button class="btn ghost" data-toggle-friend-mute="${esc(id)}" data-muted="${data.preferences.muted}" type="button">${data.preferences.muted ? 'Stummschaltung aufheben' : 'Stummschalten'}</button><button class="btn ghost" data-toggle-friend-notifications="${esc(id)}" data-enabled="${data.preferences.notificationsEnabled}" type="button">${data.preferences.notificationsEnabled ? 'Benachrichtigungen aus' : 'Benachrichtigungen an'}</button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close-friend-profile]').onclick = () => modal.remove();
    modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
  }

  async function directInvite(id) {
    const room = credentials();
    if (!room?.code) throw new Error('Öffne oder erstelle zuerst einen Online-Raum. Danach kann die Einladung ohne manuelle Codeeingabe versendet werden.');
    await api('/api/platform/invites', {
      method: 'POST',
      body: JSON.stringify({ recipientId: id, type: 'room', roomCode: room.code, message: `Komm direkt in meinen QuizTime-Raum ${room.code}!` }),
    });
    alert(`Einladung für Raum ${room.code} wurde versendet.`);
  }

  function siblingPreferenceButton(button, selector) {
    return button.closest('.app-modal-card')?.querySelector(selector) || null;
  }

  document.addEventListener('click', async event => {
    const profile = event.target.closest('[data-friend-profile]');
    const direct = event.target.closest('[data-direct-friend-invite]');
    const mute = event.target.closest('[data-toggle-friend-mute]');
    const notifications = event.target.closest('[data-toggle-friend-notifications]');
    if (!profile && !direct && !mute && !notifications) return;
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    busy = true;
    try {
      if (profile) await showProfile(profile.dataset.friendProfile);
      if (direct) await directInvite(direct.dataset.directFriendInvite);
      if (mute) {
        const next = mute.dataset.muted !== 'true';
        const notificationButton = siblingPreferenceButton(mute, '[data-toggle-friend-notifications]');
        const notificationsEnabled = notificationButton?.dataset.enabled !== 'false';
        await api(`/api/platform/friends/${mute.dataset.toggleFriendMute}/preferences`, { method: 'PATCH', body: JSON.stringify({ muted: next, notificationsEnabled }) });
        mute.dataset.muted = String(next);
        mute.textContent = next ? 'Stummschaltung aufheben' : 'Stummschalten';
      }
      if (notifications) {
        const next = notifications.dataset.enabled !== 'true';
        const muteButton = siblingPreferenceButton(notifications, '[data-toggle-friend-mute]');
        const muted = muteButton?.dataset.muted === 'true';
        await api(`/api/platform/friends/${notifications.dataset.toggleFriendNotifications}/preferences`, { method: 'PATCH', body: JSON.stringify({ muted, notificationsEnabled: next }) });
        notifications.dataset.enabled = String(next);
        notifications.textContent = next ? 'Benachrichtigungen aus' : 'Benachrichtigungen an';
      }
    } catch (error) { alert(error.message); }
    finally { busy = false; }
  }, true);

  new MutationObserver(enhanceRows).observe(document.documentElement, { childList: true, subtree: true });
  enhanceRows();
})();
