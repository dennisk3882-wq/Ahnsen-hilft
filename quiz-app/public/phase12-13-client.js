'use strict';

(() => {
  if (window.__quiztimePhase1213Client) return;
  window.__quiztimePhase1213Client = true;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.error || 'Anfrage fehlgeschlagen.'), { status: response.status, body });
    return body;
  }
  function currentQuestion() {
    const stage = document.querySelector('.event-question,.online-question-view,.solo-stage,.player-stage');
    const heading = stage?.querySelector('h2,h1');
    if (!heading) return null;
    return { questionText: heading.textContent.trim(), questionId: stage.querySelector('[data-question-id]')?.dataset.questionId || null, category: document.querySelector('.category-chip,#soloCategory')?.textContent?.trim() || null, quizType: document.body.textContent.includes('Kinderquiz') ? 'child' : null };
  }
  function addFooter() {
    if (document.querySelector('.phase13-footer') || location.pathname === '/legal') return;
    const footer = document.createElement('footer'); footer.className = 'phase13-footer';
    footer.innerHTML = '<a href="/legal#impressum">Impressum</a><a href="/legal#datenschutz">Datenschutz</a><a href="/legal#nutzung">Nutzungsbedingungen</a><a href="/legal#kinder">Kinder & Eltern</a><a href="/progress">Mein Fortschritt</a>';
    document.body.appendChild(footer);
  }
  function closeModal() { document.querySelector('#phase13Modal')?.remove(); }
  function openReport() {
    const question = currentQuestion(); const modal = document.createElement('div'); modal.id = 'phase13Modal'; modal.className = 'phase13-modal';
    modal.innerHTML = `<section class="phase13-modal-card"><span class="app-kicker">Beta & Qualität</span><h2>Problem melden</h2>${question ? `<div class="phase13-question-preview"><strong>Aktuelle Frage</strong><p>${esc(question.questionText)}</p></div>` : ''}<form id="phase13ReportForm"><label>Art<select name="kind"><option value="${question ? 'question' : 'bug'}">${question ? 'Fehler in dieser Frage' : 'Technischer Fehler'}</option><option value="bug">Technischer Fehler</option><option value="usability">Bedienung unklar</option><option value="idea">Idee</option><option value="other">Sonstiges</option></select></label>${question ? '<label>Fragenfehler<select name="reportType"><option value="wrong-answer">Richtige Lösung stimmt nicht</option><option value="unclear">Frage oder Antworten unklar</option><option value="outdated">Veraltet</option><option value="duplicate">Doppelte Frage</option><option value="typo">Tippfehler</option><option value="other">Sonstiges</option></select></label>' : ''}<label>Titel<input name="title" required maxlength="160" value="${question ? 'Quizfrage prüfen' : ''}"></label><label>Beschreibung<textarea name="description" rows="5" required minlength="10"></textarea></label><div id="phase13ReportMessage" class="message"></div><div class="phase13-modal-actions"><button class="btn ghost" type="button" data-close>Abbrechen</button><button class="btn primary" type="submit">Senden</button></div></form></section>`;
    document.body.appendChild(modal); modal.querySelector('[data-close]').onclick = closeModal;
    modal.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const message = modal.querySelector('#phase13ReportMessage');
      try {
        if (question && form.get('kind') === 'question') await api('/api/platform/questions/report', { method: 'POST', body: JSON.stringify({ ...question, reportType: form.get('reportType'), comment: form.get('description'), pagePath: location.pathname, appVersion: '13.0.0' }) });
        else await api('/api/platform/feedback', { method: 'POST', body: JSON.stringify({ kind: form.get('kind'), title: form.get('title'), description: form.get('description'), pagePath: location.pathname, appVersion: '13.0.0', clientContext: { viewport: `${innerWidth}x${innerHeight}`, language: navigator.language } }) });
        message.textContent = 'Danke. Die Meldung wurde gespeichert.'; setTimeout(closeModal, 900);
      } catch (error) { message.textContent = error.message; }
    };
  }
  function addReportButton() {
    if (document.querySelector('.phase13-report-button') || location.pathname.startsWith('/platform-admin')) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'phase13-report-button'; button.textContent = '⚑ Problem melden'; button.onclick = openReport; document.body.appendChild(button);
  }
  async function ensureConsent() {
    try {
      const consent = await api('/api/platform/legal/consent'); if (consent.valid || document.querySelector('#phase13ConsentModal')) return;
      const modal = document.createElement('div'); modal.id = 'phase13ConsentModal'; modal.className = 'phase13-modal';
      modal.innerHTML = `<section class="phase13-modal-card"><span class="app-kicker">QuizTime 13</span><h2>Datenschutz und Nutzung bestätigen</h2><p>Bitte wähle nur die Altersgruppe. Ein vollständiges Geburtsdatum wird nicht gespeichert.</p><form><label>Altersgruppe<select name="ageGroup" required><option value="">Bitte wählen</option><option value="16plus">Ich bin mindestens 16 Jahre alt</option><option value="under16">Ich bin unter 16 Jahre alt</option></select></label><label id="guardianField" class="hidden">E-Mail einer erziehungsberechtigten Person<input name="guardianEmail" type="email" autocomplete="email"></label><label class="row"><input name="accepted" type="checkbox" required><span>Ich bestätige die <a href="/legal#datenschutz" target="_blank">Datenschutzerklärung</a> und <a href="/legal#nutzung" target="_blank">Nutzungsbedingungen</a>.</span></label><div class="message"></div><button class="btn primary wide-button" type="submit">Bestätigen</button></form></section>`;
      document.body.appendChild(modal); const form = modal.querySelector('form'); const select = form.elements.ageGroup;
      select.onchange = () => { const under = select.value === 'under16'; modal.querySelector('#guardianField').classList.toggle('hidden', !under); form.elements.guardianEmail.required = under; };
      form.onsubmit = async event => { event.preventDefault(); const message = form.querySelector('.message'); try { const result = await api('/api/platform/legal/consent', { method: 'POST', body: JSON.stringify({ ageGroup: select.value, guardianEmail: form.elements.guardianEmail.value, accepted: form.elements.accepted.checked }) }); if (result.valid) modal.remove(); else { message.textContent = 'Die Bestätigungs-E-Mail wurde versendet. Bis zur Freigabe bleiben Community und Wettbewerbe gesperrt.'; form.querySelector('button').disabled = true; } } catch (error) { message.textContent = error.message; } };
    } catch (error) { if (![401, 403].includes(error.status)) console.warn('Rechtsstatus konnte nicht geladen werden:', error.message); }
  }
  addFooter(); addReportButton(); ensureConsent();
})();
