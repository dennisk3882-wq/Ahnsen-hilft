'use strict';

(() => {
  let activeQuizType = localStorage.getItem('ahnsen_wrong_practice_type') === 'adult' ? 'adult' : 'child';
  let starting = false;
  const originalRenderState = renderState;

  renderState = nextState => {
    if (nextState?.practiceWrong) {
      activeQuizType = nextState.quizType === 'adult' ? 'adult' : 'child';
      localStorage.setItem('ahnsen_wrong_practice_type', activeQuizType);
      settings.quizType = activeQuizType;
      settings.category = 'Gemischt';
      settings.mode = 'relaxed';
      settings.questionCount = 10;
      persistSettings();
    }
    return originalRenderState(nextState);
  };

  async function requestStart(quizType) {
    const response = await fetch('/api/solo/practice/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizType, questionCount: 10 }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Das Fehlertraining konnte nicht gestartet werden.');
    return data;
  }

  async function startWrongAnswerPractice(quizType = 'child') {
    if (starting) return;
    starting = true;
    activeQuizType = quizType === 'adult' ? 'adult' : 'child';
    localStorage.setItem('ahnsen_wrong_practice_type', activeQuizType);
    const message = document.querySelector('#setupMessage');
    if (message) message.textContent = 'Fehlertraining wird vorbereitet …';
    try {
      const practiceState = await requestStart(activeQuizType);
      recordStoredForSession = '';
      renderState(practiceState);
      if (message) message.textContent = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (message) message.textContent = error.message;
      else alert(error.message);
    } finally {
      starting = false;
    }
  }

  document.addEventListener('click', event => {
    const playAgain = event.target.closest('#playAgainButton');
    if (!playAgain || !state?.practiceWrong) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startWrongAnswerPractice(activeQuizType);
  }, true);

  window.startWrongAnswerPractice = startWrongAnswerPractice;
})();
