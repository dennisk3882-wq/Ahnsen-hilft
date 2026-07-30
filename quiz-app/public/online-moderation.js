'use strict';

(() => {
  const list = document.querySelector('#onlinePlayerList');
  if (!list) return;

  async function reportPlayer(row) {
    const rawName = row.querySelector('.online-player-copy strong')?.textContent || '';
    const targetName = rawName.replace(/\s*♛\s*/g, '').trim();
    const reason = prompt(`Warum möchtest du ${targetName || 'diesen Spieler'} melden?`, 'Unangemessenes Verhalten');
    if (!reason) return;
    const details = prompt('Kurze Beschreibung (optional):', '') || '';
    const roomCode = document.querySelector('#onlineRoomCode')?.textContent?.trim() || '';
    const response = await fetch('/api/platform/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetName, roomCode, reason, details }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      alert('Zum Melden benötigst du ein QuizTime-Profil. Öffne zuerst den Solo-Bereich und melde dich dort an.');
      return;
    }
    if (!response.ok) throw new Error(data.error || 'Meldung konnte nicht gesendet werden.');
    alert('Die Meldung wurde an die Plattform-Moderation gesendet.');
  }

  function enhance() {
    list.querySelectorAll('.online-player-row:not(.self)').forEach(row => {
      if (row.querySelector('[data-online-report]')) return;
      const target = row.lastElementChild || row;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'online-kick-button';
      button.dataset.onlineReport = 'true';
      button.setAttribute('aria-label', 'Spieler melden');
      button.title = 'Spieler melden';
      button.textContent = '!';
      button.addEventListener('click', () => reportPlayer(row).catch(error => alert(error.message)));
      target.appendChild(button);
    });
  }

  new MutationObserver(enhance).observe(list, { childList: true, subtree: true });
  enhance();
})();
