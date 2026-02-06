const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeDifficulty(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (v === 'easy') return 'Easy';
  if (v === 'medium') return 'Medium';
  if (v === 'hard') return 'Hard';
  return null;
}

function difficultyRank(difficulty) {
  const normalized = normalizeDifficulty(difficulty);
  if (normalized === 'Hard') return 3;
  if (normalized === 'Medium') return 2;
  if (normalized === 'Easy') return 1;
  return 0;
}

function revisionIntervalDays(userSetDifficulty) {
  const normalized = normalizeDifficulty(userSetDifficulty);
  if (normalized === 'Hard') return 7;
  if (normalized === 'Easy') return 14;
  // Not specified in prompt; picked a reasonable default.
  if (normalized === 'Medium') return 10;
  return 14;
}

function calculateNextRevisionDate({ solvedDate, userSetDifficulty }) {
  const base = solvedDate ? new Date(solvedDate) : new Date();
  if (Number.isNaN(base.getTime())) {
    throw new Error('Invalid solvedDate');
  }

  const days = revisionIntervalDays(userSetDifficulty);
  return new Date(base.getTime() + days * MS_PER_DAY);
}

module.exports = {
  normalizeDifficulty,
  difficultyRank,
  revisionIntervalDays,
  calculateNextRevisionDate,
};
