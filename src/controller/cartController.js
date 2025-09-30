import db from "../database/db.js";

// const TAX_RATE = Number(process.env.TAX_RATE ?? 0.12);

// --- cookie helpers ---
function readCookieCart(req) {
  try {
    const raw = req.cookies?.cart;
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { items: parsed }; // legacy shape "[]"
    if (parsed && Array.isArray(parsed.items)) return { items: parsed.items };
    return { items: [] };
  } catch {
    return { items: [] };
  }
}
function writeCookieCart(res, cart) {
  const normalized = cart && Array.isArray(cart.items) ? cart : { items: [] };
  res.cookie("cart", JSON.stringify(normalized), {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

function calcTotals(items) {
  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);

  // 3% tax per product (kept)
  const tax = items.reduce((s, it) => s + (it.unitPrice * it.quantity * 0.03), 0);
  const taxRounded = Math.round(tax * 100) / 100;

  // 🚚 Shipping: FREE if subtotal > 5000, else 50
  const shipping = subtotal > 5000 ? 0 : (subtotal > 0 ? 50 : 0);

  const total = subtotal + taxRounded + shipping;

  return {
    subtotal,
    tax: taxRounded,
    shipping,
    total
  };
}


async function ensureUserCart(userId) {
  const { rows } = await db.query("SELECT id FROM cart WHERE user_id = $1", [
    userId,
  ]);
  if (rows.length) return rows[0].id;
  const ins = await db.query(
    "INSERT INTO cart (user_id, created_at) VALUES ($1, NOW()) RETURNING id",
    [userId]
  );
  return ins.rows[0].id;
}

async function fetchVariant(variantId) {
  const q = `
    SELECT pv.id, pv.product_id, pv.price, pv.color, pv.ram, pv.storage, pv.stock_quantity,
           p.name,
           COALESCE(
             (SELECT img_url FROM product_images 
              WHERE product_variant_id = pv.id 
              ORDER BY is_primary DESC, position ASC, id ASC LIMIT 1),
             (SELECT img_url FROM product_images 
              WHERE product_id = p.id AND product_variant_id IS NULL 
              ORDER BY is_primary DESC, position ASC, id ASC LIMIT 1)
           ) AS image
    FROM product_variant pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.id = $1
  `;
  const { rows } = await db.query(q, [variantId]);
  return rows[0] || null;
}

async function loadUserCartItems(userId) {
  const q = `
    SELECT ci.variant_id AS item_id, ci.quantity,
           pv.product_id, pv.color, pv.ram, pv.storage, pv.price AS unit_price, pv.stock_quantity,
           p.name,
           COALESCE(
             (SELECT img_url FROM product_images 
              WHERE product_variant_id = pv.id 
              ORDER BY is_primary DESC, position ASC, id ASC LIMIT 1),
             (SELECT img_url FROM product_images 
              WHERE product_id = p.id AND product_variant_id IS NULL 
              ORDER BY is_primary DESC, position ASC, id ASC LIMIT 1)
           ) AS image
    FROM cart c
    JOIN cart_items ci ON ci.cart_id = c.id
    JOIN product_variant pv ON pv.id = ci.variant_id
    JOIN products p ON p.id = pv.product_id
    WHERE c.user_id = $1
    ORDER BY ci.id ASC
  `;
  const { rows } = await db.query(q, [userId]);
  return rows.map((r) => ({
    itemId: String(r.item_id),
    productId: r.product_id,
    variantId: String(r.item_id),
    name: r.name,
    color: r.color,
    ram: Number(r.ram),
    storage: Number(r.storage),
    unitPrice: Number(r.unit_price),
    quantity: Number(r.quantity),
    image: r.image,
    stock: Number(r.stock_quantity),
  }));
}


export async function renderCart(req, res) {
  try {
    const isLoggedIn = Boolean(req.session.user);
    let items = [];

    if (isLoggedIn) {
      items = await loadUserCartItems(req.session.user.id);
    } else {
      const cookie = readCookieCart(req);
      const cookieItems = Array.isArray(cookie.items) ? cookie.items : [];
      for (const it of cookieItems) {
        const v = await fetchVariant(it.variantId);
        if (!v) continue;
        const clampedQty = Math.min(
          Number(it.quantity || 1),
          Number(v.stock_quantity || 0)
        );
        items.push({
          itemId: String(v.id),
          productId: v.product_id,
          variantId: String(v.id),
          name: v.name,
          color: v.color,
          ram: Number(v.ram), // ✅ include RAM
          storage: Number(v.storage),
          unitPrice: Number(v.price),
          quantity: clampedQty,
          image: v.image,
          stock: Number(v.stock_quantity),
        });
      }
    }

    const totals = calcTotals(items);
    const count = items.reduce((s, it) => s + it.quantity, 0);

    res.render("user/cart", { cart: { items, count, ...totals } });
  } catch (err) {
    console.error("renderCart error", err);
    res
      .status(500)
      .render("user/cart", {
        cart: {
          items: [],
          count: 0,
          subtotal: 0,
          tax: 0,
          shipping: 0,
          total: 0,
        },
      });
  }
}

export async function apiAddToCart(req, res) {
  try {
    const { productId, variantId, color, ram, storage, unitPrice, quantity } =
      req.body;
    if (
      !productId ||
      !variantId ||
      !color ||
      !ram ||
      !storage ||
      !unitPrice ||
      !quantity
    ) {
      return res
        .status(400)
        .json({ ok: false, message: "Missing required fields." });
    }

    const variant = await fetchVariant(variantId);
    if (!variant)
      return res
        .status(404)
        .json({ ok: false, message: "Variant not found." });
    if (Number(variant.stock_quantity) < 1)
      return res
        .status(400)
        .json({ ok: false, message: "Variant out of stock." });

    let safeQty = Math.max(1, Number(quantity));
    safeQty = Math.min(safeQty, Number(variant.stock_quantity));

    const isLoggedIn = Boolean(req.session.user);
    if (isLoggedIn) {
      const userId = req.session.user.id;
      const cartId = await ensureUserCart(userId);

      const { rows: existRows } = await db.query(
        "SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND variant_id = $2",
        [cartId, variantId]
      );
      if (existRows.length) {
        const newQty = Math.min(
          existRows[0].quantity + safeQty,
          Number(variant.stock_quantity)
        );
        await db.query("UPDATE cart_items SET quantity = $1 WHERE id = $2", [
          newQty,
          existRows[0].id,
        ]);
      } else {
        await db.query(
          "INSERT INTO cart_items (cart_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, $4)",
          [cartId, productId, variantId, safeQty]
        );
      }
      return res.json({ ok: true });
    }

    // Guest → cookie
    const cookieCart = readCookieCart(req);
    if (!cookieCart || typeof cookieCart !== "object") {
      return (
        writeCookieCart(res, { items: [] }),
        res.json({ ok: true })
      );
    }
    if (!Array.isArray(cookieCart.items)) cookieCart.items = [];
    const idx = cookieCart.items.findIndex(
      (it) => String(it.variantId) === String(variantId)
    );
    if (idx >= 0) {
      cookieCart.items[idx].quantity = Math.min(
        Number(cookieCart.items[idx].quantity || 0) + safeQty,
        Number(variant.stock_quantity)
      );
    } else {
      cookieCart.items.push({
        variantId: String(variantId),
        productId,
        color,
        ram, // ✅ keep RAM in cookie
        storage,
        unitPrice: Number(variant.price),
        quantity: safeQty,
      });
    }
    writeCookieCart(res, cookieCart);

    res.json({ ok: true });
  } catch (err) {
    console.error("apiAddToCart error", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

export async function apiUpdateCartItem(req, res) {
  try {
    const { variantId } = req.params;
    let { quantity } = req.body;
    quantity = Math.max(1, Number(quantity));

    const variant = await fetchVariant(variantId);
    if (!variant)
      return res
        .status(404)
        .json({ ok: false, message: "Variant not found." });
    const clamped = Math.min(quantity, Number(variant.stock_quantity));

    const isLoggedIn = Boolean(req.session.user);
    if (isLoggedIn) {
      const cartId = await ensureUserCart(req.session.user.id);
      await db.query(
        "UPDATE cart_items SET quantity = $1 WHERE cart_id = $2 AND variant_id = $3",
        [clamped, cartId, variantId]
      );
      return res.json({ ok: true });
    }

    const cookieCart = readCookieCart(req);
    if (!cookieCart || typeof cookieCart !== "object")
      return res.json({ ok: true });
    if (!Array.isArray(cookieCart.items)) cookieCart.items = [];
    const it = cookieCart.items.find(
      (i) => String(i.variantId) === String(variantId)
    );
    if (it) it.quantity = clamped;
    writeCookieCart(res, cookieCart);
    res.json({ ok: true });
  } catch (err) {
    console.error("apiUpdateCartItem error", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

export async function apiRemoveCartItem(req, res) {
  try {
    const { variantId } = req.params;
    const isLoggedIn = Boolean(req.session.user);
    if (isLoggedIn) {
      const cartId = await ensureUserCart(req.session.user.id);
      await db.query(
        "DELETE FROM cart_items WHERE cart_id = $1 AND variant_id = $2",
        [cartId, variantId]
      );
      return res.json({ ok: true });
    }

    const cookieCart = readCookieCart(req);
    if (!cookieCart || typeof cookieCart !== "object")
      return res.json({ ok: true });
    if (!Array.isArray(cookieCart.items)) cookieCart.items = [];
    cookieCart.items = cookieCart.items.filter(
      (it) => String(it.variantId) !== String(variantId)
    );
    writeCookieCart(res, cookieCart);
    res.json({ ok: true });
  } catch (err) {
    console.error("apiRemoveCartItem error", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
}
