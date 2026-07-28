'use strict';

function calculateAnswerScore({ correct, remainingSeconds }) {
  if (!correct) return -5;
  const seconds = Math.max(0, Math.floor(Number(remainingSeconds) || 0));
  return 10 + seconds;
}

module.exports = { calculateAnswerScore };
