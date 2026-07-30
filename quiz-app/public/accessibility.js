'use strict';

(() => {
  document.documentElement.lang = 'de';
  const main = document.querySelector('main');
  if (main && !main.id) main.id = 'mainContent';
  if (main && !document.querySelector('.skip-link')) {
    const link = document.createElement('a');
    link.className = 'skip-link';
    link.href = `#${main.id}`;
    link.textContent = 'Direkt zum Inhalt';
    document.body.prepend(link);
  }

  document.querySelectorAll('.message').forEach(node => {
    if (!node.hasAttribute('aria-live')) node.setAttribute('aria-live', 'polite');
  });
  document.querySelectorAll('button').forEach(button => {
    if (!button.getAttribute('aria-label') && !button.textContent.trim()) button.setAttribute('aria-label', 'Aktion');
  });

  function loadScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    document.body.appendChild(script);
  }
  if (location.pathname === '/online') loadScript('/online-enhancements.js');
  if (location.pathname === '/community') loadScript('/community-enhancements.js');
  if (location.pathname === '/arena') loadScript('/history-enhancements.js');
  if (location.pathname === '/platform-admin') loadScript('/admin-event-enhancements.js');

  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const dialog = [...document.querySelectorAll('[role="dialog"],.app-modal,.event-player,.admin-phase10-modal')]
      .reverse().find(node => !node.classList.contains('hidden'));
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
})();
