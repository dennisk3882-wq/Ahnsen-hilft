'use strict';

const REPOSITORY = String(process.env.QUIZTIME_GITHUB_REPOSITORY || 'dennisk3882-wq/Ahnsen-hilft').trim();
const CACHE_MS = 2 * 60 * 1000;
const PRODUCTION_STALE_MS = 8 * 60 * 60 * 1000;
let cached = null;
let cachedAt = 0;

function normalizeRun(run, label) {
  if (!run) return null;
  return {
    label,
    id: run.id,
    name: run.name,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    branch: run.head_branch,
    commit: String(run.head_sha || '').slice(0, 8),
    startedAt: run.run_started_at || run.created_at,
    updatedAt: run.updated_at,
    url: run.html_url,
    runNumber: run.run_number,
  };
}

async function fetchWorkflow(fileName, label) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'QuizTime-Admin-Monitor',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_ACTIONS_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_ACTIONS_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${encodeURIComponent(fileName)}/runs?per_page=5`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`GitHub Actions antwortet mit Status ${response.status}.`);
  const data = await response.json();
  return normalizeRun(data.workflow_runs?.[0], label);
}

function summarize(browser, production) {
  const productionAge = production?.updatedAt ? Date.now() - new Date(production.updatedAt).getTime() : Infinity;
  const productionStale = productionAge > PRODUCTION_STALE_MS;
  const failed = [browser, production].find(run => run?.status === 'completed' && run.conclusion !== 'success');
  const running = [browser, production].find(run => run && run.status !== 'completed');
  if (failed) return { state: 'failed', label: `${failed.label} fehlgeschlagen`, productionStale };
  if (running) return { state: 'running', label: `${running.label} läuft`, productionStale };
  if (!browser || !production) return { state: 'pending', label: 'Erste automatische Läufe stehen noch aus', productionStale };
  if (productionStale) return { state: 'warning', label: 'Produktionsprüfung ist älter als acht Stunden', productionStale };
  return { state: 'success', label: 'Alle automatischen Browserprüfungen erfolgreich', productionStale };
}

async function getBrowserTestStatus(force = false) {
  if (process.env.NODE_ENV === 'test' && process.env.QUIZTIME_E2E_BROWSER_STATUS === 'success') {
    const now = new Date().toISOString();
    const browser = { label: 'Browser-Tests', status: 'completed', conclusion: 'success', updatedAt: now, startedAt: now, url: null, runNumber: 1, branch: 'e2e', commit: 'local' };
    const production = { label: 'Produktionsprüfung', status: 'completed', conclusion: 'success', updatedAt: now, startedAt: now, url: null, runNumber: 1, branch: 'production', commit: 'local' };
    return { repository: REPOSITORY, fetchedAt: now, browser, production, summary: summarize(browser, production), actionsUrl: null };
  }
  if (!force && cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const [browserResult, productionResult] = await Promise.allSettled([
    fetchWorkflow('quiz-browser-tests.yml', 'Browser-Tests'),
    fetchWorkflow('quiz-production-smoke.yml', 'Produktionsprüfung'),
  ]);
  const browser = browserResult.status === 'fulfilled' ? browserResult.value : null;
  const production = productionResult.status === 'fulfilled' ? productionResult.value : null;
  const errors = [browserResult, productionResult]
    .filter(result => result.status === 'rejected')
    .map(result => result.reason?.message || 'Unbekannter GitHub-Fehler');
  cached = {
    repository: REPOSITORY,
    fetchedAt: new Date().toISOString(),
    browser,
    production,
    summary: summarize(browser, production),
    errors,
    actionsUrl: `https://github.com/${REPOSITORY}/actions`,
  };
  cachedAt = Date.now();
  return cached;
}

function installBrowserTestStatusRoute(app, requirePlatformAdmin) {
  app.get('/api/platform/admin/browser-tests', requirePlatformAdmin, async (req, res) => {
    try {
      res.json(await getBrowserTestStatus(req.query?.refresh === '1'));
    } catch (error) {
      res.status(502).json({ error: `Automatische Testläufe konnten nicht geladen werden: ${error.message}` });
    }
  });
}

module.exports = { getBrowserTestStatus, installBrowserTestStatusRoute, _test: { normalizeRun, summarize } };
