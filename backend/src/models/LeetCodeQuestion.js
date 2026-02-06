const mongoose = require('mongoose');
const { calculateNextRevisionDate, difficultyRank, normalizeDifficulty } = require('../utils/revision');

const LeetCodeQuestionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, index: true },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
    userSetDifficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: null },
    solvedDate: { type: Date, default: null },
    nextRevisionDate: { type: Date, default: null, index: true },
    difficultyRank: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

LeetCodeQuestionSchema.index({ userId: 1, slug: 1 }, { unique: true });

LeetCodeQuestionSchema.pre('validate', function preValidate(next) {
  if (this.difficulty) this.difficulty = normalizeDifficulty(this.difficulty) ?? this.difficulty;
  if (this.userSetDifficulty) {
    this.userSetDifficulty = normalizeDifficulty(this.userSetDifficulty) ?? this.userSetDifficulty;
  }

  // Rank by actual difficulty (Hardest first)
  this.difficultyRank = difficultyRank(this.difficulty);

  if (this.solvedDate && (this.userSetDifficulty || this.nextRevisionDate == null)) {
    this.nextRevisionDate = calculateNextRevisionDate({
      solvedDate: this.solvedDate,
      userSetDifficulty: this.userSetDifficulty ?? this.difficulty,
    });
  }

  next();
});

module.exports = mongoose.model('LeetCodeQuestion', LeetCodeQuestionSchema);
