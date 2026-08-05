'use strict';

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('de-DE').trim();
}

function buildCatalog({ prefix, build }) {
  const questions = [];

  function chooseWrong(values, correct) {
    const seen = new Set([normalize(correct)]);
    const wrong = [];
    for (const value of values) {
      const text = String(value);
      const key = normalize(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      wrong.push(text);
      if (wrong.length === 3) break;
    }
    if (wrong.length !== 3) throw new Error(`Zu wenige eindeutige Ablenkungen für „${correct}“.`);
    return wrong;
  }

  function add(category, text, correct, distractors, explanation) {
    const correctIndex = questions.length % 4;
    const options = chooseWrong(distractors, correct);
    options.splice(correctIndex, 0, String(correct));
    questions.push(Object.freeze({
      id: `${prefix}${String(questions.length + 1).padStart(3, '0')}`,
      text: String(text),
      category: String(category),
      options: Object.freeze(options),
      correctIndex,
      explanation: String(explanation),
    }));
  }

  function alternatives(rows, index, side) {
    const values = [];
    for (let offset = 1; offset < rows.length && values.length < 8; offset += 1) {
      values.push(rows[(index + offset) % rows.length][side]);
    }
    return values;
  }

  function pairs(category, rows, wording) {
    rows.forEach(([left, right], index) => {
      add(
        category,
        wording.forward(left, right),
        right,
        alternatives(rows, index, 1),
        wording.explain(left, right),
      );
      add(
        category,
        wording.reverse(left, right),
        left,
        alternatives(rows, index, 0),
        wording.explain(left, right),
      );
    });
  }

  build({ add, pairs });
  return Object.freeze(questions);
}

module.exports = Object.freeze({ buildCatalog });
