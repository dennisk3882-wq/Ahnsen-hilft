'use strict';

(() => {
  const GAME_KEY = 'ahnsen_offline_game_v1';
  let installedFor = '';

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
    return data;
  }

  function game() {
    try { return JSON.parse(localStorage.getItem(GAME_KEY) || 'null'); } catch { return null; }
  }

  async function install() {
    const current = game();
    const target = document.querySelector('.offline-result-actions');
    if (!target || current?.phase !== 'finished' || installedFor === current.id) return;
    installedFor = current.id;
    let profile;
    let account;
    try {
      [profile, account] = await Promise.all([api('/api/platform/me'), api('/api/account/me')]);
    } catch { return; }
    if (!profile.profile || !account.account?.emailVerified) return;

    const box = document.createElement('div');
    box.className = 'offline-profile-save';
    box.innerHTML = `<label>Welcher Teilnehmer bist du?<select id="offlineProfileParticipant">${current.participants.map(participant => `<option value="${participant.id}" ${participant.name === profile.profile.name ? 'selected' : ''}>${participant.name}</option>`).join('')}</select></label><button id="saveOfflineProfileResult" class="btn secondary" type="button">Im Profil speichern</button><span id="offlineProfileSaveMessage" class="message" aria-live="polite"></span>`;
    target.before(box);
    box.querySelector('#saveOfflineProfileResult').onclick = async () => {
      const button = box.querySelector('#saveOfflineProfileResult');
      const message = box.querySelector('#offlineProfileSaveMessage');
      const participant = current.participants.find(item => item.id === box.querySelector('#offlineProfileParticipant').value);
      if (!participant) return;
      button.disabled = true;
      try {
        const data = await api('/api/platform/history/import', {
          method: 'POST',
          body: JSON.stringify({
            sourceType: 'offline',
            importKey: `${current.id}:${participant.id}`,
            title: `Offline-Mehrspieler · ${current.kind === 'teams' ? 'Teamspiel' : 'Einzelspieler'}`,
            quizType: current.quizType,
            category: current.category,
            score: participant.score,
            correct: participant.correct,
            wrong: participant.wrong,
            unanswered: participant.unanswered,
            playedAt: current.completedAt ? new Date(current.completedAt).toISOString() : new Date().toISOString(),
          }),
        });
        message.textContent = data.imported ? 'Das Ergebnis wurde in deiner Historie gespeichert. Es zählt bewusst nicht für die Liga.' : 'Dieses Ergebnis war bereits gespeichert.';
      } catch (error) {
        message.textContent = error.message;
        message.classList.add('bad-text');
        button.disabled = false;
      }
    };
  }

  new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
  install();
})();
