'use strict';

(() => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, options = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.endsWith('/api/solo/profiles/register') && options.body) {
      try {
        const payload = JSON.parse(options.body);
        const email = document.querySelector('#profileRegisterEmail')?.value || '';
        options = { ...options, body: JSON.stringify({ ...payload, email }) };
      } catch { /* ursprüngliche Anfrage unverändert senden */ }
    }
    return nativeFetch(input, options);
  };

  function enhanceProfilePanel() {
    const registerForm = document.querySelector('#profileRegisterForm');
    if (registerForm && !document.querySelector('#profileRegisterEmail')) {
      const nameLabel = registerForm.querySelector('label');
      const label = document.createElement('label');
      label.innerHTML = 'E-Mail-Adresse<input id="profileRegisterEmail" type="email" autocomplete="email" maxlength="254" placeholder="Für Passwort-Wiederherstellung" required>';
      nameLabel?.insertAdjacentElement('afterend', label);
      const password = document.querySelector('#profileRegisterPassword');
      if (password) password.placeholder = 'Mindestens 8 Zeichen, Buchstabe + Zahl';
      const note = document.createElement('small');
      note.className = 'muted';
      note.textContent = 'Nach der Registrierung erhältst du einen Bestätigungslink. Dein Passwort wird niemals per E-Mail versendet.';
      password?.parentElement?.appendChild(note);
    }

    const loginForm = document.querySelector('#profileLoginForm');
    if (loginForm && !document.querySelector('#forgotProfilePassword')) {
      const link = document.createElement('a');
      link.id = 'forgotProfilePassword';
      link.className = 'btn ghost small';
      link.href = '/recover';
      link.textContent = 'Passwort vergessen?';
      loginForm.appendChild(link);
    }

    const actions = document.querySelector('.profile-current .profile-actions');
    if (actions && !document.querySelector('#openAccountCenter')) {
      const link = document.createElement('a');
      link.id = 'openAccountCenter';
      link.className = 'btn ghost small';
      link.href = '/account';
      link.textContent = 'Konto verwalten';
      actions.prepend(link);
    }
  }

  new MutationObserver(enhanceProfilePanel).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', enhanceProfilePanel);
  enhanceProfilePanel();
})();
