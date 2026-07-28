'use strict';

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function withoutQuestionMark(value) {
  return clean(value).replace(/[?!.]+$/, '');
}

function correctAnswer(question) {
  return clean(question?.options?.[Number(question?.correctIndex)] || '');
}

const WEAK_EXPLANATION_PATTERNS = [
  /beantwortet diese frage richtig/i,
  /hat beziehungsweise haben/i,
  /ist die richtige (anzahl|zeitangabe|höhenangabe|größenangabe|bezeichnung|auswahl|farbe|form)/i,
  /ist die gesuchte (person|figur|ort|pflanze|sprache|tier)/i,
  /ist die richtige lösung aus/i,
  /diese frage gehört zur kategorie/i,
  /wird dafür benötigt/i,
  /wird damit angezeigt/i,
  /^die richtige antwort ist\b/i,
];

function isWeakExplanation(value) {
  const text = clean(value);
  return !text || WEAK_EXPLANATION_PATTERNS.some(pattern => pattern.test(text));
}

function buildExplanation(question) {
  const custom = clean(question?.explanation);
  if (custom && !isWeakExplanation(custom)) return custom;

  const text = withoutQuestionMark(question?.text);
  const answer = correctAnswer(question);
  if (!answer) return 'Die richtige Lösung wird nach der Antwort angezeigt.';

  let match;
  if ((match = text.match(/^Welche Farbe entsteht aus (.+) und (.+)$/i))) {
    return `Wenn man ${match[1]} und ${match[2]} mischt, entsteht ${answer}.`;
  }
  if ((match = text.match(/^Wofür steht (?:die Abkürzung )?(.+)$/i))) {
    return `${match[1]} steht für ${answer}.`;
  }
  if ((match = text.match(/^Wie viele (.+) hat (.+)$/i))) {
    return `${match[2]} hat ${answer} ${match[1]}.`;
  }
  if ((match = text.match(/^Wie viele (.+) haben (.+)$/i))) {
    return `${match[2]} haben ${answer} ${match[1]}.`;
  }
  if ((match = text.match(/^Wie nennt man (.+)$/i))) {
    return `${match[1]} nennt man ${answer}.`;
  }
  if ((match = text.match(/^Wie heißt (der|die|das|ein|eine) (.+)$/i))) {
    return `${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2]} heißt ${answer}.`;
  }
  if ((match = text.match(/^Was ist (.+)$/i))) {
    return `${match[1]} ist ${answer}.`;
  }
  if ((match = text.match(/^Was bedeutet (.+)$/i))) {
    return `${match[1]} bedeutet ${answer}.`;
  }
  if ((match = text.match(/^Wer schrieb (.+)$/i))) {
    return `${answer} schrieb ${match[1]}.`;
  }
  if ((match = text.match(/^Wer malte (.+)$/i))) {
    return `${answer} malte ${match[1]}.`;
  }
  if ((match = text.match(/^Wer komponierte (.+)$/i))) {
    return `${answer} komponierte ${match[1]}.`;
  }
  if ((match = text.match(/^Aus welchem Land stammt (.+)$/i))) {
    return `${match[1]} stammt aus ${answer}.`;
  }
  if ((match = text.match(/^In welchem Land liegt (.+)$/i))) {
    return `${match[1]} liegt in ${answer}.`;
  }
  if ((match = text.match(/^Auf welchem Kontinent liegt (.+)$/i))) {
    return `${match[1]} liegt auf dem Kontinent ${answer}.`;
  }

  return `Die richtige Antwort lautet „${answer}“.`;
}

function enrichQuestion(question) {
  return { ...question, explanation: buildExplanation(question) };
}

function enrichCatalog(catalog) {
  return Array.isArray(catalog) ? catalog.map(enrichQuestion) : [];
}

module.exports = {
  buildExplanation,
  enrichQuestion,
  enrichCatalog,
  correctAnswer,
  isWeakExplanation,
};
