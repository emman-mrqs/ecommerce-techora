import db from "../database/db.js";

export async function cancelOrder(req, res, next) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { orderId, reason } = req.body || {};
    if (!orderId) return res.status(400).json({ message: "orderId is required" });

    // Get order & ownership
    const { rows } = await db.query(
      "SELECT id, user_id, order_status FROM orders WHERE id = $1",
      [orderId]
    );
    const ord = rows[0];
    if (!ord) return res.status(404).json({ message: "Order not found" });
    if (ord.user_id !== userId) return res.status(403).json({ message: "Forbidden" });

    const status = String(ord.order_status || "").toLowerCase();
    // allow cancel when pending or confirmed (To Ship)
    const cancellable = (status === "pending" || status === "confirmed");
    if (!cancellable) {
      return res.status(400).json({ message: "Order can no longer be cancelled" });
    }

    await db.query(
      "UPDATE orders SET order_status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [orderId]
    );

    // (Optional) persist reason — create a table if you want:
    // await db.query("INSERT INTO order_cancellations(order_id, user_id, reason, created_at) VALUES($1,$2,$3,NOW())",
    //                [orderId, userId, reason || null]);

    return res.json({ ok: true });
  } catch (e) { next(e); }
}
