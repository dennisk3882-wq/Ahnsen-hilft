'use strict';

(() => {
  const NativeEventSource = window.EventSource;
  if (NativeEventSource) {
    class SecureEventSource {
      static CONNECTING = NativeEventSource.CONNECTING;
      static OPEN = NativeEventSource.OPEN;
      static CLOSED = NativeEventSource.CLOSED;

      constructor(url, options) {
        this.url = String(url);
        this.withCredentials = Boolean(options?.withCredentials);
        this.readyState = SecureEventSource.CONNECTING;
        this.listeners = new Map();
        this.native = null;
        this.closed = false;
        this.reconnectTimer = null;
        this.onerror = null;
        this.onopen = null;
        this.onmessage = null;
        this.connect();
      }

      addEventListener(type, listener, options) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push({ listener, options });
        this.native?.addEventListener(type, listener, options);
      }

      removeEventListener(type, listener) {
        const entries = this.listeners.get(type) || [];
        this.listeners.set(type, entries.filter(entry => entry.listener !== listener));
        this.native?.removeEventListener(type, listener);
      }

      dispatchEvent(event) { return this.native?.dispatchEvent(event) || false; }

      close() {
        this.closed = true;
        this.readyState = SecureEventSource.CLOSED;
        clearTimeout(this.reconnectTimer);
        this.native?.close();
        this.native = null;
      }

      async connect() {
        if (this.closed) return;
        this.readyState = SecureEventSource.CONNECTING;
        try {
          const original = new URL(this.url, location.origin);
          const token = original.searchParams.get('token');
          let streamUrl = original.pathname + original.search;
          if (token && /\/api\/online\/rooms\/[^/]+\/events$/.test(original.pathname)) {
            const code = original.pathname.split('/')[4];
            const response = await fetch(`/api/online/rooms/${encodeURIComponent(code)}/stream-ticket`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Echtzeit-Ticket konnte nicht erstellt werden.');
            streamUrl = `${original.pathname}?ticket=${encodeURIComponent(data.ticket)}`;
          }
          if (this.closed) return;
          const native = new NativeEventSource(streamUrl, { withCredentials: this.withCredentials });
          this.native = native;
          for (const [type, entries] of this.listeners) for (const entry of entries) native.addEventListener(type, entry.listener, entry.options);
          native.onopen = event => {
            this.readyState = SecureEventSource.OPEN;
            this.onopen?.call(this, event);
          };
          native.onmessage = event => this.onmessage?.call(this, event);
          native.onerror = event => {
            this.readyState = SecureEventSource.CONNECTING;
            this.onerror?.call(this, event);
            native.close();
            if (!this.closed) {
              clearTimeout(this.reconnectTimer);
              this.reconnectTimer = setTimeout(() => this.connect(), 1200);
            }
          };
        } catch (error) {
          this.readyState = SecureEventSource.CONNECTING;
          this.onerror?.call(this, new Event('error'));
          console.warn('Sichere Echtzeitverbindung wird erneuert:', error.message);
          if (!this.closed) this.reconnectTimer = setTimeout(() => this.connect(), 1800);
        }
      }
    }

    window.EventSource = SecureEventSource;
  }

  const moderation = document.createElement('script');
  moderation.src = '/online-moderation.js';
  moderation.defer = true;
  document.head.appendChild(moderation);
})();
