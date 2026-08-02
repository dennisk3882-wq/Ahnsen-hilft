'use strict';

(() => {
  if (window.__quiztimeAnswerIntegrityInstalled) return;
  window.__quiztimeAnswerIntegrityInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  let questionShownAt = performance.now();
  let questionSignature = '';

  function currentQuestionSignature() {
    const question = document.querySelector('.solo-question-title h2, .event-question h2, .online-question h2, .question-card h2, [data-question-text]');
    return String(question?.textContent || location.pathname).trim().slice(0, 180);
  }

  function refreshQuestionClock() {
    const signature = currentQuestionSignature();
    const hasEnabledAnswers = document.querySelector('[data-answer]:not([disabled]), [data-event-answer]:not([disabled]), .answer-btn:not([disabled])');
    if (hasEnabledAnswers && signature && signature !== questionSignature) {
      questionSignature = signature;
      questionShownAt = performance.now();
    }
  }

  const observer = new MutationObserver(refreshQuestionClock);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
  queueMicrotask(refreshQuestionClock);

  function answerRequest(url, options) {
    if (String(options?.method || 'GET').toUpperCase() !== 'POST') return false;
    return /\/answer(?:\?|$)/u.test(String(url || ''));
  }

  window.fetch = async function quizTimeIntegrityFetch(input, options = {}) {
    const url = typeof input === 'string' ? input : input?.url;
    if (!answerRequest(url, options) || typeof options.body !== 'string') return nativeFetch(input, options);
    try {
      const body = JSON.parse(options.body || '{}');
      body.clientEventId ||= crypto.randomUUID();
      body.responseMs ??= Math.max(0, Math.round(performance.now() - questionShownAt));
      body.questionKey ||= currentQuestionSignature();
      return nativeFetch(input, { ...options, body: JSON.stringify(body) });
    } catch {
      return nativeFetch(input, options);
    }
  };
})();
