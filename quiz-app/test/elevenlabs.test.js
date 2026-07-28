'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildSpeechText, _test } = require('../elevenlabs');

const question = {
  id: 'test-1',
  text: 'Welches Tier ist das größte Landtier?',
  options: ['Elefant', 'Pferd', 'Löwe', 'Nashorn'],
};

assert.strictEqual(buildSpeechText(question, 'question'), 'Frage. Welches Tier ist das größte Landtier?');
const fullText = buildSpeechText(question, 'all');
assert(fullText.includes('Antwort A. Elefant.'));
assert(fullText.includes('Antwort D. Nashorn.'));
assert(buildSpeechText(question, 'feedback-correct').includes('richtige Antwort'));
assert(buildSpeechText(question, 'feedback-wrong').includes('leider falsch'));
assert(buildSpeechText(question, 'feedback-timeout').includes('Zeit'));

assert(_test.isVoiceReadPermissionError('The API key you used is missing the permission voices_read to execute this operation.'));
assert.strictEqual(_test.normalizeScope('feedback-correct'), 'feedback-correct');
assert.strictEqual(_test.normalizeScope('anything-else'), 'all');

const germanEducational = _test.voiceScore({
  voice_id: 'de',
  name: 'Freundliche Lehrerin',
  category: 'professional',
  labels: { language: 'German', use_case: 'educational' },
  verified_languages: [{ language: 'de', locale: 'de-DE' }],
});
const generic = _test.voiceScore({ voice_id: 'generic', name: 'Generic', labels: {} });
assert(germanEducational > generic, 'Eine deutsche Lernstimme muss bevorzugt werden.');

const feedbackKeyA = _test.cacheKey({ question, scope: 'feedback-correct', quizType: 'child', voiceId: 'voice-1' });
const feedbackKeyB = _test.cacheKey({ question: { ...question, id: 'other', text: 'Andere Frage?' }, scope: 'feedback-correct', quizType: 'child', voiceId: 'voice-1' });
assert.strictEqual(feedbackKeyA, feedbackKeyB, 'Festes Antwort-Feedback soll nur einmal pro Stimme erzeugt werden.');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'solo.html'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'elevenlabs-speech.js'), 'utf8');
assert(html.includes('/elevenlabs-speech.js'));
assert(html.includes('/elevenlabs-speech.css'));
assert(client.includes('window.speakQuestion = elevenLabsSpeak'));
assert(client.includes('speakAnswerFeedback'));
assert(client.includes('feedback-correct'));
assert(client.includes('/api/solo/speech'));
assert(client.includes('caches.open(CACHE_NAME)'));
assert(client.includes('Standardstimme aktiv'));

console.log('ElevenLabs speech tests passed.');