import { useEffect, useMemo, useState } from "react";
import { Form, useFetcher, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShop } from "../models/shop.server";
import { createSyncLog } from "../models/sync-log.server";

const PRODUCT_INVENTORY_QUERY = `#graphql
  query ProductInventory($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      nodes {
        id
        title
        status
        handle
        featuredMedia {
          preview {
            image {
              url
              altText
            }
          }
        }
        variants(first: 50) {
          nodes {
            id
            title
            sku
            inventoryQuantity
            inventoryItem {
              id
              tracked
              inventoryLevels(first: 10) {
                nodes {
                  location {
                    id
                    name
                  }
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
    locations(first: 20) {
      nodes {
        id
        name
        isActive
      }
    }
  }
`;

const INVENTORY_SET_QUANTITIES = `#graphql
  mutation InventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup {
        reason
        changes {
          name
          delta
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function availableAtLocation(variant, locationId) {
  const levels = variant.inventoryItem?.inventoryLevels?.nodes ?? [];
  const level = levels.find((item) => item.location?.id === locationId);
  const available = level?.quantities?.find((item) => item.name === "available");

  if (typeof available?.quantity === "number") {
    return available.quantity;
  }

  return variant.inventoryQuantity ?? 0;
}

function flattenRows(products, locationId) {
  return products.flatMap((product) =>
    (product.variants?.nodes ?? []).map((variant) => ({
      productId: product.id,
      productTitle: product.title,
      status: product.status,
      imageUrl: product.featuredMedia?.preview?.image?.url ?? "",
      imageAlt: product.featuredMedia?.preview?.image?.altText ?? product.title,
      variantId: variant.id,
      variantTitle: variant.title,
      sku: variant.sku || "—",
      tracked: Boolean(variant.inventoryItem?.tracked),
      inventoryItemId: variant.inventoryItem?.id ?? "",
      quantity: availableAtLocation(variant, locationId),
    })),
  );
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const requestedLocationId = url.searchParams.get("locationId") ?? "";

  const response = await admin.graphql(PRODUCT_INVENTORY_QUERY, {
    variables: {
      first: 25,
      query: q || null,
    },
  });
  const json = await response.json();
  const products = json.data?.products?.nodes ?? [];
  const hasNextPage = Boolean(json.data?.products?.pageInfo?.hasNextPage);
  const locations = (json.data?.locations?.nodes ?? []).filter(
    (location) => location.isActive,
  );
  const locationId =
    locations.find((location) => location.id === requestedLocationId)?.id ??
    locations[0]?.id ??
    "";
  const shopDoc = await getShop(session.shop).catch(() => null);

  return {
    q,
    locationId,
    locations,
    hasNextPage,
    shopName: shopDoc?.name ?? session.shop,
    shopDomain: shopDoc?.myshopifyDomain ?? session.shop,
    rows: flattenRows(products, locationId),
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const inventoryItemId = String(formData.get("inventoryItemId") || "");
  const locationId = String(formData.get("locationId") || "");
  const quantity = Number(formData.get("quantity"));
  const productTitle = String(formData.get("productTitle") || "");
  const sku = String(formData.get("sku") || "");

  if (!inventoryItemId || !locationId || Number.isNaN(quantity) || quantity < 0) {
    return { ok: false, error: "Enter a valid quantity and location." };
  }

  const response = await admin.graphql(INVENTORY_SET_QUANTITIES, {
    variables: {
      idempotencyKey: crypto.randomUUID(),
      input: {
        name: "available",
        reason: "correction",
        quantities: [
          {
            inventoryItemId,
            locationId,
            quantity,
            changeFromQuantity: null,
          },
        ],
      },
    },
  });
  const json = await response.json();
  const userErrors = json.data?.inventorySetQuantities?.userErrors ?? [];
  const graphQLErrors = json.errors ?? [];
  const error =
    userErrors[0]?.message || graphQLErrors[0]?.message || null;

  await createSyncLog({
    shop: session.shop,
    topic: "APP_INVENTORY_UPDATE",
    source: "app",
    status: error ? "error" : "processed",
    message: error
      ? error
      : `Set ${productTitle} (${sku}) to ${quantity}`,
    payload: { inventoryItemId, locationId, quantity, productTitle, sku },
  }).catch(() => undefined);

  return error ? { ok: false, error } : { ok: true };
};

function statusTone(status) {
  if (status === "ACTIVE") return "success";
  if (status === "DRAFT") return "info";
  return "neutral";
}

function VariantRow({ row, locationId }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [quantity, setQuantity] = useState(String(row.quantity ?? 0));
  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    setQuantity(String(row.quantity ?? 0));
  }, [row.quantity, row.variantId]);

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Inventory updated");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  return (
    <s-table-row>
      <s-table-cell>
        <s-stack direction="inline" gap="base" alignItems="center">
          {row.imageUrl ? (
            <s-thumbnail src={row.imageUrl} alt={row.imageAlt} size="small" />
          ) : null}
          <s-stack direction="block" gap="base">
            <s-text type="strong">{row.productTitle}</s-text>
            <s-text color="subdued">{row.variantTitle}</s-text>
          </s-stack>
        </s-stack>
      </s-table-cell>
      <s-table-cell>
        <s-badge tone={statusTone(row.status)}>{row.status}</s-badge>
      </s-table-cell>
      <s-table-cell>{row.sku}</s-table-cell>
      <s-table-cell>
        {row.tracked ? (
          <s-number-field
            label="Quantity"
            labelAccessibilityVisibility="exclusive"
            value={quantity}
            min={0}
            step={1}
            onChange={(event) => setQuantity(event.currentTarget.value)}
          />
        ) : (
          <s-text color="subdued">Not tracked</s-text>
        )}
      </s-table-cell>
      <s-table-cell>
        <s-button
          variant="secondary"
          disabled={!row.tracked || !row.inventoryItemId || !locationId}
          {...(isSaving ? { loading: true } : {})}
          onClick={() =>
            fetcher.submit(
              {
                inventoryItemId: row.inventoryItemId,
                locationId,
                quantity,
                productTitle: row.productTitle,
                sku: row.sku,
              },
              { method: "POST" },
            )
          }
        >
          Update
        </s-button>
      </s-table-cell>
    </s-table-row>
  );
}

export default function InventoryPage() {
  const { q, locationId, locations, hasNextPage, shopName, shopDomain, rows } =
    useLoaderData();
  const navigation = useNavigation();
  const isSearching = navigation.state === "loading";
  const locationName = useMemo(
    () => locations.find((location) => location.id === locationId)?.name,
    [locations, locationId],
  );

  return (
    <s-page heading="Product inventory">
      <s-section heading={shopName}>
        <s-paragraph>
          Products and variants from {shopDomain}. Search the catalog, review SKU
          and available quantity, then update inventory for{" "}
          {locationName || "the selected location"}.
        </s-paragraph>
      </s-section>

      <s-section heading="Find products">
        <Form method="get">
          <s-grid gridTemplateColumns="1fr 1fr auto" gap="base" alignItems="end">
            <s-search-field
              label="Search products"
              name="q"
              value={q}
              placeholder="Search by title, SKU, or barcode"
            />
            <s-select label="Location" name="locationId" value={locationId}>
              {locations.map((location) => (
                <s-option key={location.id} value={location.id}>
                  {location.name}
                </s-option>
              ))}
            </s-select>
            <s-button type="submit" variant="secondary">
              Apply
            </s-button>
          </s-grid>
        </Form>
      </s-section>

      <s-section heading="Variants">
        {isSearching ? (
          <s-spinner accessibilityLabel="Loading products" />
        ) : rows.length === 0 ? (
          <s-banner heading="No products found" tone="info">
            Try another search, or add products in the Shopify admin.
          </s-banner>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>SKU</s-table-header>
              <s-table-header>Available</s-table-header>
              <s-table-header listSlot="labeled">Inventory</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((row) => (
                <VariantRow
                  key={row.variantId}
                  row={row}
                  locationId={locationId}
                />
              ))}
            </s-table-body>
          </s-table>
        )}
        {hasNextPage ? (
          <s-paragraph color="subdued">
            Showing the first 25 matching products. Narrow the search to find a
            specific SKU.
          </s-paragraph>
        ) : null}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
