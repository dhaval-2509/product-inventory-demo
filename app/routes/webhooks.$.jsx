import { processWebhook } from "../webhooks/process.server";

export const action = async ({ request }) => {
  return processWebhook(request);
};
