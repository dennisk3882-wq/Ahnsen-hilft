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

const germanEducational = _test.voiceScore({
  voice_id: 'de',
  name: 'Freundliche Lehrerin',
  category: 'professional',
  labels: { language: 'German', use_case: 'educational' },
  verified_languages: [{ language: 'de', locale: 'de-DE' }],
});
const generic = _test.voiceScore({ voice_id: 'generic', name: 'Generic', labels: {} });
assert(germanEducational > generic, 'Eine deutsche Lernstimme muss bevorzugt werden.');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'solo.html'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'elevenlabs-speech.js'), 'utf8');
assert(html.includes('/elevenlabs-speech.js'));
assert(html.includes('/elevenlabs-speech.css'));
assert(client.includes("window.speakQuestion = elevenLabsSpeak"));
assert(client.includes("/api/solo/speech"));
assert(client.includes("caches.open(CACHE_NAME)"));

console.log('ElevenLabs speech tests passed.');
