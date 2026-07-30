'use strict';

(function exposeOfflineEngine(root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  if (root) root.AhnsenOfflineEngine = engine;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function calculateScore({ mode, correct, timedOut = false, remainingSeconds = 0 } = {}) {
    if (timedOut) return 0;
    if (mode === 'party') {
      return correct ? 10 + Math.max(0, Math.ceil(Number(remainingSeconds) || 0)) : -5;
    }
    return correct ? 10 : 0;
  }

  function currentRound(turnIndex, participantCount) {
    const count = Math.max(1, Number(participantCount) || 1);
    return Math.floor(Math.max(0, Number(turnIndex) || 0) / count) + 1;
  }

  function totalTurns(participantCount, rounds) {
    return Math.max(0, Number(participantCount) || 0) * Math.max(0, Number(rounds) || 0);
  }

  function validateParticipantNames(participants = []) {
    const names = participants.map(participant => String(participant?.name || '').trim());
    if (names.length < 2) return { ok: false, error: 'Mindestens zwei Teilnehmer sind erforderlich.' };
    if (names.some(name => !name)) return { ok: false, error: 'Bitte für alle Teilnehmer einen Namen eintragen.' };
    const unique = new Set(names.map(name => name.toLocaleLowerCase('de-DE')));
    if (unique.size !== names.length) return { ok: false, error: 'Jeder Name darf nur einmal vorkommen.' };
    return { ok: true, error: '' };
  }

  return {
    calculateScore,
    currentRound,
    totalTurns,
    validateParticipantNames,
  };
}));
