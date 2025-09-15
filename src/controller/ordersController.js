// src/controller/ordersController.js
import db from "../database/db.js";

// Who am I? (also returns the Express session ID)
export async function getMe(req, res) {
  if (!req.session?.user) return res.status(401).json({ loggedIn: false });
  const { id, name, email } = req.session.user;
  return res.json({ loggedIn: true, sessionID: req.sessionID, user: { id, name, email } });
}

// List my orders (aggregated with items)
export async function getMyOrders(req, res) {
  if (!req.session?.user) return res.status(401).json({ error: "Not logged in" });
  const userId = req.session.user.id;

  // Optional filters
  const q = (req.query.q || "").trim();
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const { rows } = await db.query(
    `
    WITH base AS (
      SELECT
        o.id,
        o.created_at,
        o.order_status,
        o.payment_status,
        o.payment_method,
        o.total_amount,
        o.shipping_address,
        COALESCE(
          json_agg(
            json_build_object(
              'variant_id', oi.product_variant_id,
              'name', p.name,
              'qty', oi.quantity,
              'price', oi.unit_price,
              'color', pv.color,
              'ram',   pv.ram,
              'storage', pv.storage,
              'image', (
                SELECT img_url FROM product_images pi
                 WHERE (pi.product_variant_id = pv.id OR pi.product_id = p.id)
                 ORDER BY is_primary DESC NULLS LAST, position ASC NULLS LAST, id ASC
                 LIMIT 1
              )
            )
          ) FILTER (WHERE oi.id IS NOT NULL), '[]'
        ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN product_variant pv ON pv.id = oi.product_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE o.user_id = $1
      GROUP BY o.id
    )
    SELECT
      id,
      created_at,
      order_status,
      payment_status,
      payment_method,
      total_amount,
      shipping_address,
      items,
      -- Map DB statuses to your UI tabs
      CASE
        WHEN payment_status = 'unpaid' AND order_status = 'pending'     THEN 'To Pay'
        WHEN payment_status = 'paid'   AND order_status IN ('confirmed','paid') THEN 'To Ship'
        WHEN order_status = 'shipped'  THEN 'To Receive'
        WHEN order_status = 'completed' THEN 'Completed'
        WHEN order_status = 'cancelled' THEN 'Cancelled'
        ELSE 'To Pay'
      END AS ui_status
    FROM base
    WHERE ($2 = '' OR EXISTS (
      SELECT 1 FROM json_array_elements(items) it
      WHERE LOWER(it->>'name') LIKE ('%' || LOWER($2) || '%')
    ) OR CAST(id AS TEXT) ILIKE ('%' || $2 || '%'))
    ORDER BY created_at DESC
    LIMIT $3 OFFSET $4
    `,
    [userId, q, limit, offset]
  );

  // Add a nice display code like TE2025-000123
  const year = new Date().getFullYear();
  const out = rows.map(r => ({
    id: r.id,                    // numeric DB id
    code: `TE${year}-${String(r.id).padStart(6, '0')}`,
    created_at: r.created_at,
    order_status: r.order_status,
    payment_status: r.payment_status,
    payment_method: r.payment_method,
    total_amount: r.total_amount,
    shipping_address: r.shipping_address,
    items: r.items,
    ui_status: r.ui_status
  }));
  res.json(out);
}

// Single order (details + payments)
export async function getMyOrderDetail(req, res) {
  if (!req.session?.user) return res.status(401).json({ error: "Not logged in" });
  const userId = req.session.user.id;
  const orderId = Number(req.params.orderId);

  const { rows } = await db.query(
    `
    SELECT
      o.id,
      o.created_at,
      o.order_status,
      o.payment_status,
      o.payment_method,
      o.total_amount,
      o.shipping_address,
      COALESCE(json_agg(
        json_build_object(
          'variant_id', oi.product_variant_id,
          'name', p.name,
          'qty', oi.quantity,
          'price', oi.unit_price,
          'color', pv.color,
          'ram',   pv.ram,
          'storage', pv.storage
        )
      ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items,
      COALESCE(json_agg(
        DISTINCT jsonb_build_object(
          'id', pay.id,
          'status', pay.payment_status,
          'method', pay.payment_method,
          'transaction_id', pay.transaction_id,
          'amount', pay.amount_paid,
          'date', pay.payment_date
        )
      ) FILTER (WHERE pay.id IS NOT NULL), '[]') AS payments
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN product_variant pv ON pv.id = oi.product_variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    LEFT JOIN payments pay ON pay.order_id = o.id
    WHERE o.user_id = $1 AND o.id = $2
    GROUP BY o.id
    `,
    [userId, orderId]
  );

  if (!rows.length) return res.status(404).json({ error: "Order not found" });
  res.json(rows[0]);
}
