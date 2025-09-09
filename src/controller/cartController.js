import db from "../database/db.js";

// For not logged-in users
function saveToCookieCart(req, res, cartItem) {
  const existingCart = req.cookies.cart ? JSON.parse(req.cookies.cart) : [];

  // Check for existing variant
  const index = existingCart.findIndex(item =>
    item.variant_id === cartItem.variant_id
  );

  if (index >= 0) {
    existingCart[index].quantity += cartItem.quantity;
  } else {
    existingCart.push(cartItem);
  }

  res.cookie('cart', JSON.stringify(existingCart), { httpOnly: true });
}

// For logged-in users
async function saveToDBCart(userId, { product_id, variant_id, quantity }) {
  // Get or create cart
  const cartRes = await db.query(
    "SELECT * FROM cart WHERE user_id = $1", [userId]
  );

  let cartId;

  if (cartRes.rows.length === 0) {
    const newCart = await db.query(
      "INSERT INTO cart(user_id, created_at) VALUES($1, NOW()) RETURNING id", [userId]
    );
    cartId = newCart.rows[0].id;
  } else {
    cartId = cartRes.rows[0].id;
  }

  // Check if item exists
  const itemRes = await db.query(
    "SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2",
    [cartId, product_id]
  );

  if (itemRes.rows.length > 0) {
    await db.query(
      "UPDATE cart_items SET quantity = quantity + $1 WHERE cart_id = $2 AND product_id = $3",
      [quantity, cartId, product_id]
    );
  } else {
    await db.query(
      "INSERT INTO cart_items(cart_id, product_id, quantity) VALUES ($1, $2, $3)",
      [cartId, product_id, quantity]
    );
  }
}

export const addToCart = async (req, res) => {
  const { product_id, variant_id, quantity } = req.body;

  if (!product_id || !variant_id || !quantity) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const cartItem = { product_id, variant_id, quantity: parseInt(quantity) };

    if (req.session.user) {
      await saveToDBCart(req.session.user.id, cartItem);
    } else {
      saveToCookieCart(req, res, cartItem);
    }

    res.status(200).json({ message: "Item added to cart" });
  } catch (err) {
    console.error("Add to cart error:", err);
    res.status(500).json({ error: "Failed to add to cart" });
  }
};
