'use strict';

const crypto = require('crypto');
const storage = require('./extended-storage');
const { enrichQuestion } = require('./question-explanations');

const API_BASE = 'https://api.elevenlabs.io';
const API_KEY = String(process.env.ELEVENLABS_API_KEY || '').trim();
const MODEL_ID = String(process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2').trim();
const CONFIGURED_VOICE_ID = String(process.env.ELEVENLABS_VOICE_ID || '').trim();
const FALLBACK_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const VOICE_CACHE_MS = 60 * 60 * 1000;
const AUDIO_CACHE_MAX_ITEMS = 100;
const AUDIO_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const GENERATION_LIMIT_PER_HOUR = 60;

const FEEDBACK = {
  correct: [
    'Super, das ist die richtige Antwort!',
    'Klasse gemacht, genau richtig!',
    'Stark, das hast du gewusst!',
    'Perfekt, weiter so!',
    'Richtig! Das war eine tolle Antwort.',
    'Sehr gut, du liegst genau richtig!',
  ],
  wrong: [
    'Schade, diesmal war es leider falsch.',
    'Fast! Bei der nächsten Frage klappt es bestimmt.',
    'Das war knifflig. Leider war die Antwort falsch.',
    'Nicht schlimm, jetzt kennst du die richtige Lösung.',
    'Leider falsch, aber jede Frage macht dich schlauer.',
    'Diesmal hat es nicht geklappt. Weiter geht es!',
  ],
  timeout: [
    'Schade, die Zeit ist leider abgelaufen.',
    'Die Zeit ist um. Bei der nächsten Frage bist du wieder dran.',
    'Diesmal war die Zeit zu knapp. Nicht schlimm!',
  ],
};

let voiceCache = {
  expiresAt: 0,
  voices: [],
  defaultVoiceId: CONFIGURED_VOICE_ID || FALLBACK_VOICE_ID,
  error: null,
  voiceSelectionAvailable: true,
};
const audioCache = new Map();
let audioCacheBytes = 0;
const generationBuckets = new Map();
const inFlight = new Map();

function safeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function voiceScore(voice) {
  const labels = Object.values(voice.labels || {}).join(' ').toLowerCase();
  const description = `${voice.description || ''} ${voice.name || ''}`.toLowerCase();
  const verified = Array.isArray(voice.verified_languages) ? voice.verified_languages : [];
  let score = 0;
  if (verified.some(item => /^de(?:-|$)/i.test(item.locale || '') || /^deu?$|german|deutsch$/i.test(item.language || ''))) score += 100;
  if (/german|deutsch|de-de|deu/.test(labels)) score += 70;
  if (/educational|education|instructor|teacher|narrat|story|warm|friendly|clear|guide/.test(`${labels} ${description}`)) score += 25;
  if (voice.category === 'professional') score += 15;
  if (voice.is_owner) score += 10;
  if (voice.voice_id === CONFIGURED_VOICE_ID) score += 1000;
  return score;
}

function publicVoice(voice) {
  return {
    id: voice.voice_id,
    name: voice.name || 'ElevenLabs-Stimme',
    description: safeText(voice.description || voice.labels?.description || '').slice(0, 140),
    gender: safeText(voice.labels?.gender || ''),
    accent: safeText(voice.labels?.accent || ''),
    category: safeText(voice.labels?.use_case || voice.category || ''),
    previewUrl: voice.preview_url || null,
  };
}

async function readError(response) {
  const body = await response.json().catch(() => null);
  return safeText(body?.detail?.message || body?.detail || body?.message || `HTTP ${response.status}`);
}

function isVoiceReadPermissionError(message) {
  return /voices_read|missing the permission[^.]*voices|permission[^.]*voices_read/i.test(String(message || ''));
}

function fallbackVoice() {
  return {
    id: CONFIGURED_VOICE_ID || FALLBACK_VOICE_ID,
    name: 'ElevenLabs-Standardstimme',
    description: 'Standardstimme für das Ahnsen Quiz',
    gender: '',
    accent: '',
    category: 'Quiz',
    previewUrl: null,
  };
}

async function fetchVoices() {
  if (!API_KEY) return { voices: [], defaultVoiceId: null, error: 'ELEVENLABS_API_KEY fehlt.', voiceSelectionAvailable: false };
  if (voiceCache.expiresAt > Date.now()) return voiceCache;

  try {
    const response = await fetch(`${API_BASE}/v2/voices?page_size=100&include_total_count=false`, {
      headers: { 'xi-api-key': API_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    const raw = Array.isArray(data.voices) ? data.voices : [];
    const voices = raw
      .filter(voice => voice?.voice_id)
      .sort((a, b) => voiceScore(b) - voiceScore(a) || String(a.name).localeCompare(String(b.name), 'de'))
      .slice(0, 30)
      .map(publicVoice);
    const defaultVoiceId = CONFIGURED_VOICE_ID || voices[0]?.id || FALLBACK_VOICE_ID;
    voiceCache = {
      expiresAt: Date.now() + VOICE_CACHE_MS,
      voices: voices.length ? voices : [fallbackVoice()],
      defaultVoiceId,
      error: null,
      voiceSelectionAvailable: voices.length > 1,
    };
  } catch (error) {
    const permissionLimited = isVoiceReadPermissionError(error.message);
    voiceCache = {
      expiresAt: Date.now() + (permissionLimited ? VOICE_CACHE_MS : 5 * 60 * 1000),
      voices: [fallbackVoice()],
      defaultVoiceId: CONFIGURED_VOICE_ID || FALLBACK_VOICE_ID,
      error: permissionLimited ? null : `Stimmenliste nicht verfügbar: ${error.message}`,
      voiceSelectionAvailable: false,
    };
  }
  return voiceCache;
}

function resultScope(scope) {
  const match = String(scope || '').match(/^result-(correct|wrong|timeout)-(\d+)$/);
  return match ? { type: match[1], index: Number(match[2]) } : null;
}

function normalizeScope(scope) {
  const value = String(scope || 'all');
  if (resultScope(value)) return value;
  return value === 'question' ? 'question' : 'all';
}

function feedbackPhrase(type, index) {
  const choices = FEEDBACK[type] || FEEDBACK.wrong;
  return choices[Math.abs(Number(index) || 0) % choices.length];
}

function buildSpeechText(rawQuestion, scope) {
  const question = enrichQuestion(rawQuestion);
  const normalizedScope = normalizeScope(scope);
  const result = resultScope(normalizedScope);
  if (result) {
    return `${feedbackPhrase(result.type, result.index)} Erklärung. ${safeText(question.explanation)}`;
  }

  const text = safeText(question.text);
  if (normalizedScope === 'question') return `Frage. ${text}`;
  const letters = ['A', 'B', 'C', 'D'];
  const answers = question.options.map((option, index) => `Antwort ${letters[index]}. ${safeText(option)}.`).join(' ');
  return `Frage. ${text}. ${answers}`;
}

function cacheKey({ question: rawQuestion, scope, quizType, voiceId }) {
  const question = enrichQuestion(rawQuestion);
  const normalizedScope = normalizeScope(scope);
  return crypto.createHash('sha256').update(JSON.stringify({
    id: question.id,
    text: question.text,
    options: question.options,
    explanation: resultScope(normalizedScope) ? question.explanation : undefined,
    scope: normalizedScope,
    quizType,
    voiceId,
    model: MODEL_ID,
  })).digest('hex');
}

function getCached(key) {
  const hit = audioCache.get(key);
  if (!hit) return null;
  audioCache.delete(key);
  audioCache.set(key, hit);
  return hit;
}

function putCached(key, buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return;
  if (audioCache.has(key)) {
    audioCacheBytes -= audioCache.get(key).length;
    audioCache.delete(key);
  }
  audioCache.set(key, buffer);
  audioCacheBytes += buffer.length;
  while (audioCache.size > AUDIO_CACHE_MAX_ITEMS || audioCacheBytes > AUDIO_CACHE_MAX_BYTES) {
    const oldestKey = audioCache.keys().next().value;
    if (!oldestKey) break;
    audioCacheBytes -= audioCache.get(oldestKey).length;
    audioCache.delete(oldestKey);
  }
}

function assertGenerationAllowed(ip) {
  const time = Date.now();
  const cutoff = time - 60 * 60 * 1000;
  const entries = (generationBuckets.get(ip) || []).filter(timestamp => timestamp > cutoff);
  if (entries.length >= GENERATION_LIMIT_PER_HOUR) {
    const error = new Error('Zu viele neue Sprachdateien in kurzer Zeit. Bitte später erneut versuchen.');
    error.statusCode = 429;
    throw error;
  }
  entries.push(time);
  generationBuckets.set(ip, entries);
}

async function synthesize({ question: rawQuestion, scope = 'all', quizType = 'child', voiceId, ip = 'unknown' }) {
  if (!API_KEY) {
    const error = new Error('Die ElevenLabs-Sprachausgabe ist auf dem Server nicht eingerichtet.');
    error.statusCode = 503;
    throw error;
  }

  const question = enrichQuestion(rawQuestion);
  const voices = await fetchVoices();
  const allowedIds = new Set(voices.voices.map(voice => voice.id));
  const selectedVoiceId = allowedIds.has(voiceId) ? voiceId : voices.defaultVoiceId || CONFIGURED_VOICE_ID || FALLBACK_VOICE_ID;
  const normalizedScope = normalizeScope(scope);
  const key = cacheKey({ question, scope: normalizedScope, quizType, voiceId: selectedVoiceId });
  const memoryCached = getCached(key);
  if (memoryCached) return { buffer: memoryCached, key, cache: 'MEMORY', voiceId: selectedVoiceId };
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    try {
      const durable = await storage.getSpeechAudio(key);
      if (durable?.length) {
        putCached(key, durable);
        return { buffer: durable, key, cache: 'DATABASE', voiceId: selectedVoiceId };
      }
    } catch (error) {
      console.warn('Dauerhafter Sprachcache konnte nicht gelesen werden:', error.message);
    }

    assertGenerationAllowed(ip);
    const response = await fetch(`${API_BASE}/v1/text-to-speech/${encodeURIComponent(selectedVoiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: buildSpeechText(question, normalizedScope),
        model_id: MODEL_ID,
        voice_settings: {
          stability: quizType === 'child' ? 0.72 : 0.64,
          similarity_boost: 0.78,
          style: resultScope(normalizedScope) ? 0.16 : quizType === 'child' ? 0.08 : 0.12,
          use_speaker_boost: true,
          speed: resultScope(normalizedScope) ? 0.9 : quizType === 'child' ? 0.82 : 0.94,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const message = await readError(response);
      const error = new Error(`ElevenLabs konnte die Sprache nicht erzeugen: ${message}`);
      error.statusCode = response.status === 401 || response.status === 403 ? 503 : response.status;
      throw error;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error('ElevenLabs hat eine leere Audiodatei zurückgegeben.');
    putCached(key, buffer);
    storage.saveSpeechAudio({
      cacheKey: key,
      voiceId: selectedVoiceId,
      scope: normalizedScope,
      modelId: MODEL_ID,
      buffer,
    }).catch(error => console.warn('Sprachdatei konnte nicht dauerhaft gespeichert werden:', error.message));
    return { buffer, key, cache: 'GENERATED', voiceId: selectedVoiceId };
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

async function getPublicConfig() {
  if (!API_KEY) return {
    enabled: false,
    modelId: MODEL_ID,
    voices: [],
    defaultVoiceId: null,
    voiceSelectionAvailable: false,
    error: 'API-Key fehlt.',
    feedbackCounts: Object.fromEntries(Object.entries(FEEDBACK).map(([key, values]) => [key, values.length])),
  };
  const config = await fetchVoices();
  let persistentCache = { files: 0, bytes: 0 };
  try { persistentCache = await storage.speechCacheStats(); } catch { /* Anzeige bleibt optional */ }
  return {
    enabled: true,
    modelId: MODEL_ID,
    voices: config.voices,
    defaultVoiceId: config.defaultVoiceId,
    voiceSelectionAvailable: config.voiceSelectionAvailable,
    warning: config.error,
    feedbackCounts: Object.fromEntries(Object.entries(FEEDBACK).map(([key, values]) => [key, values.length])),
    persistentCache,
  };
}

module.exports = {
  getPublicConfig,
  synthesize,
  buildSpeechText,
  feedbackPhrase,
  _test: { cacheKey, voiceScore, isVoiceReadPermissionError, normalizeScope, resultScope },
};