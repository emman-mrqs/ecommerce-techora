import client from "../config/paypal.js";
import paypal from "@paypal/checkout-server-sdk";
import db from "../database/db.js"; // <-- add this


export const createPayPalOrder = async (req, res) => {
  const { orderId, total } = req.body;

  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer("return=representation");
  request.requestBody({
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: orderId.toString(),
        amount: { currency_code: "PHP", value: Number(total).toFixed(2) }
      }
    ]
  });

  try {
    const order = await client().execute(request);
    res.json({ id: order.result.id });
  } catch (err) {
    console.error("PayPal create error:", err);
    res.status(500).send("PayPal order creation failed");
  }
};

export const capturePayPalOrder = async (req, res) => {
  const { paypalOrderId, orderId } = req.body;

  const request = new paypal.orders.OrdersCaptureRequest(paypalOrderId);
  request.requestBody({});

  const cx = await db.connect();
  try {
    // 1) Capture on PayPal
    const capture = await client().execute(request);

    // 2) Start DB transaction
    await cx.query("BEGIN");

    // 3) Lock the product_variant rows for this order and deduct stock
    //    (join + FOR UPDATE OF pv prevents race conditions)
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

    if (items.length === 0) {
      throw new Error("No order items found to deduct stock.");
    }

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
        throw new Error(
          `Insufficient stock for variant ${it.variant_id} (wanted ${it.quantity}).`
        );
      }
    }

    // 4) Record payment
    const paidAmount =
      capture.result?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ??
      null;

    await cx.query(
      `
      INSERT INTO payments (order_id, payment_method, payment_status, transaction_id, amount_paid)
      VALUES ($1, 'paypal', 'completed', $2, $3)
      `,
      [orderId, capture.result.id, paidAmount]
    );

    // 5) Mark order as paid/confirmed
    await cx.query(
      `UPDATE orders SET payment_status = 'paid', order_status = 'confirmed', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    // 6) Clear the user's cart (if session is present)
    if (req.session?.user?.id) {
      await cx.query(
        `DELETE FROM cart_items WHERE cart_id = (SELECT id FROM cart WHERE user_id = $1)`,
        [req.session.user.id]
      );
    }

    await cx.query("COMMIT");
    res.json({ success: true, message: "Payment captured, stock deducted, order confirmed!" });
  } catch (err) {
    try { await cx.query("ROLLBACK"); } catch {}
    console.error("PayPal capture error:", err);
    res.status(500).json({ success: false, error: String(err.message || err) });
  } finally {
    cx.release();
  }
};