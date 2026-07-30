'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { enrichQuestion } = require('./question-explanations');

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const QUESTION_SECONDS = 20;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ROOMS = 200;
const ALLOWED_QUESTION_COUNTS = new Set([5, 10, 15, 25]);
const ALLOWED_REACTIONS = new Set(['👍', '🎉', '😂', '🤯', '👏', '🔥']);
const TEAM_NAMES = Object.freeze({ violet: 'Team Violett', blue: 'Team Blau' });

const catalogs = {
  adult: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'adult-questions.json'), 'utf8')).map(enrichQuestion),
  child: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'child-questions.json'), 'utf8')).map(enrichQuestion),
};

function safeText(value, length = 80) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, length);
}

function safeName(value) {
  return safeText(value, 30);
}

function normalizeRoomCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

function calculateOnlineScore({ correct, timedOut = false, remainingSeconds = 0 } = {}) {
  if (timedOut) return 0;
  return correct ? 10 + Math.max(0, Math.ceil(Number(remainingSeconds) || 0)) : -5;
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function randomRoomCode() {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_ALPHABET[crypto.randomInt(0, ROOM_ALPHABET.length)];
  }
  return code;
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(0, index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function installOnlineMultiplayerRoutes(app, { now = () => Date.now() } = {}) {
  const rooms = new Map();
  const streams = new Map();
  const questionTimers = new Map();
  const createAttempts = new Map();

  function ipOf(req) {
    return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  }

  function allowRoomCreation(ip) {
    const timestamp = now();
    const key = String(ip || 'unknown');
    const active = (createAttempts.get(key) || []).filter(value => timestamp - value < 60 * 60 * 1000);
    if (active.length >= 10) return false;
    active.push(timestamp);
    createAttempts.set(key, active);
    return true;
  }

  function generateUniqueCode() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const code = randomRoomCode();
      if (!rooms.has(code)) return code;
    }
    throw new Error('Es konnte kein freier Raumcode erzeugt werden.');
  }

  function catalogFor(type) {
    return catalogs[type === 'adult' ? 'adult' : 'child'];
  }

  function categoriesFor(type) {
    return [...new Set(catalogFor(type).map(question => question.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'de'));
  }

  function availableQuestions(room) {
    const source = catalogFor(room.quizType);
    return room.category === 'Gemischt'
      ? source
      : source.filter(question => question.category === room.category);
  }

  function chooseQuestions(room) {
    const pool = availableQuestions(room);
    if (!pool.length) throw new Error('Für diese Kategorie sind keine Fragen vorhanden.');
    const selected = [];
    let batch = shuffle(pool);
    while (selected.length < room.questionCount) {
      if (!batch.length) batch = shuffle(pool);
      selected.push(structuredClone(batch.pop()));
    }
    return selected;
  }

  function publicQuestion(room) {
    const question = room.questions[room.currentIndex];
    if (!question || !['question', 'revealed'].includes(room.phase)) return null;
    return {
      id: question.id,
      category: question.category,
      text: question.text,
      options: question.options,
      ...(question.imageUrl ? { imageUrl: question.imageUrl } : {}),
      ...(room.phase === 'revealed' ? {
        correctIndex: question.correctIndex,
        explanation: question.explanation,
      } : {}),
    };
  }

  function roomPlayers(room) {
    return Object.values(room.players);
  }

  function playerLeaderboard(room) {
    return roomPlayers(room)
      .map(player => ({
        id: player.id,
        name: player.name,
        team: player.team,
        connected: Boolean(player.connected),
        ready: Boolean(player.ready),
        score: Number(player.score || 0),
        correct: Number(player.correct || 0),
        wrong: Number(player.wrong || 0),
        unanswered: Number(player.unanswered || 0),
      }))
      .sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name, 'de'))
      .map((player, index) => ({ ...player, rank: index + 1 }));
  }

  function teamLeaderboard(room) {
    if (room.gameMode !== 'teams') return [];
    const teams = Object.keys(TEAM_NAMES).map(teamId => {
      const members = roomPlayers(room).filter(player => player.team === teamId);
      return {
        id: teamId,
        name: TEAM_NAMES[teamId],
        members: members.map(player => player.name),
        score: members.reduce((sum, player) => sum + Number(player.score || 0), 0),
        correct: members.reduce((sum, player) => sum + Number(player.correct || 0), 0),
        wrong: members.reduce((sum, player) => sum + Number(player.wrong || 0), 0),
      };
    });
    return teams
      .sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name, 'de'))
      .map((team, index) => ({ ...team, rank: index + 1 }));
  }

  function getPlayerByToken(room, token) {
    const normalized = String(token || '');
    return roomPlayers(room).find(player => player.token === normalized) || null;
  }

  function streamEntries(code) {
    return streams.get(code) || new Set();
  }

  function hasOpenStream(code, token) {
    return [...streamEntries(code)].some(entry => entry.token === token && !entry.res.writableEnded);
  }

  function publicState(room, player) {
    const response = player ? room.responses[player.id] || null : null;
    return {
      room: {
        code: room.code,
        title: room.title,
        visibility: room.visibility,
        gameMode: room.gameMode,
        quizType: room.quizType,
        category: room.category,
        questionCount: room.questionCount,
        maxPlayers: room.maxPlayers,
        durationSec: QUESTION_SECONDS,
        phase: room.phase,
        hostPlayerId: room.hostPlayerId,
        currentIndex: room.currentIndex,
        totalQuestions: room.questions.length || room.questionCount,
        questionStartedAt: room.questionStartedAt,
        serverNow: now(),
        answeredCount: Object.keys(room.responses).length,
        question: publicQuestion(room),
        players: playerLeaderboard(room),
        teams: teamLeaderboard(room),
        messages: room.messages.slice(-40).map(message => ({
          id: message.id,
          playerId: message.playerId,
          playerName: message.playerName,
          type: message.type,
          text: message.text,
          createdAt: message.createdAt,
        })),
        createdAt: room.createdAt,
        finishedAt: room.finishedAt,
      },
      self: player ? {
        id: player.id,
        name: player.name,
        team: player.team,
        isHost: player.id === room.hostPlayerId,
        ready: Boolean(player.ready),
        answered: Boolean(response),
        result: room.phase === 'revealed' && response ? {
          answerIndex: response.answerIndex,
          correct: response.correct,
          timedOut: response.timedOut,
          delta: response.delta,
          remainingSeconds: response.remainingSeconds,
        } : null,
      } : null,
    };
  }

  function sendSse(res, event, payload) {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  function broadcast(room) {
    room.updatedAt = now();
    for (const entry of streamEntries(room.code)) {
      if (entry.res.writableEnded) continue;
      const player = getPlayerByToken(room, entry.token);
      if (player) sendSse(entry.res, 'state', publicState(room, player));
    }
  }

  function clearQuestionTimer(room) {
    const timer = questionTimers.get(room.code);
    if (timer) clearTimeout(timer);
    questionTimers.delete(room.code);
  }

  function scheduleQuestionTimer(room) {
    clearQuestionTimer(room);
    const remaining = Math.max(0, QUESTION_SECONDS * 1000 - (now() - room.questionStartedAt));
    const timer = setTimeout(() => revealQuestion(room), remaining + 30);
    timer.unref?.();
    questionTimers.set(room.code, timer);
  }

  function finishRoom(room) {
    clearQuestionTimer(room);
    room.phase = 'finished';
    room.finishedAt = now();
    room.questionStartedAt = null;
    room.responses = {};
    broadcast(room);
  }

  function revealQuestion(room) {
    if (room.phase !== 'question') return;
    clearQuestionTimer(room);
    const question = room.questions[room.currentIndex];
    const elapsedMs = Math.max(0, now() - room.questionStartedAt);
    const remainingAtTimeout = Math.max(0, QUESTION_SECONDS - elapsedMs / 1000);

    for (const player of roomPlayers(room)) {
      let response = room.responses[player.id];
      if (!response) {
        response = {
          answerIndex: null,
          answeredAt: now(),
          remainingSeconds: Math.max(0, Math.ceil(remainingAtTimeout)),
          timedOut: true,
        };
        room.responses[player.id] = response;
      }
      const correct = !response.timedOut && response.answerIndex === question.correctIndex;
      const delta = calculateOnlineScore({
        correct,
        timedOut: response.timedOut,
        remainingSeconds: response.remainingSeconds,
      });
      response.correct = correct;
      response.delta = delta;
      player.score += delta;
      if (response.timedOut) player.unanswered += 1;
      else if (correct) player.correct += 1;
      else player.wrong += 1;
    }
    room.phase = 'revealed';
    broadcast(room);
  }

  function startQuestion(room, index) {
    room.currentIndex = index;
    room.phase = 'question';
    room.questionStartedAt = now();
    room.responses = {};
    broadcast(room);
    scheduleQuestionTimer(room);
  }

  function allPlayersAnswered(room) {
    return roomPlayers(room).length > 0 && roomPlayers(room).every(player => Boolean(room.responses[player.id]));
  }

  function preview(room) {
    return {
      code: room.code,
      title: room.title,
      visibility: room.visibility,
      gameMode: room.gameMode,
      quizType: room.quizType,
      category: room.category,
      questionCount: room.questionCount,
      maxPlayers: room.maxPlayers,
      playerCount: roomPlayers(room).length,
      phase: room.phase,
      teams: TEAM_NAMES,
    };
  }

  function roomFromRequest(req, res) {
    const code = normalizeRoomCode(req.params.code || req.body?.code || req.query?.code);
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Dieser Online-Raum wurde nicht gefunden.' });
      return null;
    }
    return room;
  }

  function authenticated(req, res) {
    const room = roomFromRequest(req, res);
    if (!room) return null;
    const token = String(req.body?.token || req.query?.token || req.headers['x-player-token'] || '');
    const player = getPlayerByToken(room, token);
    if (!player) {
      res.status(401).json({ error: 'Die Spieleranmeldung für diesen Raum ist ungültig.' });
      return null;
    }
    return { room, player, token };
  }

  function requireHost(req, res) {
    const auth = authenticated(req, res);
    if (!auth) return null;
    if (auth.room.hostPlayerId !== auth.player.id) {
      res.status(403).json({ error: 'Nur der Gastgeber kann diese Aktion ausführen.' });
      return null;
    }
    return auth;
  }

  function ensureLobby(room, res) {
    if (room.phase !== 'lobby') {
      res.status(409).json({ error: 'Diese Einstellung kann nur in der Lobby geändert werden.' });
      return false;
    }
    return true;
  }

  function addSystemMessage(room, text) {
    room.messages.push({
      id: crypto.randomUUID(),
      playerId: null,
      playerName: 'System',
      type: 'system',
      text: safeText(text, 160),
      createdAt: now(),
    });
    if (room.messages.length > 50) room.messages.splice(0, room.messages.length - 50);
  }

  app.get('/api/online/config', (_req, res) => {
    res.json({
      questionCounts: [...ALLOWED_QUESTION_COUNTS],
      questionSeconds: QUESTION_SECONDS,
      teams: TEAM_NAMES,
      catalogs: {
        child: { size: catalogs.child.length, categories: categoriesFor('child') },
        adult: { size: catalogs.adult.length, categories: categoriesFor('adult') },
      },
    });
  });

  app.get('/api/online/rooms/public', (_req, res) => {
    const list = [...rooms.values()]
      .filter(room => room.visibility === 'public' && room.phase === 'lobby' && roomPlayers(room).length < room.maxPlayers)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 30)
      .map(preview);
    res.json({ rooms: list });
  });

  app.get('/api/online/rooms/:code/preview', (req, res) => {
    const room = roomFromRequest(req, res);
    if (room) res.json({ room: preview(room) });
  });

  app.post('/api/online/rooms', (req, res) => {
    if (!allowRoomCreation(ipOf(req))) return res.status(429).json({ error: 'Zu viele Räume erstellt. Bitte später erneut versuchen.' });
    if (rooms.size >= MAX_ROOMS) return res.status(503).json({ error: 'Aktuell sind zu viele Online-Räume aktiv.' });

    const hostName = safeName(req.body?.hostName);
    if (hostName.length < 2) return res.status(400).json({ error: 'Der Name muss mindestens zwei Zeichen haben.' });
    const quizType = req.body?.quizType === 'adult' ? 'adult' : 'child';
    const categories = categoriesFor(quizType);
    const requestedCategory = safeText(req.body?.category || 'Gemischt', 50);
    const category = requestedCategory === 'Gemischt' || categories.includes(requestedCategory) ? requestedCategory : 'Gemischt';
    const questionCount = ALLOWED_QUESTION_COUNTS.has(Number(req.body?.questionCount)) ? Number(req.body.questionCount) : 10;
    const maxPlayers = Math.max(2, Math.min(8, Number(req.body?.maxPlayers) || 8));
    const gameMode = req.body?.gameMode === 'teams' ? 'teams' : 'individual';
    const visibility = req.body?.visibility === 'public' ? 'public' : 'private';
    const code = generateUniqueCode();
    const playerId = crypto.randomUUID();
    const token = randomToken();
    const team = gameMode === 'teams' && req.body?.team === 'blue' ? 'blue' : gameMode === 'teams' ? 'violet' : null;
    const timestamp = now();
    const room = {
      code,
      title: safeText(req.body?.title || `${hostName}s Quizraum`, 60) || `${hostName}s Quizraum`,
      visibility,
      gameMode,
      quizType,
      category,
      questionCount,
      maxPlayers,
      phase: 'lobby',
      hostPlayerId: playerId,
      players: {
        [playerId]: {
          id: playerId,
          token,
          name: hostName,
          team,
          ready: true,
          connected: false,
          score: 0,
          correct: 0,
          wrong: 0,
          unanswered: 0,
          joinedAt: timestamp,
        },
      },
      questions: [],
      currentIndex: 0,
      questionStartedAt: null,
      responses: {},
      messages: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      finishedAt: null,
    };
    rooms.set(code, room);
    addSystemMessage(room, `${hostName} hat den Raum erstellt.`);
    res.status(201).json({ code, token, playerId, state: publicState(room, room.players[playerId]) });
  });

  app.post('/api/online/rooms/:code/join', (req, res) => {
    const room = roomFromRequest(req, res);
    if (!room) return;
    if (room.phase !== 'lobby') return res.status(409).json({ error: 'Dieses Spiel läuft bereits.' });
    if (roomPlayers(room).length >= room.maxPlayers) return res.status(409).json({ error: 'Dieser Raum ist bereits voll.' });
    const name = safeName(req.body?.name);
    if (name.length < 2) return res.status(400).json({ error: 'Der Name muss mindestens zwei Zeichen haben.' });
    if (roomPlayers(room).some(player => player.name.toLocaleLowerCase('de-DE') === name.toLocaleLowerCase('de-DE'))) {
      return res.status(409).json({ error: 'Dieser Spielername wird im Raum bereits verwendet.' });
    }
    const playerId = crypto.randomUUID();
    const token = randomToken();
    const team = room.gameMode === 'teams' && req.body?.team === 'blue' ? 'blue' : room.gameMode === 'teams' ? 'violet' : null;
    room.players[playerId] = {
      id: playerId,
      token,
      name,
      team,
      ready: false,
      connected: false,
      score: 0,
      correct: 0,
      wrong: 0,
      unanswered: 0,
      joinedAt: now(),
    };
    addSystemMessage(room, `${name} ist dem Raum beigetreten.`);
    broadcast(room);
    res.status(201).json({ code: room.code, token, playerId, state: publicState(room, room.players[playerId]) });
  });

  app.get('/api/online/rooms/:code/state', (req, res) => {
    const auth = authenticated(req, res);
    if (!auth) return;
    res.json(publicState(auth.room, auth.player));
  });

  app.get('/api/online/rooms/:code/events', (req, res) => {
    const auth = authenticated(req, res);
    if (!auth) return;
    const { room, player, token } = auth;
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    const entry = { res, token };
    if (!streams.has(room.code)) streams.set(room.code, new Set());
    streams.get(room.code).add(entry);
    player.connected = true;
    sendSse(res, 'state', publicState(room, player));
    broadcast(room);

    const heartbeat = setInterval(() => sendSse(res, 'heartbeat', { serverNow: now() }), 20000);
    heartbeat.unref?.();
    req.on('close', () => {
      clearInterval(heartbeat);
      streams.get(room.code)?.delete(entry);
      if (!hasOpenStream(room.code, token)) player.connected = false;
      broadcast(room);
    });
  });

  app.post('/api/online/rooms/:code/ready', (req, res) => {
    const auth = authenticated(req, res);
    if (!auth) return;
    if (!ensureLobby(auth.room, res)) return;
    auth.player.ready = req.body?.ready !== false;
    broadcast(auth.room);
    res.json({ ok: true, state: publicState(auth.room, auth.player) });
  });

  app.patch('/api/online/rooms/:code/settings', (req, res) => {
    const auth = requireHost(req, res);
    if (!auth || !ensureLobby(auth.room, res)) return;
    const room = auth.room;
    if (req.body?.title !== undefined) room.title = safeText(req.body.title, 60) || room.title;
    if (req.body?.visibility !== undefined) room.visibility = req.body.visibility === 'public' ? 'public' : 'private';
    if (req.body?.maxPlayers !== undefined) room.maxPlayers = Math.max(roomPlayers(room).length, Math.min(8, Math.max(2, Number(req.body.maxPlayers) || 8)));
    if (req.body?.questionCount !== undefined && ALLOWED_QUESTION_COUNTS.has(Number(req.body.questionCount))) room.questionCount = Number(req.body.questionCount);
    if (req.body?.quizType !== undefined) {
      room.quizType = req.body.quizType === 'adult' ? 'adult' : 'child';
      room.category = 'Gemischt';
    }
    if (req.body?.category !== undefined) {
      const category = safeText(req.body.category, 50);
      room.category = category === 'Gemischt' || categoriesFor(room.quizType).includes(category) ? category : 'Gemischt';
    }
    broadcast(room);
    res.json({ ok: true, state: publicState(room, auth.player) });
  });

  app.patch('/api/online/rooms/:code/team', (req, res) => {
    const auth = authenticated(req, res);
    if (!auth || !ensureLobby(auth.room, res)) return;
    if (auth.room.gameMode !== 'teams') return res.status(409).json({ error: 'Dieser Raum wird ohne Teams gespielt.' });
    auth.player.team = req.body?.team === 'blue' ? 'blue' : 'violet';
    auth.player.ready = false;
    broadcast(auth.room);
    res.json({ ok: true, state: publicState(auth.room, auth.player) });
  });

  app.post('/api/online/rooms/:code/start', (req, res) => {
    const auth = requireHost(req, res);
    if (!auth || !ensureLobby(auth.room, res)) return;
    const room = auth.room;
    const players = roomPlayers(room);
    if (players.length < 2) return res.status(409).json({ error: 'Mindestens zwei Spieler sind erforderlich.' });
    if (players.some(player => !player.ready)) return res.status(409).json({ error: 'Alle Spieler müssen bereit sein.' });
    if (room.gameMode === 'teams') {
      const teams = new Set(players.map(player => player.team));
      if (!teams.has('violet') || !teams.has('blue')) return res.status(409).json({ error: 'Beide Teams benötigen mindestens ein Mitglied.' });
    }
    try {
      room.questions = chooseQuestions(room);
      room.currentIndex = 0;
      room.finishedAt = null;
      room.messages = room.messages.slice(-20);
      for (const player of players) {
        player.score = 0;
        player.correct = 0;
        player.wrong = 0;
        player.unanswered = 0;
      }
      addSystemMessage(room, 'Das Online-Quiz wurde gestartet.');
      startQuestion(room, 0);
      res.json({ ok: true, state: publicState(room, auth.player) });
    } catch (error) {
      res.status(409).json({ error: error.message });
    }
  });

  app.post('/api/online/rooms/:code/answer', (req, res) => {
    const auth = authenticated(req, res);
    if (!auth) return;
    const { room, player } = auth;
    if (room.phase !== 'question') return res.status(409).json({ error: 'Aktuell läuft keine beantwortbare Frage.' });
    if (room.responses[player.id]) return res.status(409).json({ error: 'Du hast diese Frage bereits beantwortet.' });
    const answerIndex = Number(req.body?.answerIndex);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return res.status(400).json({ error: 'Bitte eine gültige Antwort auswählen.' });
    const remainingMs = Math.max(0, QUESTION_SECONDS * 1000 - (now() - room.questionStartedAt));
    if (remainingMs <= 0) {
      revealQuestion(room);
      return res.status(409).json({ error: 'Die Antwortzeit ist bereits abgelaufen.' });
    }
    room.responses[player.id] = {
      answerIndex,
      answeredAt: now(),
      remainingSeconds: Math.max(0, Math.ceil(remainingMs / 1000)),
      timedOut: false,
    };
    broadcast(room);
    if (allPlayersAnswered(room)) {
      const timer = setTimeout(() => revealQuestion(room), 450);
      timer.unref?.();
    }
    res.json({ ok: true, state: publicState(room, player) });
  });

  app.post('/api/online/rooms/:code/next', (req, res) => {
    const auth = requireHost(req, res);
    if (!auth) return;
    const room = auth.room;
    if (room.phase !== 'revealed') return res.status(409).json({ error: 'Die aktuelle Frage muss zuerst aufgelöst sein.' });
    if (room.currentIndex + 1 >= room.questions.length) {
      finishRoom(room);
    } else {
      startQuestion(room, room.currentIndex + 1);
    }
    res.json({ ok: true, state: publicState(room, auth.player) });
  });

  app.post('/api/online/rooms/:code/restart', (req, res) => {
    const auth = requireHost(req, res);
    if (!auth) return;
    const room = auth.room;
    if (room.phase !== 'finished') return res.status(409).json({ error: 'Ein Neustart ist erst nach dem Endstand möglich.' });
    clearQuestionTimer(room);
    room.phase = 'lobby';
    room.questions = [];
    room.currentIndex = 0;
    room.questionStartedAt = null;
    room.responses = {};
    room.finishedAt = null;
    for (const player of roomPlayers(room)) {
      player.score = 0;
      player.correct = 0;
      player.wrong = 0;
      player.unanswered = 0;
      player.ready = player.id === room.hostPlayerId;
    }
    addSystemMessage(room, 'Der Raum ist für eine neue Runde bereit.');
    broadcast(room);
    res.json({ ok: true, state: publicState(room, auth.player) });
  });

  app.post('/api/online/rooms/:code/kick', (req, res) => {
    const auth = requireHost(req, res);
    if (!auth || !ensureLobby(auth.room, res)) return;
    const targetId = String(req.body?.playerId || '');
    if (!auth.room.players[targetId]) return res.status(404).json({ error: 'Spieler wurde nicht gefunden.' });
    if (targetId === auth.player.id) return res.status(409).json({ error: 'Der Gastgeber kann sich nicht selbst entfernen.' });
    const removed = auth.room.players[targetId];
    delete auth.room.players[targetId];
    addSystemMessage(auth.room, `${removed.name} wurde aus dem Raum entfernt.`);
    for (const entry of streamEntries(auth.room.code)) {
      if (entry.token === removed.token) {
        sendSse(entry.res, 'removed', { message: 'Du wurdest vom Gastgeber aus dem Raum entfernt.' });
        entry.res.end();
      }
    }
    broadcast(auth.room);
    res.json({ ok: true });
  });

  app.post('/api/online/rooms/:code/chat', (req, res) => {
    const auth = authenticated(req, res);
    if (!auth) return;
    const reaction = safeText(req.body?.reaction, 4);
    const message = safeText(req.body?.message, 160);
    if (!message && !ALLOWED_REACTIONS.has(reaction)) return res.status(400).json({ error: 'Bitte eine Nachricht oder gültige Reaktion senden.' });
    auth.room.messages.push({
      id: crypto.randomUUID(),
      playerId: auth.player.id,
      playerName: auth.player.name,
      type: ALLOWED_REACTIONS.has(reaction) ? 'reaction' : 'chat',
      text: ALLOWED_REACTIONS.has(reaction) ? reaction : message,
      createdAt: now(),
    });
    if (auth.room.messages.length > 50) auth.room.messages.splice(0, auth.room.messages.length - 50);
    broadcast(auth.room);
    res.json({ ok: true });
  });

  app.post('/api/online/rooms/:code/leave', (req, res) => {
    const auth = authenticated(req, res);
    if (!auth) return;
    const { room, player } = auth;
    if (room.phase === 'lobby') {
      delete room.players[player.id];
      addSystemMessage(room, `${player.name} hat den Raum verlassen.`);
      if (!roomPlayers(room).length) {
        clearQuestionTimer(room);
        rooms.delete(room.code);
      } else if (room.hostPlayerId === player.id) {
        const successor = roomPlayers(room).sort((a, b) => a.joinedAt - b.joinedAt)[0];
        room.hostPlayerId = successor.id;
        successor.ready = true;
        addSystemMessage(room, `${successor.name} ist jetzt Gastgeber.`);
      }
    } else {
      player.connected = false;
    }
    broadcast(room);
    res.json({ ok: true });
  });

  setInterval(() => {
    const cutoff = now() - ROOM_TTL_MS;
    for (const [code, room] of rooms) {
      if (room.updatedAt < cutoff) {
        clearQuestionTimer(room);
        for (const entry of streamEntries(code)) entry.res.end();
        streams.delete(code);
        rooms.delete(code);
      }
    }
    const attemptCutoff = now() - 60 * 60 * 1000;
    for (const [ip, attempts] of createAttempts) {
      const active = attempts.filter(value => value >= attemptCutoff);
      if (active.length) createAttempts.set(ip, active);
      else createAttempts.delete(ip);
    }
  }, 10 * 60 * 1000).unref?.();
}

module.exports = {
  installOnlineMultiplayerRoutes,
  calculateOnlineScore,
  normalizeRoomCode,
  TEAM_NAMES,
};
