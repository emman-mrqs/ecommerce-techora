// src/controller/sellerOrdersController.js
import db from "../database/db.js";

export const renderSellerOrders = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const sellerRes = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );

    if (sellerRes.rows.length === 0) {
      return res.redirect("/seller-application");
    }

    const sellerId = sellerRes.rows[0].id;

    // ✅ Fetch orders with full invoice info
    const ordersRes = await db.query(
      `
      SELECT 
        o.id AS order_id,
        o.created_at AS order_date,
        o.order_status,
        o.shipping_address,
        u.name AS customer_name,
        p.name AS product_name,
        oi.quantity,
        (oi.unit_price * oi.quantity) AS total_price,
        img.img_url AS product_image,
        pay.payment_method,
        pay.payment_status,
        pay.transaction_id,
        pay.amount_paid,
        pay.payment_date,
        s.store_name
      FROM orders o
      JOIN users u ON u.id = o.user_id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p ON p.id = v.product_id
      LEFT JOIN product_images img 
        ON img.product_id = p.id AND img.is_primary = true
      LEFT JOIN payments pay ON pay.order_id = o.id
      JOIN sellers s ON s.id = p.seller_id
      WHERE p.seller_id = $1
      ORDER BY o.created_at DESC
      `,
      [sellerId]
    );

    res.render("seller/sellerOrders", {
      activePage: "orders",
      pageTitle: "Seller Orders",
      orders: ordersRes.rows
    });
  } catch (err) {
    console.error("❌ Error fetching seller orders:", err);
    res.status(500).send("Server error");
  }
};

// ✅ New: Update order status
export const updateOrderStatus = async (req, res) => {
  try {
    const { order_id, order_status } = req.body;

    await db.query(
      "UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2",
      [order_status, order_id]
    );

    // Return the new status so frontend can use it immediately
    res.json({
      success: true,
      message: "Order status updated successfully!",
      newStatus: order_status
    });
  } catch (err) {
    console.error("❌ Error updating order status:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

//Filter orders product
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
    if (date) {
      values.push(date);
      query += ` AND o.created_at >= NOW() - INTERVAL '${date} days'`;
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
    console.error("❌ Error filtering orders:", err);
    res.json({ success: false, orders: [] });
  }
};
