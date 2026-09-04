// One-off script: copies all collections from local MongoDB (MONGO_URI)
// into MongoDB Atlas (ATLAS_URI). Run with: node backend/utils/migrateToAtlas.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const SOURCE_URI = process.env.MONGO_URI;
const TARGET_URI = process.env.ATLAS_URI;
const BATCH_SIZE = 500;

async function migrate() {
  if (!SOURCE_URI) throw new Error('MONGO_URI is not set in .env');
  if (!TARGET_URI) throw new Error('ATLAS_URI is not set in .env');

  const srcClient = new MongoClient(SOURCE_URI);
  const dstClient = new MongoClient(TARGET_URI);

  await srcClient.connect();
  await dstClient.connect();

  const srcDb = srcClient.db();
  const dstDb = dstClient.db();

  console.log(`Source DB: ${srcDb.databaseName}`);
  console.log(`Target DB: ${dstDb.databaseName}`);

  const collections = await srcDb.listCollections().toArray();
  if (collections.length === 0) {
    console.log('No collections found in source database. Nothing to migrate.');
  }

  for (const { name } of collections) {
    const srcColl = srcDb.collection(name);
    const dstColl = dstDb.collection(name);

    const total = await srcColl.countDocuments();
    console.log(`\nCollection "${name}": ${total} documents`);

    if (total === 0) continue;

    await dstColl.deleteMany({}); // clean slate for idempotent re-runs
    const cursor = srcColl.find({});
    let batch = [];
    let migrated = 0;

    while (await cursor.hasNext()) {
      batch.push(await cursor.next());
      if (batch.length >= BATCH_SIZE) {
        await dstColl.insertMany(batch, { ordered: false });
        migrated += batch.length;
        process.stdout.write(`  ${migrated}/${total}\r`);
        batch = [];
      }
    }
    if (batch.length > 0) {
      await dstColl.insertMany(batch, { ordered: false });
      migrated += batch.length;
    }
    console.log(`  ${migrated}/${total} done`);

    // Recreate indexes (skip the default _id index)
    const indexes = await srcColl.indexes();
    for (const idx of indexes) {
      if (idx.name === '_id_') continue;
      const { key, name: idxName, ...opts } = idx;
      try {
        await dstColl.createIndex(key, { name: idxName, ...opts });
      } catch (e) {
        console.warn(`  index "${idxName}" skipped: ${e.message}`);
      }
    }
  }

  await srcClient.close();
  await dstClient.close();
  console.log('\nMigration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
