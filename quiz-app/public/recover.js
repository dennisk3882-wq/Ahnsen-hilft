'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const resetToken = params.get('reset');
  const verifyToken = params.get('verify');

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Die Anfrage konnte nicht ausgeführt werden.');
    return data;
  }

  function message(selector, text, bad = false) {
    const node = $(selector);
    if (!node) return;
    node.textContent = text;
    node.className = bad ? 'bad-text' : 'muted';
  }

  function busy(form, value) {
    form?.querySelectorAll('input,button').forEach(node => { node.disabled = value; });
  }

  if (resetToken) {
    $('#forgotPanel').classList.add('hidden');
    $('#resetPanel').classList.remove('hidden');
    $('#recoverTitle').textContent = 'Neues Passwort festlegen';
    $('#recoverIntro').textContent = 'Der Link ist nur einmal verwendbar und 30 Minuten gültig.';
  } else if (verifyToken) {
    $('#forgotPanel').classList.add('hidden');
    $('#verifyPanel').classList.remove('hidden');
    $('#recoverTitle').textContent = 'E-Mail-Adresse bestätigen';
    $('#recoverIntro').textContent = 'Damit sind Passwortzurücksetzung und Kontohinweise für dieses Profil aktiviert.';
    api(`/api/account/email/verify?token=${encodeURIComponent(verifyToken)}`)
      .then(data => {
        $('#verifyPanel').innerHTML = `<div class="panel-heading"><div><span class="eyebrow">Erfolgreich</span><h2>E-Mail-Adresse bestätigt</h2></div></div><p class="muted">${data.email} ist jetzt mit deinem QuizTime-Profil verbunden.</p><a class="btn primary" href="/account">Kontocenter öffnen</a>`;
      })
      .catch(error => message('#verifyMessage', error.message, true));
  }

  $('#forgotForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    busy(form, true);
    message('#forgotMessage', 'Anfrage wird verarbeitet …');
    try {
      const data = await api('/api/account/password/forgot', { method: 'POST', body: JSON.stringify({ email: $('#forgotEmail').value }) });
      form.reset();
      message('#forgotMessage', data.message || 'Falls ein bestätigtes Profil existiert, wurde eine E-Mail versendet.');
    } catch (error) {
      message('#forgotMessage', error.message, true);
    } finally {
      busy(form, false);
    }
  });

  $('#resetForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    busy(form, true);
    message('#resetMessage', 'Neues Passwort wird gespeichert …');
    try {
      await api('/api/account/password/reset', { method: 'POST', body: JSON.stringify({ token: resetToken, password: $('#resetPassword').value, confirmation: $('#resetConfirmation').value }) });
      $('#resetPanel').innerHTML = '<div class="panel-heading"><div><span class="eyebrow">Erfolgreich</span><h2>Passwort wurde geändert</h2></div></div><p class="muted">Alle bisherigen Anmeldungen wurden beendet. Du kannst dich jetzt mit dem neuen Passwort anmelden.</p><a class="btn primary" href="/solo">Zur Profilanmeldung</a>';
    } catch (error) {
      message('#resetMessage', error.message, true);
      busy(form, false);
    }
  });
})();
