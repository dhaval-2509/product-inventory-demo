import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Product inventory for Shopify</h1>
        <p className={styles.text}>
          Search products, review SKUs, update inventory, and watch webhook sync
          logs from one embedded admin app.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Catalog and inventory.</strong> View variants, SKUs, and
            available quantities, then update stock from the app.
          </li>
          <li>
            <strong>Live synchronization.</strong> Product and inventory webhooks
            are stored so merchants can audit what changed.
          </li>
          <li>
            <strong>Production ready storage.</strong> Shop sessions, shop
            records, and sync logs live in MongoDB for Vercel deployments.
          </li>
        </ul>
      </div>
    </div>
  );
}
