'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let state = null;

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Anfrage fehlgeschlagen.'), { status: response.status });
    return data;
  }

  function render() {
    if (!state) return;
    $('#welcomePercent').textContent = `${state.progress} %`;
    $('.welcome-progress-ring').style.setProperty('--progress', `${state.progress}%`);
    $('#welcomeProgressLabel').textContent = `${state.completedCount} von ${state.total} Schritten`;
    $('#welcomeProgressText').textContent = state.complete ? 'Einführung abgeschlossen – stark gemacht!' : 'Jeder erledigte Schritt wird automatisch gespeichert.';
    $('#welcomeProgressBar').style.width = `${state.progress}%`;
    $('#welcomeSteps').innerHTML = state.steps.map((step, index) => `
      <article class="welcome-step ${step.completed ? 'completed' : ''}">
        <div class="welcome-step-number">${step.completed ? '✓' : index + 1}</div>
        <div><span class="welcome-status ${step.completed ? 'done' : ''}">${step.completed ? 'Erledigt' : 'Noch offen'}</span><h2>${esc(step.title)}</h2><p>${esc(step.text)}</p></div>
        <a class="btn ${step.completed ? 'ghost' : 'secondary'} small" href="${esc(step.href)}" data-step-link="${esc(step.key)}">${step.completed ? 'Noch einmal öffnen' : 'Jetzt erledigen'}</a>
      </article>`).join('');
    const rewardButton = $('#claimWelcomeReward');
    rewardButton.disabled = !state.complete || state.rewardClaimed;
    rewardButton.textContent = state.rewardClaimed ? 'Belohnung abgeholt ✓' : 'Belohnung abholen';
    document.querySelectorAll('[data-step-link]').forEach(link => link.addEventListener('click', () => {
      if (link.dataset.stepLink === 'arena') navigator.sendBeacon?.('/api/platform/phase11/telemetry/page', new Blob([JSON.stringify({ page: 'arena' })], { type: 'application/json' }));
    }));
  }

  async function load() {
    try {
      state = await api('/api/platform/phase11/onboarding');
      $('#welcomeLoading').classList.add('hidden');
      $('#welcomeApp').classList.remove('hidden');
      render();
    } catch (error) {
      $('#welcomeLoading').classList.add('hidden');
      if (error.status === 401) $('#welcomeLogin').classList.remove('hidden');
      else {
        $('#welcomeLogin').classList.remove('hidden');
        $('#welcomeLogin').querySelector('p').textContent = error.message;
      }
    }
  }

  $('#claimWelcomeReward').addEventListener('click', async () => {
    const button = $('#claimWelcomeReward');
    button.disabled = true;
    try {
      state = await api('/api/platform/phase11/onboarding/reward', { method: 'POST', body: '{}' });
      $('#welcomeMessage').textContent = 'Belohnung gutgeschrieben: 500 XP, 100 Saisonpunkte und das Abzeichen „QuizTime bereit“.';
      render();
    } catch (error) {
      $('#welcomeMessage').textContent = error.message;
      $('#welcomeMessage').className = 'message bad-text';
      button.disabled = false;
    }
  });

  $('#dismissWelcome').addEventListener('click', async () => {
    try {
      await api('/api/platform/phase11/onboarding/dismiss', { method: 'POST', body: JSON.stringify({ dismissed: true }) });
      location.href = '/';
    } catch (error) {
      $('#welcomeMessage').textContent = error.message;
    }
  });

  load();
})();
