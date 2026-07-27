'use strict';

function calculateAnswerScore({ correct, questionEndsAt, answeredAt }) {
  const remainingMilliseconds = Math.max(0, Number(questionEndsAt) - Number(answeredAt));
  const remainingSeconds = Math.ceil(remainingMilliseconds / 1000);
  return {
    remainingSeconds,
    points: correct ? 10 + remainingSeconds : -5
  };
}

module.exports = { calculateAnswerScore };
