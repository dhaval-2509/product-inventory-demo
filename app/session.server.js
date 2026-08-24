import { Session } from "@shopify/shopify-api";
import { getDb } from "./db.server";

function toSession(document) {
  if (!document) return undefined;
  const { _id, ...data } = document;
  return new Session({
    ...data,
    expires: data.expires ? new Date(data.expires) : undefined,
    refreshTokenExpires: data.refreshTokenExpires
      ? new Date(data.refreshTokenExpires)
      : undefined,
  });
}

export class MongoSessionStorage {
  async collection() {
    const db = await getDb();
    return db.collection("shopify_sessions");
  }

  async storeSession(session) {
    const collection = await this.collection();
    await collection.updateOne(
      { id: session.id },
      { $set: session.toObject() },
      { upsert: true },
    );
    return true;
  }

  async loadSession(id) {
    const collection = await this.collection();
    return toSession(await collection.findOne({ id }));
  }

  async deleteSession(id) {
    const collection = await this.collection();
    await collection.deleteOne({ id });
    return true;
  }

  async deleteSessions(ids) {
    const collection = await this.collection();
    await collection.deleteMany({ id: { $in: ids } });
    return true;
  }

  async findSessionsByShop(shop) {
    const collection = await this.collection();
    const rows = await collection.find({ shop }).toArray();
    return rows.map(toSession);
  }
}
