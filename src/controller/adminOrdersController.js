import db from "../database/db.js";

/**
 * GET /admin/orders
 * Show orders grouped by seller; each order is seller-scoped (sum only that seller's items)
 */
export const renderAdminOrders = async (req, res) => {
  try {
    const ordersRes = await db.query(`
      SELECT
        s.id          AS seller_id,
        s.store_name  AS store_name,
        o.id          AS order_id,
        o.created_at  AS order_date,
        o.order_status,
        u.name        AS customer_name,
        u.email       AS customer_email,
        COALESCE(SUM(oi.total_price),0) AS seller_total,
        COALESCE(SUM(oi.quantity),0)    AS total_items,
        (SELECT payment_method FROM payments p WHERE p.order_id = o.id ORDER BY payment_date DESC NULLS LAST, id DESC LIMIT 1) AS payment_method,
        (SELECT payment_status FROM payments p WHERE p.order_id = o.id ORDER BY payment_date DESC NULLS LAST, id DESC LIMIT 1) AS payment_status
      FROM order_items oi
      JOIN product_variant pv ON pv.id = oi.product_variant_id
      JOIN products p         ON p.id = pv.product_id
      JOIN sellers s          ON s.id = p.seller_id
      JOIN orders o           ON o.id = oi.order_id
      JOIN users u            ON u.id = o.user_id
      GROUP BY s.id, s.store_name, o.id, o.created_at, o.order_status, u.name, u.email
      ORDER BY s.store_name ASC, o.created_at DESC, o.id DESC
    `);

    const itemsRes = await db.query(`
      SELECT
        oi.order_id,
        s.id         AS seller_id,
        p.name       AS product_name,
        pv.storage, pv.ram, pv.color,
        oi.quantity,
        oi.total_price
      FROM order_items oi
      JOIN product_variant pv ON pv.id = oi.product_variant_id
      JOIN products p         ON p.id = pv.product_id
      JOIN sellers s          ON s.id = p.seller_id
      ORDER BY oi.order_id ASC, oi.id ASC
    `);

    const itemsMap = new Map();
    for (const it of itemsRes.rows) {
      const key = `${it.seller_id}|${it.order_id}`;
      if (!itemsMap.has(key)) itemsMap.set(key, []);
      itemsMap.get(key).push({
        product_name: it.product_name,
        storage: it.storage,
        ram: it.ram,
        color: it.color,
        quantity: Number(it.quantity),
        line_total: Number(it.total_price)
      });
    }

    const bySeller = new Map();
    for (const r of ordersRes.rows) {
      if (!bySeller.has(r.seller_id)) {
        bySeller.set(r.seller_id, {
          seller_id: r.seller_id,
          store_name: r.store_name,
          orders: []
        });
      }
      const key = `${r.seller_id}|${r.order_id}`;
      bySeller.get(r.seller_id).orders.push({
        order_id: r.order_id,
        order_date: r.order_date,
        order_status: r.order_status,
        customer_name: r.customer_name,
        customer_email: r.customer_email,
        seller_total: Number(r.seller_total),
        total_items: Number(r.total_items),
        payment_method: r.payment_method || null,
        payment_status: r.payment_status || null,
        items: itemsMap.get(key) || []
      });
    }

    const sellers = Array.from(bySeller.values());

    res.render("admin/adminOrders", {
      activePage: "orders",
      pageTitle: "Orders Management",
      sellers,
      toast: req.session.toast || null
    });
    delete req.session.toast;
  } catch (err) {
    console.error("Error rendering admin orders:", err);
    res.status(500).send("Error loading orders");
  }
};

/**
 * GET /admin/orders/:orderId/seller/:sellerId (JSON)
 * Invoice payload (seller-scoped order view like the seller dashboard)
 */
