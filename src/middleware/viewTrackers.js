// src/middleware/viewTrackers.js
import db from "../database/db.js";

// prevent multiple increments on quick refreshes
// example: "pv_21" cookie for product 21, "sv_5" for store/seller 5
const THROTTLE_MINUTES = 30;

function hasRecentCookie(req, res, key) {
  if (req.cookies && req.cookies[key]) return true;
  // set cookie if not present
  res.cookie(key, "1", {
    httpOnly: false,           // readable by client (we just need presence)
    sameSite: "lax",
    maxAge: THROTTLE_MINUTES * 60 * 1000
  });
  return false;
}

export async function trackProductView(productId, sellerId, req, res) {
  if (!productId) return;
  const cookieKey = `pv_${productId}`;
  if (hasRecentCookie(req, res, cookieKey)) return;

  // total counter (UPSERT)
  await db.query(
    `
    INSERT INTO product_stats (product_id, views_total, last_viewed_at)
    VALUES ($1, 1, now())
    ON CONFLICT (product_id)
    DO UPDATE SET
      views_total = product_stats.views_total + 1,
      last_viewed_at = now();
    `,
    [productId]
  );

  // daily rollup (optional)
  await db.query(
    `
    INSERT INTO product_daily_views (product_id, view_date, views)
    VALUES ($1, CURRENT_DATE, 1)
    ON CONFLICT (product_id, view_date)
    DO UPDATE SET views = product_daily_views.views + 1;
    `,
    [productId]
  );
}

export async function trackStoreView(sellerId, req, res) {
  if (!sellerId) return;
  const cookieKey = `sv_${sellerId}`;
  if (hasRecentCookie(req, res, cookieKey)) return;

  await db.query(
    `
    INSERT INTO store_stats (seller_id, views_total, last_viewed_at)
    VALUES ($1, 1, now())
    ON CONFLICT (seller_id)
    DO UPDATE SET
      views_total = store_stats.views_total + 1,
      last_viewed_at = now();
    `,
    [sellerId]
  );

  await db.query(
    `
    INSERT INTO store_daily_views (seller_id, view_date, views)
    VALUES ($1, CURRENT_DATE, 1)
    ON CONFLICT (seller_id, view_date)
    DO UPDATE SET views = store_daily_views.views + 1;
    `,
    [sellerId]
  );
}
