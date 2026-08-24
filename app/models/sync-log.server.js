import { getSyncLogsCollection } from "../db.server";

export async function createSyncLog({
  shop,
  topic,
  source = "webhook",
  status = "processed",
  message,
  payload,
}) {
  const logs = await getSyncLogsCollection();
  const doc = {
    shop,
    topic,
    source,
    status,
    message: message ?? "",
    payload: payload ?? {},
    createdAt: new Date(),
  };

  const result = await logs.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function listSyncLogs(shop, { limit = 50 } = {}) {
  const logs = await getSyncLogsCollection();
  return logs.find({ shop }).sort({ createdAt: -1 }).limit(limit).toArray();
}
