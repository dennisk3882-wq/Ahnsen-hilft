'use strict';

const crypto = require('crypto');

const OPTION_COUNT = 4;
const DEFAULT_MAX_STREAK = 2;

function cloneQuestion(question) {
  return {
    ...question,
    options: Array.isArray(question?.options) ? [...question.options] : [],
  };
}

function createRng(seed) {
  const digest = crypto.createHash('sha256').update(String(seed || '')).digest();
  let state = digest.readUInt32BE(0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function shuffle(values, seed) {
  const result = [...values];
  const random = createRng(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function longestStreak(values) {
  let longest = 0;
  let current = 0;
  let previous = null;
  for (const value of values) {
    if (value === previous) current += 1;
    else current = 1;
    previous = value;
    longest = Math.max(longest, current);
  }
  return longest;
}

function balancedQuotas(count, seed, optionCount = OPTION_COUNT) {
  const size = Math.max(0, Number(count) || 0);
  const base = Math.floor(size / optionCount);
  const quotas = Array(optionCount).fill(base);
  const remainderOrder = shuffle([...Array(optionCount).keys()], `${seed}:remainder`);
  for (let index = 0; index < size % optionCount; index += 1) quotas[remainderOrder[index]] += 1;
  return quotas;
}

function fallbackSequence(quotas, seed, maxStreak) {
  const remaining = [...quotas];
  const sequence = [];
  const tieOrder = shuffle([...Array(remaining.length).keys()], `${seed}:fallback`);
  while (sequence.length < quotas.reduce((sum, value) => sum + value, 0)) {
    const last = sequence.at(-1);
    const currentStreak = sequence.length >= 2 && sequence.at(-2) === last ? 2 : sequence.length ? 1 : 0;
    const candidates = tieOrder
      .filter(index => remaining[index] > 0 && !(currentStreak >= maxStreak && index === last))
      .sort((left, right) => remaining[right] - remaining[left] || tieOrder.indexOf(left) - tieOrder.indexOf(right));
    const selected = candidates[0] ?? tieOrder.find(index => remaining[index] > 0);
    sequence.push(selected);
    remaining[selected] -= 1;
  }
  return sequence;
}

function balancedPositions(count, seed, { optionCount = OPTION_COUNT, maxStreak = DEFAULT_MAX_STREAK } = {}) {
  const quotas = balancedQuotas(count, seed, optionCount);
  const bag = quotas.flatMap((amount, position) => Array(amount).fill(position));
  if (bag.length <= 1) return bag;
  for (let attempt = 0; attempt < 256; attempt += 1) {
    const candidate = shuffle(bag, `${seed}:position:${attempt}`);
    if (longestStreak(candidate) <= maxStreak) return candidate;
  }
  return fallbackSequence(quotas, seed, maxStreak);
}

function layoutQuestion(question, targetCorrectIndex, seed) {
  const source = cloneQuestion(question);
  if (source.options.length !== OPTION_COUNT || !Number.isInteger(source.correctIndex)
      || source.correctIndex < 0 || source.correctIndex >= OPTION_COUNT) {
    return {
      question: source,
      displayToRaw: [...Array(source.options.length).keys()],
      rawToDisplay: [...Array(source.options.length).keys()],
    };
  }

  const target = Math.max(0, Math.min(OPTION_COUNT - 1, Number(targetCorrectIndex) || 0));
  const distractorRawIndexes = shuffle(
    [...Array(OPTION_COUNT).keys()].filter(index => index !== source.correctIndex),
    `${seed}:distractors`,
  );
  const displayToRaw = [];
  let distractorPointer = 0;
  for (let displayIndex = 0; displayIndex < OPTION_COUNT; displayIndex += 1) {
    displayToRaw[displayIndex] = displayIndex === target
      ? source.correctIndex
      : distractorRawIndexes[distractorPointer++];
  }
  const rawToDisplay = Array(OPTION_COUNT);
  displayToRaw.forEach((rawIndex, displayIndex) => { rawToDisplay[rawIndex] = displayIndex; });
  return {
    question: {
      ...source,
      options: displayToRaw.map(rawIndex => source.options[rawIndex]),
      correctIndex: target,
    },
    displayToRaw,
    rawToDisplay,
  };
}

function prepareBalancedQuestions(questions, seed, options = {}) {
  const source = Array.isArray(questions) ? questions : [];
  const positions = balancedPositions(source.length, seed, options);
  return source.map((question, index) => layoutQuestion(question, positions[index], `${seed}:question:${index}:${question?.id || ''}`).question);
}

function prepareQuestionAt(question, index, total, seed, options = {}) {
  const positions = balancedPositions(total, seed, options);
  return layoutQuestion(question, positions[index] ?? 0, `${seed}:question:${index}:${question?.id || ''}`);
}

function distribution(questions) {
  const result = Array(OPTION_COUNT).fill(0);
  for (const question of questions || []) {
    if (Number.isInteger(question?.correctIndex) && result[question.correctIndex] !== undefined) result[question.correctIndex] += 1;
  }
  return result;
}

module.exports = {
  OPTION_COUNT,
  DEFAULT_MAX_STREAK,
  createRng,
  shuffle,
  longestStreak,
  balancedQuotas,
  balancedPositions,
  layoutQuestion,
  prepareBalancedQuestions,
  prepareQuestionAt,
  distribution,
};
