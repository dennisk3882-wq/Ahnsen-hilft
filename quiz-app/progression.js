'use strict';

const LEVEL_SIZE = 500;
const TIME_ZONE = 'Europe/Berlin';

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function progressionSummary({ games = 0, correct = 0, points = 0 } = {}) {
  const xp = Math.max(0, Math.round(number(games) * 60 + number(correct) * 20 + Math.max(0, number(points))));
  const level = Math.floor(xp / LEVEL_SIZE) + 1;
  const xpIntoLevel = xp % LEVEL_SIZE;
  const progressPercent = Math.round(xpIntoLevel / LEVEL_SIZE * 100);
  const title = level >= 20 ? 'Quiz-Legende'
    : level >= 12 ? 'Wissens-Champion'
      : level >= 7 ? 'Quiz-Profi'
        : level >= 3 ? 'Wissenssammler'
          : 'Quiz-Neuling';
  return {
    xp,
    level,
    levelSize: LEVEL_SIZE,
    xpIntoLevel,
    xpForNextLevel: LEVEL_SIZE - xpIntoLevel,
    progressPercent,
    title,
  };
}

function dayKey(value, timeZone = TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function shiftDay(key, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Number(days || 0), 12));
  return date.toISOString().slice(0, 10);
}

function streakSummary(values = [], referenceDate = new Date()) {
  const days = [...new Set(values.map(value => dayKey(value)).filter(Boolean))].sort();
  if (!days.length) return { current: 0, best: 0, playedToday: false, lastPlayedDay: null };

  let best = 1;
  let running = 1;
  for (let index = 1; index < days.length; index += 1) {
    if (days[index] === shiftDay(days[index - 1], 1)) {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 1;
    }
  }

  const today = dayKey(referenceDate);
  const latest = days[days.length - 1];
  const playedToday = latest === today;
  const active = playedToday || latest === shiftDay(today, -1);
  let current = active ? 1 : 0;
  if (active) {
    for (let index = days.length - 2; index >= 0; index -= 1) {
      const expected = shiftDay(days[index + 1], -1);
      if (days[index] !== expected) break;
      current += 1;
    }
  }

  return { current, best, playedToday, lastPlayedDay: latest };
}

function achievementList(stats = {}) {
  const result = [];
  if (stats.games >= 1) result.push({ id: 'first-game', icon: 'game', title: 'Erste Runde', text: 'Das erste Solo-Quiz wurde beendet.' });
  if (stats.correct >= 10) result.push({ id: 'ten-correct', icon: 'star', title: 'Zehn Treffer', text: 'Mindestens zehn Fragen wurden richtig beantwortet.' });
  if (stats.correct >= 50) result.push({ id: 'fifty-correct', icon: 'medal', title: 'Quiz-Profi', text: 'Mindestens 50 richtige Antworten.' });
  if (stats.correct >= 100) result.push({ id: 'hundred-correct', icon: 'trophy', title: 'Wissens-Champion', text: 'Mindestens 100 richtige Antworten.' });
  if (stats.answers >= 20 && stats.accuracy >= 80) result.push({ id: 'accuracy-80', icon: 'target', title: 'Treffsicher', text: 'Mindestens 80 Prozent Trefferquote bei 20 Antworten.' });
  if (stats.bestScore >= 200) result.push({ id: 'score-200', icon: 'rocket', title: 'Punkterakete', text: 'In einer Runde mindestens 200 Punkte erreicht.' });
  if (stats.level >= 5) result.push({ id: 'level-five', icon: 'level', title: 'Level 5', text: 'Durch regelmäßiges Spielen Level 5 erreicht.' });
  if (stats.currentStreak >= 3) result.push({ id: 'streak-three', icon: 'flame', title: 'Dreierserie', text: 'An drei Tagen in Folge gespielt.' });
  if (stats.bestStreak >= 7) result.push({ id: 'streak-seven', icon: 'calendar', title: 'Wochenserie', text: 'Sieben Tage am Stück Wissen trainiert.' });
  const strongCategory = Array.isArray(stats.categories)
    ? stats.categories.find(category => category.correct >= 10 && category.accuracy >= 80)
    : null;
  if (strongCategory) result.push({ id: `category-${strongCategory.category}`, icon: 'brain', title: `${strongCategory.category}-Kenner`, text: `Starke Leistungen in „${strongCategory.category}“.` });
  return result;
}

module.exports = {
  LEVEL_SIZE,
  TIME_ZONE,
  progressionSummary,
  dayKey,
  shiftDay,
  streakSummary,
  achievementList,
};
