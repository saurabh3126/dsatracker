const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV !== 'test') {
    // Keep server runnable for local dev, but this should be overridden in real deployments.
    console.warn('[auth] JWT_SECRET is missing/too short. Using an insecure fallback for local dev.');
  }

  return secret || 'dev-insecure-jwt-secret-change-me';
}

async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function signToken(payload, options = {}) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d', ...options });
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

function sanitizeUser(userDoc) {
  if (!userDoc) return null;
  const obj = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  delete obj.passwordHash;
  return obj;
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  sanitizeUser,
};
