const mongoose = require('mongoose');

const { normalizeDifficulty, difficultyRank } = require('../utils/revision');
const { computeBucketDueAt } = require('../utils/revisionBuckets');

const RevisionItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Uniqueness guard to prevent duplicates: `${source}:${ref}`
    questionKey: { type: String, required: true },

    source: { type: String, required: true },
    ref: { type: String, required: true },

    title: { type: String, required: true },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: null },
    difficultyRank: { type: Number, default: 0, index: true },

    link: { type: String, default: '' },
    topic: { type: String, default: '' },
    tags: { type: [String], default: [] },

    bucket: { type: String, enum: ['today', 'week', 'month'], required: true, index: true },
    bucketDueAt: { type: Date, default: null, index: true },

    lastCompletedAt: { type: Date, default: null },
    weekCompletedAt: { type: Date, default: null },
    monthCompletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

RevisionItemSchema.index({ userId: 1, questionKey: 1 }, { unique: true });

RevisionItemSchema.pre('validate', function preValidate(next) {
  if (this.source) this.source = String(this.source).trim().toLowerCase();
  if (this.ref) this.ref = String(this.ref).trim();

  if (this.source && this.ref) {
    // Case-insensitive key to avoid duplicates from casing differences.
    this.questionKey = `${this.source}:${String(this.ref).toLowerCase()}`;
  }

  if (this.difficulty) this.difficulty = normalizeDifficulty(this.difficulty) ?? this.difficulty;
  this.difficultyRank = difficultyRank(this.difficulty);

  if (this.bucket && !this.bucketDueAt) {
    this.bucketDueAt = computeBucketDueAt(this.bucket, new Date());
  }

  next();
});

module.exports = mongoose.model('RevisionItem', RevisionItemSchema);
