'use strict';

const source = require('./question-expansion-batch3-child');

const SPORT = [
  ['Fußball', 'Fußball'],
  ['Basketball', 'Basketballkorb'],
  ['Tennis', 'Tennisschläger'],
  ['Eishockey', 'Eishockeyschläger und Puck'],
  ['Tischtennis', 'Tischtennisschläger'],
  ['Badminton', 'Federball'],
  ['Golf', 'Golfschläger'],
  ['Baseball', 'Baseballschläger'],
  ['Bogenschießen', 'Sportbogen'],
  ['Fechten', 'Florett'],
];

function uniqueAlternatives(rows, index, side, correct) {
  const values = [];
  const seen = new Set([String(correct).toLocaleLowerCase('de-DE')]);
  for (let offset = 1; offset < rows.length && values.length < 3; offset += 1) {
    const value = String(rows[(index + offset) % rows.length][side]);
    const key = value.toLocaleLowerCase('de-DE');
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values;
}

function withAnswerPosition(question, correct, distractors) {
  const options = [...distractors];
  options.splice(question.correctIndex, 0, String(correct));
  return Object.freeze({
    ...question,
    options: Object.freeze(options),
  });
}

const questions = source.map(question => {
  const numericId = Number(String(question.id).slice(-3));

  if (numericId >= 151 && numericId <= 200) {
    return Object.freeze({
      ...question,
      explanation: String(question.explanation).replace(/^Der /u, 'Das Tier '),
      options: Object.freeze([...question.options]),
    });
  }

  if (numericId >= 441 && numericId <= 464) {
    const text = String(question.text)
      .replace(/^Wer komponierte das Musikstück „(.+)“\?$/u, 'Welcher Komponist ist mit dem Werk „$1“ verbunden?')
      .replace(/^Welches Werk stammt von (.+)\?$/u, 'Welches der genannten Werke wurde von $1 komponiert?');
    return Object.freeze({
      ...question,
      text,
      options: Object.freeze([...question.options]),
    });
  }

  if (numericId >= 466 && numericId <= 485) {
    const relativeIndex = numericId - 466;
    const pairIndex = Math.floor(relativeIndex / 2);
    const [sport, equipment] = SPORT[pairIndex];
    const forward = relativeIndex % 2 === 0;
    const correct = forward ? equipment : sport;
    const distractors = uniqueAlternatives(SPORT, pairIndex, forward ? 1 : 0, correct);
    const rebuilt = withAnswerPosition(question, correct, distractors);
    return Object.freeze({
      ...rebuilt,
      text: forward
        ? `Welches eindeutig zugeordnete Sportgerät passt zu „${sport}“?`
        : `Zu welcher Sportart gehört das Gerät „${equipment}“?`,
      explanation: `${equipment} gehört zur Sportart ${sport}. Die Bezeichnung ist so gewählt, dass nur diese Sportart als Lösung passt.`,
    });
  }

  return Object.freeze({
    ...question,
    options: Object.freeze([...question.options]),
  });
});

module.exports = Object.freeze(questions);
