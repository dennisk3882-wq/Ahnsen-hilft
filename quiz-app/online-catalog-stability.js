'use strict';

const crypto = require('crypto');
const catalogService = require('./question-catalog-service');
const runtimeRoomAdmin = require('./runtime-room-admin');
const onlineStorage = require('./online-room-storage');
const phase10 = require('./phase10-storage');

let eventPatched = false;

function categories(type) {
  return [...new Set(catalogService.currentCatalog(type).map(question => question.category).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'de'));
}

function validCategory(type, value) {
  const category = String(value || 'Gemischt').trim() || 'Gemischt';
  return category === 'Gemischt' || categories(type).includes(category) ? category : 'Gemischt';
}

function persistentSnapshot(room) {
  const snapshot = structuredClone(room);
  for (const player of Object.values(snapshot.players || {})) {
    player.connected = false;
    delete player.token;
  }
  return snapshot;
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(0, index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function eventQuestionIds(event) {
  const type = event.quiz_type === 'child' ? 'child' : 'adult';
  const catalog = catalogService.currentCatalog(type);
  const category = validCategory(type, event.category);
  const filtered = category === 'Gemischt' ? catalog : catalog.filter(question => question.category === category);
  const pool = filtered.length >= Number(event.question_count || 10) ? filtered : catalog;
  return shuffle(pool).slice(0, Math.min(Number(event.question_count || 10), pool.length)).map(question => question.id);
}

function patchEventCatalog() {
  if (eventPatched) return;
  eventPatched = true;
  const original = phase10.createEventSession.bind(phase10);
  phase10.createEventSession = async (profileId, eventId) => {
    const event = await phase10.eventById(eventId);
    if (!event) return original(profileId, eventId, []);
    const questionIds = eventQuestionIds(event);
    if (!questionIds.length) throw new Error('Der veröffentlichte Fragenkatalog enthält keine passenden Eventfragen.');
    return original(profileId, eventId, questionIds);
  };
}

function installOnlineCatalogMiddleware(app) {
  app.use('/api/online', (req, res, next) => {
    const originalUrl = String(req.originalUrl || '');
    const isConfig = req.method === 'GET' && /^\/api\/online\/config(?:\?|$)/u.test(originalUrl);
    const isCreate = req.method === 'POST' && /^\/api\/online\/rooms\/?(?:\?|$)/u.test(originalUrl);
    const startMatch = req.method === 'POST' ? originalUrl.match(/^\/api\/online\/rooms\/([A-Z0-9]{6})\/start(?:\?|$)/iu) : null;

    if (isConfig) {
      const originalJson = res.json.bind(res);
      res.json = payload => {
        payload ||= {};
        payload.catalogVersion = catalogService.versionFor(catalogService.currentCatalogs());
        payload.catalogs = {
          child: { size: catalogService.currentCatalog('child').length, categories: categories('child') },
          adult: { size: catalogService.currentCatalog('adult').length, categories: categories('adult') },
        };
        return originalJson(payload);
      };
      return next();
    }

    if (isCreate) {
      req.body ||= {};
      const quizType = req.body.quizType === 'adult' ? 'adult' : 'child';
      const desiredCategory = validCategory(quizType, req.body.category);
      req.body.category = 'Gemischt';
      const originalJson = res.json.bind(res);
      res.json = payload => {
        if (res.statusCode < 400 && payload?.code) {
          const room = runtimeRoomAdmin.roomForCode(payload.code);
          if (room) {
            room.category = desiredCategory;
            room.catalogVersion = catalogService.versionFor(catalogService.currentCatalogs());
            room.updatedAt = Date.now();
            if (payload.state?.room) payload.state.room.category = desiredCategory;
            onlineStorage.saveRoom(persistentSnapshot(room)).catch(error => console.error('Raumkatalog konnte nicht persistiert werden:', error.message));
          }
        }
        return originalJson(payload);
      };
      return next();
    }

    if (startMatch) {
      const code = startMatch[1].toUpperCase();
      const room = runtimeRoomAdmin.roomForCode(code);
      if (!room) return next();
      const desiredCategory = validCategory(room.quizType, room.category);
      room.category = 'Gemischt';
      const originalJson = res.json.bind(res);
      res.json = payload => {
        if (res.statusCode < 400) {
          try {
            const current = runtimeRoomAdmin.replaceQuestions(code, catalogService.currentCatalog(room.quizType), desiredCategory);
            current.catalogVersion = catalogService.versionFor(catalogService.currentCatalogs());
            const spectator = runtimeRoomAdmin.spectatorState(code);
            if (payload?.state?.room && spectator) {
              payload.state.room.category = spectator.category;
              payload.state.room.question = spectator.question;
              payload.state.room.totalQuestions = spectator.totalQuestions;
            }
            onlineStorage.saveRoom(persistentSnapshot(current)).catch(error => console.error('Aktueller Raumkatalog konnte nicht gespeichert werden:', error.message));
          } catch (error) {
            room.category = desiredCategory;
            console.error(`Raum ${code} konnte nicht auf den veröffentlichten Fragenkatalog umgestellt werden:`, error.message);
          }
        } else {
          room.category = desiredCategory;
        }
        return originalJson(payload);
      };
      return next();
    }

    next();
  });
}

module.exports = {
  patchEventCatalog,
  installOnlineCatalogMiddleware,
  _test: { validCategory, eventQuestionIds, persistentSnapshot },
};
