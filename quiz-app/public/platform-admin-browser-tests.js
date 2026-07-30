'use strict';

(() => {
  const target = document.querySelector('#adminBrowserTests');
  const dashboard = document.querySelector('#adminDashboard');
  if (!target || !dashboard) return;

  let refreshTimer = null;
  let lastRendered = '';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const date = value => value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : 'Noch kein Lauf';

  function runCard(run, fallbackLabel) {
    const label = run?.label || fallbackLabel;
    const state = !run ? 'pending' : run.status !== 'completed' ? 'running' : run.conclusion === 'success' ? 'success' : 'failed';
    const stateLabel = !run ? 'Ausstehend' : run.status !== 'completed' ? 'Läuft' : run.conclusion === 'success' ? 'Erfolgreich' : 'Fehlgeschlagen';
    const meta = run ? `${date(run.updatedAt)} · Lauf ${run.runNumber || '–'} · ${run.branch || '–'} · ${run.commit || '–'}` : 'Der erste automatische Lauf startet nach der Veröffentlichung dieser Erweiterung.';
    const action = run?.url ? `<a class="btn ghost small" href="${esc(run.url)}" target="_blank" rel="noopener noreferrer">Bericht öffnen</a>` : '';
    return `<article class="admin-browser-card ${state}"><div class="admin-browser-icon"><i></i></div><div><span class="eyebrow">${esc(label)}</span><h3>${esc(stateLabel)}</h3><p>${esc(meta)}</p></div>${action}</article>`;
  }

  function render(data) {
    const key = JSON.stringify(data);
    if (key === lastRendered) return;
    lastRendered = key;
    const summary = data.summary || { state: 'pending', label: 'Status wird vorbereitet' };
    const errors = data.errors?.length ? `<p class="admin-browser-warning">${esc(data.errors.join(' · '))}</p>` : '';
    target.innerHTML = `<div class="admin-browser-summary ${esc(summary.state)}"><i></i><div><strong>${esc(summary.label)}</strong><span>Letzte Abfrage: ${date(data.fetchedAt)}</span></div>${data.actionsUrl ? `<a class="btn secondary small" href="${esc(data.actionsUrl)}" target="_blank" rel="noopener noreferrer">Alle Testläufe</a>` : ''}</div><div class="admin-browser-grid">${runCard(data.browser, 'Browser-Tests bei Änderungen')}${runCard(data.production, 'Produktionsprüfung alle sechs Stunden')}</div>${errors}`;
  }

  async function load(force = false) {
    if (dashboard.classList.contains('hidden')) return;
    try {
      const response = await fetch(`/api/platform/admin/browser-tests${force ? '?refresh=1' : ''}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Teststatus konnte nicht geladen werden.');
      render(data);
    } catch (error) {
      target.innerHTML = `<div class="admin-empty bad-text">${esc(error.message)}</div>`;
    }
  }

  const observer = new MutationObserver(() => {
    if (!dashboard.classList.contains('hidden')) {
      load();
      if (!refreshTimer) refreshTimer = setInterval(load, 60_000);
    } else if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  });
  observer.observe(dashboard, { attributes: true, attributeFilter: ['class'] });
  document.querySelector('#refreshAdmin')?.addEventListener('click', () => load(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  load();
})();
