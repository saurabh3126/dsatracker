const express = require('express');
const mongoose = require('mongoose');

const User = require('../models/User');
const { hashPassword, verifyPassword, signToken, sanitizeUser } = require('../utils/auth');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

function requireMongo(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'MongoDB not connected',
      hint: 'Set MONGO_URI in your .env and restart the server',
    });
  }
  next();
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  // Basic sanity check (intentionally simple).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

router.post('/signup', requireMongo, async (req, res) => {
  try {
    const { name, email, password, leetcodeUsername, neetcodeUsername } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'valid email is required' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    // Signup-only collection requirement
    if (!leetcodeUsername || typeof leetcodeUsername !== 'string' || !leetcodeUsername.trim()) {
      return res.status(400).json({ error: 'leetcodeUsername is required at signup' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(409).json({ error: 'email already in use' });
    }

    const passwordHash = await hashPassword(password);

    const userDoc = {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      leetcodeUsername: leetcodeUsername.trim(),
    };

    if (typeof neetcodeUsername === 'string' && neetcodeUsername.trim()) {
      userDoc.neetcodeUsername = neetcodeUsername.trim();
    }

    const user = await User.create(userDoc);

    const token = signToken({ sub: user._id.toString() });

    return res.status(201).json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    // Handle duplicate key errors
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'email already in use' });
    }
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', requireMongo, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'valid email is required' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'password is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({ sub: user._id.toString() });

    return res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', requireMongo, requireAuth, async (req, res) => {
  return res.json({ user: req.user });
});

router.patch('/me', requireMongo, requireAuth, async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const upcomingContest = req.body?.upcomingContest;
  if (!upcomingContest || typeof upcomingContest !== 'object') {
    return res.status(400).json({ error: 'upcomingContest object is required' });
  }

  const name = typeof upcomingContest.name === 'string' ? upcomingContest.name.trim() : '';
  const url = typeof upcomingContest.url === 'string' ? upcomingContest.url.trim() : '';
  const startsAtRaw = upcomingContest.startsAt;
  const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;

  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return res.status(400).json({ error: 'upcomingContest.startsAt must be a valid date' });
  }

  // Limit name/url length to keep profile payload small.
  if (name.length > 120) return res.status(400).json({ error: 'upcomingContest.name too long' });
  if (url.length > 500) return res.status(400).json({ error: 'upcomingContest.url too long' });

  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        'upcomingContest.name': name || null,
        'upcomingContest.startsAt': startsAt,
        'upcomingContest.url': url || null,
      },
    },
    { new: true }
  );

  return res.json({ user: sanitizeUser(updated) });
});

module.exports = router;
