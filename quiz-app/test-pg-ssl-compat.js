'use strict';

if (process.env.NODE_ENV === 'test' && process.env.DATABASE_URL) {
  const raw = String(process.env.DATABASE_URL);
  let local = false;
  try {
    const url = new URL(raw);
    local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  } catch { /* ungültige URLs werden später regulär von pg gemeldet */ }

  if (local) {
    const pg = require('pg');
    const NativePool = pg.Pool;
    class LocalTestPool extends NativePool {
      constructor(config = {}) {
        const next = typeof config === 'string' ? { connectionString: config } : { ...config };
        if (next.connectionString) {
          const url = new URL(next.connectionString);
          url.searchParams.delete('sslmode');
          next.connectionString = url.toString();
        }
        next.ssl = false;
        super(next);
      }
    }
    pg.Pool = LocalTestPool;
  }
}
