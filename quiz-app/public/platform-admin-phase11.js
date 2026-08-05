'use strict';

(() => {
  if (!document.querySelector('link[href="/platform-admin-phase12.css"]')) { const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/platform-admin-phase12.css'; document.head.appendChild(style); }
  const tabs = document.querySelector('.admin-tabs'); let button = document.querySelector('[data-admin-tab="phase12"]');
  if (tabs && !button) { button = document.createElement('button'); button.type = 'button'; button.dataset.adminTab = 'phase12'; button.textContent = 'Qualität & Release'; tabs.querySelector('[data-admin-tab="phase11"]')?.insertAdjacentElement('afterend', button); }
  const dashboard = document.querySelector('#adminDashboard'); let view = document.querySelector('[data-admin-view="phase12"]');
  if (dashboard && !view) { view = document.createElement('section'); view.className = 'hidden'; view.dataset.adminView = 'phase12'; view.innerHTML = '<div id="adminPhase12Content"><div class="admin-empty">Fragenqualität, Recht, Backups und Release-Prüfung werden geladen …</div></div>'; dashboard.querySelector('[data-admin-view="phase11"]')?.insertAdjacentElement('afterend', view); }
  button?.addEventListener('click', () => { document.querySelectorAll('[data-admin-tab]').forEach(item => item.classList.toggle('active', item === button)); document.querySelectorAll('[data-admin-view]').forEach(item => item.classList.toggle('hidden', item !== view)); window.dispatchEvent(new CustomEvent('quiztime:phase12-admin-open')); });
  for (const src of ['/platform-admin-phase11-core.js', '/platform-admin-phase12.js']) { if (document.querySelector(`script[src="${src}"]`)) continue; const script = document.createElement('script'); script.src = src; script.defer = true; document.body.appendChild(script); }
})();
