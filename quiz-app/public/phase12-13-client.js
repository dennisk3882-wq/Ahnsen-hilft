'use strict';

(() => {
  if (window.__quiztimePhase1213Client) return;
  window.__quiztimePhase1213Client = true;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.error || 'Anfrage fehlgeschlagen.'), { status: response.status, body });
    return body;
  }

  function questionContext() {
    const stage = document.querySelector('.event-question,.online-question-view,.solo-stage,.player-stage,[data-question-id]');
    if (!stage) return null;
    const textNode = stage.querySelector('[data-question-text],h1,h2,h3');
    const questionText = textNode?.textContent?.trim();
    if (!questionText || questionText.length < 4) return null;
    const idNode = stage.matches('[data-question-id]') ? stage : stage.querySelector('[data-question-id]');
    const categoryNode = stage.querySelector('[data-category],.category-chip') || document.querySelector('#soloCategory,.category-chip');
    const quizType = document.body.dataset.quizType
      || (document.body.classList.contains('child-quiz') || document.body.textContent.includes('Kinderquiz') ? 'child' : null);
    return {
      stage,
      questionId: idNode?.dataset.questionId || null,
      questionText,
      category: categoryNode?.dataset.category || categoryNode?.textContent?.trim() || null,
      quizType,
    };
  }

  function addFooter() {
    if (document.querySelector('.phase13-footer') || location.pathname === '/legal') return;
    const footer = document.createElement('footer');
    footer.className = 'phase13-footer';
    footer.innerHTML = '<a href="/legal#impressum">Impressum</a><a href="/legal#datenschutz">Datenschutz</a><a href="/legal#nutzung">Nutzungsbedingungen</a><a href="/legal#kinder">Kinder & Eltern</a><a href="/progress">Mein Fortschritt</a>';
    document.body.appendChild(footer);
  }

  function closeModal() {
    document.querySelector('#phase13QuestionModal')?.remove();
  }

  function openQuestionReport(question) {
    const modal = document.createElement('div');
    modal.id = 'phase13QuestionModal';
    modal.className = 'phase13-modal';
    modal.innerHTML = `<section class="phase13-modal-card"><span class="app-kicker">Fragenqualität</span><h2>Diese Frage melden</h2><div class="phase13-question-preview"><strong>Aktuelle Frage</strong><p>${esc(question.questionText)}</p></div><form id="phase13QuestionReportForm"><label>Was stimmt nicht?<select name="reportType"><option value="wrong-answer">Richtige Lösung stimmt nicht</option><option value="unclear">Frage oder Antworten sind unklar</option><option value="outdated">Inhalt ist veraltet</option><option value="duplicate">Frage ist doppelt</option><option value="typo">Tippfehler</option><option value="other">Sonstiges</option></select></label><label>Kurze Beschreibung<textarea name="comment" rows="4" required minlength="5" maxlength="1200"></textarea></label><div class="message" aria-live="polite"></div><div class="phase13-modal-actions"><button class="btn ghost" type="button" data-close>Abbrechen</button><button class="btn primary" type="submit">Frage senden</button></div></form></section>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = closeModal;
    modal.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const message = modal.querySelector('.message');
      try {
        await api('/api/platform/questions/report', {
          method: 'POST',
          body: JSON.stringify({
            questionId: question.questionId,
            questionText: question.questionText,
            quizType: question.quizType,
            category: question.category,
            reportType: form.get('reportType'),
            comment: form.get('comment'),
            pagePath: location.pathname,
            appVersion: '13.0.0',
          }),
        });
        message.textContent = 'Danke. Die Frage wurde zur Prüfung vorgemerkt.';
        setTimeout(closeModal, 1000);
      } catch (error) {
        message.textContent = error.message;
      }
    };
  }

  function ensureQuestionReportAction() {
    if (location.pathname.startsWith('/platform-admin') || location.pathname === '/legal' || location.pathname === '/progress') return;
    const question = questionContext();
    if (!question || question.stage.querySelector('.phase12-question-report-action')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ghost small phase12-question-report-action';
    button.textContent = 'Diese Frage melden';
    button.onclick = () => openQuestionReport(questionContext() || question);
    question.stage.appendChild(button);
  }

  async function ensureConsent() {
    try {
      const consent = await api('/api/platform/legal/consent');
      if (consent.valid || document.querySelector('#phase13ConsentModal')) return;
      const modal = document.createElement('div');
      modal.id = 'phase13ConsentModal';
      modal.className = 'phase13-modal';
      modal.innerHTML = `<section class="phase13-modal-card"><span class="app-kicker">QuizTime 13</span><h2>Datenschutz und Nutzung bestätigen</h2><p>Bitte wähle nur die Altersgruppe. Ein vollständiges Geburtsdatum wird nicht gespeichert.</p><form><label>Altersgruppe<select name="ageGroup" required><option value="">Bitte wählen</option><option value="16plus">Ich bin mindestens 16 Jahre alt</option><option value="under16">Ich bin unter 16 Jahre alt</option></select></label><label id="guardianField" class="hidden">E-Mail einer erziehungsberechtigten Person<input name="guardianEmail" type="email" autocomplete="email"></label><label class="row"><input name="accepted" type="checkbox" required><span>Ich bestätige die <a href="/legal#datenschutz" target="_blank">Datenschutzerklärung</a> und <a href="/legal#nutzung" target="_blank">Nutzungsbedingungen</a>.</span></label><div class="message"></div><button class="btn primary wide-button" type="submit">Bestätigen</button></form></section>`;
      document.body.appendChild(modal);
      const form = modal.querySelector('form');
      const select = form.elements.ageGroup;
      select.onchange = () => {
        const under = select.value === 'under16';
        modal.querySelector('#guardianField').classList.toggle('hidden', !under);
        form.elements.guardianEmail.required = under;
      };
      form.onsubmit = async event => {
        event.preventDefault();
        const message = form.querySelector('.message');
        try {
          const result = await api('/api/platform/legal/consent', {
            method: 'POST',
            body: JSON.stringify({
              ageGroup: select.value,
              guardianEmail: form.elements.guardianEmail.value,
              accepted: form.elements.accepted.checked,
            }),
          });
          if (result.valid) modal.remove();
          else {
            message.textContent = 'Die Bestätigungs-E-Mail wurde versendet. Bis zur Freigabe bleiben Community und Wettbewerbe gesperrt.';
            form.querySelector('button').disabled = true;
          }
        } catch (error) {
          message.textContent = error.message;
        }
      };
    } catch (error) {
      if (![401, 403].includes(error.status)) console.warn('Rechtsstatus konnte nicht geladen werden:', error.message);
    }
  }

  addFooter();
  ensureConsent();
  ensureQuestionReportAction();
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensureQuestionReportAction();
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
