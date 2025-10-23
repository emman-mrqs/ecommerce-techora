// src/utils/healthChecks.js
import db from "../database/db.js";
import { insertAudit } from "./audit.js";

/**
 * recentlyExists:
 *   - checks whether an audit log with similar context was created within the window hours
 *   - if promoId/productId/variantId provided it queries the JSON details field directly
 */
async function recentlyExists({
  action,
  resource,
  sellerId,
  productId = null,
  variantId = null,
  promoId = null,
  windowHours = 24
}) {
  const where = [
    `action = $1`,
    `resource = $2`,
    `actor_type = 'seller'`,
    `actor_id = $3`,
    `created_at >= now() - ($4 * interval '1 hour')`
  ];
  const params = [action, resource, sellerId, windowHours];
  let idx = 5;

  if (productId != null) {
    where.push(`( (details->>'product_id')::int = $${idx} )`);
    params.push(productId);
    idx++;
  }
  if (variantId != null) {
    where.push(`( (details->>'variant_id')::int = $${idx} )`);
    params.push(variantId);
    idx++;
  }
  if (promoId != null) {
    where.push(`( (details->>'promotion_id')::int = $${idx} )`);
    params.push(promoId);
    idx++;
  }

  const sql = `
    SELECT 1 FROM audit_logs
    WHERE ${where.join(" AND ")}
    LIMIT 1
  `;
  try {
    const { rows } = await db.query(sql, params);
    return rows.length > 0;
  } catch (err) {
    console.error("recentlyExists db error:", err);
    // if DB lookup fails, be conservative (return false so system still inserts alerts),
    // but we log above.
    return false;
  }
}

/* =========================
  Low stock (per variant) - unchanged conceptually
========================= */
export async function checkLowStockForSeller({ sellerId, threshold = 10 }) {
  try {
    const sellerRes = await db.query("SELECT id, store_name FROM sellers WHERE id = $1 LIMIT 1", [sellerId]);
    const actorName = sellerRes.rows[0]?.store_name || `seller:${sellerId}`;

    const { rows } = await db.query(
      `SELECT p.id AS product_id,
              p.name AS product_name,
              v.id AS variant_id,
              COALESCE(v.stock_quantity,0)::int AS current_stock
       FROM products p
       JOIN product_variant v ON v.product_id = p.id
       WHERE p.seller_id = $1
         AND COALESCE(v.stock_quantity,0) <= $2
       ORDER BY p.id, v.id`,
      [sellerId, threshold]
    );

    for (const r of rows) {
      const exists = await recentlyExists({
        action: "low_stock_alert",
        resource: "product_variant",
        sellerId,
        productId: r.product_id,
        variantId: r.variant_id,
        windowHours: 24
      });
      if (exists) continue;

      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: actorName,
        action: "low_stock_alert",
        resource: "product_variant",
        details: {
          seller_id: sellerId,
          product_id: r.product_id,
          variant_id: r.variant_id,
          product_name: r.product_name,
          current_stock: Number(r.current_stock),
          threshold
        },
        ip: null,
        status: "success"
      });
    }
  } catch (err) {
    console.error("Low stock audit error:", err);
  }
}

/* =========================
  Low promotion qty
========================= */
export async function checkLowPromotionQtyForSeller({ sellerId, threshold = 5 }) {
  try {
    const sellerRes = await db.query("SELECT id, store_name FROM sellers WHERE id = $1 LIMIT 1", [sellerId]);
    const actorName = sellerRes.rows[0]?.store_name || `seller:${sellerId}`;

    const { rows } = await db.query(
      `SELECT id, voucher_code, usage_limit, COALESCE(used_count,0)::int AS used_count
       FROM promotions
       WHERE seller_id = $1
         AND usage_limit IS NOT NULL
         AND (usage_limit - COALESCE(used_count,0)) <= $2`,
      [sellerId, threshold]
    );

    for (const r of rows) {
      const remaining = Number(r.usage_limit) - Number(r.used_count);

      const exists = await recentlyExists({
        action: "low_promotion_qty",
        resource: "promotions",
        sellerId,
        promoId: r.id,
        windowHours: 24
      });
      if (exists) continue;

      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: actorName,
        action: "low_promotion_qty",
        resource: "promotions",
        details: {
          seller_id: sellerId,
          promotion_id: r.id,
          voucher_code: r.voucher_code,
          remaining,
          threshold
        },
        ip: null,
        status: "success"
      });
    }
  } catch (err) {
    console.error("Low promo audit error:", err);
  }
}

