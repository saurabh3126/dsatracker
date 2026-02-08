const mongoose = require('mongoose');

const { normalizeDifficulty, difficultyRank } = require('../utils/revision');

const SolvedQuestionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Uniqueness guard: `${source}:${ref}`
    questionKey: { type: String, required: true },

    source: { type: String, required: true },
    ref: { type: String, required: true },

    title: { type: String, required: true },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: null },
    difficultyRank: { type: Number, default: 0, index: true },

    link: { type: String, default: '' },

    notes: { type: String, default: '' },

    solvedAt: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true }
);

SolvedQuestionSchema.index({ userId: 1, questionKey: 1 }, { unique: true });

SolvedQuestionSchema.pre('validate', function preValidate(next) {
  if (this.source) this.source = String(this.source).trim().toLowerCase();
  if (this.ref) this.ref = String(this.ref).trim();

  if (this.source && this.ref) {
    this.questionKey = `${this.source}:${String(this.ref).toLowerCase()}`;
  }

  if (this.difficulty) this.difficulty = normalizeDifficulty(this.difficulty) ?? this.difficulty;
  this.difficultyRank = difficultyRank(this.difficulty);

  next();
});

module.exports = mongoose.model('SolvedQuestion', SolvedQuestionSchema);
