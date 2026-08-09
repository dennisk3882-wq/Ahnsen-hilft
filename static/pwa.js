if (typeof document === 'undefined') {
  const CACHE = 'ahnsen-hilft-public-v3';
  const CORE = [
    '/',
    '/pwa.css?v=1',
    '/pwa-extra.css?v=1',
    '/pwa/icon-192.png',
    '/pwa/icon-512.png',
    '/assets/ahnsen-startseite.png',
    '/manifest.webmanifest'
  ];
  const CACHEABLE = new Set([
    '/pwa.css',
    '/pwa-extra.css',
    '/pwa/icon-192.png',
    '/pwa/icon-512.png',
    '/assets/ahnsen-startseite.png',
    '/manifest.webmanifest'
  ]);

  self.addEventListener('install', event => {
    event.waitUntil(
      caches.open(CACHE)
        .then(cache => cache.addAll(CORE))
        .then(() => self.skipWaiting())
    );
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
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    if (CACHEABLE.has(url.pathname)) {
      event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy));
          }
          return response;
        }))
      );
      return;
    }

    if (event.request.mode === 'navigate') {
      event.respondWith(
        fetch(event.request).catch(() => caches.match('/'))
      );
    }
  });

  self.addEventListener('push', event => {
    let data = {
      title: document.querySelector('meta[name=\"application-name\"]')?.content || document.title.split(' · ').pop() || 'Bürgerplattform',
      body: 'Es gibt eine neue Information.',
      url: '/profil',
      tag: 'ahnsen-hilft'
    };
    try {
      if (event.data) data = { ...data, ...event.data.json() };
    } catch (_error) {}
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || '/pwa/icon-192.png',
        badge: data.badge || '/pwa/icon-192.png',
        tag: data.tag,
        data: { url: data.url || '/profil' }
      })
    );
  });

  self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : '/profil';
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        for (const client of list) {
          if ('focus' in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
      })
    );
  });
} else {
  (() => {
    const extraCss = document.createElement('link');
    extraCss.rel = 'stylesheet';
    extraCss.href = '/pwa-extra.css?v=1';
    document.head.appendChild(extraCss);

    const offlineBanner = document.getElementById('offline-banner');
    const updateNetworkState = () => {
      if (offlineBanner) offlineBanner.hidden = navigator.onLine;
    };
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);
    updateNetworkState();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/pwa.js?worker=3', { scope: '/' }).catch(() => {});
      });
    }

    const nav = document.querySelector('.bottom-nav');
    if (nav && !nav.querySelector('a[href="/profil"]')) {
      const profile = document.createElement('a');
      const active = ['/profil', '/anmelden', '/registrieren'].some(path => location.pathname.startsWith(path));
      profile.className = `bottom-link${active ? ' active profile-active' : ''}`;
      profile.href = '/profil';
      if (active) profile.setAttribute('aria-current', 'page');
      profile.innerHTML = '<span class="glyph" aria-hidden="true">●</span><small>Profil</small>';
      nav.appendChild(profile);
    }

    let installPrompt = null;
    const installButton = document.getElementById('install-app');
    if (installButton) {
      installButton.setAttribute('aria-label', `${document.title.split(' · ').pop() || 'Bürgerplattform'} installieren`);
      installButton.setAttribute('title', 'App installieren');
      installButton.innerHTML = `
        <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6.5" y="2.5" width="11" height="19" rx="2.5"></rect>
          <path d="M9.5 5.5h5"></path>
          <path d="M12 8v7"></path>
          <path d="m9.5 12.5 2.5 2.5 2.5-2.5"></path>
          <path d="M10.5 18.5h3"></path>
        </svg>
        <span>Installieren</span>
      `;
    }
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      installPrompt = event;
      if (installButton) installButton.hidden = false;
    });
    if (installButton) {
      installButton.addEventListener('click', async () => {
        if (!installPrompt) return;
        await installPrompt.prompt();
        installPrompt = null;
        installButton.hidden = true;
      });
    }

    const locationButton = document.getElementById('use-location');
    const locationStatus = document.getElementById('location-status');
    if (locationButton && locationStatus) {
      locationButton.addEventListener('click', () => {
        if (!navigator.geolocation) {
          locationStatus.textContent = 'Standortfunktion wird von diesem Gerät nicht unterstützt.';
          return;
        }
        locationButton.disabled = true;
        locationStatus.textContent = 'Standort wird ermittelt …';
        navigator.geolocation.getCurrentPosition(
          position => {
            const latitude = document.getElementById('latitude');
            const longitude = document.getElementById('longitude');
            if (latitude) latitude.value = position.coords.latitude.toFixed(6);
            if (longitude) longitude.value = position.coords.longitude.toFixed(6);
            locationStatus.textContent = 'Standort wurde hinzugefügt.';
            locationButton.disabled = false;
          },
          () => {
            locationStatus.textContent = 'Standort konnte nicht übernommen werden. Bitte den Ort manuell eintragen.';
            locationButton.disabled = false;
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      });
    }

    const photoInput = document.getElementById('foto');
    const preview = document.getElementById('photo-preview');
    if (photoInput && preview) {
      photoInput.addEventListener('change', () => {
        const file = photoInput.files && photoInput.files[0];
        if (!file) {
          preview.hidden = true;
          preview.removeAttribute('src');
          return;
        }
        if (file.size > 8 * 1024 * 1024) {
          window.alert('Das Foto darf höchstens 8 MB groß sein.');
          photoInput.value = '';
          preview.hidden = true;
          return;
        }
        const url = URL.createObjectURL(file);
        preview.src = url;
        preview.hidden = false;
        preview.onload = () => URL.revokeObjectURL(url);
      });
    }

    const pushStatus = document.getElementById('push-status');
    const enablePush = document.getElementById('enable-push');
    const disablePush = document.getElementById('disable-push');
    const setPushStatus = text => {
      if (pushStatus) pushStatus.textContent = text;
    };
    const urlBase64ToUint8Array = base64String => {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
    };

    if (enablePush) {
      enablePush.addEventListener('click', async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          setPushStatus('Dieses Gerät unterstützt keine Browser-Push-Nachrichten.');
          return;
        }
        try {
          enablePush.disabled = true;
          setPushStatus('Benachrichtigungen werden eingerichtet …');
          const keyResponse = await fetch('/api/push/public-key', { credentials: 'same-origin' });
          if (!keyResponse.ok) throw new Error('Push ist auf dem Server noch nicht eingerichtet.');
          const keyData = await keyResponse.json();
          const registration = await navigator.serviceWorker.ready;
          let subscription = await registration.pushManager.getSubscription();
          if (!subscription) {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
            });
          }
          const save = await fetch('/api/push/subscribe', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription.toJSON())
          });
          if (!save.ok) throw new Error('Die Anmeldung konnte nicht gespeichert werden.');
          setPushStatus('Push-Nachrichten sind auf diesem Gerät aktiv.');
        } catch (error) {
          setPushStatus(error.message || 'Push konnte nicht aktiviert werden.');
        } finally {
          enablePush.disabled = false;
        }
      });
    }

    if (disablePush) {
      disablePush.addEventListener('click', async () => {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          if (!subscription) {
            setPushStatus('Auf diesem Gerät ist Push bereits deaktiviert.');
            return;
          }
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint })
          });
          await subscription.unsubscribe();
          setPushStatus('Push wurde auf diesem Gerät deaktiviert.');
        } catch (_error) {
          setPushStatus('Push konnte auf diesem Gerät nicht deaktiviert werden.');
        }
      });
    }
  })();
}

