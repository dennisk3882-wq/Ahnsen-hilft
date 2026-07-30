'use strict';

const { performance } = require('perf_hooks');

const baseUrl = String(process.env.QUIZTIME_LOAD_URL || process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/u, '');
const concurrency = Math.max(1, Math.min(100, Number(process.env.QUIZTIME_LOAD_CONCURRENCY || 20)));
const requestsPerWorker = Math.max(1, Math.min(1000, Number(process.env.QUIZTIME_LOAD_REQUESTS || 30)));
const paths = ['/', '/solo', '/online', '/arena', '/api/online/status', '/api/online/config', '/api/platform/stability/status'];

async function oneRequest(path) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  const duration = performance.now() - started;
  await response.arrayBuffer();
  return { path, status: response.status, duration };
}

async function worker(id) {
  const results = [];
  for (let index = 0; index < requestsPerWorker; index += 1) {
    const path = paths[(id + index) % paths.length];
    try { results.push(await oneRequest(path)); }
    catch (error) { results.push({ path, status: 0, duration: 15_000, error: error.message }); }
  }
  return results;
}

async function roomLifecycle() {
  const created = await fetch(`${baseUrl}/api/online/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostName: `Load${Date.now()}`.slice(0, 30), title: 'Lasttest', quizType: 'adult', category: 'Gemischt', questionCount: 5, maxPlayers: 2 }),
  });
  const room = await created.json().catch(() => ({}));
  if (!created.ok) return { ok: false, stage: 'create', status: created.status, error: room.error };
  const state = await fetch(`${baseUrl}/api/online/rooms/${room.code}/state?token=${encodeURIComponent(room.token)}`);
  const left = await fetch(`${baseUrl}/api/online/rooms/${room.code}/leave`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: room.token }),
  });
  return { ok: state.ok && left.ok, stage: 'lifecycle', code: room.code, state: state.status, leave: left.status };
}

async function main() {
  console.log(`QuizTime Lasttest: ${baseUrl}, ${concurrency} parallele Worker × ${requestsPerWorker} Requests`);
  const started = performance.now();
  const batches = await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
  const results = batches.flat();
  const duration = performance.now() - started;
  const sorted = results.map(result => result.duration).sort((a, b) => a - b);
  const percentile = value => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] || 0;
  const failures = results.filter(result => result.status < 200 || result.status >= 400);
  const statuses = results.reduce((map, result) => ({ ...map, [result.status]: Number(map[result.status] || 0) + 1 }), {});
  const lifecycle = await roomLifecycle().catch(error => ({ ok: false, error: error.message }));
  console.log(JSON.stringify({
    requests: results.length,
    durationMs: Math.round(duration),
    requestsPerSecond: Number((results.length / Math.max(0.001, duration / 1000)).toFixed(2)),
    latencyMs: { p50: Math.round(percentile(0.5)), p95: Math.round(percentile(0.95)), p99: Math.round(percentile(0.99)) },
    statuses,
    failures: failures.slice(0, 20),
    roomLifecycle: lifecycle,
  }, null, 2));
  if (failures.length || !lifecycle.ok || percentile(0.95) > 5000) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
