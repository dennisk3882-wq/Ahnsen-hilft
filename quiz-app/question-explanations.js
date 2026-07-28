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

function buildExplanation(question) {
  const custom = clean(question?.explanation);
  if (custom) return custom;

  const text = withoutQuestionMark(question?.text);
  const answer = correctAnswer(question);
  if (!answer) return 'Die richtige Lösung wird nach der Antwort angezeigt.';

  let match;
  if ((match = text.match(/^Welche Farbe entsteht aus (.+) und (.+)$/i))) {
    return `Wenn man ${match[1]} und ${match[2]} mischt, entsteht ${answer}.`;
  }
  if ((match = text.match(/^Was misst man mit (?:einem|einer) (.+)$/i))) {
    return `Mit ${match[1]} misst man ${answer}.`;
  }
  if ((match = text.match(/^Womit misst man (.+)$/i))) {
    return `${match[1]} misst man mit ${answer}.`;
  }
  if ((match = text.match(/^Womit (.+)$/i))) {
    return `Dafür verwendet man ${answer}.`;
  }
  if ((match = text.match(/^Wie viele (.+) (?:hat|haben|sind) (.+)$/i))) {
    return `${match[2]} hat beziehungsweise haben ${answer} ${match[1]}.`;
  }
  if (/^Wie viele /i.test(text)) {
    return `${answer} ist die richtige Anzahl.`;
  }
  if (/^Wie lange /i.test(text)) {
    return `${answer} ist die richtige Zeitangabe.`;
  }
  if (/^Wie hoch /i.test(text)) {
    return `${answer} ist die richtige Höhenangabe.`;
  }
  if (/^Wie groß /i.test(text)) {
    return `${answer} ist die richtige Größenangabe.`;
  }
  if (/^Wie nennt man /i.test(text) || /^Wie heißt /i.test(text)) {
    return `${answer} ist die richtige Bezeichnung.`;
  }
  if (/^Wer /i.test(text)) {
    return `${answer} ist die gesuchte Person beziehungsweise Figur.`;
  }
  if (/^(Wo|In welchem Land|In welcher Stadt|Auf welchem Kontinent) /i.test(text)) {
    return `${answer} ist der gesuchte Ort.`;
  }
  if (/^(Wann|In welchem Jahr|In welchem Jahrhundert) /i.test(text)) {
    return `${answer} ist der richtige Zeitpunkt.`;
  }
  if (/^Welcher Tag /i.test(text)) {
    return `${answer} ist der richtige Wochentag.`;
  }
  if (/^Welcher Monat /i.test(text)) {
    return `${answer} ist der richtige Monat.`;
  }
  if (/^Welche Jahreszeit /i.test(text) || /Jahreszeit/i.test(text)) {
    return `${answer} ist die passende Jahreszeit.`;
  }
  if (/^Welche Zahl /i.test(text) || /^Was ist .*\d/i.test(text) || /Hälfte|Doppelte|Summe|Ergebnis/i.test(text)) {
    return `${answer} ist das richtige Rechenergebnis.`;
  }
  if (/^Welches Tier /i.test(text) || /^Welche Tier/i.test(text)) {
    return `${answer} ist das gesuchte Tier.`;
  }
  if (/^Welche Pflanze /i.test(text) || /^Welcher Baum /i.test(text)) {
    return `${answer} ist die gesuchte Pflanze.`;
  }
  if (/^Welches Instrument /i.test(text)) {
    return `${answer} ist das gesuchte Musikinstrument.`;
  }
  if (/^Welcher Song|^Welches Lied|^Welche Band|^Welcher Sänger|^Welche Sängerin/i.test(text)) {
    return `${answer} ist die richtige Lösung aus dem Bereich Musik.`;
  }
  if (/^Welcher Film|^Welche Serie|^Welche Figur|^Welcher Schauspieler|^Welche Schauspielerin/i.test(text)) {
    return `${answer} ist die richtige Lösung aus Film und Fernsehen.`;
  }
  if (/^Welche Sportart|^Welcher Verein|^Welche Mannschaft|^Welcher Spieler/i.test(text)) {
    return `${answer} ist die richtige Lösung aus dem Bereich Sport.`;
  }
  if (/^Welche Sprache /i.test(text)) {
    return `${answer} ist die gesuchte Sprache.`;
  }
  if (/^Welche Form /i.test(text)) {
    return `${answer} ist die richtige geometrische Form.`;
  }
  if (/^Welche Farbe /i.test(text)) {
    return `${answer} ist die richtige Farbe.`;
  }
  if (/^Welches Gerät /i.test(text) || /^Welcher Gegenstand /i.test(text) || /^Welches Werkzeug /i.test(text)) {
    return `${answer} ist der passende Gegenstand dafür.`;
  }
  if (/^Was bedeutet /i.test(text) || /^Wofür steht /i.test(text)) {
    return `${answer} ist die richtige Bedeutung.`;
  }
  if (/^Was braucht /i.test(text)) {
    return `${answer} wird dafür benötigt.`;
  }
  if (/^Was zeigt /i.test(text)) {
    return `${answer} wird damit angezeigt.`;
  }
  if (/^Was ist das Gegenteil /i.test(text)) {
    return `${answer} ist das passende Gegenteil.`;
  }
  if (/^Was entsteht /i.test(text)) {
    return `Dabei entsteht ${answer}.`;
  }
  if (/^Was /i.test(text)) {
    return `${answer} beantwortet diese Frage richtig.`;
  }
  if (/^(Welcher|Welche|Welches) /i.test(text)) {
    return `${answer} ist hier die richtige Auswahl.`;
  }
  if (/^(Richtig oder falsch|Stimmt es)/i.test(text)) {
    return `${answer} ist korrekt.`;
  }

  const category = clean(question?.category);
  return category
    ? `Die richtige Antwort ist ${answer}. Diese Frage gehört zur Kategorie „${category}“.`
    : `Die richtige Antwort ist ${answer}.`;
}

function enrichQuestion(question) {
  return { ...question, explanation: buildExplanation(question) };
}

function enrichCatalog(catalog) {
  return Array.isArray(catalog) ? catalog.map(enrichQuestion) : [];
}

module.exports = { buildExplanation, enrichQuestion, enrichCatalog, correctAnswer };