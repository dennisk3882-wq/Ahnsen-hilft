'use strict';

(() => {
  const exitButton = document.querySelector('#exitSoloButton');
  const stage = document.querySelector('#soloStage');
  if (!exitButton || !stage) return;

  function quizIsFinished() {
    return Boolean(stage.querySelector('.solo-result-view'));
  }

  function updateButtonLabel() {
    exitButton.textContent = quizIsFinished() ? '← Zur Quiz-Auswahl' : '✕ Quiz beenden';
  }

  async function removeCurrentSession() {
    const sessionId = localStorage.getItem('ahnsen_solo_session');
    if (!sessionId) return;

    try {
      await fetch(`/api/solo/session/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // Die Oberfläche darf auch bei einer unterbrochenen Verbindung verlassen werden.
      // Serverseitig läuft die ungenutzte Sitzung nach spätestens zwei Stunden ab.
    }
  }

  exitButton.addEventListener('click', async () => {
    const finished = quizIsFinished();
    if (!finished) {
      const confirmed = window.confirm(
        'Möchtest du das Quiz wirklich beenden?\n\nDer bisherige Fortschritt dieser Runde wird verworfen.',
      );
      if (!confirmed) return;
    }

    exitButton.disabled = true;
    exitButton.textContent = 'Quiz wird beendet …';
    window.speechSynthesis?.cancel();

    await removeCurrentSession();
    localStorage.removeItem('ahnsen_solo_session');
    window.location.assign('/solo');
  });

  new MutationObserver(updateButtonLabel).observe(stage, { childList: true, subtree: true });
  updateButtonLabel();
})();
