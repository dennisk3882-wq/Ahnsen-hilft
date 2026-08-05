'use strict';

(() => {
  let lastQuestion = null;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const clone = response.clone();
      const type = clone.headers.get('content-type') || '';
      if (type.includes('application/json')) {
        const data = await clone.json();
        const question = data?.question || data?.state?.question || data?.room?.question;
        if (question?.id) lastQuestion = { id: question.id, category: question.category || '', text: question.text || '' };
      }
    } catch { /* Beobachtung ist optional */ }
    return response;
  };

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function close() { document.querySelector('#phase12FeedbackModal')?.remove(); }
  function open() {
    close();
    const modal = document.createElement('div');
    modal.id = 'phase12FeedbackModal';
    modal.className = 'app-modal';
    modal.innerHTML = `<section class="app-modal-card"><span class="app-kicker">Beta & Qualität</span><h2>Problem melden</h2><label>Art<select id="phase12Kind"><option value="problem">Technisches Problem</option><option value="question_feedback" ${lastQuestion?'selected':''}>Fehlerhafte Frage</option><option value="idea">Verbesserungsidee</option><option value="praise">Lob</option></select></label>${lastQuestion?`<div class="phase12-question-context"><strong>Aktuelle Frage</strong><span>${esc(lastQuestion.text)}</span></div>`:''}<label>Beschreibung<textarea id="phase12Message" rows="5" maxlength="2500" placeholder="Was ist passiert und was hättest du erwartet?"></textarea></label><div id="phase12FeedbackMessage" class="message"></div><div class="row"><button id="phase12Cancel" class="btn ghost" type="button">Abbrechen</button><button id="phase12Send" class="btn primary" type="button">Meldung senden</button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector('#phase12Cancel').onclick = close;
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.querySelector('#phase12Send').onclick = async () => {
      const kind = modal.querySelector('#phase12Kind').value;
      const message = modal.querySelector('#phase12Message').value.trim();
      const output = modal.querySelector('#phase12FeedbackMessage');
      try {
        let response;
        if (kind === 'question_feedback' && lastQuestion?.id) {
          response = await originalFetch('/api/platform/question-reports', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ questionId:lastQuestion.id, reason:'other', details:message, page:location.pathname }) });
        } else {
          response = await originalFetch('/api/platform/feedback', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ kind, message, page:location.pathname, viewport:`${innerWidth}x${innerHeight}` }) });
        }
        const data = await response.json().catch(()=>({}));
        if (!response.ok) throw new Error(data.error || 'Meldung konnte nicht gespeichert werden.');
        output.textContent = 'Danke. Deine Meldung wurde gespeichert.';
        setTimeout(close, 1200);
      } catch (error) { output.textContent = error.message; }
    };
  }
  function install() {
    if (document.querySelector('#phase12FeedbackButton')) return;
    const button = document.createElement('button');
    button.id = 'phase12FeedbackButton';
    button.type = 'button';
    button.className = 'phase12-feedback-button';
    button.textContent = '⚑ Problem melden';
    button.onclick = open;
    document.body.appendChild(button);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', install) : install();
})();
