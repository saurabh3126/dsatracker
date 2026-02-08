const mongoose = require('mongoose');

async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    return { connected: false, reason: 'MONGO_URI not set' };
  }

  if (mongoose.connection.readyState === 1) {
    return { connected: true, reason: 'already connected' };
  }

  try {
    await mongoose.connect(uri, {
      // Fail fast if Mongo isn't reachable (helpful for local dev).
      serverSelectionTimeoutMS: Math.max(1000, Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000)),
    });
    return { connected: true, reason: 'connected' };
  } catch (err) {
    return {
      connected: false,
      reason: err?.message || 'connect failed',
    };
  }
}

async function disconnectMongo() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close(false);
}

module.exports = { connectMongo, disconnectMongo };
