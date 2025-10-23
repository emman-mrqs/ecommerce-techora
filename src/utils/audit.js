// src/utils/audit.js
import db from "../database/db.js";

/**
 * insertAudit - helper to insert an audit log row.
 */
export async function insertAudit({
  actor_type = "system",
  actor_id = null,
  actor_name = null,
  action,
  resource = null,
  details = null,
  ip = null,
  status = "success",
}) {
  if (!action) throw new Error("insertAudit: `action` is required");

  const sql = `
    INSERT INTO audit_logs
      (actor_type, actor_id, actor_name, action, resource, details, ip, status, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
    RETURNING *;
  `;
  const vals = [
    actor_type,
    actor_id,
    actor_name,
    action,
    resource,
    details ? JSON.stringify(details) : null,
    ip || null,
    status,
  ];

  try {
    const { rows } = await db.query(sql, vals);
    console.log("[audit] insert successful, id =", rows[0]?.id);
    return rows[0];
  } catch (err) {
    console.error("[audit] insert failed:", err?.message || err);
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  NEW: Per-seller order audits so seller bell can show “Order placed/updated”
/* -------------------------------------------------------------------------- */

/**
 * Emit one audit row per seller involved in the order.
 * Called right after an order and its items are saved.
 */
export async function emitOrderPlacedAudits({ orderId, buyerId }) {
  // Buyer info (optional in UI)
  const { rows: urows } = await db.query(
    `SELECT id, name, email FROM users WHERE id = $1 LIMIT 1`,
    [buyerId]
  );
  const buyer = urows[0] || {};

  // Sellers present in the order + seller-side total
  const { rows: sellers } = await db.query(
    `
    SELECT p.seller_id,
           SUM(oi.unit_price * oi.quantity)::numeric(12,2) AS seller_total
    FROM order_items oi
    JOIN product_variant v ON v.id = oi.product_variant_id
    JOIN products p        ON p.id = v.product_id
    WHERE oi.order_id = $1
    GROUP BY p.seller_id
    `,
    [orderId]
  );

  for (const s of sellers) {
    const sellerId = Number(s.seller_id);

    // Store name for actor_name (nice in UI)
    const { rows: srow } = await db.query(
      `SELECT store_name FROM sellers WHERE id = $1 LIMIT 1`,
      [sellerId]
    );

    await insertAudit({
      actor_type: "seller",
      actor_id: sellerId,
      actor_name: srow[0]?.store_name || null,
      action: "order_placed",                // <- picked up by middleware/poller
      resource: "orders",
      details: {
        seller_id: sellerId,                 // <- CRITICAL so it targets the seller
        order_id: orderId,
        buyer_id: buyer.id,
        buyer_name: buyer.name,
        buyer_email: buyer.email,
        total_amount: s.seller_total,        // seller-side total
        order_status: "pending"              // or your initial status
      },
      status: "success"
    });
  }
}

/**
 * Emit one “order_updated” audit per seller in the order.
 * Call this whenever you change an order’s status (or other meaningful fields).
 */
export async function emitOrderUpdatedAudits({ orderId, orderStatus }) {
  // Find sellers in this order
  const { rows: sellers } = await db.query(
    `
    SELECT DISTINCT p.seller_id
    FROM order_items oi
    JOIN product_variant v ON v.id = oi.product_variant_id
    JOIN products p        ON p.id = v.product_id
    WHERE oi.order_id = $1
    `,
    [orderId]
  );

  // Buyer snapshot (optional)
  const { rows: brow } = await db.query(
    `SELECT u.id, u.name, u.email
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
      WHERE o.id = $1`,
    [orderId]
  );
  const buyer = brow[0] || {};

  for (const s of sellers) {
    const sellerId = Number(s.seller_id);
    const { rows: srow } = await db.query(
      `SELECT store_name FROM sellers WHERE id = $1 LIMIT 1`,
      [sellerId]
    );

    await insertAudit({
      actor_type: "seller",
      actor_id: sellerId,
      actor_name: srow[0]?.store_name || null,
      action: "order_updated",               // <- picked up by middleware/poller
      resource: "orders",
      details: {
        seller_id: sellerId,                 // <- target this seller
        order_id: orderId,
        buyer_id: buyer.id,
        buyer_name: buyer.name,
        buyer_email: buyer.email,
        order_status: orderStatus || null
      },
      status: "success"
    });
  }
}
