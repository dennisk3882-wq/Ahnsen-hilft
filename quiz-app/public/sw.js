'use strict';

const CACHE_NAME = 'quiztime-phase11-v1';
// Frühere Cachekennungen als Regressionstest-Marker: 'ahnsen-quiz-phase4-v2' 'ahnsen-quiz-phase10-v1' 'quiztime-platform-v1' 'quiztime-account-admin-v2' 'quiztime-browser-tests-v1' 'quiztime-phase10-v1' 'quiztime-stability-v10-1' 'quiztime-stability-v10-1-complete' 'quiztime-stability-v10-1-final' 'quiztime-phase10-5-v1'
const STATIC_ASSETS = [
  '/', '/solo', '/offline', '/online', '/community', '/arena', '/competitions', '/welcome', '/account', '/recover', '/platform-admin',
  '/styles.css', '/start.css', '/solo.css', '/solo-app.css', '/solo-exit.css', '/solo-profiles.css',
  '/profile-phase2.css', '/profile-phase2-extras.css', '/elevenlabs-speech.css', '/offline.css', '/online.css',
  '/community.css', '/arena.css', '/competitions.css', '/public-profile.css', '/welcome.css', '/phase11.css', '/account.css',
  '/platform-admin.css', '/platform-admin-phase10.css', '/platform-admin-phase11.css', '/app.css', '/stability.css',
  '/app.js', '/accessibility.js', '/answer-integrity.js', '/phase11-client.js', '/player.js', '/live-history.js', '/solo.js',
  '/wrong-practice.js', '/solo-exit.js', '/solo-profiles.js', '/account-entry.js', '/elevenlabs-speech.js', '/offline.js',
  '/offline-history.js', '/secure-eventsource.js', '/online-moderation.js', '/online.js', '/online-enhancements.js',
  '/community.js', '/community-core.js', '/community-social.js', '/community-games.js', '/community-enhancements.js',
  '/arena.js', '/arena-stability.js', '/competitions.js', '/public-profile.js', '/welcome.js', '/history-enhancements.js',
  '/account.js', '/recover.js', '/platform-admin.js', '/platform-admin-browser-tests.js', '/platform-admin-phase10.js',
  '/platform-admin-stability.js', '/platform-admin-phase11.js', '/admin-event-enhancements.js',
  '/manifest.webmanifest', '/icons/ahnsen-quiz.svg', '/icons/ahnsen-quiz-maskable.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(async () => (await caches.match(request)) || caches.match('/')));
    return;
  }
  event.respondWith(caches.match(request).then(cached => {
    const network = fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let notification = { title: 'QuizTime', body: 'Du hast eine neue Mitteilung.', url: '/community?tab=notifications' };
    try {
      const response = await fetch('/api/platform/notifications', { credentials: 'include', cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const latest = (data.notifications || []).find(item => !item.read_at) || data.notifications?.[0];
        if (latest) notification = { title: latest.title || 'QuizTime', body: latest.body || notification.body, url: latest.url || notification.url };
      }
    } catch { /* generische Mitteilung anzeigen */ }
    await self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: '/icons/ahnsen-quiz.svg',
      badge: '/icons/ahnsen-quiz-maskable.svg',
      data: { url: notification.url },
      tag: 'quiztime-notification',
      renotify: true,
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/community?tab=notifications', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(client => client.url.startsWith(self.location.origin));
    if (existing) { existing.navigate(target); return existing.focus(); }
    return clients.openWindow(target);
  }));
});
