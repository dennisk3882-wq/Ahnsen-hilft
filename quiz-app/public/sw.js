'use strict';

const CACHE_NAME = 'ahnsen-quiz-phase4-v2';
const STATIC_ASSETS = [
  '/',
  '/solo',
  '/offline',
  '/online',
  '/styles.css',
  '/start.css',
  '/solo.css',
  '/solo-app.css',
  '/solo-exit.css',
  '/solo-profiles.css',
  '/profile-phase2.css',
  '/profile-phase2-extras.css',
  '/elevenlabs-speech.css',
  '/offline.css',
  '/online.css',
  '/app.css',
  '/app.js',
  '/player.js',
  '/solo.js',
  '/wrong-practice.js',
  '/solo-exit.js',
  '/solo-profiles.js',
  '/elevenlabs-speech.js',
  '/offline.js',
  '/online.js',
  '/manifest.webmanifest',
  '/icons/ahnsen-quiz.svg',
  '/icons/ahnsen-quiz-maskable.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});