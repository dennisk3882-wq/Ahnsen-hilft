'use strict';

let deferredInstallPrompt = null;

const BRAND_REPLACEMENTS = [
  ['Ahnsen Quizabend', 'QuizTime'],
  ['Ahnsen Quiz', 'QuizTime'],
  ['Ahnsen-Quiz', 'QuizTime'],
];

function escapeAppHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}

function replaceBrandText(value) {
  let result = String(value ?? '');
  for (const [from, to] of BRAND_REPLACEMENTS) result = result.split(from).join(to);
  return result;
}

function applyQuizTimeBranding(root = document) {
  const scope = root.nodeType === Node.DOCUMENT_NODE ? root : root.ownerDocument || document;
  const target = root.nodeType === Node.DOCUMENT_NODE ? root.documentElement : root;
  const nextTitle = replaceBrandText(scope.title);
  if (nextTitle !== scope.title) scope.title = nextTitle;
  target.querySelectorAll?.('meta[content], [aria-label], [title], [alt]').forEach(element => {
    for (const attribute of ['content', 'aria-label', 'title', 'alt']) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute);
      const next = replaceBrandText(current);
      if (next !== current) element.setAttribute(attribute, next);
    }
  });
  const walker = scope.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return BRAND_REPLACEMENTS.some(([from]) => node.nodeValue?.includes(from)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const node of textNodes) node.nodeValue = replaceBrandText(node.nodeValue);
  scope.querySelectorAll('.app-logo span, .app-logo').forEach(logo => {
    if (logo.children.length === 0 && ['A', 'AQ'].includes(logo.textContent.trim())) logo.textContent = 'Q';
  });
}

function watchQuizTimeBranding() {
  applyQuizTimeBranding(document);
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) node.nodeValue = replaceBrandText(node.nodeValue);
        else if (node.nodeType === Node.ELEMENT_NODE) applyQuizTimeBranding(node);
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function loadPageSpecificStyles() {
  if (!document.body.classList.contains('solo-body')) return;
  if (document.querySelector('link[href="/solo-app.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/solo-app.css';
  document.head.appendChild(link);
}

function openInfoModal(title, text, stage = '') {
  document.querySelector('#appInfoModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'appInfoModal';
  modal.className = 'app-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'appInfoTitle');
  modal.innerHTML = `<section class="app-modal-card"><div class="app-modal-icon" aria-hidden="true">✦</div>${stage ? `<span class="app-badge app-upcoming">${escapeAppHtml(stage)}</span>` : ''}<h2 id="appInfoTitle">${escapeAppHtml(title)}</h2><p class="muted">${escapeAppHtml(text)}</p><button id="closeAppInfo" class="btn primary wide-button" type="button">Verstanden</button></section>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closeAppInfo').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  const onEscape = event => {
    if (event.key !== 'Escape') return;
    close();
    document.removeEventListener('keydown', onEscape);
  };
  document.addEventListener('keydown', onEscape);
  modal.querySelector('#closeAppInfo').focus();
}

function installUpcomingHandlers() {
  document.querySelectorAll('[data-upcoming]').forEach(element => {
    element.addEventListener('click', event => {
      event.preventDefault();
      openInfoModal(
        element.dataset.upcomingTitle || 'Diese Funktion folgt',
        element.dataset.upcomingText || 'Dieser Bereich wird in einer der nächsten Ausbaustufen vollständig freigeschaltet.',
        element.dataset.upcomingStage || '',
      );
    });
  });
}

function installPwaHandling() {
  const buttons = [...document.querySelectorAll('[data-install-app]')];
  const updateButtons = available => buttons.forEach(button => button.classList.toggle('available', available));
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateButtons(true);
  });
  buttons.forEach(button => button.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      openInfoModal('Web-App installieren', 'Öffne im Browsermenü „Zum Startbildschirm hinzufügen“ oder „App installieren“. Danach startet QuizTime wie eine normale App im Vollbild.');
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    updateButtons(false);
  }));
  window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; updateButtons(false); });
}

function connectAppShortcuts() {
  document.querySelector('#heroLiveButton')?.addEventListener('click', () => document.querySelector('#openLiveLoginButton')?.click());
}

function primaryNavigation() {
  const path = location.pathname;
  const competitionArea = path === '/arena' || path === '/competitions' || path.startsWith('/profile/');
  const items = [
    { href: '/', label: 'Start', active: path === '/' || path === '/welcome', icon: '<path d="m3 11 9-8 9 8v9H3v-9Z"/><path d="M9 20v-6h6v6"/>' },
    { href: '/solo', label: 'Spielen', active: ['/solo', '/offline', '/online'].includes(path), icon: '<circle cx="12" cy="12" r="8"/><path d="m10 8 6 4-6 4Z"/>' },
    { href: '/community', label: 'Community', active: path === '/community', icon: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20v-1a5.5 5.5 0 0 1 11 0v1M13 20v-.5a4.5 4.5 0 0 1 8-2.8"/>' },
    { href: '/arena', label: 'Arena', active: competitionArea, icon: '<path d="M7 3h10v6a5 5 0 0 1-10 0V3Z"/><path d="M7 6H3v2a5 5 0 0 0 5 5m9-7h4v2a5 5 0 0 1-5 5M12 14v7m-4 0h8"/>' },
  ];
  document.querySelectorAll('.app-bottom-nav').forEach(nav => {
    nav.innerHTML = items.map(item => `<a class="app-nav-item ${item.active ? 'active' : ''}" href="${item.href}" ${item.active ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg><span>${item.label}</span></a>`).join('');
  });
}

function installPhase11Presentation() {
  const banner = document.querySelector('.phase-banner');
  if (banner) {
    const icon = banner.querySelector('.phase-banner-icon');
    const strong = banner.querySelector('strong');
    const detail = banner.querySelector('strong + span');
    const action = banner.querySelector('a');
    if (icon) icon.textContent = '11.0';
    if (strong) strong.textContent = 'QuizTime 11: bereit für Einführung und öffentlichen Betrieb';
    if (detail) detail.textContent = 'Neue-Spieler-Einführung, Produktionschecks, Manipulationsschutz, vollständige Eventsteuerung und Betriebsanalysen sind integriert.';
    if (action) { action.href = '/welcome'; action.textContent = 'Einführung öffnen'; }
  }
  const topBadge = document.querySelector('#topModeBadge');
  if (topBadge) topBadge.innerHTML = '<i></i> Version 11.0';

  if (location.pathname === '/arena') {
    const actions = document.querySelector('.arena-topbar .app-top-actions');
    if (actions && !actions.querySelector('a[href="/competitions"]')) {
      const link = document.createElement('a');
      link.className = 'btn ghost small';
      link.href = '/competitions';
      link.textContent = 'Wettbewerbe';
      actions.prepend(link);
    }
    const kicker = document.querySelector('.arena-hero .app-kicker');
    if (kicker) kicker.textContent = 'Version 11 · Arena, Schutz & Wettbewerbe';
  }
}

function appendStyle(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function appendScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement('script');
  script.src = src;
  script.defer = true;
  document.body.appendChild(script);
}

function loadEnhancements() {
  appendStyle('/stability.css');
  appendStyle('/phase11.css');
  appendScript('/accessibility.js');
  appendScript('/answer-integrity.js');
  appendScript('/phase11-client.js');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Service Worker konnte nicht registriert werden:', error.message)));
}

watchQuizTimeBranding();
loadPageSpecificStyles();
installUpcomingHandlers();
installPwaHandling();
connectAppShortcuts();
primaryNavigation();
installPhase11Presentation();
loadEnhancements();
registerServiceWorker();
