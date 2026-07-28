'use strict';

(() => {
  const STORAGE_KEY = 'ahnsen_elevenlabs_speech';
  const CACHE_NAME = 'ahnsen-elevenlabs-audio-v2';
  const preferences = loadPreferences();
  let speechConfig = null;
  let currentAudio = null;
  let currentObjectUrl = '';
  let loading = false;
  let lastFeedbackSignature = '';
  let feedbackTimer = null;

  function loadPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        voiceId: String(saved.voiceId || ''),
        scope: saved.scope === 'question' ? 'question' : 'all',
      };
    } catch {
      return { voiceId: '', scope: 'all' };
    }
  }

  function savePreferences() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }

  function getQuizType() {
    return document.querySelector('[data-quiz-type].active')?.dataset.quizType === 'adult' ? 'adult' : 'child';
  }

  function getRenderedQuestion() {
    const card = document.querySelector('.solo-question-card');
    const questionText = card?.querySelector('.solo-question-title h2')?.textContent?.trim();
    const options = [...(card?.querySelectorAll('.answer-text') || [])].map(node => node.textContent.trim());
    if (!questionText || options.length !== 4) return null;
    return { questionText, options, quizType: getQuizType() };
  }

  function simpleHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function cacheRequest(payload) {
    const signature = simpleHash(JSON.stringify({ ...payload, modelId: speechConfig?.modelId || '' }));
    return new Request(`${location.origin}/__speech_cache__/${signature}`);
  }

  function stopSpeech() {
    window.speechSynthesis?.cancel();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = '';
    }
    updateButtons(false);
  }

  function updateButtons(isPlaying, message = '') {
    const speakButton = document.querySelector('#speakButton');
    const stopButton = document.querySelector('#stopSpeechButton');
    const inlineButtons = document.querySelectorAll('[data-speak]');
    if (speakButton) {
      speakButton.disabled = loading;
      speakButton.textContent = loading ? '⏳ Stimme lädt …' : isPlaying ? '🔊 Wird vorgelesen' : '🔊 Vorlesen';
    }
    if (stopButton) stopButton.disabled = !isPlaying && !loading;
    inlineButtons.forEach(button => {
      button.disabled = loading;
      button.textContent = loading ? '⏳' : '🔊';
      button.title = message || 'Mit ElevenLabs vorlesen';
    });
  }

  function fallbackText(question, scope) {
    if (scope === 'feedback-correct') return 'Super, das ist die richtige Antwort!';
    if (scope === 'feedback-wrong') return 'Schade, leider falsch. Bei der nächsten Frage klappt es bestimmt!';
    if (scope === 'feedback-timeout') return 'Schade, die Zeit ist leider abgelaufen.';
    const letters = ['A', 'B', 'C', 'D'];
    return scope === 'question'
      ? `Frage. ${question.questionText}`
      : `Frage. ${question.questionText}. ${question.options.map((option, index) => `Antwort ${letters[index]}. ${option}`).join('. ')}`;
  }

  function browserFallback(question, reason = '', scope = preferences.scope) {
    if (!question || !('speechSynthesis' in window)) return;
    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(fallbackText(question, scope));
    utterance.lang = 'de-DE';
    utterance.rate = scope.startsWith('feedback-') ? 0.95 : question.quizType === 'child' ? 0.84 : 0.94;
    const voices = window.speechSynthesis.getVoices();
    const germanVoice = voices.find(voice => /^de/i.test(voice.lang));
    if (germanVoice) utterance.voice = germanVoice;
    utterance.onstart = () => updateButtons(true, reason || 'Browser-Ersatzstimme');
    utterance.onend = () => updateButtons(false);
    utterance.onerror = () => updateButtons(false);
    window.speechSynthesis.speak(utterance);
  }

  async function getCachedAudio(payload) {
    if (!('caches' in window)) return null;
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(cacheRequest(payload));
      return response?.ok ? response.blob() : null;
    } catch {
      return null;
    }
  }

  async function cacheAudio(payload, response) {
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheRequest(payload), response);
    } catch {
      // Caching ist nur eine Kosten- und Komfortoptimierung.
    }
  }

  async function requestAudio(payload) {
    const cachedBlob = await getCachedAudio(payload);
    if (cachedBlob) return cachedBlob;

    const response = await fetch('/api/solo/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Die natürliche Stimme konnte nicht geladen werden.');
    }
    const clone = response.clone();
    await cacheAudio(payload, clone);
    return response.blob();
  }

  async function playElevenLabs(payload, question, { quietFallback = false } = {}) {
    if (!question || loading) return;
    if (!speechConfig?.enabled) {
      browserFallback(question, speechConfig?.error || 'ElevenLabs ist nicht verfügbar.', payload.scope);
      return;
    }

    loading = true;
    stopSpeech();
    updateButtons(false);
    try {
      const blob = await requestAudio(payload);
      currentObjectUrl = URL.createObjectURL(blob);
      currentAudio = new Audio(currentObjectUrl);
      currentAudio.preload = 'auto';
      currentAudio.onplay = () => updateButtons(true);
      currentAudio.onended = stopSpeech;
      currentAudio.onerror = () => {
        stopSpeech();
        browserFallback(question, 'Audiodatei konnte nicht abgespielt werden.', payload.scope);
      };
      await currentAudio.play();
    } catch (error) {
      stopSpeech();
      browserFallback(question, error.message, payload.scope);
      if (!quietFallback) showStatus(`ElevenLabs nicht verfügbar – Browserstimme wird verwendet. ${error.message}`, 'warning');
    } finally {
      loading = false;
      if (!currentAudio || currentAudio.paused) updateButtons(false);
    }
  }

  async function elevenLabsSpeak() {
    const question = getRenderedQuestion();
    if (!question || loading) return;
    if (currentAudio && !currentAudio.paused) {
      stopSpeech();
      return;
    }
    const payload = {
      ...question,
      scope: preferences.scope,
      voiceId: preferences.voiceId || speechConfig?.defaultVoiceId,
    };
    await playElevenLabs(payload, question);
  }

  async function speakAnswerFeedback(scope) {
    const question = getRenderedQuestion();
    if (!question || !scope.startsWith('feedback-')) return;
    const payload = {
      ...question,
      scope,
      voiceId: preferences.voiceId || speechConfig?.defaultVoiceId,
    };
    await playElevenLabs(payload, question, { quietFallback: true });
  }

  function showStatus(text, type = '') {
    const status = document.querySelector('#elevenLabsStatus');
    if (!status) return;
    status.textContent = text;
    status.className = `elevenlabs-status ${type}`;
  }

  function renderVoiceOptions() {
    const select = document.querySelector('#elevenLabsVoiceSelect');
    if (!select) return;
    const voices = speechConfig?.voices || [];
    if (!preferences.voiceId || !voices.some(voice => voice.id === preferences.voiceId)) {
      preferences.voiceId = speechConfig?.defaultVoiceId || voices[0]?.id || '';
      savePreferences();
    }
    select.innerHTML = voices.length
      ? voices.map(voice => `<option value="${escapeAttribute(voice.id)}" ${voice.id === preferences.voiceId ? 'selected' : ''}>${escapeHtml(voice.name)}${voice.accent ? ` – ${escapeHtml(voice.accent)}` : ''}</option>`).join('')
      : '<option value="">Browser-Ersatzstimme</option>';
    select.disabled = !speechConfig?.enabled || !voices.length || speechConfig?.voiceSelectionAvailable === false;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function installControls() {
    const speechToggle = document.querySelector('.solo-toggle');
    if (speechToggle && !document.querySelector('#elevenLabsControls')) {
      const controls = document.createElement('div');
      controls.id = 'elevenLabsControls';
      controls.className = 'elevenlabs-controls';
      controls.innerHTML = `
        <div class="elevenlabs-heading"><div><strong>Natürliche ElevenLabs-Stimme</strong><small>Fragen und Antwort-Feedback werden auf dem Server vertont; dein API-Key bleibt verborgen.</small></div><span class="elevenlabs-badge">AI Voice</span></div>
        <label>Stimme<select id="elevenLabsVoiceSelect"><option>Stimmen werden geladen …</option></select></label>
        <div class="elevenlabs-scope" role="radiogroup" aria-label="Vorleseumfang">
          <button type="button" data-speech-scope="question">Nur Frage</button>
          <button type="button" data-speech-scope="all">Frage und Antworten</button>
        </div>
        <p class="muted" style="margin:0;font-size:.82rem">Nach einer Antwort hörst du automatisch „richtig“, „falsch“ oder „Zeit abgelaufen“, solange automatisches Vorlesen aktiviert ist.</p>
        <div id="elevenLabsStatus" class="elevenlabs-status">Verbindung zu ElevenLabs wird geprüft …</div>`;
      speechToggle.insertAdjacentElement('afterend', controls);

      document.querySelector('#elevenLabsVoiceSelect').addEventListener('change', event => {
        preferences.voiceId = event.target.value;
        savePreferences();
        stopSpeech();
      });
      controls.querySelectorAll('[data-speech-scope]').forEach(button => button.addEventListener('click', () => {
        preferences.scope = button.dataset.speechScope;
        savePreferences();
        updateScopeButtons();
        stopSpeech();
      }));
    }

    const speakButton = document.querySelector('#speakButton');
    if (speakButton && !document.querySelector('#stopSpeechButton')) {
      const stopButton = document.createElement('button');
      stopButton.id = 'stopSpeechButton';
      stopButton.className = 'btn ghost small';
      stopButton.type = 'button';
      stopButton.textContent = '⏹ Stoppen';
      stopButton.disabled = true;
      stopButton.addEventListener('click', stopSpeech);
      speakButton.insertAdjacentElement('afterend', stopButton);
    }
    updateScopeButtons();
  }

  function updateScopeButtons() {
    document.querySelectorAll('[data-speech-scope]').forEach(button => {
      const active = button.dataset.speechScope === preferences.scope;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function feedbackScopeFromDom() {
    const feedback = document.querySelector('.solo-question-card .answer-feedback');
    if (!feedback) return null;
    if (/Zeit ist abgelaufen/i.test(feedback.textContent || '')) return 'feedback-timeout';
    if (feedback.classList.contains('success')) return 'feedback-correct';
    if (feedback.classList.contains('error')) return 'feedback-wrong';
    return null;
  }

  function detectAndSpeakFeedback() {
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      const speechEnabled = document.querySelector('#speechToggle')?.checked !== false;
      const scope = feedbackScopeFromDom();
      const question = getRenderedQuestion();
      if (!speechEnabled || !scope || !question) return;
      const sessionId = localStorage.getItem('ahnsen_solo_session') || '';
      const signature = `${sessionId}:${question.questionText}:${scope}`;
      if (signature === lastFeedbackSignature) return;
      lastFeedbackSignature = signature;
      speakAnswerFeedback(scope);
    }, 180);
  }

  async function loadConfig() {
    installControls();
    try {
      const response = await fetch('/api/solo/speech/config');
      const data = await response.json().catch(() => ({}));
      speechConfig = data;
      renderVoiceOptions();
      if (data.enabled) {
        if (data.warning) {
          showStatus(`Bereit, mit Hinweis: ${data.warning}`, 'warning');
        } else if (data.voiceSelectionAvailable === false) {
          showStatus('ElevenLabs ist bereit · Standardstimme aktiv. Weitere Stimmen erscheinen nach Freigabe von voices_read.', 'success');
        } else {
          showStatus(`ElevenLabs ist bereit · Modell ${data.modelId}`, 'success');
        }
      } else {
        showStatus(`ElevenLabs ist nicht aktiv. ${data.error || ''} Die Browserstimme bleibt als Ersatz verfügbar.`, 'warning');
      }
    } catch (error) {
      speechConfig = { enabled: false, error: error.message, voices: [] };
      renderVoiceOptions();
      showStatus(`ElevenLabs konnte nicht erreicht werden. ${error.message}`, 'warning');
    }
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-answer], #nextSoloButton, #playAgainButton, #newSettingsButton, #startSoloButton')) stopSpeech();
  }, true);
  window.addEventListener('beforeunload', stopSpeech);

  const stage = document.querySelector('#soloStage');
  if (stage && 'MutationObserver' in window) {
    new MutationObserver(detectAndSpeakFeedback).observe(stage, { childList: true, subtree: true });
  }

  window.speakQuestion = elevenLabsSpeak;
  window.speakAnswerFeedback = speakAnswerFeedback;
  loadConfig();
})();