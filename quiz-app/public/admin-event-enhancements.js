'use strict';

(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let pending = false;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
    return data;
  }

  function enhanceCards() {
    document.querySelectorAll('#adminOfficialEvents [data-event-edit]').forEach(edit => {
      const actions = edit.parentElement;
      if (!actions || actions.querySelector(`[data-event-duplicate="${CSS.escape(edit.dataset.eventEdit)}"]`)) return;
      actions.insertAdjacentHTML('beforeend', `<button class="btn ghost small" data-event-duplicate="${esc(edit.dataset.eventEdit)}" type="button">Duplizieren</button><button class="btn ghost small" data-event-toggle-publication="${esc(edit.dataset.eventEdit)}" type="button">Entwurf/Veröffentlicht</button>`);
    });
  }

  function enhanceForm() {
    const form = document.querySelector('#officialEventForm');
    if (!form || form.querySelector('#previewOfficialEvent')) return;
    const submit = form.querySelector('button[type="submit"]');
    const preview = document.createElement('button');
    preview.id = 'previewOfficialEvent';
    preview.className = 'btn secondary wide-button';
    preview.type = 'button';
    preview.textContent = 'Eventvorschau prüfen';
    submit.before(preview);
    preview.onclick = async () => {
      const payload = {
        title: document.querySelector('#eventAdminTitle')?.value,
        quizType: document.querySelector('#eventAdminQuizType')?.value,
        category: document.querySelector('#eventAdminCategory')?.value,
        questionCount: Number(document.querySelector('#eventAdminQuestionCount')?.value),
      };
      try {
        const data = await api('/api/platform/admin/stability/events/preview', { method: 'POST', body: JSON.stringify(payload) });
        const p = data.preview;
        alert(`${p.title}\n${p.quizType} · ${p.category}\n${p.questionCount} von ${p.availableQuestions} verfügbaren Fragen\n\n${p.sampleQuestions.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}`);
      } catch (error) { alert(error.message); }
    };
  }

  document.addEventListener('click', async event => {
    const duplicate = event.target.closest('[data-event-duplicate]');
    const publication = event.target.closest('[data-event-toggle-publication]');
    if (!duplicate && !publication) return;
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    pending = true;
    try {
      if (duplicate) {
        const data = await api(`/api/platform/admin/stability/events/${duplicate.dataset.eventDuplicate}/duplicate`, { method: 'POST', body: '{}' });
        alert(`Entwurf „${data.event.title}“ wurde erstellt.`);
      }
      if (publication) {
        const publish = confirm('OK = veröffentlichen und aktivieren. Abbrechen = als Entwurf deaktivieren.');
        const data = await api(`/api/platform/admin/stability/events/${publication.dataset.eventTogglePublication}/publication`, { method: 'PATCH', body: JSON.stringify({ published: publish }) });
        alert(data.event.publication_status === 'published' ? 'Event ist veröffentlicht.' : 'Event wurde als Entwurf gespeichert.');
      }
      document.dispatchEvent(new CustomEvent('quiztime-admin-refresh'));
    } catch (error) { alert(error.message); }
    finally { pending = false; }
  }, true);

  new MutationObserver(() => { enhanceCards(); enhanceForm(); }).observe(document.documentElement, { childList: true, subtree: true });
  enhanceCards();
  enhanceForm();
})();
