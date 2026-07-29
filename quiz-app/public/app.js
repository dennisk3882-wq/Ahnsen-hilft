'use strict';

let deferredInstallPrompt = null;

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
      ${stage ? `<span class="app-badge app-upcoming">${stage}</span>` : ''}
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
        'Öffne im Browsermenü „Zum Startbildschirm hinzufügen“ oder „App installieren“. Danach startet Ahnsen Quiz wie eine normale App im Vollbild.',
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

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('Service Worker konnte nicht registriert werden:', error.message);
    });
  });
}

installUpcomingHandlers();
installPwaHandling();
registerServiceWorker();
