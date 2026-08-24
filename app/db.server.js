import { MongoClient } from "mongodb";

const DEFAULT_DB_NAME = "product_inventory";

function getMongoUri() {
  return process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
}

function getDbName() {
  return process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME;
}

function getClientPromise() {
  const uri = getMongoUri();

  if (process.env.NODE_ENV !== "production") {
    if (!global.mongoClientPromise) {
      const client = new MongoClient(uri);
      global.mongoClientPromise = client.connect();
    }
    return global.mongoClientPromise;
  }

  if (!global.mongoClientPromise) {
    const client = new MongoClient(uri);
    global.mongoClientPromise = client.connect();
  }

  return global.mongoClientPromise;
}

export async function getDb() {
  const client = await getClientPromise();
  const db = client.db(getDbName());
  await ensureIndexes(db);
  return db;
}

let indexesReady = false;

async function ensureIndexes(db) {
  if (indexesReady) return;
  await Promise.all([
    db.collection("shops").createIndex({ shop: 1 }, { unique: true }),
    db.collection("sync_logs").createIndex({ shop: 1, createdAt: -1 }),
    db.collection("shopify_sessions").createIndex({ id: 1 }, { unique: true }),
    db.collection("shopify_sessions").createIndex({ shop: 1 }),
  ]);
  indexesReady = true;
}

export async function getShopsCollection() {
  const db = await getDb();
  return db.collection("shops");
}

export async function getSyncLogsCollection() {
  const db = await getDb();
  return db.collection("sync_logs");
}

export { getDbName, getMongoUri };
