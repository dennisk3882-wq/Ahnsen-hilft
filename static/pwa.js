if (typeof document === 'undefined') {
  const CACHE = 'ahnsen-hilft-public-v3';
  const CORE = [
    '/',
    '/pwa.css?v=1',
    '/pwa-extra.css?v=1',
    '/pwa/ahnsen-app-v7-192.png',
    '/pwa/ahnsen-app-v7-512.png',
    '/assets/ahnsen-startseite.png',
    '/manifest.webmanifest'
  ];
  const CACHEABLE = new Set([
    '/pwa.css',
    '/pwa-extra.css',
    '/pwa/ahnsen-app-v7-192.png',
    '/pwa/ahnsen-app-v7-512.png',
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
      title: 'Ahnsen hilft',
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
        icon: data.icon || '/pwa/ahnsen-app-v7-192.png',
        badge: data.badge || '/pwa/ahnsen-app-v7-192.png',
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
    if (nav) {
      const icons = {
        home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></svg>',
        report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 7v5c0 4.8 3.2 7.8 8 9 4.8-1.2 8-4.2 8-9V7z"/><path d="M12 8v5M12 16h.01"/></svg>',
        calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
        mobility: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M7 8h10M8 18v2m8-2v2M8 14h.01M16 14h.01M9 5h6"/></svg>',
        waste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l2 3h3l-2 4"/><path d="m18 10-3-1 1-3"/><path d="m7 9-3 5 2 4"/><path d="m6 18 1-3 3 1"/><path d="m10 20h6l3-5"/></svg>',
        dgh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 4l9 6"/><path d="M5 9v11h14V9M9 20v-6h6v6"/></svg>',
        politics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18M5 9v9m4-9v9m6-9v9m4-9v9M3 21h18M12 3 3 7h18z"/></svg>',
        people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.4-4 2.4-6 5.5-6s5.1 2 5.5 6M14 15c3.5-.5 5.7 1.2 6.5 4.5"/></svg>',
        news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
        idea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6m-5 3h4"/><path d="M8.5 15c-1.5-1.1-2.5-2.9-2.5-5a6 6 0 1 1 12 0c0 2.1-1 3.9-2.5 5-.8.6-1.2 1.1-1.4 2h-4.2c-.2-.9-.6-1.4-1.4-2z"/></svg>',
        neighbor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20v-8l8-6 8 6v8"/><path d="M9 20v-5h6v5"/><path d="M7 8 5 6M17 8l2-2"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5M12 17h.01"/></svg>',
        map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15m6-12v15"/></svg>',
        more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
        profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.6-4.3 3.1-6.5 7.5-6.5s6.9 2.2 7.5 6.5"/></svg>'
      };

      const navItems = [
        { key: 'home', href: '/', label: 'Start', description: 'Übersicht', paths: ['/'] },
        { key: 'report', href: '/mangel-melden', label: 'Melden', description: 'Mängel', paths: ['/mangel-melden', '/meldestatus'] },
        { key: 'calendar', href: '/veranstaltungen', label: 'Termine', description: 'Kalender', paths: ['/veranstaltungen'] },
        { key: 'mobility', href: '/mobilitaet', label: 'Mobilität', description: 'Bus & Fahrt', paths: ['/mobilitaet'] },
        { key: 'waste', href: '/muelltermine-info', label: 'Müll', description: 'Abfuhr', paths: ['/muelltermine-info', '/muelltermine.ics'] },
        { key: 'dgh', href: '/dgh-mieten', label: 'DGH', description: 'Belegung', paths: ['/dgh-mieten', '/dgh-anfrage', '/dgh-anfrage-erfolgreich'] },
        { key: 'politics', href: '/politik-rat', label: 'Politik', description: 'Rat & Protokolle', paths: ['/politik-rat'] },
        { key: 'people', href: '/vereine', label: 'Vereine', description: 'Gruppen', paths: ['/vereine', '/feuerwehr'] },
        { key: 'news', href: '/aktuelles', label: 'Aktuelles', description: 'Neuigkeiten', paths: ['/aktuelles', '/buergerinformationen'] },
        { key: 'idea', href: '/ideen', label: 'Ideen', description: 'Mitgestalten', paths: ['/ideen'] },
        { key: 'neighbor', href: '/nachbarschaft', label: 'Helfen', description: 'Nachbarschaft', paths: ['/nachbarschaft'] },
        { key: 'warning', href: '/warnungen', label: 'Warnlage', description: 'Amtlich', paths: ['/warnungen'] },
        { key: 'map', href: '/karte', label: 'Karte', description: 'Mängelkarte', paths: ['/karte'] },
        { key: 'more', href: '/mehr', label: 'Mehr', description: 'Alle Bereiche', paths: ['/mehr', '/ueber-', '/ansprechpartner', '/datenschutz', '/impressum'] },
        { key: 'profile', href: '/profil', label: 'Profil', description: 'Mein Ahnsen', paths: ['/profil', '/anmelden', '/registrieren', '/nachrichten'] }
      ];

      const currentPath = location.pathname.replace(/\/+$/, '') || '/';
      const isMatch = (candidate, rule) => {
        if (rule === '/') return candidate === '/';
        if (rule.endsWith('-')) return candidate.startsWith(rule);
        return candidate === rule || candidate.startsWith(`${rule}/`);
      };
      const activeItem = navItems.find(item => item.paths.some(rule => isMatch(currentPath, rule))) || navItems[0];
      const track = document.createElement('div');
      track.className = 'bottom-nav-track';

      navItems.forEach(item => {
        const link = document.createElement('a');
        const active = item.key === activeItem.key;
        link.className = `bottom-link${active ? ' active' : ''}`;
        link.href = item.href;
        link.dataset.navKey = item.key;
        link.title = `${item.label} – ${item.description}`;
        link.setAttribute('aria-label', `${item.label}: ${item.description}`);
        if (active) link.setAttribute('aria-current', 'page');
        link.innerHTML = `<span class="nav-icon" aria-hidden="true">${icons[item.key]}</span><span class="nav-copy"><strong>${item.label}</strong><small>${item.description}</small></span>`;
        track.appendChild(link);
      });

      nav.classList.add('nav-slider');
      nav.innerHTML = '';
      nav.appendChild(track);

      const updateNavEdges = () => {
        const max = Math.max(0, track.scrollWidth - track.clientWidth);
        nav.classList.toggle('at-start', track.scrollLeft <= 2);
        nav.classList.toggle('at-end', track.scrollLeft >= max - 2);
      };
      const centerActiveNav = behavior => {
        const activeLink = track.querySelector('.bottom-link.active');
        if (!activeLink) return;
        activeLink.scrollIntoView({ behavior, block: 'nearest', inline: 'center' });
        window.setTimeout(updateNavEdges, behavior === 'smooth' ? 280 : 30);
      };

      track.addEventListener('scroll', updateNavEdges, { passive: true });
      window.addEventListener('resize', () => centerActiveNav('auto'));
      requestAnimationFrame(() => requestAnimationFrame(() => centerActiveNav('auto')));

      try {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const hintKey = 'ahnsen-bottom-nav-hint-v1';
        if (!reduceMotion && track.scrollWidth > track.clientWidth + 8 && !localStorage.getItem(hintKey)) {
          window.setTimeout(() => {
            nav.classList.add('nav-hint');
            window.setTimeout(() => nav.classList.remove('nav-hint'), 1100);
            localStorage.setItem(hintKey, '1');
          }, 650);
        }
      } catch (_error) {}
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
