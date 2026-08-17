const CACHE = 'buergermeister-1992-plus-v16';
const ASSETS = ["./","index.html","styles.css","modern-theme.css","game-engine.js","app.js","manifest.webmanifest","icons/icon.svg","icons/icon-192.png","icons/icon-512.png","assets/stage-kuhdorf.svg","assets/stage-dorf.svg","assets/stage-grosses-dorf.svg","assets/stage-kleinstadt.svg","assets/stage-stadt.svg","assets/stage-grossstadt.svg","assets/stage-moderne-stadt.svg","assets/stage-metropole.svg"];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => hit || caches.match('./')))
  );
});
