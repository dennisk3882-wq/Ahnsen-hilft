'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let loading = false;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
    return data;
  }

  function counts(rows = []) {
    return Object.fromEntries(rows.map(row => [row.source_type, Number(row.count || 0)]));
  }

  async function load() {
    const root = $('#adminPhase10Content');
    if (!root || $('#adminDashboard')?.classList.contains('hidden') || loading) return;
    loading = true;
    try {
      const [summary, preview] = await Promise.all([
        api('/api/platform/admin/stability/summary'),
        api('/api/platform/admin/stability/season-preview'),
      ]);
      let panel = $('#adminStabilityPanel');
      if (!panel) {
        panel = document.createElement('section');
        panel.id = 'adminStabilityPanel';
        panel.className = 'panel';
        root.appendChild(panel);
      }
      const ledger = counts(summary.ledger);
      const season = preview.preview;
      panel.innerHTML = `
        <div class="panel-heading"><div><span class="eyebrow">Stabilität 10.1</span><h2>Datenprüfung & Reparatur</h2></div><button id="refreshStabilityAdmin" class="btn ghost small" type="button">Aktualisieren</button></div>
        <div class="admin-metric-grid phase10-admin-metrics">
          <article class="admin-metric"><strong>${ledger.online || 0}</strong><span>Online-Ergebnisse</span><small>idempotent verbucht</small></article>
          <article class="admin-metric"><strong>${ledger.duel || 0}</strong><span>Duellergebnisse</span><small>im Ergebnis-Ledger</small></article>
          <article class="admin-metric"><strong>${ledger.tournament || 0}</strong><span>Turnierergebnisse</span><small>im Ergebnis-Ledger</small></article>
          <article class="admin-metric"><strong>${summary.sessions?.expired_open || 0}</strong><span>Abgelaufene Sitzungen</span><small>${summary.sessions?.active_open || 0} aktuell offen</small></article>
          <article class="admin-metric"><strong>${summary.catalog?.consistent ? 'OK' : 'Prüfen'}</strong><span>Fragenkatalog</span><small>${summary.catalog?.canonicalVersion || '–'}</small></article>
        </div>
        <div class="admin-main-grid">
          <section class="admin-item"><div class="admin-item-head"><div><strong>Automatische Abstimmung</strong><small>Fertige Räume nachverbuchen und abgelaufene Eventrunden schließen</small></div></div><button id="reconcileStability" class="btn primary wide-button" type="button">Daten jetzt prüfen und reparieren</button><div id="reconcileMessage" class="message" aria-live="polite"></div></section>
          <section class="admin-item"><div class="admin-item-head"><div><strong>Saisonvorschau</strong><small>${esc(season?.season?.name || 'Keine aktive Saison')}</small></div></div><p>${season ? `${season.totalPlayers} Spieler werden ausgewertet. Auf- und Abstieg werden innerhalb der aktuellen Liga berechnet.` : 'Keine Daten verfügbar.'}</p><a class="btn secondary small" href="/arena?tab=league" target="_blank" rel="noopener">Ligatabelle ansehen</a></section>
        </div>
        <section class="admin-item"><div class="admin-item-head"><div><strong>Manuelle Korrektur</strong><small>Jede Änderung wird mit Begründung protokolliert.</small></div></div><form id="stabilityAdjustmentForm" class="admin-phase10-form"><div class="admin-phase10-form-grid"><label>Profil-ID<input id="stabilityProfileId" required placeholder="UUID des Profils"></label><label>XP-Änderung<input id="stabilityXpDelta" type="number" value="0" min="-10000" max="10000"></label><label>Saisonpunkte-Änderung<input id="stabilitySeasonDelta" type="number" value="0" min="-5000" max="5000"></label><label>Begründung<input id="stabilityReason" maxlength="300" required placeholder="z. B. fehlgeschlagene Belohnung nachtragen"></label></div><button class="btn danger" type="submit">Korrektur protokolliert ausführen</button><div id="stabilityAdjustmentMessage" class="message" aria-live="polite"></div></form></section>
        <section class="admin-item"><div class="admin-item-head"><div><strong>Zentraler Fragenkatalog</strong><small>${esc(summary.catalog?.policy || '')}</small></div><span class="admin-status ${summary.catalog?.consistent ? 'active' : 'cancelled'}">${summary.catalog?.consistent ? 'Konsistent' : 'Abweichung'}</span></div><p>Standardversion ${esc(summary.catalog?.canonicalVersion || '–')} · Veröffentlichte Version ${esc(summary.catalog?.publishedVersion || '–')} · Zusatzfragen: ${Number(summary.catalog?.byType?.adult?.custom || 0) + Number(summary.catalog?.byType?.child?.custom || 0)}</p></section>
        <p class="muted">Installierte Migrationen: ${(summary.migrations || []).map(item => esc(item.version)).join(', ') || 'keine'}. Manuelle Korrekturen insgesamt: ${summary.adjustments || 0}.</p>`;
      $('#refreshStabilityAdmin').onclick = load;
      $('#reconcileStability').onclick = async () => {
        const button = $('#reconcileStability');
        button.disabled = true;
        try {
          const result = await api('/api/platform/admin/stability/reconcile', { method: 'POST', body: '{}' });
          $('#reconcileMessage').textContent = `${result.repairedRooms} Räume repariert, ${result.abandonedSessions} abgelaufene Eventrunden geschlossen.`;
          await load();
        } catch (error) { $('#reconcileMessage').textContent = error.message; }
        finally { button.disabled = false; }
      };
      $('#stabilityAdjustmentForm').onsubmit = async event => {
        event.preventDefault();
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          const result = await api('/api/platform/admin/stability/adjust-profile', {
            method: 'POST',
            body: JSON.stringify({
              profileId: $('#stabilityProfileId').value,
              xpDelta: Number($('#stabilityXpDelta').value),
              seasonPointsDelta: Number($('#stabilitySeasonDelta').value),
              reason: $('#stabilityReason').value,
            }),
          });
          $('#stabilityAdjustmentMessage').textContent = `Korrektur ${result.id} wurde gespeichert.`;
          event.currentTarget.reset();
        } catch (error) { $('#stabilityAdjustmentMessage').textContent = error.message; }
        finally { button.disabled = false; }
      };
    } catch (error) {
      let panel = $('#adminStabilityPanel');
      if (!panel) { panel = document.createElement('section'); panel.id = 'adminStabilityPanel'; panel.className = 'panel'; root.appendChild(panel); }
      panel.innerHTML = `<div class="admin-empty bad-text">${esc(error.message)}</div>`;
    } finally {
      loading = false;
    }
  }

  document.querySelector('[data-admin-tab="phase10"]')?.addEventListener('click', () => setTimeout(load, 80));
  document.addEventListener('quiztime-admin-refresh', load);
  new MutationObserver(() => {
    const view = document.querySelector('[data-admin-view="phase10"]');
    if (view && !view.classList.contains('hidden')) load();
  }).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class'] });
})();
