/*
  One-time migration for RevisionItem indexes.

  Why:
  - Previously RevisionItem had a unique index on { userId, questionKey }, which prevented
    the same question from being added to multiple buckets (e.g., Week + Today).
  - Now uniqueness is scoped to bucket: { userId, questionKey, bucket }.

  Run:
    node scripts/migrateRevisionIndexes.js

  Requires:
  - MONGO_URI in .env
*/

require('dotenv').config();
const mongoose = require('mongoose');

const { connectMongo, disconnectMongo } = require('../backend/src/db/connect');
const RevisionItem = require('../backend/src/models/RevisionItem');

async function main() {
  const conn = await connectMongo();
  if (!conn.connected) {
    console.error('Mongo not connected:', conn.reason);
    process.exitCode = 1;
    return;
  }

  try {
    const coll = RevisionItem.collection;
    const indexes = await coll.indexes();

    const oldIndex = indexes.find((i) => i?.name === 'userId_1_questionKey_1');
    if (oldIndex) {
      console.log('Dropping old unique index:', oldIndex.name);
      await coll.dropIndex(oldIndex.name);
    } else {
      console.log('Old index not found (OK).');
    }

    console.log('Syncing indexes with current schema...');
    await RevisionItem.syncIndexes();

    const after = await coll.indexes();
    console.log('Current indexes:', after.map((i) => i.name));
  } finally {
    await disconnectMongo();
    await mongoose.disconnect().catch(() => null);
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exitCode = 1;
});
