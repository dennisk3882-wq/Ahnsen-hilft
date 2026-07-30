'use strict';

let deferredInstallPrompt = null;

const BRAND_REPLACEMENTS = [
  ['Ahnsen Quizabend', 'QuizTime'],
  ['Ahnsen Quiz', 'QuizTime'],
  ['Ahnsen-Quiz', 'QuizTime'],
];

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
      return BRAND_REPLACEMENTS.some(([from]) => node.nodeValue?.includes(from))
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const node of textNodes) {
    const next = replaceBrandText(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  scope.querySelectorAll('.app-logo span, .app-logo').forEach(logo => {
    if (logo.children.length === 0 && ['A', 'AQ'].includes(logo.textContent.trim())) logo.textContent = 'Q';
  });
}

function watchQuizTimeBranding() {
  applyQuizTimeBranding(document);
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const next = replaceBrandText(mutation.target.nodeValue);
        if (next !== mutation.target.nodeValue) mutation.target.nodeValue = next;
        continue;
      }
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const next = replaceBrandText(node.nodeValue);
          if (next !== node.nodeValue) node.nodeValue = next;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          applyQuizTimeBranding(node);
        }
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
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
  const existing = document.querySelector('#appInfoModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'appInfoModal';
  modal.className = 'app-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'appInfoTitle');
  modal.innerHTML = `
    <section class="app-modal-card">
      <div class="app-modal-icon" aria-hidden="true">✦</div>
      ${stage ? `<span class="app-badge app-upcoming">${escapeAppHtml(stage)}</span>` : ''}
      <h2 id="appInfoTitle">${escapeAppHtml(title)}</h2>
      <p class="muted">${escapeAppHtml(text)}</p>
      <button id="closeAppInfo" class="btn primary wide-button" type="button">Verstanden</button>
    </section>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#closeAppInfo').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', function onEscape(event) {
    if (event.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onEscape);
    }
  });
  modal.querySelector('#closeAppInfo').focus();
}

function escapeAppHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
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
  if (!buttons.length) return;

  const updateButtons = available => {
    buttons.forEach(button => button.classList.toggle('available', available));
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateButtons(true);
  });

  buttons.forEach(button => button.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      openInfoModal(
        'Web-App installieren',
        'Öffne im Browsermenü „Zum Startbildschirm hinzufügen“ oder „App installieren“. Danach startet QuizTime wie eine normale App im Vollbild.',
      );
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    updateButtons(false);
  }));

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateButtons(false);
  });
}

function connectAppShortcuts() {
  document.querySelector('#heroLiveButton')?.addEventListener('click', () => {
    document.querySelector('#openLiveLoginButton')?.click();
  });
}

function installCommunityEntry() {
  const nav = document.querySelector('.app-bottom-nav');
  if (nav && !nav.querySelector('a[href="/community"]')) {
    const link = document.createElement('a');
    link.className = 'app-nav-item';
    link.href = '/community';
    link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20v-1a5.5 5.5 0 0 1 11 0v1M13 20v-.5a4.5 4.5 0 0 1 8-2.8"/></svg><span>Community</span>';
    nav.appendChild(link);
  }

  const banner = document.querySelector('.phase-banner');
  if (banner && !banner.dataset.communityReady) {
    banner.dataset.communityReady = 'true';
    const strong = banner.querySelector('strong');
    const detail = banner.querySelector('strong + span');
    const action = banner.querySelector('a');
    if (strong) strong.textContent = 'QuizTime Plattform und Community sind integriert';
    if (detail) detail.textContent = 'Freunde, Einladungen, Schnellspiel, Turniere, Saisonrangliste, eigene Quizpakete und Push-Mitteilungen sind verfügbar.';
    if (action) {
      action.href = '/community';
      action.textContent = 'Community öffnen';
    }
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('Service Worker konnte nicht registriert werden:', error.message);
    });
  });
}

watchQuizTimeBranding();
loadPageSpecificStyles();
installUpcomingHandlers();
installPwaHandling();
connectAppShortcuts();
installCommunityEntry();
registerServiceWorker();