/* =========================
  Expiring promotions
  - windowDays: how many days ahead to consider "expiring soon"
  - dedupe ensures we don't spam the audit log
========================= */
export async function checkExpiringPromotionsForSeller({ sellerId, windowDays = 7 }) {
  try {
    const sellerRes = await db.query("SELECT id, store_name FROM sellers WHERE id = $1 LIMIT 1", [sellerId]);
    const actorName = sellerRes.rows[0]?.store_name || `seller:${sellerId}`;

    // use robust interval arithmetic: now() + ($2 * interval '1 day')
    const { rows } = await db.query(
      `SELECT id, voucher_code, expiry_date
       FROM promotions
       WHERE seller_id = $1
         AND expiry_date IS NOT NULL
         AND expiry_date >= now()
         AND expiry_date <= now() + ($2 * interval '1 day')
       ORDER BY expiry_date ASC`,
      [sellerId, windowDays]
    );

    for (const r of rows) {
      const daysToExpiry = r.expiry_date ? Math.ceil((new Date(r.expiry_date) - new Date()) / (1000*60*60*24)) : null;

      const exists = await recentlyExists({
        action: "promotion_expiring_soon",
        resource: "promotions",
        sellerId,
        promoId: r.id,
        windowHours: 24
      });
      if (exists) continue;

      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: actorName,
        action: "promotion_expiring_soon",
        resource: "promotions",
        details: {
          seller_id: sellerId,
          promotion_id: r.id,
          voucher_code: r.voucher_code,
          expiry_date: r.expiry_date,
          days_to_expiry: daysToExpiry
        },
        ip: null,
        status: "success"
      });
    }
  } catch (err) {
    console.error("Expiring promo audit error:", err);
  }
}

/* =========================
PROMOTION STATUS
========================= */

export async function checkAndMarkExpiredPromotionsForSeller({ sellerId }) {
  try {
    // Get seller info for actor_name
    const sellerRes = await db.query("SELECT id, store_name FROM sellers WHERE id = $1 LIMIT 1", [sellerId]);
    const actorName = sellerRes.rows[0]?.store_name || `seller:${sellerId}`;

    // 1) Find promotions that are past expiry but still not marked 'expired'
    const { rows } = await db.query(
      `SELECT id, voucher_code, expiry_date, status
       FROM promotions
       WHERE seller_id = $1
         AND expiry_date IS NOT NULL
         AND expiry_date < now()
         AND COALESCE(status, '') <> 'expired'`,
      [sellerId]
    );

    if (!rows.length) return;

    // 2) For each, update status => 'expired' and write audit (dedupe by checking recent logs)
    for (const promo of rows) {
      // update status
      await db.query(
        `UPDATE promotions SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [promo.id]
      );

      // avoid duplicate audit entries if one already exists in the last 24h
      const { rows: found } = await db.query(
        `SELECT 1 FROM audit_logs
         WHERE action = 'promotion_expired'
           AND resource = 'promotions'
           AND actor_type = 'seller'
           AND actor_id = $1
           AND (details->>'promotion_id')::int = $2
           AND created_at >= now() - interval '24 hours'
         LIMIT 1`,
        [sellerId, promo.id]
      );
      if (found.length) continue;

      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: actorName,
        action: "promotion_expired",
        resource: "promotions",
        details: {
          seller_id: sellerId,
          promotion_id: promo.id,
          voucher_code: promo.voucher_code,
          expiry_date: promo.expiry_date
        },
        ip: null,
        status: "success"
      });
    }
  } catch (err) {
    console.error("checkAndMarkExpiredPromotionsForSeller error:", err);
  }
}