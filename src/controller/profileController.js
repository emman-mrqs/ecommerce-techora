// src/controller/profileController.js
import db from "../database/db.js";

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

        pv.id                     AS variant_id,
        pv.product_id,
        pv.storage,
        pv.ram,
        pv.color,
        pv.price                  AS variant_price,

        p.name                    AS product_name,

        COALESCE(vi.img_url, pi.img_url) AS img_url,

        pay.payment_method        AS pay_method,
        pay.payment_status        AS pay_status,
        pay.transaction_id,
        pay.amount_paid,
        pay.payment_date
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
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC, o.id DESC, oi.id ASC;
    `;

    const { rows } = await db.query(sql, [user.id]);

    // Group rows → orders
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.order_id)) {
        map.set(r.order_id, {
          id: r.order_id,
          created_at: r.created_at,
          order_status: r.order_status,
          ui_status: toUI(r.order_status),
          total_amount: r.total_amount,
          shipping_address: r.shipping_address,
          payment: {
            method: r.pay_method || r.order_payment_method,
            status: r.pay_status || r.order_payment_status,
            transaction_id: r.transaction_id,
            amount_paid: r.amount_paid || 0,
            amount: r.amount_paid || r.total_amount || 0,
            payment_date: r.payment_date
          },
          items: [],
        });
      }

      map.get(r.order_id).items.push({
        order_item_id: r.order_item_id,
        product_name: r.product_name,
        variant_id: r.variant_id,
        color: r.color,
        storage: r.storage,
        ram: r.ram,
        unit_price: r.unit_price ?? r.variant_price ?? 0,
        quantity: r.quantity ?? 1,
        total_price:
          r.total_price ?? ((r.unit_price ?? r.variant_price ?? 0) * (r.quantity ?? 1)),
        img_url: r.img_url
      });
    }

    const allOrders = [...map.values()];
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
