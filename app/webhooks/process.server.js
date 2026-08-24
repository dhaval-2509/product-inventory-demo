import { authenticate, sessionStorage } from "../shopify.server";
import { markShopUninstalled, updateShopScopes } from "../models/shop.server";
import { createSyncLog } from "../models/sync-log.server";

function summarizePayload(topic, payload) {
  if (!payload || typeof payload !== "object") {
    return "Webhook received";
  }

  if (topic.includes("PRODUCT")) {
    const title = payload.title ?? payload.id ?? "product";
    return `Product ${title}`;
  }

  if (topic.includes("INVENTORY_LEVELS")) {
    return `Inventory item ${payload.inventory_item_id ?? ""} at location ${payload.location_id ?? ""} is ${payload.available ?? "updated"}`;
  }

  if (topic.includes("INVENTORY_ITEMS")) {
    return `Inventory item SKU ${payload.sku ?? payload.id ?? "updated"}`;
  }

  if (topic.includes("SCOPES")) {
    return `Updated scopes: ${payload.current ?? ""}`;
  }

  if (topic.includes("UNINSTALLED")) {
    return "App uninstalled";
  }

  return "Webhook received";
}

export async function processWebhook(request) {
  const { topic, shop, payload, session } = await authenticate.webhook(request);
  const normalizedTopic = String(topic || "UNKNOWN").toUpperCase();

  try {
    if (normalizedTopic.includes("UNINSTALLED")) {
      if (sessionStorage) {
        const sessions = await sessionStorage.findSessionsByShop(shop);
        if (sessions.length) {
          await sessionStorage.deleteSessions(sessions.map((item) => item.id));
        }
      }
      await markShopUninstalled(shop);
    }

    if (normalizedTopic.includes("SCOPES_UPDATE")) {
      await updateShopScopes(shop, payload?.current);
    }

    await createSyncLog({
      shop,
      topic: normalizedTopic,
      source: "webhook",
      status: "processed",
      message: summarizePayload(normalizedTopic, payload),
      payload,
    });
  } catch (error) {
    try {
      await createSyncLog({
        shop,
        topic: normalizedTopic,
        source: "webhook",
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to process webhook",
        payload,
      });
    } catch (logError) {
      console.error("Failed to store webhook error log", logError);
    }
  }

  return new Response();
}
