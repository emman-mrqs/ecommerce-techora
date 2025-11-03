// src/controller/profileController.js
import db from "../database/db.js";
import bcrypt from "bcrypt";
import { insertAudit } from "../utils/audit.js";

const UI_STATUS = {
  pending: "Pending",
  confirmed: "To Ship",
  shipped: "To Receive",
  completed: "Completed",
  complete: "Completed",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  return: "Return/Refund",
  returned: "Return/Refund",
  refund: "Return/Refund",
  refunded: "Return/Refund",
};
const toUI = s => UI_STATUS[String(s || "").toLowerCase()] || s || "All";

export async function renderProfile(req, res, next) {
  try {
    if (!req.session?.user?.id) return res.redirect("/login");
    const user = req.session.user;
    const sessionID = req.sessionID;

    const sql = `
      SELECT
        o.id                      AS order_id,
        o.order_status,
        o.payment_method          AS order_payment_method,
        o.payment_status          AS order_payment_status,
        o.total_amount,
        o.shipping_address,
        o.created_at,

        oi.id                     AS order_item_id,
        oi.quantity,
        oi.unit_price,
        oi.total_price,
        oi.item_status            AS item_status,

        pv.id                     AS variant_id,
        pv.product_id,
        pv.storage,
        pv.ram,
        pv.color,
        pv.price                  AS variant_price,

        p.id                      AS product_id,
        p.name                    AS product_name,
        p.seller_id               AS seller_id,

        COALESCE(vi.img_url, pi.img_url) AS img_url,

        pay.payment_method        AS pay_method,
        pay.payment_status        AS pay_status,
        pay.transaction_id,
        pay.amount_paid,
        pay.payment_date,

        s.store_name              AS seller_name,
        s.user_id                 AS seller_user_id
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant pv ON pv.id = oi.product_variant_id
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN payments pay ON pay.order_id = o.id
      LEFT JOIN LATERAL (
        SELECT img_url
        FROM product_images
        WHERE product_variant_id = pv.id
        ORDER BY is_primary DESC, position ASC, id ASC
        LIMIT 1
      ) AS vi ON TRUE
      LEFT JOIN LATERAL (
        SELECT img_url
        FROM product_images
        WHERE product_id = p.id AND product_variant_id IS NULL
        ORDER BY is_primary DESC, position ASC, id ASC
        LIMIT 1
      ) AS pi ON TRUE
      LEFT JOIN sellers s ON s.id = p.seller_id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC, o.id DESC, oi.id ASC;
    `;

    const { rows } = await db.query(sql, [user.id]);

    // Build virtual orders grouped by order_item (virtualId = orderId-orderItemId).
    const map = new Map();

    for (const r of rows) {
      const virtualId = `${r.order_id}-${r.order_item_id}`;

      // Defensive seller name fallback:
      const sellerId = r.seller_id ?? null;
      const sellerName = (r.seller_name && String(r.seller_name).trim())
        ? r.seller_name
        : (sellerId ? `Seller #${sellerId}` : '—');

      // per-item computations
      const itemUnit = r.unit_price ?? r.variant_price ?? 0;
      const itemQty = r.quantity ?? 1;
      const itemTotal = r.total_price ?? (itemUnit * itemQty);

      // create container if it's the first time we see this virtualId
      if (!map.has(virtualId)) {
        map.set(virtualId, {
          id: virtualId,
          parent_order_id: r.order_id,
          created_at: r.created_at,
          order_status: r.order_status,
          // prefer item-level status when present; otherwise use order-level status
          ui_status: toUI(r.item_status || r.order_status),
          total_amount: itemTotal,
          shipping_address: r.shipping_address,
          payment: {
            method: r.pay_method || r.order_payment_method,
            status: r.pay_status || r.order_payment_status,
            transaction_id: r.transaction_id,
            amount_paid: r.amount_paid || 0,
            amount: r.amount_paid || itemTotal || 0,
            payment_date: r.payment_date
          },
          items: []
        });
      }

      // push the item into the container
      map.get(virtualId).items.push({
        order_item_id: r.order_item_id,
        product_id: r.product_id,
        product_name: r.product_name,
        variant_id: r.variant_id,
        color: r.color,
        storage: r.storage,
        ram: r.ram,
        unit_price: r.unit_price ?? r.variant_price ?? 0,
        quantity: r.quantity ?? 1,
        total_price: r.total_price ?? ((r.unit_price ?? r.variant_price ?? 0) * (r.quantity ?? 1)),
        img_url: r.img_url,
        item_status: r.item_status || null,
        seller_id: sellerId,
        seller_name: sellerName
      });
    }

    // Convert map to array
    const allOrders = [...map.values()];

    // Compute seller summary for each (virtual) order (single name or comma separated)
    allOrders.forEach(o => {
      const names = new Set((o.items || []).map(it => it.seller_name || (`Seller #${it.seller_id || '—'}`)));
      o.sellers = [...names];
      o.seller_display = o.sellers.length === 1 ? o.sellers[0] : o.sellers.join(', ');
    });

    const ordersByStatus = {
      All: allOrders,
      Pending: allOrders.filter(o => o.ui_status === "Pending"),
      "To Ship": allOrders.filter(o => o.ui_status === "To Ship"),
      "To Receive": allOrders.filter(o => o.ui_status === "To Receive"),
      Completed: allOrders.filter(o => o.ui_status === "Completed"),
      Cancelled: allOrders.filter(o => o.ui_status === "Cancelled"),
      "Return/Refund": allOrders.filter(o => o.ui_status === "Return/Refund"),
    };

    res.render("user/profile.ejs", {
      user,
      sessionID,
      allOrders,
      ordersByStatus
    });

  } catch (err) {
    next(err);
  }
}



