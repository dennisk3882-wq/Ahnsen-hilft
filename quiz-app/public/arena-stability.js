'use strict';

(() => {
  const state = { events: [], league: null, timer: null };
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  async function api(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
    return data;
  }

  function remainingLabel(seconds) {
    const value = Math.max(0, Number(seconds || 0));
    const days = Math.floor(value / 86400);
    const hours = Math.floor((value % 86400) / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    if (days) return `Start in ${days} T. ${hours} Std.`;
    if (hours) return `Start in ${hours} Std. ${minutes} Min.`;
    return `Start in ${Math.max(1, minutes)} Min.`;
  }

  function enhanceEvents() {
    for (const event of state.events) {
      const button = document.querySelector(`[data-event-start="${CSS.escape(String(event.id))}"]`);
      if (!button) continue;
      const card = button.closest('.event-card');
      const status = card?.querySelector('.arena-status');
      const attempts = Math.max(1, Number(event.settings?.maxAttempts || 5));
      const attemptChip = [...(card?.querySelectorAll('.event-meta span') || [])].find(node => /Versuche/u.test(node.textContent));
      if (attemptChip) attemptChip.textContent = `${Number(event.attempts || 0)}/${attempts} Versuche`;
      if (event.availability === 'upcoming') {
        button.disabled = true;
        button.textContent = remainingLabel(event.starts_in_seconds);
        button.classList.remove('primary');
        button.classList.add('ghost');
        if (status) {
          status.textContent = 'Beginnt später';
          status.className = 'arena-status waiting';
        }
      } else if (status) {
        status.textContent = 'Aktiv';
        status.className = 'arena-status active';
      }
    }
  }

  function enhanceLeague() {
    const me = state.league?.me;
    if (!me || !document.querySelector('#leagueProgress')) return;
    const outcome = me.outcome === 'promotion' ? 'Aktuell in der Aufstiegszone'
      : me.outcome === 'relegation' ? 'Aktuell in der Abstiegszone'
        : 'Aktuell im gesicherten Bereich';
    document.querySelector('#leagueProgress').innerHTML = `<div class="league-progress-copy"><span>${Number(me.points || 0).toLocaleString('de-DE')} Saisonpunkte</span><span>${esc(outcome)}</span></div><div class="league-progress-track"><span style="width:${me.outcome === 'promotion' ? 100 : me.outcome === 'relegation' ? 20 : 60}%"></span></div><small class="muted">Auf- und Abstieg werden am Saisonende anhand der Platzierung innerhalb deiner Liga berechnet.</small>`;
  }

  function enhanceHistory() {
    document.querySelectorAll('.history-row').forEach(row => {
      const copy = row.querySelector('.history-copy strong');
      const icon = row.querySelector('.history-icon');
      const text = copy?.textContent || '';
      if (/offline/iu.test(text)) { if (icon) icon.textContent = '📱'; }
      if (/live/iu.test(text)) { if (icon) icon.textContent = '📺'; }
    });
  }

  async function refresh() {
    try {
      const [events, league, account] = await Promise.all([
        api('/api/platform/phase10/events'),
        api('/api/platform/phase10/league?limit=200'),
        api('/api/account/me'),
      ]);
      state.events = events.events || [];
      state.league = league;
      if (!account.account?.emailVerified) {
        const app = document.querySelector('#arenaApp');
        if (app && !document.querySelector('#arenaVerificationNotice')) {
          app.insertAdjacentHTML('afterbegin', '<section id="arenaVerificationNotice" class="panel"><strong>E-Mail-Bestätigung erforderlich</strong><p class="muted">Bestätige deine E-Mail-Adresse im Kontocenter, bevor Duelle, Turniere und Belohnungen genutzt werden können.</p><a class="btn primary small" href="/account">Zum Kontocenter</a></section>');
        }
      }
      enhanceEvents();
      enhanceLeague();
      enhanceHistory();
    } catch { /* Die Hauptoberfläche zeigt ihre eigene Fehlermeldung. */ }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      enhanceEvents();
      enhanceLeague();
      enhanceHistory();
    }, 40);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => {
    for (const event of state.events) {
      if (event.availability === 'upcoming') event.starts_in_seconds = Math.max(0, Number(event.starts_in_seconds || 0) - 30);
    }
    enhanceEvents();
  }, 30000);
  refresh();
})();
