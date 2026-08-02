'use strict';

const db = require('./platform-db');
const storage = require('./phase11-storage');
const questionCatalog = require('./question-catalog-service');

let patched = false;

function browserFamily(value) {
  return storage._test.browserFamily(value);
}

function deviceFamily(value) {
  return storage._test.deviceFamily(value);
}

function patchPhase11() {
  if (patched) return;
  patched = true;

  const ensureReady = storage.ensureReady;
  storage.ensureReady = async (...args) => {
    const result = await ensureReady(...args);
    await questionCatalog.reloadFromDatabase();
    return result;
  };

  storage.completeOnboardingStep = async (profileId, key) => {
    if (!storage.ONBOARDING_STEPS.some(step => step.key === key)) throw new Error('Unbekannter Einführungsschritt.');
    await storage.ensureReady();
    await db.query(`
      INSERT INTO quiz_phase11_onboarding(profile_id,completed_steps)
      VALUES($1,jsonb_build_array($2::text))
      ON CONFLICT(profile_id) DO UPDATE SET
        completed_steps=(
          SELECT COALESCE(jsonb_agg(value ORDER BY value),'[]'::jsonb)
          FROM (
            SELECT DISTINCT value
            FROM jsonb_array_elements_text(quiz_phase11_onboarding.completed_steps || EXCLUDED.completed_steps) AS values(value)
          ) unique_values
        ),
        updated_at=NOW()
    `, [profileId, key]);
    return storage.onboarding(profileId);
  };

  const beginAnswerEvent = storage.beginAnswerEvent;
  storage.beginAnswerEvent = async (req, profileId) => {
    const event = await beginAnswerEvent(req, profileId);
    if (!event?.id) return event;
    const userAgent = String(req.get?.('user-agent') || '');
    await db.query(`
      UPDATE quiz_phase11_answer_events
         SET browser_family=$2,device_family=$3
       WHERE id=$1
    `, [event.id, browserFamily(userAgent), deviceFamily(userAgent)]).catch(() => {});
    return event;
  };

  const analytics = storage.analytics;
  storage.analytics = async (...args) => {
    const result = await analytics(...args);
    const days = Math.max(1, Math.min(365, Number(args[0]) || 30));
    const { rows } = await db.query(`
      SELECT COALESCE(browser_family,'Unbekannt') browser,
             COALESCE(device_family,'Unbekannt') device,
             COUNT(*)::int events,
             COUNT(DISTINCT profile_id)::int users
        FROM quiz_phase11_answer_events
       WHERE created_at>NOW()-($1::int*INTERVAL '1 day')
       GROUP BY browser_family,device_family
       ORDER BY events DESC
       LIMIT 30
    `, [days]).catch(() => ({ rows: [] }));
    result.devices = rows;
    return result;
  };

  const readinessChecks = storage.readinessChecks;
  storage.readinessChecks = async (...args) => {
    const result = await readinessChecks(...args);
    const diagnostics = await questionCatalog.diagnostics().catch(() => null);
    const check = result.checks.find(item => item.key === 'catalog');
    if (check && diagnostics) {
      check.ok = Boolean(
        diagnostics.consistent
        && Number(diagnostics.byType?.adult?.canonical || 0) >= 500
        && Number(diagnostics.byType?.child?.canonical || 0) >= 500
        && Number(diagnostics.byType?.adult?.runtime || 0) > 0
        && Number(diagnostics.byType?.child?.runtime || 0) > 0
      );
      check.detail = `${diagnostics.byType?.adult?.runtime || 0} aktive Erwachsenen- und ${diagnostics.byType?.child?.runtime || 0} aktive Kinderfragen; ${diagnostics.disabledQuestions || 0} administrativ deaktiviert.`;
      result.status = result.checks.some(item => item.required && !item.ok)
        ? 'fail'
        : result.checks.some(item => !item.ok) ? 'warning' : 'pass';
    }
    return result;
  };
}

module.exports = { patchPhase11 };