/* 
--------------------
Profile info
--------------------
*/
export async function updateName(req, res, next) {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userId = req.session.user.id;
    const { name } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: "Name too short" });
    }

    // get previous for audit
    const prev = await db.query(`SELECT name FROM users WHERE id = $1`, [userId]);
    const oldName = prev.rows[0]?.name || null;

    const sql = `
      UPDATE users
      SET name = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, email
    `;
    const values = [name.trim(), userId];
    const { rows } = await db.query(sql, values);

    // Update session
    req.session.user = { ...req.session.user, name: rows[0].name };

    // AUDIT (best-effort)
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session.user.name || req.session.user.email,
        action: "profile_name_updated",
        resource: "users",
        details: { user_id: userId, old_name: oldName, new_name: rows[0].name },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (e) {
      console.error("audit(profile_name_updated) failed:", e);
    }

    res.json({ success: true, user: rows[0] });
  } catch (err) {
    next(err);
  }
}

/* 
------------------------
Profile Change password
-----------------------
*/
export async function changePassword(req, res) {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.session.user.id;

    // get user
    const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = result.rows[0];

    if (user.auth_provider !== "local") {
      return res.status(400).json({ success: false, message: "This account is linked to Google Sign-In." });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2", [hash, userId]);

    // AUDIT (no sensitive data)
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session.user.name || req.session.user.email,
        action: "password_changed",
        resource: "users",
        details: { user_id: userId },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (e) {
      console.error("audit(password_changed) failed:", e);
    }

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

/* 
------------------------
Cancel Order
------------------------
*/
export async function cancelOrder(req, res) {
  const client = await db.connect();
  try {
    console.log('cancelOrder called, user=', req.session?.user?.id, 'body=', req.body);
    if (!req.session?.user?.id)
      return res.status(401).json({ success: false, message: "Not authenticated" });

    const userId = req.session.user.id;
    const { orderItemId } = req.body;
    if (!orderItemId)
      return res.status(400).json({ success: false, message: "orderItemId is required" });

    // validate ownership
    const check = await client.query(
      `SELECT oi.id AS order_item_id,
              LOWER(COALESCE(oi.item_status,'')) AS item_status,
              oi.order_id, o.user_id, o.order_status
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.id = $1 AND o.user_id = $2
        LIMIT 1`,
      [orderItemId, userId]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ success: false, message: "Order item not found" });

    const row = check.rows[0];
    const itemStatus = row.item_status;
    const cancellable = ['pending', 'confirmed', ''];
    if (!cancellable.includes(itemStatus))
      return res.status(400).json({ success: false, message: "This item cannot be cancelled at this stage." });

    await client.query('BEGIN');

    // cancel only that item
    const updated = await client.query(
      `UPDATE order_items
          SET item_status = 'cancelled', updated_at = NOW()
        WHERE id = $1
        RETURNING order_id`,
      [orderItemId]
    );

    // if all items of parent order are now cancelled → mark parent as cancelled
    const remaining = await client.query(
      `SELECT COUNT(*)::int AS cnt
         FROM order_items
        WHERE order_id = $1
          AND LOWER(COALESCE(item_status,'')) NOT IN ('cancelled')`,
      [updated.rows[0].order_id]
    );
    if (remaining.rows[0].cnt === 0) {
      await client.query(
        `UPDATE orders
            SET order_status = 'cancelled', updated_at = NOW()
          WHERE id = $1`,
        [updated.rows[0].order_id]
      );
    } else {
      await client.query(`UPDATE orders SET updated_at = NOW() WHERE id = $1`, [updated.rows[0].order_id]);
    }

    await client.query('COMMIT');

    // audit (optional)
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session.user.name || req.session.user.email,
        action: "order_item_cancelled_by_user",
        resource: "order_items",
        details: { order_item_id: orderItemId, order_id: updated.rows[0].order_id, prev_item_status: itemStatus },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (e) { console.error("audit cancel failed:", e); }

    return res.json({ success: true, message: "Item cancelled successfully" });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error("cancelOrder error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
}



/* 
------------------------
Mark Order as Received
------------------------
*/
export async function markOrderReceived(req, res) {
  const client = await db.connect();
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    const userId = req.session.user.id;
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: "Order ID is required" });

    // validate ownership
    const orderCheck = await client.query(
      "SELECT id, order_status FROM orders WHERE id = $1 AND user_id = $2 LIMIT 1",
      [orderId, userId]
    );
    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const order = orderCheck.rows[0];

    // Only allow marking received for items that are shipped
    await client.query("BEGIN");

    const updated = await client.query(
      `UPDATE order_items
       SET item_status = 'completed', updated_at = NOW()
       WHERE order_id = $1
         AND COALESCE(item_status,'') = 'shipped'
       RETURNING id`,
      [orderId]
    );

    if (updated.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "No shipped items to mark as received." });
    }

    // If all items are now completed, update parent order row
    const remaining = await client.query(
      `SELECT COUNT(*)::int AS cnt
       FROM order_items
       WHERE order_id = $1
         AND COALESCE(item_status,'') NOT IN ('completed')`,
      [orderId]
    );
    if (remaining.rows[0].cnt === 0) {
      await client.query(
        `UPDATE orders SET order_status = 'completed', updated_at = NOW() WHERE id = $1`,
        [orderId]
      );
    } else {
      // if not all completed, ensure order_status is at least 'shipped'
      await client.query(`UPDATE orders SET order_status = 'shipped', updated_at = NOW() WHERE id = $1`, [orderId]);
    }

    await client.query("COMMIT");

    // AUDIT
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session.user.name || req.session.user.email,
        action: "order_marked_received",
        resource: "order_items",
        details: { order_id: orderId, items_updated: updated.rows.length, prev_order_status: order.order_status },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (e) {
      console.error("audit(order_marked_received) failed:", e);
    }

    return res.json({ success: true, message: "Order marked as received.", itemsCompleted: updated.rows.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(()=>{});
    console.error("markOrderReceived error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
}

/* 
------------------------
Return and Refund
------------------------
*/
export async function requestRefund(req, res) {
  const client = await db.connect();
  try {
    console.log('requestRefund called, user=', req.session?.user?.id, 'body=', req.body);
    if (!req.session?.user?.id) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const { orderId } = req.body;
    const userId = req.session.user.id;
    if (!orderId) return res.status(400).json({ success: false, message: "Order ID required" });

    // validate ownership
    const orderCheck = await client.query(
      "SELECT id, order_status FROM orders WHERE id = $1 AND user_id = $2 LIMIT 1",
      [orderId, userId]
    );
    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const order = orderCheck.rows[0];

    // Determine refund-eligible item statuses.
    // If your DB uses 'to_receive' or other words, include them in the array below.
    const refundableStatuses = ['shipped', 'to_receive', 'to receive'];

    // Find items eligible for refund
    const eligible = await client.query(
      `SELECT id, item_status
       FROM order_items
       WHERE order_id = $1
         AND LOWER(COALESCE(item_status,'')) = ANY($2::text[])`,
      [orderId, refundableStatuses]
    );

    if (eligible.rows.length === 0) {
      return res.status(400).json({ success: false, message: "No eligible items found for refund." });
    }

    await client.query("BEGIN");

    // Update only eligible items
    const updated = await client.query(
      `UPDATE order_items
       SET item_status = 'return', updated_at = NOW()
       WHERE order_id = $1
         AND LOWER(COALESCE(item_status,'')) = ANY($2::text[])
       RETURNING id`,
      [orderId, refundableStatuses]
    );

    // After marking returns, mark parent order row to 'return' when appropriate
    await client.query(
      `UPDATE orders SET order_status = 'return', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    await client.query("COMMIT");

    // AUDIT
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session.user.name || req.session.user.email,
        action: "refund_requested",
        resource: "order_items",
        details: { order_id: orderId, items_affected: updated.rows.length, prev_order_status: order.order_status },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (e) {
      console.error("audit(refund_requested) failed:", e);
    }

    return res.json({ success: true, message: "Refund requested successfully.", items: updated.rows.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(()=>{});
    console.error("requestRefund error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
}


/* =========================
   Addresses
========================== */
export const getAddresses = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const result = await db.query(
      "SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    res.json({ success: true, addresses: result.rows });
  } catch (err) {
    console.error("Error fetching addresses:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const addAddress = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const {
      first_name,
      last_name,
      street,
      city,
      province,
      zip,
      phone,
      email
    } = req.body;

    const checkQuery = `
      SELECT id FROM addresses 
      WHERE user_id = $1 
        AND LOWER(TRIM(first_name)) = LOWER(TRIM($2))
        AND LOWER(TRIM(last_name)) = LOWER(TRIM($3))
        AND LOWER(TRIM(street)) = LOWER(TRIM($4))
        AND LOWER(TRIM(city)) = LOWER(TRIM($5))
        AND LOWER(TRIM(province)) = LOWER(TRIM($6))
        AND TRIM(zip) = TRIM($7)
        AND TRIM(phone) = TRIM($8)
        AND LOWER(TRIM(email)) = LOWER(TRIM($9))
      LIMIT 1
    `;
    const exists = await db.query(checkQuery, [
      userId, first_name, last_name, street, city, province, zip, phone, email
    ]);

    if (exists.rows.length > 0) {
      return res.json({ success: false, message: "This address already exists." });
    }

    const query = `
      INSERT INTO addresses
        (user_id, first_name, last_name, street, city, province, zip, phone, email, created_at, updated_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
      RETURNING *`;
    const values = [userId, first_name, last_name, street, city, province, zip, phone, email];

    const result = await db.query(query, values);

    // AUDIT
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session.user.name || req.session.user.email,
        action: "address_added",
        resource: "addresses",
        details: { address_id: result.rows[0].id, city, province, zip },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (e) {
      console.error("audit(address_added) failed:", e);
    }

    res.json({ success: true, address: result.rows[0] });
  } catch (err) {
    console.error("Error adding address:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateAddress = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { id, first_name, last_name, street, city, province, zip, phone, email } = req.body;

    const check = await db.query(
      "SELECT * FROM addresses WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    if (check.rows.length === 0) {
      return res.json({ success: false, message: "Address not found" });
    }

    const prev = check.rows[0];

    const query = `
      UPDATE addresses 
      SET first_name=$1, last_name=$2, street=$3, city=$4, province=$5, zip=$6, phone=$7, email=$8, updated_at=NOW()
      WHERE id=$9 AND user_id=$10
      RETURNING *`;
    const values = [first_name, last_name, street, city, province, zip, phone, email, id, userId];

    const result = await db.query(query, values);

    // AUDIT
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session.user.name || req.session.user.email,
        action: "address_updated",
        resource: "addresses",
        details: {
          address_id: id,
          before: { city: prev.city, province: prev.province, zip: prev.zip },
          after:  { city, province, zip }
        },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (e) {
      console.error("audit(address_updated) failed:", e);
    }

    res.json({ success: true, address: result.rows[0] });
  } catch (err) {
    console.error("Error updating address:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { id } = req.body;

    const check = await db.query(
      "SELECT city, province, zip FROM addresses WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    if (check.rows.length === 0) {
      return res.json({ success: false, message: "Address not found" });
    }
    const prev = check.rows[0];

    await db.query("DELETE FROM addresses WHERE id = $1 AND user_id = $2", [id, userId]);

    // AUDIT
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session.user.name || req.session.user.email,
        action: "address_deleted",
        resource: "addresses",
        details: { address_id: id, city: prev.city, province: prev.province, zip: prev.zip },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (e) {
      console.error("audit(address_deleted) failed:", e);
    }

    res.json({ success: true, message: "Address deleted" });
  } catch (err) {
    console.error("Error deleting address:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { id } = req.body;

    const check = await db.query(
      "SELECT id, city, province, zip FROM addresses WHERE id=$1 AND user_id=$2",
      [id, userId]
    );
    if (check.rows.length === 0) {
      return res.json({ success: false, message: "Address not found" });
    }

    await db.query("UPDATE addresses SET is_default=false WHERE user_id=$1", [userId]);
    await db.query("UPDATE addresses SET is_default=true, updated_at=NOW() WHERE id=$1 AND user_id=$2", [id, userId]);

    // AUDIT
    try {
      const r = check.rows[0];
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session.user.name || req.session.user.email,
        action: "address_set_default",
        resource: "addresses",
        details: { address_id: id, city: r.city, province: r.province, zip: r.zip },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (e) {
      console.error("audit(address_set_default) failed:", e);
    }

    res.json({ success: true, message: "Default address updated" });
  } catch (err) {
    console.error("Error setting default address:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
