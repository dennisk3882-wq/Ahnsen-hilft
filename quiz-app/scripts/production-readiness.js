'use strict';

const baseUrl = String(process.argv[2] || process.env.PRODUCTION_URL || process.env.APP_BASE_URL || '').replace(/\/$/u, '');
if (!/^https?:\/\//u.test(baseUrl)) {
  console.error('PRODUCTION_URL oder eine vollständige URL als Argument ist erforderlich.');
  process.exit(2);
}

async function request(path, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
    ...options,
  });
  const text = await response.text();
  return { path, status: response.status, ok: response.ok, ms: Date.now() - startedAt, text };
}

function assert(result, condition, message) {
  if (!condition) throw new Error(`${result.path}: ${message} (HTTP ${result.status})`);
  console.log(`✓ ${result.path} · ${result.status} · ${result.ms} ms`);
}

(async () => {
  const health = await request('/health');
  assert(health, health.ok, 'Health-Endpunkt ist nicht erreichbar');

  const readiness = await request('/api/platform/readiness');
  let readinessData = {};
  try { readinessData = JSON.parse(readiness.text); } catch { /* Fehler wird unten gemeldet. */ }
  assert(readiness, readiness.ok, `Bereitschaft fehlgeschlagen: ${readinessData.status || readiness.text.slice(0, 120)}`);
  assert(readiness, readinessData.version === '11.0.0', `Version 11.0.0 erwartet, erhalten: ${readinessData.version || 'unbekannt'}`);
  assert(readiness, readinessData.status !== 'fail', 'Pflichtprüfung meldet Fehler');

  for (const path of ['/', '/solo', '/arena', '/competitions', '/welcome']) {
    const page = await request(path);
    assert(page, page.ok && /QuizTime/iu.test(page.text), 'QuizTime-Seite ist nicht vollständig verfügbar');
  }

  const online = await request('/api/online/status');
  const onlineData = JSON.parse(online.text || '{}');
  assert(online, online.ok && onlineData.online === true, 'Online-System ist nicht aktiv');
  assert(online, onlineData.persistence === 'postgresql', 'PostgreSQL-Persistenz wird nicht gemeldet');

  console.log(`\nQuizTime 11 Produktionscheck erfolgreich: ${baseUrl}`);
  console.log(`${readinessData.checks?.filter(item => item.ok).length || 0}/${readinessData.checks?.length || 0} interne Prüfungen bestanden.`);
})().catch(error => {
  console.error(`✗ Produktionscheck fehlgeschlagen: ${error.message}`);
  process.exit(1);
});
