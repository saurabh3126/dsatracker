const mongoose = require('mongoose');

const ArchivedRevisionItemSchema = new mongoose.Schema(
  {
    itemKey: { type: String, required: true },
    source: { type: String, required: true },
    ref: { type: String, required: true },
    title: { type: String, required: true },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: null },
    link: { type: String, default: '' },
    completedAt: { type: Date, required: true },
  },
  { _id: false }
);

const MonthlyRevisionArchiveSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Month key in IST: YYYY-MM
    monthKey: { type: String, required: true, index: true },

    items: { type: [ArchivedRevisionItemSchema], default: [] },
  },
  { timestamps: true }
);

MonthlyRevisionArchiveSchema.index({ userId: 1, monthKey: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyRevisionArchive', MonthlyRevisionArchiveSchema);
