// src/controller/sellerOrdersController.js
import db from "../database/db.js";

export const renderSellerOrders = async (req, res) => {
  try {
    const userId = req.session.user.id;

    // find seller
    const sellerRes = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      return res.redirect("/seller-application");
    }
    const sellerId = sellerRes.rows[0].id;

    // --- pagination params ---
    const perPage = 5;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset = (page - 1) * perPage;

    // --- total count (distinct orders that include this seller's items) ---
    const countRes = await db.query(
      `
      SELECT COUNT(DISTINCT o.id) AS total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p ON p.id = v.product_id
      WHERE p.seller_id = $1
      `,
      [sellerId]
    );
    const totalOrders = Number(countRes.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalOrders / perPage));

    // --- data page (one row per order for THIS seller) ---
    // We aggregate quantities and seller-side total, and show the first item for image/name.
    const ordersRes = await db.query(
      `
      SELECT 
        o.id AS order_id,
        o.created_at AS order_date,
        o.order_status,
        o.shipping_address,
        o.payment_status AS order_payment_status,
        u.name AS customer_name,
        s.store_name,

        -- seller-side aggregates
        SUM(oi.quantity) AS quantity,
        SUM(oi.unit_price * oi.quantity)::numeric(12,2) AS total_price,

        -- representative product for card/list (first item from this seller in the order)
        fi.product_name,
        fi.product_image,

        -- latest payment (if any)
        pay.payment_method,
        pay.payment_status,
        pay.transaction_id,
        pay.amount_paid,
        pay.payment_date

      FROM orders o
      JOIN users u ON u.id = o.user_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p ON p.id = v.product_id
      JOIN sellers s ON s.id = p.seller_id

      -- first item (for this seller in this order)
      LEFT JOIN LATERAL (
        SELECT p2.name AS product_name,
               (SELECT img_url 
                  FROM product_images 
                 WHERE product_id = p2.id AND is_primary = true 
                 ORDER BY position ASC NULLS LAST, id ASC
                 LIMIT 1) AS product_image
        FROM order_items oi2
        JOIN product_variant v2 ON v2.id = oi2.product_variant_id
        JOIN products p2 ON p2.id = v2.product_id
        WHERE oi2.order_id = o.id AND p2.seller_id = $1
        ORDER BY oi2.id ASC
        LIMIT 1
      ) fi ON TRUE

      -- latest payment for the order
      LEFT JOIN LATERAL (
        SELECT pmt.*
          FROM payments pmt
         WHERE pmt.order_id = o.id
         ORDER BY pmt.payment_date DESC NULLS LAST, pmt.id DESC
         LIMIT 1
      ) AS pay ON TRUE

      WHERE p.seller_id = $1
      GROUP BY 
        o.id, o.created_at, o.order_status, o.shipping_address, o.payment_status,
        u.name, s.store_name, fi.product_name, fi.product_image,
        pay.payment_method, pay.payment_status, pay.transaction_id, pay.amount_paid, pay.payment_date
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [sellerId, perPage, offset]
    );

    res.render("seller/sellerOrders", {
      activePage: "orders",
      pageTitle: "Seller Orders",
      orders: ordersRes.rows,
      // pagination info for EJS
      page,
      perPage,
      totalOrders,
      totalPages,
    });
  } catch (err) {
    console.error("❌ Error fetching seller orders:", err);
    res.status(500).send("Server error");
  }
};

// ==========Update order status (and finalize COD payments if needed)=============
export const updateOrderStatus = async (req, res) => {
  const cx = await db.connect();
  try {
    const { order_id, order_status } = req.body;

    await cx.query("BEGIN");

    // Update the order status
    await cx.query(
      "UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2",
      [order_status, order_id]
    );

    // If marking as completed/delivered, ensure COD payment is completed too
    const normalized = String(order_status).toLowerCase();
    if (normalized === "completed" || normalized === "delivered") {
      // Get order total and current payment (latest)
      const { rows: ordRows } = await cx.query(
        "SELECT total_amount, payment_status FROM orders WHERE id = $1",
        [order_id]
      );
      const orderTotal = Number(ordRows[0]?.total_amount || 0);

      const { rows: payRows } = await cx.query(
        `
        SELECT id, payment_method, payment_status, transaction_id
        FROM payments
        WHERE order_id = $1
        ORDER BY payment_date DESC NULLS LAST, id DESC
        LIMIT 1
        `,
        [order_id]
      );

      // Helper: generate a COD transaction id
      const genTxnId = () => `COD-${order_id}-${Date.now()}`;

      if (payRows.length === 0) {
        // No payment row yet -> create completed COD payment now
        await cx.query(
          `
          INSERT INTO payments (order_id, payment_method, payment_status, transaction_id, amount_paid, payment_date)
          VALUES ($1, 'cod', 'completed', $2, $3, NOW())
          `,
          [order_id, genTxnId(), orderTotal]
        );
        // Mark order as paid
        await cx.query(
          "UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1",
          [order_id]
        );
      } else {
        const pay = payRows[0];
        if (pay.payment_method === "cod" && pay.payment_status !== "completed") {
          // Complete pending/unpaid COD
          await cx.query(
            `
            UPDATE payments
            SET payment_status = 'completed',
                transaction_id = COALESCE(transaction_id, $2),
                amount_paid = $3,
                payment_date = NOW()
            WHERE id = $1
            `,
            [pay.id, pay.transaction_id || genTxnId(), orderTotal]
          );
          await cx.query(
            "UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1",
            [order_id]
          );
        }
      }
    }

    await cx.query("COMMIT");
    res.json({
      success: true,
      message: "Order status updated successfully!",
      newStatus: order_status
    });
  } catch (err) {
    try { await cx.query("ROLLBACK"); } catch {}
    console.error("❌ Error updating order status:", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    cx.release();
  }
};

// Filter orders (unchanged logic; still fine to keep simple list)
export const filterSellerOrders = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { status, date, search } = req.body;

    const sellerRes = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      return res.json({ success: false, orders: [] });
    }
    const sellerId = sellerRes.rows[0].id;

    let query = `
      SELECT 
        o.id AS order_id, o.created_at AS order_date, o.order_status, o.shipping_address,
        u.name AS customer_name, p.name AS product_name,
        oi.quantity, (oi.unit_price * oi.quantity) AS total_price,
        img.img_url AS product_image
      FROM orders o
      JOIN users u ON u.id = o.user_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p ON p.id = v.product_id
      LEFT JOIN product_images img ON img.product_id = p.id AND img.is_primary = true
      WHERE p.seller_id = $1
    `;
    const values = [sellerId];

    if (status) {
      values.push(status);
      query += ` AND o.order_status = $${values.length}`;
    }
    if (date && !isNaN(date)) {
      values.push(parseInt(date, 10));
      query += ` AND o.created_at >= NOW() - make_interval(days => $${values.length})`;
    }
    if (search) {
      values.push(`%${search}%`);
      values.push(`%${search}%`);
      query += ` AND (o.id::text ILIKE $${values.length - 1} OR u.name ILIKE $${values.length})`;
    }

    query += ` ORDER BY o.created_at DESC`;

    const result = await db.query(query, values);

    res.json({ success: true, orders: result.rows });
  } catch (err) {
    console.error("Error filtering orders:", err);
    res.json({ success: false, orders: [] });
  }
};

// ============== delete Orders ==============
// ============== delete Orders (controller-only fix: delete replies/reviews first) ==============
export const deleteSellerOrderItems = async (req, res) => {
  const client = await db.connect();
  let inTxn = false;

  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Login required." });
    }

    // Accept body (POST) or URL param /seller/orders/:orderId
    const orderIdRaw = req.body?.order_id ?? req.params?.orderId;
    const orderId = Number(orderIdRaw);
    if (!Number.isFinite(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order_id." });
    }

    // Resolve seller
    const sellerRes = await client.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      return res.status(403).json({ success: false, message: "Seller not found or not approved." });
    }
    const sellerId = sellerRes.rows[0].id;

    await client.query("BEGIN");
    inTxn = true;

    // 1) Figure out which order_items (for THIS seller in THIS order) we’re removing.
    const toDelRes = await client.query(
      `
      SELECT oi.id            AS order_item_id,
             oi.product_variant_id AS variant_id,
             oi.quantity      AS quantity
      FROM order_items oi
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p        ON p.id = v.product_id
      WHERE oi.order_id = $1
        AND p.seller_id = $2
      `,
      [orderId, sellerId]
    );

    if (toDelRes.rowCount === 0) {
      await client.query("ROLLBACK"); inTxn = false;
      return res.status(404).json({
        success: false,
        message: "No items from this order belong to your store, or they were already removed."
      });
    }

    const orderItemIds = toDelRes.rows.map(r => r.order_item_id);

    // 2) Delete DEPENDENTS first (controller-only fix)
    //    2a) review_replies for reviews that point to these order_items
    await client.query(
      `
      DELETE FROM review_replies rr
      USING product_reviews pr
      WHERE rr.review_id = pr.id
        AND pr.order_item_id = ANY($1::bigint[])
      `,
      [orderItemIds]
    );

    //    2b) product_reviews for these order_items
    await client.query(
      `
      DELETE FROM product_reviews
      WHERE order_item_id = ANY($1::bigint[])
      `,
      [orderItemIds]
    );

    // 3) Delete the seller’s order_items themselves (now FKs are clear)
    const delItemsRes = await client.query(
      `
      DELETE FROM order_items oi
      USING (SELECT UNNEST($1::bigint[]) AS id) t
      WHERE oi.id = t.id
      RETURNING oi.product_variant_id AS variant_id, oi.quantity
      `,
      [orderItemIds]
    );

    // 4) Restock removed variants (aggregate by variant_id)
    const needByVariant = new Map();
    for (const r of delItemsRes.rows) {
      const vid = Number(r.variant_id);
      const qty = Number(r.quantity);
      needByVariant.set(vid, (needByVariant.get(vid) || 0) + qty);
    }
    for (const [vid, qty] of needByVariant.entries()) {
      await client.query(
        `
        UPDATE product_variant
           SET stock_quantity = stock_quantity + $2,
               updated_at     = NOW()
         WHERE id = $1
        `,
        [vid, qty]
      );
    }

    // 5) Any items left on the order?
    const leftRows = await client.query(
      `
      SELECT COALESCE(SUM(unit_price * quantity), 0)::numeric AS subtotal,
             COUNT(*)::int                                  AS cnt
      FROM order_items
      WHERE order_id = $1
      `,
      [orderId]
    );
    const remainingCount = Number(leftRows.rows[0]?.cnt || 0);

    if (remainingCount === 0) {
      // no items left → remove payments + order row
      await client.query(`DELETE FROM payments WHERE order_id = $1`, [orderId]);
      await client.query(`DELETE FROM orders   WHERE id       = $1`, [orderId]);

      await client.query("COMMIT"); inTxn = false;
      return res.json({
        success: true,
        removedItems: delItemsRes.rowCount,
        orderDeleted: true,
        message: "Order fully removed (no items remaining)."
      });
    }

    // 6) Recompute total (12% tax)
    const subtotal = Number(leftRows.rows[0].subtotal || 0);
    const tax = subtotal * 0.12;
    const newTotal = Number((subtotal + tax).toFixed(2));

    await client.query(
      `
      UPDATE orders
         SET total_amount = $2,
             updated_at   = NOW()
       WHERE id = $1
      `,
      [orderId, newTotal]
    );

    await client.query("COMMIT"); inTxn = false;
    return res.json({
      success: true,
      removedItems: delItemsRes.rowCount,
      orderDeleted: false,
      newTotal,
      message: "Your products in this order have been removed and stock was restored."
    });
  } catch (err) {
    if (inTxn) { try { await client.query("ROLLBACK"); } catch {} }
    console.error("❌ deleteSellerOrderItems error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  } finally {
    try { client.release(); } catch {}
  }
};