// Hard guard for the message badge. /pwa.js is served with no-store by the
// production entrypoint, so this path does not depend on a cached community
// stylesheet or community script. A red badge is only rendered after the
// server has explicitly returned an unread count greater than zero.
if (typeof document !== 'undefined') {
  (() => {
    let badgeRequest = 0;

    const hideBadge = (link, badge) => {
      if (badge) {
        badge.textContent = '';
        badge.hidden = true;
        badge.style.setProperty('display', 'none', 'important');
      }
      if (link) link.removeAttribute('aria-label');
    };

    const refreshMessageBadge = async () => {
      const link = document.getElementById('message-center-link');
      if (!link) return;
      const badge = link.querySelector('.message-badge');
      const requestId = ++badgeRequest;

      hideBadge(link, badge);

      try {
        const response = await fetch(`/api/me/unread-count?_=${Date.now()}`, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store',
            'Pragma': 'no-cache'
          }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (requestId !== badgeRequest) return;

        const loggedIn = Boolean(data && data.loggedIn);
        const count = Math.max(0, Number(data && data.count) || 0);

        link.hidden = !loggedIn;
        if (loggedIn) {
          link.style.removeProperty('display');
          link.setAttribute('aria-label', count > 0 ? `Nachrichten, ${count} ungelesen` : 'Nachrichten');
        } else {
          link.style.setProperty('display', 'none', 'important');
          hideBadge(link, badge);
          return;
        }

        if (badge && count > 0) {
          badge.textContent = count > 99 ? '99+' : String(count);
          badge.hidden = false;
          badge.style.setProperty('display', 'grid', 'important');
        } else {
          hideBadge(link, badge);
          if (loggedIn) link.setAttribute('aria-label', 'Nachrichten');
        }
      } catch (_error) {
        if (requestId !== badgeRequest) return;
        hideBadge(link, badge);
      }
    };

    const setupMessageBadgeGuard = () => {
      const link = document.getElementById('message-center-link');
      if (!link || link.dataset.badgeGuardReady === '1') return;
      link.dataset.badgeGuardReady = '1';
      const badge = link.querySelector('.message-badge');
      hideBadge(link, badge);
      refreshMessageBadge();
      window.addEventListener('pageshow', refreshMessageBadge);
      window.addEventListener('focus', refreshMessageBadge);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshMessageBadge();
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupMessageBadgeGuard, { once: true });
    } else {
      setupMessageBadgeGuard();
    }
  })();
}