export const adminGetInvoice = async (req, res) => {
  const { orderId, sellerId } = req.params;

  try {
    const baseRes = await db.query(`
      SELECT
        o.id                 AS order_id,
        o.order_status,
        o.total_amount,
        o.created_at        AS created_at,
        o.shipping_address,
        u.name              AS customer_name,
        u.email             AS customer_email,
        s.id                AS seller_id,
        s.store_name
      FROM orders o
      JOIN users u  ON u.id = o.user_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant pv ON pv.id = oi.product_variant_id
      JOIN products p ON p.id = pv.product_id
      JOIN sellers s  ON s.id = p.seller_id
      WHERE o.id = $1 AND s.id = $2
      LIMIT 1
    `, [orderId, sellerId]);

    if (baseRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Invoice not found" });
    }
    const base = baseRes.rows[0];

    const itemsRes = await db.query(`
      SELECT
        p.name  AS product_name,
        pv.storage, pv.ram, pv.color,
        oi.quantity,
        oi.total_price
      FROM order_items oi
      JOIN product_variant pv ON pv.id = oi.product_variant_id
      JOIN products p         ON p.id = pv.product_id
      JOIN sellers s          ON s.id = p.seller_id
      WHERE oi.order_id = $1 AND s.id = $2
      ORDER BY oi.id ASC
    `, [orderId, sellerId]);

    const payRes = await db.query(`
      SELECT payment_method, payment_status, transaction_id, amount_paid, payment_date
      FROM payments
      WHERE order_id = $1
      ORDER BY payment_date DESC NULLS LAST, id DESC
      LIMIT 1
    `, [orderId]);

    const invoice = {
      order_id: base.order_id,
      order_status: base.order_status,
      created_at: base.created_at,
      customer_name: base.customer_name,
      customer_email: base.customer_email,
      shipping_address: base.shipping_address,
      store_name: base.store_name,
      items: itemsRes.rows.map(r => ({
        product_name: r.product_name,
        specs: [r.storage, r.ram, r.color].filter(Boolean).join(" / "),
        quantity: Number(r.quantity),
        line_total: Number(r.total_price)
      })),
      payment: payRes.rows[0] || null
    };
    invoice.seller_total = invoice.items.reduce((a, b) => a + b.line_total, 0);

    res.json({ ok: true, invoice });
  } catch (err) {
    console.error("Error building invoice:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

/**
 * POST /admin/orders/:orderId/seller/:sellerId/delete
 * Admin deletes the portion of an order that belongs to a specific seller.
 */
export const adminDeleteSellerOrder = async (req, res) => {
  const { orderId, sellerId } = req.params;

  try {
    await db.query("BEGIN");

    // Order items for this seller in this order
    const oiRes = await db.query(
      `
      SELECT oi.id
      FROM order_items oi
      JOIN product_variant pv ON pv.id = oi.product_variant_id
      JOIN products p         ON p.id = pv.product_id
      WHERE oi.order_id = $1
        AND p.seller_id = $2
      `,
      [orderId, sellerId]
    );
    const itemIds = oiRes.rows.map(r => r.id);

    if (itemIds.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "No seller items in this order." });
    }

    // Delete dependents
    await db.query(`
      DELETE FROM review_replies
      WHERE review_id IN (SELECT id FROM product_reviews WHERE order_item_id = ANY($1))
    `, [itemIds]);

    await db.query(`
      DELETE FROM product_reviews
      WHERE order_item_id = ANY($1)
    `, [itemIds]);

    // Delete the seller's order_items
    const delItemsRes = await db.query(
      `DELETE FROM order_items WHERE id = ANY($1)`,
      [itemIds]
    );

    // Recalculate / remove order if empty
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total_price),0)::numeric AS new_total
       FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    const remaining = countRes.rows[0].cnt;
    const newTotal = countRes.rows[0].new_total;

    let orderEmpty = false;
    if (remaining === 0) {
      await db.query(`DELETE FROM payments WHERE order_id = $1`, [orderId]);
      await db.query(`DELETE FROM orders   WHERE id = $1`, [orderId]);
      orderEmpty = true;
    } else {
      await db.query(`UPDATE orders SET total_amount = $2 WHERE id = $1`, [orderId, newTotal]);
    }

    await db.query("COMMIT");

    res.json({
      ok: true,
      deleted_items: delItemsRes.rowCount || itemIds.length,
      order_empty: orderEmpty
    });
  } catch (err) {
    console.error("adminDeleteSellerOrder error:", err);
    try { await db.query("ROLLBACK"); } catch {}
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

//Edit each of sellers orders
// Edit each of sellers orders (scoped to seller; robust)
export const adminUpdateOrderStatus = async (req, res) => {
  const client = await db.connect();
  try {
    const { orderId, sellerId } = req.params;
    const order_id = parseInt(orderId, 10);
    const seller_id = parseInt(sellerId, 10);
    const raw = (req.body?.order_status ?? "").toString().trim().toLowerCase();

    // basic validation / normalization
    const allowed = new Set([
      "pending", "confirmed", "shipped", "delivered", "completed", "cancelled", "return"
    ]);
    if (!allowed.has(raw)) {
      return res.status(400).json({ ok: false, error: "Invalid order_status" });
    }

    await client.query("BEGIN");

    // Ensure this order contains items from this seller, then update
    const upd = await client.query(
      `
      UPDATE orders o
         SET order_status = $1,
             updated_at   = NOW()
       WHERE o.id = $2
         AND EXISTS (
               SELECT 1
               FROM order_items oi
               JOIN product_variant pv ON pv.id = oi.product_variant_id
               JOIN products p         ON p.id = pv.product_id
               WHERE oi.order_id = o.id
                 AND p.seller_id = $3
             )
      RETURNING o.id, o.total_amount
      `,
      [raw, order_id, seller_id]
    );

    if (upd.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        error: "Order not found for this seller (or already removed)."
      });
    }

    // finalize COD if needed when completed/delivered
    if (raw === "completed" || raw === "delivered") {
      const orderTotal = Number(upd.rows[0].total_amount || 0);

      const payRows = await client.query(
        `
        SELECT id, payment_method, payment_status, transaction_id
        FROM payments
        WHERE order_id = $1
        ORDER BY payment_date DESC NULLS LAST, id DESC
        LIMIT 1
        `,
        [order_id]
      );

      const genTxnId = () => `COD-${order_id}-${Date.now()}`;

      if (payRows.rowCount === 0) {
        // create completed COD row & mark order paid
        await client.query(
          `
          INSERT INTO payments (order_id, payment_method, payment_status, transaction_id, amount_paid, payment_date)
          VALUES ($1, 'cod', 'completed', $2, $3, NOW())
          `,
          [order_id, genTxnId(), orderTotal]
        );
        await client.query(
          "UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1",
          [order_id]
        );
      } else {
        const pay = payRows.rows[0];
        if (pay.payment_method === "cod" && pay.payment_status !== "completed") {
          await client.query(
            `
            UPDATE payments
               SET payment_status = 'completed',
                   transaction_id = COALESCE(transaction_id, $2),
                   amount_paid    = $3,
                   payment_date   = NOW()
             WHERE id = $1
            `,
            [pay.id, pay.transaction_id || genTxnId(), orderTotal]
          );
          await client.query(
            "UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1",
            [order_id]
          );
        }
      }
    }

    await client.query("COMMIT");
    return res.json({ ok: true, newStatus: raw });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("adminUpdateOrderStatus error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  } finally {
    client.release();
  }
};

