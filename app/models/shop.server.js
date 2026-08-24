import { getShopsCollection } from "../db.server";

const SHOP_INFO_QUERY = `#graphql
  query ShopInfo {
    shop {
      id
      name
      email
      myshopifyDomain
      currencyCode
      plan {
        publicDisplayName
      }
      primaryDomain {
        url
      }
    }
  }
`;

export async function upsertInstalledShop({ session, admin }) {
  const shopResponse = await admin.graphql(SHOP_INFO_QUERY);
  const shopJson = await shopResponse.json();
  const shopInfo = shopJson.data?.shop;

  const shops = await getShopsCollection();
  const now = new Date();

  await shops.updateOne(
    { shop: session.shop },
    {
      $set: {
        shop: session.shop,
        shopifyId: shopInfo?.id ?? null,
        name: shopInfo?.name ?? session.shop,
        email: shopInfo?.email ?? null,
        myshopifyDomain: shopInfo?.myshopifyDomain ?? session.shop,
        currencyCode: shopInfo?.currencyCode ?? null,
        planName: shopInfo?.plan?.publicDisplayName ?? null,
        primaryDomain: shopInfo?.primaryDomain?.url ?? null,
        scope: session.scope ?? null,
        isInstalled: true,
        uninstalledAt: null,
        updatedAt: now,
      },
      $setOnInsert: {
        installedAt: now,
      },
    },
    { upsert: true },
  );
}

export async function getShop(shop) {
  const shops = await getShopsCollection();
  return shops.findOne({ shop });
}

export async function updateShopScopes(shop, scopes) {
  const shops = await getShopsCollection();
  await shops.updateOne(
    { shop },
    {
      $set: {
        scope: Array.isArray(scopes) ? scopes.join(",") : String(scopes ?? ""),
        updatedAt: new Date(),
      },
    },
  );
}

export async function markShopUninstalled(shop) {
  const shops = await getShopsCollection();
  await shops.updateOne(
    { shop },
    {
      $set: {
        isInstalled: false,
        uninstalledAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );
}
