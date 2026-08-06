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

function freezeWithText(question, text, explanation = question.explanation) {
  return Object.freeze({
    ...question,
    text,
    explanation,
    options: Object.freeze([...question.options]),
  });
}

const questions = source.map(question => {
  const numericId = Number(String(question.id).slice(-3));
  const originalText = String(question.text);

  if (numericId >= 101 && numericId <= 150) {
    const text = originalText
      .replace(/^Welches Wort bedeutet das Gegenteil von „(.+)“\?$/u, 'Welche Gegenbedeutung passt zu „$1“?')
      .replace(/^Welches Wort ist das Gegenteil von „(.+)“\?$/u, 'Welcher Ausdruck bildet das Gegensatzpaar zu „$1“?');
    return freezeWithText(question, text);
  }

  if (numericId >= 151 && numericId <= 200) {
    const text = originalText
      .replace(/^Welche besondere Eigenschaft passt zum Tier „(.+)“\?$/u, 'Welches Merkmal ist für das Tier „$1“ besonders typisch?')
      .replace(/^Welches Tier passt zu der Eigenschaft „(.+)“\?$/u, 'Welches Tier lässt sich durch das Merkmal „$1“ erkennen?');
    const explanation = String(question.explanation).replace(/^Der /u, 'Das Tier ');
    return freezeWithText(question, text, explanation);
  }

  if (numericId >= 201 && numericId <= 250) {
    const text = originalText
      .replace(/^Welche Aufgabe erfüllt ein (.+)\?$/u, 'Wozu wird das Gerät „$1“ hauptsächlich verwendet?')
      .replace(/^Welches technische Hilfsmittel (.+)\?$/u, 'Welches Gerät passt zur technischen Beschreibung „$1“?');
    return freezeWithText(question, text);
  }

  if (numericId >= 251 && numericId <= 300) {
    const text = originalText
      .replace(/^In welcher Stadt befindet sich die Sehenswürdigkeit „(.+)“\?$/u, 'Welcher Stadt ist die Sehenswürdigkeit „$1“ zuzuordnen?')
      .replace(/^Welche bekannte Sehenswürdigkeit befindet sich in (.+)\?$/u, 'Welches Bauwerk oder Wahrzeichen gehört zur Stadt $1?');
    return freezeWithText(question, text);
  }

  if (numericId >= 301 && numericId <= 340) {
    const text = originalText
      .replace(/^Welche Bedeutung hat das Verkehrszeichen „(.+)“\?$/u, 'Welche Verkehrsregel vermittelt das Zeichen „$1“?')
      .replace(/^Welches Verkehrszeichen (.+)\?$/u, 'Welcher Zeichenname gehört zur Regel „$1“?');
    return freezeWithText(question, text);
  }

  if (numericId >= 341 && numericId <= 380) {
    const text = originalText
      .replace(/^Welche Hauptzutat gehört typischerweise zu „(.+)“\?$/u, 'Welche Zutat bildet gewöhnlich die Grundlage von „$1“?')
      .replace(/^Welches Lebensmittel wird typischerweise aus „(.+)“ hergestellt\?$/u, 'Welches Produkt entsteht üblicherweise aus der Zutat „$1“?');
    return freezeWithText(question, text);
  }

  if (numericId >= 381 && numericId <= 410) {
    const text = originalText
      .replace(/^Welche Angabe passt zum Begriff „(.+)“\?$/u, 'Welche feste Zahlenangabe gehört zu „$1“?')
      .replace(/^Welcher Begriff passt zur Angabe „(.+)“\?$/u, 'Welcher Alltagsbegriff entspricht der Angabe „$1“?');
    return freezeWithText(question, text);
  }

  if (numericId >= 411 && numericId <= 440) {
    const text = originalText
      .replace(/^Welche historische Aussage passt zu „(.+)“\?$/u, 'Welche Aussage ordnet die Person „$1“ historisch richtig ein?')
      .replace(/^Welche historische Person (.+)\?$/u, 'Wer ist mit der historischen Aussage „$1“ gemeint?');
    return freezeWithText(question, text);
  }

  if (numericId >= 441 && numericId <= 464) {
    const text = originalText
      .replace(/^Wer komponierte das Musikstück „(.+)“\?$/u, 'Welcher Komponist ist mit dem Werk „$1“ verbunden?')
      .replace(/^Welches Werk stammt von (.+)\?$/u, 'Welches der genannten Werke wurde von $1 komponiert?');
    return freezeWithText(question, text);
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

  if (numericId >= 486 && numericId <= 499) {
    const text = originalText
      .replace(/^Welche Erklärung passt zum Medienbegriff „(.+)“\?$/u, 'Welche Beschreibung erklärt den Medienausdruck „$1“ korrekt?')
      .replace(/^Welcher Medienbegriff passt zu „(.+)“\?$/u, 'Welcher Ausdruck aus Film und Fernsehen entspricht „$1“?');
    return freezeWithText(question, text);
  }

  return freezeWithText(question, originalText);
});

module.exports = Object.freeze(questions);
