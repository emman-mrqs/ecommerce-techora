// src/controller/paypalController.js
import client from "../config/paypal.js";
import paypal from "@paypal/checkout-server-sdk";
import db from "../database/db.js";

/**
 * Create a PayPal order for the exact amount stored in the DB.
 * The client must ONLY send { orderId }. We ignore any client totals.
 */
export const createPayPalOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    // Read the already-finalized total (after voucher/discount) from DB
    const { rows } = await db.query(
      `SELECT total_amount
         FROM orders
        WHERE id = $1
        LIMIT 1`,
      [orderId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Order not found" });
    }

    const total = Number(rows[0].total_amount || 0);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid order total" });
    }

    // Build PayPal order using the DB amount
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: String(orderId),
          amount: {
            currency_code: "PHP",
            value: total.toFixed(2), // <- DB total (discounts already applied)
          },
        },
      ],
    });

    const order = await client().execute(request);
    return res.json({ id: order.result.id });
  } catch (err) {
    console.error("PayPal create error:", err);
    return res.status(500).send("PayPal order creation failed");
  }
};

/**
 * Capture the PayPal order, then finalize the local order:
 * - deduct stock
 * - insert payment record
 * - mark as paid/confirmed
 * - clear user's cart
 */
export const capturePayPalOrder = async (req, res) => {
  const { paypalOrderId, orderId } = req.body;
  if (!paypalOrderId || !orderId) {
    return res.status(400).json({ success: false, error: "paypalOrderId and orderId are required" });
  }

  const request = new paypal.orders.OrdersCaptureRequest(paypalOrderId);
  request.requestBody({});

  const cx = await db.connect();
  try {
    // 1) Capture on PayPal
    const capture = await client().execute(request);

    // 2) Start transaction
    await cx.query("BEGIN");

    // 3) Lock variants and deduct stock
    const { rows: items } = await cx.query(
      `
      SELECT pv.id AS variant_id, oi.quantity
        FROM order_items oi
        JOIN product_variant pv ON pv.id = oi.product_variant_id
       WHERE oi.order_id = $1
       FOR UPDATE OF pv
      `,
      [orderId]
    );
    if (!items.length) throw new Error("No order items found to deduct stock.");

    for (const it of items) {
      const upd = await cx.query(
        `
        UPDATE product_variant
           SET stock_quantity = stock_quantity - $2
         WHERE id = $1 AND stock_quantity >= $2
         RETURNING id
        `,
        [it.variant_id, it.quantity]
      );
      if (upd.rowCount === 0) {
        throw new Error(`Insufficient stock for variant ${it.variant_id} (wanted ${it.quantity}).`);
      }
    }

    // 4) Record payment
    const paidAmount =
      capture.result?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? null;

    await cx.query(
      `
      INSERT INTO payments (order_id, payment_method, payment_status, transaction_id, amount_paid)
      VALUES ($1, 'paypal', 'completed', $2, $3)
      `,
      [orderId, capture.result.id, paidAmount]
    );

    // 5) Mark order as paid/confirmed
    await cx.query(
      `UPDATE orders
          SET payment_status = 'paid',
              order_status   = 'confirmed',
              updated_at     = NOW()
        WHERE id = $1`,
      [orderId]
    );

// 6) Clear only the ordered variants from the user's cart
let userId = req.session?.user?.id;
if (!userId) {
  const { rows: orows } = await cx.query(
    `SELECT user_id FROM orders WHERE id = $1 LIMIT 1`,
    [orderId]
  );
  userId = orows[0]?.user_id;
}

if (userId) {
  const variantIds = items.map(i => Number(i.variant_id)).filter(Number.isFinite);
  if (variantIds.length) {
    await cx.query(
      `DELETE FROM cart_items
         WHERE cart_id = (SELECT id FROM cart WHERE user_id = $1)
           AND variant_id = ANY($2::int[])`,
      [userId, variantIds]
    );
  }
}

    await cx.query("COMMIT");
    return res.json({ success: true, message: "Payment captured, stock deducted, order confirmed!" });
  } catch (err) {
    try { await cx.query("ROLLBACK"); } catch {}
    console.error("PayPal capture error:", err);
    return res.status(500).json({ success: false, error: String(err.message || err) });
  } finally {
    cx.release();
  }
};
