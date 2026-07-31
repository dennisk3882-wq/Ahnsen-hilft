'use strict';

const answerLayout = require('./answer-layout');
const catalogService = require('./question-catalog-service');

const soloLayouts = new Map();
const eventLayouts = new Map();

function rawQuestion(type, publicQuestion) {
  if (!publicQuestion) return null;
  const quizType = type === 'adult' ? 'adult' : 'child';
  const catalogs = [catalogService.currentCatalog(quizType), catalogService.canonicalCatalog(quizType)];
  for (const catalog of catalogs) {
    const byId = catalog.find(question => question.id === publicQuestion.id);
    if (byId) return byId;
    const byText = catalog.find(question => question.text === publicQuestion.text);
    if (byText) return byText;
  }
  return null;
}

function layoutKey(sessionId, index) {
  return `${sessionId}:${Number(index || 0)}`;
}

function transformState(payload, { scope, quizType, store }) {
  if (!payload || typeof payload !== 'object' || !payload.sessionId || !payload.question) return payload;
  const raw = rawQuestion(quizType(payload), payload.question);
  if (!raw) return payload;
  const index = Number(payload.currentIndex || 0);
  const total = Math.max(1, Number(payload.totalQuestions || 1));
  const prepared = answerLayout.prepareQuestionAt(raw, index, total, `${scope}:${payload.sessionId}`);
  const mapping = {
    currentIndex: index,
    displayToRaw: prepared.displayToRaw,
    rawToDisplay: prepared.rawToDisplay,
  };
  store.set(layoutKey(payload.sessionId, index), mapping);
  store.set(String(payload.sessionId), mapping);

  const hadCorrectIndex = Object.prototype.hasOwnProperty.call(payload.question, 'correctIndex');
  payload.question = {
    ...payload.question,
    options: [...prepared.question.options],
    ...(hadCorrectIndex ? { correctIndex: prepared.question.correctIndex } : {}),
  };
  if (payload.result && typeof payload.result === 'object') {
    payload.result = {
      ...payload.result,
      answerIndex: Number.isInteger(payload.result.answerIndex)
        ? prepared.rawToDisplay[payload.result.answerIndex]
        : null,
      correctIndex: prepared.question.correctIndex,
    };
  }
  return payload;
}

function translateAnswer(req, store) {
  const sessionId = String(req.body?.sessionId || req.params?.id || '');
  const active = store.get(sessionId);
  const displayed = Number(req.body?.answerIndex);
  if (!active || !Number.isInteger(displayed) || displayed < 0 || displayed > 3) return;
  const raw = active.displayToRaw[displayed];
  if (Number.isInteger(raw)) req.body.answerIndex = raw;
}

function interceptInstall(app, definitions, install) {
  const originals = { get: app.get, post: app.post, delete: app.delete };
  for (const method of Object.keys(originals)) {
    app[method] = function interceptedRoute(path, ...handlers) {
      const definition = definitions[`${method.toUpperCase()} ${path}`];
      if (!definition) return originals[method].call(this, path, ...handlers);
      const interceptor = (req, res, next) => {
        try { definition.before?.(req, res); } catch (error) { return next(error); }
        const originalJson = res.json.bind(res);
        res.json = payload => {
          try { return originalJson(definition.after ? definition.after(payload, req, res) : payload); }
          catch (error) { return next(error); }
        };
        next();
      };
      return originals[method].call(this, path, interceptor, ...handlers);
    };
  }
  try { return install(); }
  finally {
    for (const [method, original] of Object.entries(originals)) app[method] = original;
  }
}

function patchSoloRoutes() {
  const module = require('./solo-routes');
  if (module.__quiztimeAnswerLayoutPatched) return;
  const originalInstall = module.installSoloRoutes;
  module.installSoloRoutes = function installBalancedSoloRoutes(app, options) {
    const after = payload => transformState(payload, {
      scope: 'solo',
      quizType: value => value.quizType,
      store: soloLayouts,
    });
    return interceptInstall(app, {
      'POST /api/solo/start': { after },
      'GET /api/solo/state/:sessionId': { after },
      'POST /api/solo/answer': { before: req => translateAnswer(req, soloLayouts), after },
      'POST /api/solo/next': { after },
      'POST /api/solo/speech': {
        before: req => {
          const type = req.body?.quizType === 'adult' ? 'adult' : 'child';
          const question = catalogService.currentCatalog(type).find(item => item.text === req.body?.questionText)
            || catalogService.canonicalCatalog(type).find(item => item.text === req.body?.questionText);
          if (question) req.body.options = [...question.options];
        },
      },
    }, () => originalInstall(app, options));
  };
  module.__quiztimeAnswerLayoutPatched = true;
}

function patchEventRoutes() {
  const module = require('./event-runtime-routes');
  if (module.__quiztimeAnswerLayoutPatched) return;
  const originalInstall = module.installEventRuntimeRoutes;
  module.installEventRuntimeRoutes = function installBalancedEventRoutes(app, options) {
    const after = payload => transformState(payload, {
      scope: 'event',
      quizType: value => value.event?.quizType,
      store: eventLayouts,
    });
    return interceptInstall(app, {
      'POST /api/platform/phase10/events/:id/start': { after },
      'GET /api/platform/phase10/event-sessions/:id': { after },
      'POST /api/platform/phase10/event-sessions/:id/answer': { before: req => translateAnswer(req, eventLayouts), after },
      'POST /api/platform/phase10/event-sessions/:id/next': { after },
    }, () => originalInstall(app, options));
  };
  module.__quiztimeAnswerLayoutPatched = true;
}

function patchOnlineRooms() {
  const runtime = require('./runtime-room-admin');
  if (runtime.__quiztimeAnswerLayoutPatched) return;
  const originalReplace = runtime.replaceQuestions;
  runtime.replaceQuestions = function replaceQuestionsWithBalancedAnswers(code, catalog, category) {
    const room = originalReplace(code, catalog, category);
    room.questions = answerLayout.prepareBalancedQuestions(
      room.questions,
      `online:${room.code}:${room.createdAt || room.catalogVersion || 'room'}`,
    );
    room.answerLayoutVersion = 1;
    return room;
  };
  runtime.__quiztimeAnswerLayoutPatched = true;
}

function patchOfflineCatalog() {
  const module = require('./offline-routes');
  if (module.__quiztimeAnswerLayoutPatched) return;
  const originalInstall = module.installOfflineRoutes;
  module.installOfflineRoutes = function installBalancedOfflineCatalog(app) {
    return interceptInstall(app, {
      'GET /api/offline/catalog': {
        after: payload => {
          if (!payload?.catalogs) return payload;
          const child = answerLayout.prepareBalancedQuestions(payload.catalogs.child, 'offline:child:catalog');
          const adult = answerLayout.prepareBalancedQuestions(payload.catalogs.adult, 'offline:adult:catalog');
          payload.catalogs = { child, adult };
          payload.version = catalogService.versionFor(payload.catalogs);
          payload.answerLayout = { balanced: true, maxCorrectStreak: 2 };
          return payload;
        },
      },
    }, () => originalInstall(app));
  };
  module.__quiztimeAnswerLayoutPatched = true;
}

patchSoloRoutes();
patchEventRoutes();
patchOnlineRooms();
patchOfflineCatalog();

module.exports = {
  patchSoloRoutes,
  patchEventRoutes,
  patchOnlineRooms,
  patchOfflineCatalog,
  _test: { transformState, translateAnswer, rawQuestion, soloLayouts, eventLayouts },
};
