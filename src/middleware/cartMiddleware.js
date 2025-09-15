import db from "../database/db.js";

export const cartCountMiddleware = async (req, res, next) => {
  try {
    if (req.session && req.session.user && req.session.user.id) {
      // Logged-in user -> query DB
      const { rows } = await db.query(
        `
        SELECT COUNT(DISTINCT ci.product_id) AS unique_products_in_cart
        FROM cart c
        JOIN cart_items ci ON c.id = ci.cart_id
        WHERE c.user_id = $1
        `,
        [req.session.user.id]
      );

      res.locals.cartCount = rows[0]?.unique_products_in_cart || 0;
    } else if (req.cookies.cart) {
      // Guest user -> cookie
      try {
        const guestCart = JSON.parse(req.cookies.cart); // ✅ parse string

        if (guestCart.items && Array.isArray(guestCart.items)) {
          const uniqueProducts = new Set(
            guestCart.items.map(item => item.product_id || item.productId)
          );
          res.locals.cartCount = uniqueProducts.size;
        } else {
          res.locals.cartCount = 0;
        }
      } catch (err) {
        console.error("Guest cart parse error:", err);
        res.locals.cartCount = 0;
      }
    } else {
      res.locals.cartCount = 0;
    }

    next();
  } catch (err) {
    console.error("Cart count error:", err);
    res.locals.cartCount = 0;
    next();
  }
};
