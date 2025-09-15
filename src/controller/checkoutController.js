// src/controller/checkoutController.js
import db from "../database/db.js";

export async function renderCheckout(req, res) {
  // ✅ Check login
  if (!req.session.user) {
    return res.send("<script>alert('You need to login first!'); window.location='/login';</script>");
  }

  const userId = req.session.user.id;

  try {
    // ✅ Get cart items from DB
    const { rows: items } = await db.query(`
        SELECT 
        ci.id AS cart_item_id,
        ci.quantity,
        pv.id AS variant_id,
        pv.color,
        pv.storage,
        pv.ram,
        pv.price,
        p.name AS product_name,
        COALESCE(
            (SELECT img_url FROM product_images 
            WHERE product_variant_id = pv.id 
            ORDER BY is_primary DESC, position ASC LIMIT 1),
            (SELECT img_url FROM product_images 
            WHERE product_id = p.id 
            ORDER BY is_primary DESC, position ASC LIMIT 1)
        ) AS image
        FROM cart_items ci
        JOIN cart c ON ci.cart_id = c.id
        JOIN product_variant pv ON ci.variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE c.user_id = $1
    `, [userId]);

    if (items.length === 0) {
      return res.send("<script>alert('Your cart is empty!'); window.location='/cart';</script>");
    }

    // ✅ Totals
    let subtotal = 0;
    items.forEach(it => subtotal += Number(it.price) * it.quantity);
    const tax = subtotal * 0.12;
    const total = subtotal + tax;

    // ✅ Render checkout with dynamic data
    res.render("user/checkout", {
      user: req.session.user,
      items,
      subtotal,
      tax,
      total
    });

  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).send("Something went wrong while loading checkout");
  }
}


// Place Order Controller
export const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "You need to login first!" });
    }

    const { paymentMethod, shippingAddress } = req.body;

    // ✅ Fetch cart items
    const cartQuery = `
      SELECT ci.id, ci.quantity, pv.id as variant_id, pv.price, p.name, pi.img_url
      FROM cart_items ci
      JOIN product_variant pv ON ci.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN product_images pi ON pi.product_variant_id = pv.id AND pi.is_primary = true
      WHERE ci.cart_id = (SELECT id FROM cart WHERE user_id = $1)
    `;
    const cartItems = (await db.query(cartQuery, [userId])).rows;

    if (cartItems.length === 0) {
      return res.status(400).json({ error: "Your cart is empty" });
    }

    // ✅ Calculate totals
    const subtotal = cartItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const tax = subtotal * 0.12;
    const total = subtotal + tax;

    // ✅ Insert into orders
    const orderResult = await db.query(
      `INSERT INTO orders (user_id, order_status, payment_method, payment_status, total_amount, shipping_address)
       VALUES ($1, 'pending', $2, 'unpaid', $3, $4) RETURNING id`,
      [userId, paymentMethod, total, shippingAddress]
    );

    const orderId = orderResult.rows[0].id;

    // ✅ Insert order items
    for (const item of cartItems) {
      await db.query(
        `INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.variant_id, item.quantity, item.price]
      );
    }

    if (paymentMethod === "cod") {
      // ✅ For COD: Clear cart immediately
      await db.query(`DELETE FROM cart_items WHERE cart_id = (SELECT id FROM cart WHERE user_id = $1)`, [userId]);

      return res.json({
        success: true,
        message: "Order placed with Cash on Delivery!",
        orderId,
        total
      });
    }

    if (paymentMethod === "paypal") {
      // ✅ For PayPal: Return orderId to frontend
      return res.json({
        success: true,
        message: "Redirect to PayPal",
        orderId,
        total
      });
    }
  } catch (err) {
    console.error("Error placing order:", err);
    res.status(500).json({ error: "Server error" });
  }
};