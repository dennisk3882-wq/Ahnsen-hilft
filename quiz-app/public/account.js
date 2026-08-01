'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  let account = null;

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Die Anfrage konnte nicht ausgeführt werden.'), { status: response.status, data });
    return data;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function date(value) {
    return value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  }

  function message(selector, text, bad = false) {
    const node = $(selector);
    if (!node) return;
    node.textContent = text || '';
    node.className = `message ${bad ? 'bad-text' : ''}`;
  }

  function setBusy(form, busy) {
    form.querySelectorAll('button,input,select').forEach(node => { node.disabled = busy; });
  }

  function renderAccount(data) {
    account = data.account;
    $('#accountTitle').textContent = `${account.name}s Konto`;
    $('#accountName').value = account.name;
    $('#deleteConfirmation').placeholder = `„${account.name}“ exakt eingeben`;
    $('#accountEmail').value = account.pendingEmail || account.email || '';
    $('#myPublicProfileLink').href = `/profile/${encodeURIComponent(account.id)}`;
    $('#myPublicProfileLink').classList.remove('hidden');

    const statusCard = document.querySelector('.account-security-card');
    statusCard.classList.remove('warning', 'danger');
    if (account.status === 'banned') statusCard.classList.add('danger');
    else if (account.status === 'suspended' || !account.emailVerified) statusCard.classList.add('warning');
    $('#accountStatusLabel').textContent = account.status === 'active' ? 'Konto aktiv' : account.status === 'suspended' ? 'Vorübergehend gesperrt' : 'Konto gesperrt';

    const badge = $('#emailBadge');
    const emailDescription = $('#emailDescription');
    const resend = $('#resendEmail');
    if (account.emailVerified) {
      badge.textContent = 'Bestätigt';
      badge.className = 'info-chip account-badge-ok';
      $('#accountEmailSummary').textContent = account.email;
      emailDescription.textContent = `${account.email} wurde am ${date(account.emailVerifiedAt)} bestätigt.`;
      resend.classList.add('hidden');
    } else if (account.pendingEmail) {
      badge.textContent = 'Bestätigung offen';
      badge.className = 'info-chip account-badge-warn';
      $('#accountEmailSummary').textContent = `Bestätigung für ${account.pendingEmail} offen`;
      emailDescription.textContent = `Öffne den Link, der an ${account.pendingEmail} gesendet wurde.`;
      resend.classList.remove('hidden');
    } else {
      badge.textContent = 'Nicht hinterlegt';
      badge.className = 'info-chip account-badge-warn';
      $('#accountEmailSummary').textContent = 'Keine bestätigte E-Mail';
      emailDescription.textContent = 'Hinterlege eine Adresse, damit du dein Passwort selbst zurücksetzen kannst.';
      resend.classList.add('hidden');
    }

    const prefs = account.preferences || {};
    $('#leaderboardVisible').checked = prefs.leaderboardVisible !== false;
    $('#profileVisibility').value = prefs.profileVisibility || (prefs.publicProfile === false ? 'private' : 'public');
    $('#allowFriendRequests').checked = prefs.allowFriendRequests !== false;
    $('#invitePolicy').value = prefs.invitePolicy || 'friends';
    $('#emailNotifications').checked = prefs.emailNotifications !== false;
    $('#pushNotifications').checked = prefs.pushNotifications !== false;

    if (!data.emailService?.configured) {
      message('#emailMessage', 'Der E-Mail-Dienst ist auf dem Server noch nicht konfiguriert. Die Adresse kann gespeichert werden, aber der Bestätigungslink wird erst nach Einrichtung von Brevo oder Resend versendet.', true);
    }
  }

  async function loadAccount() {
    try {
      const data = await api('/api/account/me');
      $('#accountLoading').classList.add('hidden');
      $('#accountLoginRequired').classList.add('hidden');
      $('#accountApp').classList.remove('hidden');
      renderAccount(data);
      await Promise.all([loadBlocks(), loadTournaments()]);
    } catch (error) {
      $('#accountLoading').classList.add('hidden');
      if (error.status === 401) $('#accountLoginRequired').classList.remove('hidden');
      else {
        $('#accountLoginRequired').classList.remove('hidden');
        $('#accountLoginRequired').innerHTML = `<h1>Kontocenter nicht verfügbar</h1><p class="bad-text">${esc(error.message)}</p><a class="btn ghost" href="/">Zur Startseite</a>`;
      }
    }
  }

  async function loadBlocks() {
    const target = $('#accountBlockList');
    try {
      const data = await api('/api/platform/blocks');
      target.innerHTML = data.blocks?.length ? data.blocks.map(profile => `<article class="account-list-row"><div><strong>${esc(profile.name)}</strong><small>Blockiert seit ${date(profile.created_at)}</small></div><button class="btn ghost small" data-unblock="${profile.id}" type="button">Freigeben</button></article>`).join('') : '<div class="account-empty">Keine blockierten Profile.</div>';
      target.querySelectorAll('[data-unblock]').forEach(button => button.addEventListener('click', async () => {
        button.disabled = true;
        try { await api(`/api/platform/blocks/${button.dataset.unblock}`, { method: 'DELETE' }); await loadBlocks(); }
        catch (error) { alert(error.message); button.disabled = false; }
      }));
    } catch (error) {
      target.innerHTML = `<div class="account-empty bad-text">${esc(error.message)}</div>`;
    }
  }

  async function loadTournaments() {
    const target = $('#accountTournamentList');
    try {
      const data = await api('/api/platform/tournaments');
      const own = (data.tournaments || []).filter(item => item.joined || item.owner_id === account?.id).slice(0, 8);
      target.innerHTML = own.length ? own.map(item => `<article class="account-list-row"><div><strong>${esc(item.name)}</strong><small>${esc(item.code)} · ${item.player_count} Teilnehmer · ${esc(item.status)}</small></div><a class="btn ghost small" href="/community?tab=tournaments">Öffnen</a></article>`).join('') : '<div class="account-empty">Du nimmst noch an keinem Turnier teil.</div>';
    } catch (error) {
      target.innerHTML = `<div class="account-empty bad-text">${esc(error.message)}</div>`;
    }
  }

  $('#nameForm').addEventListener('submit', async event => {
    event.preventDefault(); setBusy(event.currentTarget, true); message('#nameMessage', 'Profilname wird gespeichert …');
    try {
      const data = await api('/api/account/name', { method: 'PATCH', body: JSON.stringify({ name: $('#accountName').value, password: $('#namePassword').value }) });
      $('#namePassword').value = ''; account.name = data.profile.name; $('#accountTitle').textContent = `${account.name}s Konto`; message('#nameMessage', 'Profilname wurde geändert.');
    } catch (error) { message('#nameMessage', error.message, true); }
    finally { setBusy(event.currentTarget, false); }
  });

  $('#emailForm').addEventListener('submit', async event => {
    event.preventDefault(); setBusy(event.currentTarget, true); message('#emailMessage', 'Bestätigungslink wird vorbereitet …');
    try {
      const data = await api('/api/account/email', { method: 'POST', body: JSON.stringify({ email: $('#accountEmail').value, password: $('#emailPassword').value }) });
      $('#emailPassword').value = '';
      message('#emailMessage', data.emailSent ? 'Bestätigungslink wurde versendet.' : 'Adresse wurde gespeichert. Der E-Mail-Dienst muss noch im Server konfiguriert werden.', !data.emailSent);
      await loadAccount();
    } catch (error) { message('#emailMessage', error.message, true); }
    finally { setBusy(event.currentTarget, false); }
  });

  $('#resendEmail').addEventListener('click', async () => {
    $('#resendEmail').disabled = true; message('#emailMessage', 'Link wird erneut angefordert …');
    try { const data = await api('/api/account/email/resend', { method: 'POST', body: '{}' }); message('#emailMessage', data.emailSent ? 'Bestätigungslink wurde erneut versendet.' : 'E-Mail-Dienst ist noch nicht konfiguriert.', !data.emailSent); }
    catch (error) { message('#emailMessage', error.message, true); }
    finally { $('#resendEmail').disabled = false; }
  });

  $('#passwordForm').addEventListener('submit', async event => {
    event.preventDefault(); setBusy(event.currentTarget, true); message('#passwordMessage', 'Passwort wird sicher geändert …');
    try {
      await api('/api/account/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: $('#currentPassword').value, newPassword: $('#newPassword').value, confirmation: $('#passwordConfirmation').value }) });
      event.currentTarget.reset(); message('#passwordMessage', 'Passwort wurde geändert. Andere Geräte wurden abgemeldet.');
    } catch (error) { message('#passwordMessage', error.message, true); }
    finally { setBusy(event.currentTarget, false); }
  });

  $('#preferencesForm').addEventListener('submit', async event => {
    event.preventDefault(); setBusy(event.currentTarget, true); message('#preferencesMessage', 'Einstellungen werden gespeichert …');
    try {
      const profileVisibility = $('#profileVisibility').value;
      await api('/api/account/preferences', { method: 'PATCH', body: JSON.stringify({
        leaderboardVisible: $('#leaderboardVisible').checked,
        profileVisibility,
        publicProfile: profileVisibility !== 'private',
        allowFriendRequests: $('#allowFriendRequests').checked,
        invitePolicy: $('#invitePolicy').value,
        emailNotifications: $('#emailNotifications').checked,
        pushNotifications: $('#pushNotifications').checked,
      }) });
      message('#preferencesMessage', 'Einstellungen wurden gespeichert.');
    } catch (error) { message('#preferencesMessage', error.message, true); }
    finally { setBusy(event.currentTarget, false); }
  });

  $('#sessionsForm').addEventListener('submit', async event => {
    event.preventDefault(); setBusy(event.currentTarget, true); message('#sessionsMessage', 'Andere Sitzungen werden beendet …');
    try { await api('/api/account/sessions/revoke', { method: 'POST', body: JSON.stringify({ password: $('#sessionsPassword').value }) }); event.currentTarget.reset(); message('#sessionsMessage', 'Alle anderen Geräte wurden abgemeldet.'); }
    catch (error) { message('#sessionsMessage', error.message, true); }
    finally { setBusy(event.currentTarget, false); }
  });

  $('#deleteForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!confirm('Dieses Profil und alle zugehörigen Daten wirklich unwiderruflich löschen?')) return;
    setBusy(event.currentTarget, true); message('#deleteMessage', 'Profil wird gelöscht …');
    try {
      await api('/api/account', { method: 'DELETE', body: JSON.stringify({ confirmation: $('#deleteConfirmation').value, password: $('#deletePassword').value }) });
      localStorage.removeItem('ahnsen_solo_session'); localStorage.removeItem('ahnsen_online_credentials_v1'); location.href = '/';
    } catch (error) { message('#deleteMessage', error.message, true); setBusy(event.currentTarget, false); }
  });

  $('#refreshBlocks').addEventListener('click', loadBlocks);
  loadAccount();
})();