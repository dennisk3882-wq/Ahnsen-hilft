'use strict';

(() => {
  let pending = false;
  let lastFingerprint = '';

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
    return data;
  }

  async function digest(value) {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 40);
  }

  async function importFinishedLiveQuiz() {
    if (pending || !document.querySelector('#view .big-status')?.textContent.includes('Quiz beendet')) return;
    const row = document.querySelector('#overlayInner table.leaderboard tr.me');
    const playerName = document.querySelector('#playerPill')?.textContent?.trim();
    if (!row || !playerName) return;
    const cells = [...row.querySelectorAll('td')].map(cell => cell.textContent.trim());
    if (cells.length < 4) return;
    const fingerprint = `${new Date().toISOString().slice(0, 13)}|${document.title}|${document.querySelector('#overlayInner')?.textContent || ''}|${playerName}`;
    if (fingerprint === lastFingerprint) return;
    pending = true;
    try {
      const [me, account] = await Promise.all([api('/api/platform/me'), api('/api/account/me')]);
      if (!me.profile || !account.account?.emailVerified || me.profile.name !== playerName) return;
      const importKey = `live:${await digest(fingerprint)}`;
      const result = await api('/api/platform/history/import', {
        method: 'POST',
        body: JSON.stringify({
          sourceType: 'live',
          importKey,
          title: 'Moderiertes Live-Quiz',
          quizType: 'adult',
          category: 'Gemischt',
          score: Number(cells[2].replace(/[^\d-]/gu, '')) || 0,
          correct: Number(cells[3].replace(/\D/gu, '')) || 0,
          wrong: 0,
          unanswered: 0,
          playedAt: new Date().toISOString(),
        }),
      });
      lastFingerprint = fingerprint;
      const status = document.querySelector('#view .big-status');
      if (status && !status.querySelector('.live-history-note')) {
        status.insertAdjacentHTML('beforeend', `<p class="live-history-note muted">${result.imported ? 'Dein Ergebnis wurde in der Profilhistorie gespeichert.' : 'Dein Ergebnis war bereits in der Profilhistorie gespeichert.'} Es zählt nicht für die Liga.</p>`);
      }
    } catch { /* Live-Quiz bleibt unabhängig vom Profil funktionsfähig. */ }
    finally { pending = false; }
  }

  new MutationObserver(importFinishedLiveQuiz).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
