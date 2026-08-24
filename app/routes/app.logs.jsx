import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { listSyncLogs } from "../models/sync-log.server";

function logTone(status) {
  if (status === "processed") return "success";
  if (status === "error") return "critical";
  return "info";
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const logs = await listSyncLogs(session.shop, { limit: 75 });

  return {
    shop: session.shop,
    logs: logs.map((log) => ({
      id: String(log._id),
      topic: log.topic,
      source: log.source,
      status: log.status,
      message: log.message,
      createdAt: log.createdAt,
      payload: log.payload ?? {},
    })),
  };
};

export default function LogsPage() {
  const { shop, logs } = useLoaderData();

  return (
    <s-page heading="Webhook and sync logs">
      <s-section heading="Synchronization history">
        <s-paragraph>
          Events stored for {shop}. This includes Shopify product and inventory
          webhooks plus inventory changes made in the app.
        </s-paragraph>
      </s-section>

      <s-section heading="Recent events">
        {logs.length === 0 ? (
          <s-banner heading="No events yet" tone="info">
            Install the app, update a product, or change inventory to see
            synchronization logs here.
          </s-banner>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">When</s-table-header>
              <s-table-header>Topic</s-table-header>
              <s-table-header>Source</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Details</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {logs.map((log) => (
                <s-table-row key={log.id}>
                  <s-table-cell>{formatDate(log.createdAt)}</s-table-cell>
                  <s-table-cell>{log.topic}</s-table-cell>
                  <s-table-cell>{log.source}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={logTone(log.status)}>{log.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{log.message}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
