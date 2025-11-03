// src/controller/sellerOrdersController.js
import db from "../database/db.js";
import { insertAudit } from "../utils/audit.js";

/** helper: resolve seller id + store_name for the logged-in user */
async function getSellerForUser(userId) {
  const { rows } = await db.query(
    `SELECT id, store_name
       FROM sellers
      WHERE user_id = $1
        AND status = 'approved'
      LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;
  return { sellerId: rows[0].id, storeName: rows[0].store_name || null };
}

export const renderSellerOrders = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const seller = await getSellerForUser(userId);
    if (!seller) return res.redirect("/seller-application");

    const { sellerId } = seller;

    // --- pagination params ---
    const perPage = 5;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset = (page - 1) * perPage;

    // --- total count (number of seller order_items) ---
    const countRes = await db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM order_items oi
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p ON p.id = v.product_id
      WHERE p.seller_id = $1
      `,
      [sellerId]
    );
    const totalOrders = Number(countRes.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalOrders / perPage));

    // --- data page: one row per order_item that belongs to this seller ---
    // --- data page: one row per order_item that belongs to this seller ---
    const ordersRes = await db.query(
      `
      SELECT
        oi.id AS order_item_id,
        o.id AS order_id,
        o.created_at AS order_date,
        o.order_status,
        o.shipping_address,
        o.payment_status AS order_payment_status,
        u.name AS customer_name,
        s.store_name,

        -- product info (for this order_item)
        p.id AS product_id,
        p.name AS product_name,
        (SELECT img_url
           FROM product_images pi
          WHERE pi.product_id = p.id
            AND pi.is_primary = true
          ORDER BY position ASC NULLS LAST
          LIMIT 1) AS product_image,

        oi.quantity,
        oi.unit_price,
        oi.item_status AS item_status,
        (oi.unit_price * oi.quantity)::numeric(12,2) AS total_price,

        -- latest payment (if any) for whole order
        pay.payment_method,
        pay.payment_status,
        pay.transaction_id,
        pay.amount_paid,
        pay.payment_date

      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN users u ON u.id = o.user_id
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p ON p.id = v.product_id
      JOIN sellers s ON s.id = p.seller_id

      LEFT JOIN LATERAL (
        SELECT pmt.*
        FROM payments pmt
        WHERE pmt.order_id = o.id
        ORDER BY pmt.payment_date DESC NULLS LAST, pmt.id DESC
        LIMIT 1
      ) pay ON TRUE

      WHERE p.seller_id = $1
      ORDER BY o.created_at DESC, oi.id ASC
      LIMIT $2 OFFSET $3
      `,
      [sellerId, perPage, offset]
    );


    // Render: now each row corresponds to a single order_item
    res.render("seller/sellerOrders", {
      activePage: "orders",
      pageTitle: "Seller Orders",
      orders: ordersRes.rows,
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

// ========== Update order status (and finalize COD payments if needed) ==========
// Adds an audit row with action 'order_updated'
// ========== Update order item status (seller) ==========
export const updateOrderStatus = async (req, res) => {
  const cx = await db.connect();
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Login required." });

    const seller = await getSellerForUser(userId);
    if (!seller) return res.status(403).json({ success: false, message: "Seller not found or not approved." });
    const { sellerId, storeName } = seller;

    // Expect order_item_id (id of order_items) and item_status (new)
    const { order_item_id, order_status } = req.body;
    const orderItemId = Number(order_item_id);
    if (!Number.isFinite(orderItemId)) {
      return res.status(400).json({ success: false, message: "Invalid order_item_id." });
    }

    await cx.query("BEGIN");

    // 1) Verify ownership and fetch current item info
    const ownershipRes = await cx.query(
      `SELECT oi.id AS order_item_id,
              oi.order_id,
              oi.item_status AS prev_item_status,
              p.id AS product_id,
              p.seller_id
         FROM order_items oi
         JOIN product_variant v ON v.id = oi.product_variant_id
         JOIN products p ON p.id = v.product_id
        WHERE oi.id = $1
        LIMIT 1`,
      [orderItemId]
    );

    if (ownershipRes.rowCount === 0) {
      await cx.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Order item not found." });
    }

    const oi = ownershipRes.rows[0];
    if (Number(oi.seller_id) !== Number(sellerId)) {
      await cx.query("ROLLBACK");
      return res.status(403).json({ success: false, message: "You are not allowed to update this item." });
    }

    const prevItemStatus = oi.prev_item_status || null;
    const orderId = Number(oi.order_id);

    // 2) Update only this order_items.item_status
// 2) Update only this order_items.item_status — RETURN the updated row
const updateRes = await cx.query(
  `UPDATE order_items
     SET item_status = $1,
         updated_at = NOW()
   WHERE id = $2
   RETURNING id AS order_item_id, item_status, updated_at, order_id`,
  [order_status, orderItemId]
);

if (updateRes.rowCount === 0) {
  await cx.query("ROLLBACK");
  return res.status(404).json({ success: false, message: "Failed to update order item." });
}
const updatedItem = updateRes.rows[0];


    // 3) Check if all items of this order are now completed/delivered
    const allStatusRes = await cx.query(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE(item_status,'') NOT IN ('completed','delivered'))::int AS pending_count,
         COUNT(*)::int AS total_items
       FROM order_items
       WHERE order_id = $1`,
      [orderId]
    );

    const pendingCount = Number(allStatusRes.rows[0]?.pending_count || 0);
    const totalItems = Number(allStatusRes.rows[0]?.total_items || 0);

    let orderUpdated = false;
    let codCompleted = false;
    let codTxnId = null;

    if (totalItems > 0 && pendingCount === 0) {
      // 4) If all items complete -> update parent orders status (finalize)
      await cx.query(
        `UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2`,
        [order_status, orderId]
      );
      orderUpdated = true;

      // 5) COD finalize logic (keeps your existing behaviour)
      const normalized = String(order_status).toLowerCase();
      if (normalized === "completed" || normalized === "delivered") {
        const { rows: ordRows } = await cx.query(
          "SELECT total_amount, payment_status FROM orders WHERE id = $1",
          [orderId]
        );
        const orderTotal = Number(ordRows[0]?.total_amount || 0);

        const { rows: payRows } = await cx.query(
          `SELECT id, payment_method, payment_status, transaction_id
             FROM payments
            WHERE order_id = $1
            ORDER BY payment_date DESC NULLS LAST, id DESC
            LIMIT 1`,
          [orderId]
        );

        const genTxnId = () => `COD-${orderId}-${Date.now()}`;

        if (payRows.length === 0) {
          codTxnId = genTxnId();
          await cx.query(
            `INSERT INTO payments (order_id, payment_method, payment_status, transaction_id, amount_paid, payment_date)
             VALUES ($1, 'cod', 'completed', $2, $3, NOW())`,
            [orderId, codTxnId, orderTotal]
          );
          await cx.query("UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1", [orderId]);
          codCompleted = true;
        } else {
          const pay = payRows[0];
          if (pay.payment_method === "cod" && pay.payment_status !== "completed") {
            codTxnId = pay.transaction_id || genTxnId();
            await cx.query(
              `UPDATE payments
                  SET payment_status = 'completed',
                      transaction_id = COALESCE(transaction_id, $2),
                      amount_paid = $3,
                      payment_date = NOW()
                WHERE id = $1`,
              [pay.id, codTxnId, orderTotal]
            );
            await cx.query("UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1", [orderId]);
            codCompleted = true;
          }
        }
      }
    }

    await cx.query("COMMIT");

    // Audit
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: storeName,
        action: "order_item_updated",
        resource: "order_items",
        details: {
          seller_id: sellerId,
          order_id: orderId,
          order_item_id: orderItemId,
          old_item_status: prevItemStatus,
          new_item_status: order_status,
          order_row_updated: orderUpdated,
          cod_completed: codCompleted,
          cod_transaction_id: codTxnId || null
        },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (e) {
      console.error("audit(order_item_updated) failed:", e);
    }

return res.json({
  success: true,
  message: "Item status updated",
  orderItemId,
  newStatus: updatedItem.item_status,   // canonical DB value
  orderUpdated,
  codCompleted
});

  } catch (err) {
    try { await cx.query("ROLLBACK"); } catch {}
    console.error("❌ Error updating order item status:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    cx.release();
  }
};


// Filter orders (unchanged logic; still fine to keep simple list)
export const filterSellerOrders = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { status, date, search } = req.body;

    const seller = await getSellerForUser(userId);
    if (!seller) return res.json({ success: false, orders: [] });
    const { sellerId } = seller;

    let query = `
      SELECT 
        oi.id AS order_item_id,
        o.id AS order_id,
        o.created_at AS order_date,
        o.order_status,
        o.shipping_address,
        u.name AS customer_name,
        p.name AS product_name,
        oi.quantity,
        oi.unit_price,
        oi.item_status AS item_status,
        oi.product_variant_id,
        (oi.unit_price * oi.quantity) AS total_price,
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

// ============== delete Orders (for this seller's items) ==============
// Adds audits: 'seller_order_items_removed' and (if no items left) 'order_deleted'
// ============== delete a single order item (for this seller) ==============
export const deleteSellerOrderItems = async (req, res) => {
  const client = await db.connect();
  let inTxn = false;

  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Login required." });

    const seller = await getSellerForUser(userId);
    if (!seller) return res.status(403).json({ success: false, message: "Seller not found or not approved." });
    const { sellerId, storeName } = seller;

    // Accept order_item_id in body (single id). If you want to accept array in future, expand accordingly.
    const orderItemIdRaw = req.body?.order_item_id ?? req.body?.orderItemId ?? req.params?.orderItemId;
    const orderItemId = Number(orderItemIdRaw);
    if (!Number.isFinite(orderItemId)) {
      return res.status(400).json({ success: false, message: "Invalid order_item_id." });
    }

    await client.query("BEGIN");
    inTxn = true;

    // 1) Verify this order_item belongs to this seller and fetch order_id + variant + qty
    const toDelRes = await client.query(
      `
      SELECT oi.id AS order_item_id,
             oi.order_id,
             oi.product_variant_id AS variant_id,
             oi.quantity,
             p.seller_id
      FROM order_items oi
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p        ON p.id = v.product_id
      WHERE oi.id = $1
        AND p.seller_id = $2
      LIMIT 1
      `,
      [orderItemId, sellerId]
    );

    if (toDelRes.rowCount === 0) {
      await client.query("ROLLBACK");
      inTxn = false;
      return res.status(404).json({
        success: false,
        message: "Order item not found or does not belong to your store."
      });
    }

    const row = toDelRes.rows[0];
    const orderId = Number(row.order_id);

    // 2) Delete dependent review replies & reviews for that order_item
    await client.query(
      `
      DELETE FROM review_replies rr
      USING product_reviews pr
      WHERE rr.review_id = pr.id
        AND pr.order_item_id = $1
      `,
      [orderItemId]
    );

    await client.query(
      `
      DELETE FROM product_reviews
      WHERE order_item_id = $1
      `,
      [orderItemId]
    );

    // 3) Delete the order_item row (capture what we removed)
    const delItemsRes = await client.query(
      `
      DELETE FROM order_items
      WHERE id = $1
      RETURNING id AS order_item_id, product_variant_id AS variant_id, quantity
      `,
      [orderItemId]
    );

    if (delItemsRes.rowCount === 0) {
      await client.query("ROLLBACK");
      inTxn = false;
      return res.status(500).json({ success: false, message: "Failed to delete order item." });
    }

    const removed = delItemsRes.rows[0];
    const removedItems = [{
      order_item_id: Number(removed.order_item_id),
      variant_id: Number(removed.variant_id),
      qty: Number(removed.quantity)
    }];

    // 4) Restock removed variant
    await client.query(
      `
      UPDATE product_variant
         SET stock_quantity = stock_quantity + $2,
             updated_at     = NOW()
       WHERE id = $1
      `,
      [removed.variant_id, removed.quantity]
    );

    // 5) Check remaining items for the order
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
      // remove payments + order row
      await client.query(`DELETE FROM payments WHERE order_id = $1`, [orderId]);
      await client.query(`DELETE FROM orders   WHERE id       = $1`, [orderId]);

      await client.query("COMMIT");
      inTxn = false;

      // AUDIT: order_deleted (only if entire order removed)
      try {
        await insertAudit({
          actor_type: "seller",
          actor_id: sellerId,
          actor_name: storeName,
          action: "order_deleted",
          resource: "orders",
          details: {
            seller_id: sellerId,
            order_id: orderId,
            removed_items: removedItems,
            reason: "all_items_from_order_removed_by_seller"
          },
          ip: req.headers["x-forwarded-for"] || req.ip,
          status: "success",
        });
      } catch (e) {
        console.error("audit(order_deleted) failed:", e);
      }

      return res.json({
        success: true,
        removedItems: removedItems.length,
        orderDeleted: true,
        message: "Order fully removed (no items remaining)."
      });
    }

    // 6) Recompute total (12% tax) and update orders row
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

    await client.query("COMMIT");
    inTxn = false;

    // AUDIT: seller_order_items_removed
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: storeName,
        action: "seller_order_item_removed",
        resource: "order_items",
        details: {
          seller_id: sellerId,
          order_id: orderId,
          removed_items: removedItems,
          restocked_variants: removedItems.map(x => ({ variant_id: x.variant_id, qty: x.qty })),
          new_total: newTotal
        },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (e) {
      console.error("audit(seller_order_item_removed) failed:", e);
    }

    return res.json({
      success: true,
      removedItems: removedItems.length,
      orderDeleted: false,
      newTotal,
      message: "Your product in this order has been removed and stock was restored."
    });
  } catch (err) {
    if (inTxn) { try { await client.query("ROLLBACK"); } catch {} }
    console.error("❌ deleteSellerOrderItems error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  } finally {
    try { client.release(); } catch {}
  }
};
