'use strict';

(() => {
  if (window.__quiztimePhase11ClientInstalled) return;
  window.__quiztimePhase11ClientInstalled = true;

  async function json(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Anfrage fehlgeschlagen.'), { status: response.status });
    return data;
  }

  function addOnboardingBanner(state) {
    if (state.complete || state.dismissed || document.querySelector('#phase11OnboardingBanner') || location.pathname === '/welcome') return;
    const anchor = document.querySelector('.app-topbar, header');
    if (!anchor) return;
    const banner = document.createElement('aside');
    banner.id = 'phase11OnboardingBanner';
    banner.className = 'phase11-onboarding-banner';
    banner.innerHTML = `<div><strong>QuizTime-Einführung: ${state.completedCount}/${state.total}</strong><span>Noch ${state.total - state.completedCount} kurze Schritte bis zur Abschlussbelohnung.</span></div><a class="btn primary small" href="/welcome">Fortsetzen</a><button type="button" aria-label="Einführung ausblenden">×</button>`;
    anchor.insertAdjacentElement('afterend', banner);
    banner.querySelector('button').addEventListener('click', async () => {
      banner.remove();
      await json('/api/platform/phase11/onboarding/dismiss', { method: 'POST', body: JSON.stringify({ dismissed: true }) }).catch(() => {});
    });
  }

  function addNotices(data) {
    const notices = (data.notices || []).filter(item => !item.acknowledged_at);
    if (!notices.length || document.querySelector('#phase11Notice')) return;
    const notice = notices[0];
    const panel = document.createElement('div');
    panel.id = 'phase11Notice';
    panel.className = `phase11-player-notice ${notice.notice_type || 'warning'}`;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = `<section><span class="app-kicker">Hinweis von QuizTime</span><h2></h2><p></p><button class="btn primary" type="button">Gelesen</button></section>`;
    panel.querySelector('h2').textContent = notice.title;
    panel.querySelector('p').textContent = notice.body;
    document.body.appendChild(panel);
    panel.querySelector('button').addEventListener('click', async () => {
      await json(`/api/platform/phase11/notices/${encodeURIComponent(notice.id)}/acknowledge`, { method: 'POST', body: '{}' }).catch(() => {});
      panel.remove();
    });
  }

  async function init() {
    if (location.pathname === '/arena') {
      json('/api/platform/phase11/onboarding/steps/arena', { method: 'POST', body: '{}' }).catch(() => {});
    }
    try {
      const [onboarding, notices] = await Promise.all([
        json('/api/platform/phase11/onboarding'),
        json('/api/platform/phase11/notices').catch(() => ({ notices: [] })),
      ]);
      addOnboardingBanner(onboarding);
      addNotices(notices);
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) console.warn('Phase-11-Status konnte nicht geladen werden:', error.message);
    }
  }

  init();
})();
