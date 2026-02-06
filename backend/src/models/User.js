const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, required: true, unique: true },
    passwordHash: { type: String, required: true },
    leetcodeUsername: { type: String, trim: true, required: true },
    neetcodeUsername: { type: String, trim: true },

    upcomingContest: {
      name: { type: String, trim: true },
      startsAt: { type: Date },
      url: { type: String, trim: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
