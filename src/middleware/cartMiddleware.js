import db from "../database/db.js";

export default async function cartMiddleware(req, res, next) {
  let cartItemCount = 0;

  try {
    // 🧑 Logged-in user
    if (req.session && req.session.user) {
      const userId = req.session.user.id;

      // Get the user's cart ID
      const cartResult = await db.query(
        `SELECT id FROM cart WHERE user_id = $1 LIMIT 1`,
        [userId]
      );

      if (cartResult.rows.length > 0) {
        const cartId = cartResult.rows[0].id;

        // ✅ Count number of distinct items (not total quantity)
        const itemResult = await db.query(
          `SELECT COUNT(*) AS total FROM cart_items WHERE cart_id = $1`,
          [cartId]
        );

        cartItemCount = parseInt(itemResult.rows[0].total) || 0;
      }

    // 👤 Guest user with cookie
    } else if (req.cookies && req.cookies.cart) {
      let guestCartItems = [];

      try {
        const rawCart = req.cookies.cart;
        const parsed = JSON.parse(rawCart);

        // ✅ Check if items is an array
        if (parsed && Array.isArray(parsed.items)) {
          guestCartItems = parsed.items;
        } else {
          console.warn("Guest cart 'items' is not an array:", parsed);
        }

      } catch (e) {
        console.error("Error parsing guest cart cookie:", e.message);
      }

      // ✅ Count number of distinct items (not total quantity)
      cartItemCount = guestCartItems.length;
    }

  } catch (err) {
    console.error("Cart badge error:", err.message);
  }

  // ✅ Make available in all EJS views
  res.locals.cartItemCount = cartItemCount;
  next();
}
