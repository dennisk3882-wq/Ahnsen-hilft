'use strict';

(() => {
  const originalFetch = window.fetch.bind(window);
  let lastRows = [];
  let enhancing = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const date = value => value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '–';

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = String(args[0]?.url || args[0] || '');
    if (url.includes('/api/platform/phase10/history?')) {
      try {
        const copy = response.clone();
        const data = await copy.json();
        lastRows = data.history || [];
        setTimeout(enhance, 0);
      } catch { /* normale Darstellung bleibt aktiv */ }
    }
    return response;
  };

  async function api(url, options = {}) {
    const response = await originalFetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
    return data;
  }

  function sourceId(item) {
    return item.source_type === 'solo' ? item.source_id : item.id || item.source_id || item.room_code;
  }

  function enhance() {
    if (enhancing) return;
    enhancing = true;
    try {
      const panel = document.querySelector('[data-arena-view="history"] .panel');
      if (panel && !document.querySelector('#historyExportActions')) {
        const controls = document.createElement('div');
        controls.id = 'historyExportActions';
        controls.className = 'arena-actions';
        controls.innerHTML = '<a class="btn ghost small" href="/api/platform/phase10/history/export?format=csv">CSV exportieren</a><a class="btn ghost small" href="/api/platform/phase10/history/export?format=json">JSON exportieren</a>';
        panel.querySelector('.panel-heading')?.appendChild(controls);
      }
      document.querySelectorAll('#historyList .history-row').forEach((row, index) => {
        const item = lastRows[index];
        if (!item || row.querySelector('[data-history-details]')) return;
        const actions = document.createElement('div');
        actions.className = 'arena-actions history-extra-actions';
        actions.style.gridColumn = '1/-1';
        actions.innerHTML = `<button class="btn secondary small" data-history-details="${esc(item.source_type)}" data-history-source="${esc(sourceId(item))}" type="button">Details</button>${item.source_type !== 'solo' && item.id ? `<button class="btn ghost small" data-history-hide="${esc(item.id)}" type="button">Aus Verlauf ausblenden</button>` : ''}`;
        row.appendChild(actions);
      });
    } finally { enhancing = false; }
  }

  function detailMarkup(details) {
    if (details.sourceType === 'solo') {
      return `<div class="admin-list">${details.questions.map(question => `<article class="admin-item"><strong>${question.question_index + 1}. ${esc(question.question_text)}</strong><small>${question.correct ? 'Richtig' : question.timed_out ? 'Zeit abgelaufen' : 'Falsch'} · ${question.delta} Punkte · ${date(question.answered_at)}</small></article>`).join('')}</div>`;
    }
    const snapshot = details.roomSnapshot;
    const roomPlayer = snapshot ? Object.values(snapshot.players || {}).find(player => player.profileId === details.profile_id) : null;
    return `<div class="admin-metric-grid"><article class="admin-metric"><strong>${details.score}</strong><span>Punkte</span><small>${details.result}</small></article><article class="admin-metric"><strong>${details.correct}</strong><span>Richtig</span><small>${details.wrong} falsch · ${details.unanswered} offen</small></article><article class="admin-metric"><strong>${details.opponent_score}</strong><span>Gegner</span><small>${esc(details.opponent_name || '–')}</small></article></div>${snapshot ? `<p class="muted">Der Raum-Schnappschuss ist noch verfügbar: ${snapshot.questions?.length || 0} Fragen, ${roomPlayer?.responses ? Object.keys(roomPlayer.responses).length : Object.keys(snapshot.responses || {}).length} gespeicherte Antworten.</p>` : '<p class="muted">Der detaillierte Raum-Schnappschuss ist nach Ablauf der Raumaufbewahrung nicht mehr verfügbar. Das Ergebnis bleibt erhalten.</p>'}`;
  }

  async function showDetails(type, id) {
    const data = await api(`/api/platform/phase10/history/details/${encodeURIComponent(type)}/${encodeURIComponent(id)}`);
    const modal = document.createElement('div');
    modal.className = 'app-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `<section class="app-modal-card" style="width:min(780px,100%);max-height:90vh;overflow:auto"><div class="panel-heading"><div><span class="app-kicker">Spieldetails</span><h2>${esc(data.details.title || data.details.metadata?.title || data.details.source_type || 'QuizTime-Spiel')}</h2></div><button class="btn ghost small" data-close-history-details type="button">Schließen</button></div>${detailMarkup(data.details)}</section>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close-history-details]').onclick = () => modal.remove();
    modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
  }

  document.addEventListener('click', async event => {
    const detail = event.target.closest('[data-history-details]');
    const hide = event.target.closest('[data-history-hide]');
    if (!detail && !hide) return;
    try {
      if (detail) await showDetails(detail.dataset.historyDetails, detail.dataset.historySource);
      if (hide && confirm('Diesen Eintrag aus deiner persönlichen Ansicht ausblenden? Ranglistenpunkte bleiben unverändert.')) {
        await api(`/api/platform/phase10/history/${hide.dataset.historyHide}`, { method: 'DELETE' });
        document.querySelector('#historyFilters')?.requestSubmit();
      }
    } catch (error) { alert(error.message); }
  });

  new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true });
  enhance();
})();
