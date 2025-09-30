// src/controller/checkoutController.js
import db from "../database/db.js";


/* ========== helpers ========== */

// Get all cart items (joined to seller) for a user
async function getUserCartItems(userId) {
  const { rows } = await db.query(
    `
    SELECT 
      ci.id             AS cart_item_id,
      ci.quantity,
      pv.id             AS variant_id,
      pv.color,
      pv.storage,
      pv.ram,
      pv.price,
      pv.stock_quantity,
      p.id              AS product_id,
      p.seller_id       AS seller_id,
      p.name            AS product_name,
      COALESCE(
        (SELECT img_url FROM product_images 
         WHERE product_variant_id = pv.id 
         ORDER BY is_primary DESC, position ASC LIMIT 1),
        (SELECT img_url FROM product_images 
         WHERE product_id = p.id 
         ORDER BY is_primary DESC, position ASC LIMIT 1)
      ) AS image
    FROM cart_items ci
    JOIN cart c             ON ci.cart_id = c.id
    JOIN product_variant pv ON ci.variant_id = pv.id
    JOIN products p         ON pv.product_id = p.id
    WHERE c.user_id = $1
    ORDER BY ci.id ASC
    `,
    [userId]
  );
  return rows;
}

// Compute normal totals
// Replace this whole function:
function computeTotals(items, discount = 0) {
  const subtotal = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
  const tax = subtotal * 0.03;
  const shipping = subtotal > 5000 ? 0 : 50;       // ← FREE if > ₱5,000, else ₱50
  const total = Math.max(0, subtotal - Number(discount)) + tax + shipping;
  return { subtotal, tax, shipping, total };
}

// Validate a voucher code for this user's cart; discount applies only to that seller's items
async function validateVoucherForCart(userId, code) {
  const trimmed = String(code || "").trim();
  if (!trimmed) return { ok: false, message: "Enter a voucher code." };

  // find promo by code
  const { rows: promos } = await db.query(
    `SELECT id, seller_id, voucher_code, discount_type, discount_value,
            usage_limit, used_count, expiry_date, status
       FROM promotions
      WHERE LOWER(voucher_code) = LOWER($1)
      LIMIT 1`,
    [trimmed]
  );
  const promo = promos[0];
  if (!promo) return { ok: false, message: "Invalid voucher." };

  // status/expiry/limit checks
  const now = new Date();
  const active = String(promo.status || "").toLowerCase() === "active";
  const expired = promo.expiry_date ? new Date(promo.expiry_date) < now : false;
  const capped = promo.usage_limit != null && promo.used_count >= promo.usage_limit;
  if (!active || expired || capped) return { ok: false, message: "Voucher is not usable." };

  // get user cart + compute the subtotal that belongs to this voucher's seller
  const items = await getUserCartItems(userId);
  if (!items.length) return { ok: false, message: "Your cart is empty." };

  const sellerSubtotal = items
    .filter(it => Number(it.seller_id) === Number(promo.seller_id))
    .reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);

  if (sellerSubtotal <= 0) {
    return { ok: false, message: "This voucher does not apply to any items in your cart." };
  }

  // compute discount on that seller-subtotal
  let discount = 0;
  if (String(promo.discount_type).toLowerCase() === "percent") {
    discount = sellerSubtotal * (Number(promo.discount_value) / 100);
  } else {
    discount = Number(promo.discount_value);
  }
  discount = Math.max(0, Math.min(sellerSubtotal, discount));

  return {
    ok: true,
    promo: {
      id: promo.id,
      code: promo.voucher_code,
      seller_id: promo.seller_id,
      type: promo.discount_type, // "percent" | "fixed"
      value: Number(promo.discount_value),
    },
    sellerSubtotal,
    discount: Number(discount.toFixed(2)),
  };
}

/* ========== page render ========== */

export async function renderCheckout(req, res) {
  if (!req.session.user) {
    return res.send("<script>alert('You need to login first!'); window.location='/login-verify';</script>");
  }
  const userId = req.session.user.id;

  try {
    const items = await getUserCartItems(userId);
    if (!items.length) {
      return res.send("<script>alert('Your cart is empty!'); window.location='/cart';</script>");
    }

const { subtotal, tax, shipping, total } = computeTotals(items);

    const { rows: addresses } = await db.query(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    const defaultAddress = addresses.length ? addresses[0] : null;

    res.render("user/checkout", {
      user: req.session.user,
      items,
      subtotal,
      tax,
      shipping,
      total,
      addresses,
      defaultAddress
    });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).send("Something went wrong while loading checkout");
  }
}

/* ========== API: validate code (Checkout sidebar) ========== */
// POST /api/voucher/validate  { code }
export async function validateCheckoutVoucher(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ ok: false, message: "Login required." });

    const out = await validateVoucherForCart(userId, req.body?.code);
    return res.status(out.ok ? 200 : 400).json(out);
  } catch (e) {
    console.error("validateCheckoutVoucher:", e);
    return res.status(500).json({ ok: false, message: "Server error." });
  }
}


/* ========== NEW: stock reservation helper (transactional) ========== */
// items: array from getUserCartItems(userId) OR order_items joined to variants
async function reserveStockForCartItems(client, items) {
  // 1) Lock all variants involved so concurrent orders can't oversell
  const variantIds = [...new Set(items.map(i => Number(i.variant_id)))];
  const { rows: locked } = await client.query(
    `SELECT id, stock_quantity FROM product_variant
     WHERE id = ANY($1::int[]) FOR UPDATE`,
    [variantIds]
  );

  const stockById = new Map(locked.map(r => [Number(r.id), Number(r.stock_quantity)]));

  // 2) Compute required qty per variant
  const need = new Map();
  for (const it of items) {
    const vid = Number(it.variant_id);
    need.set(vid, (need.get(vid) || 0) + Number(it.quantity));
  }

  // 3) Validate availability
  for (const [vid, qtyNeeded] of need.entries()) {
    const have = stockById.get(vid);
    if (have == null) {
      throw new Error(`Variant ${vid} not found.`);
    }
    if (have < qtyNeeded) {
      throw new Error(`Insufficient stock for variant ${vid}. Need ${qtyNeeded}, have ${have}.`);
    }
  }

  // 4) Deduct stock
  for (const [vid, qtyNeeded] of need.entries()) {
    await client.query(
      `UPDATE product_variant SET stock_quantity = stock_quantity - $2 WHERE id = $1`,
      [vid, qtyNeeded]
    );
  }
}

/* ========== place order (COD/PayPal pre-create) ========== */
// Accepts optional voucherId/voucherCode; recomputes and stores discounted total.
export const placeOrder = async (req, res) => {
  const userId = req.session.user?.id;
  if (!userId) return res.status(401).json({ error: "You need to login first!" });

  const {
    paymentMethod,
    firstName, lastName, address, city, province, zipCode, phone, email,
    voucherId, voucherCode
  } = req.body;

  const shippingAddress = `${firstName} ${lastName}, ${address}, ${city}, ${province}, ${zipCode}, 📞 ${phone}, ✉ ${email}`;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Load cart items inside the txn for consistency
    const items = await (async () => {
      const { rows } = await client.query(
        `
        SELECT 
          ci.id             AS cart_item_id,
          ci.quantity,
          pv.id             AS variant_id,
          pv.price,
          p.seller_id       AS seller_id
        FROM cart_items ci
        JOIN cart c             ON ci.cart_id = c.id
        JOIN product_variant pv ON ci.variant_id = pv.id
        JOIN products p         ON pv.product_id = p.id
        WHERE c.user_id = $1
        ORDER BY ci.id ASC
        `,
        [userId]
      );
      return rows;
    })();

    if (!items.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Your cart is empty" });
    }

    // Re-validate voucher & totals (same logic as before; trimmed for brevity)
    let discount = 0;
    let appliedVoucher = null;

    async function validateVoucherInsideTxn(code) {
      const trimmed = String(code || "").trim();
      if (!trimmed) return { ok: false };
      const { rows: promos } = await client.query(
        `SELECT id, seller_id, voucher_code, discount_type, discount_value,
                usage_limit, used_count, expiry_date, status
           FROM promotions
          WHERE LOWER(voucher_code) = LOWER($1)
          LIMIT 1`,
        [trimmed]
      );
      const promo = promos[0];
      if (!promo) return { ok: false };

      const now = new Date();
      const active = String(promo.status || "").toLowerCase() === "active";
      const expired = promo.expiry_date ? new Date(promo.expiry_date) < now : false;
      const capped = promo.usage_limit != null && promo.used_count >= promo.usage_limit;
      if (!active || expired || capped) return { ok: false };

      // compute seller subtotal from items we already loaded
      const sellerSubtotal = items
        .filter(it => Number(it.seller_id) === Number(promo.seller_id))
        .reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
      if (sellerSubtotal <= 0) return { ok: false };

      let d = 0;
      if (String(promo.discount_type).toLowerCase() === "percent") {
        d = sellerSubtotal * (Number(promo.discount_value) / 100);
      } else {
        d = Number(promo.discount_value);
      }
      d = Math.max(0, Math.min(sellerSubtotal, d));

      return {
        ok: true,
        promo: {
          id: promo.id,
          code: promo.voucher_code,
          seller_id: promo.seller_id,
          type: promo.discount_type,
          value: Number(promo.discount_value),
        },
        discount: Number(d.toFixed(2)),
      };
    }

    if (voucherId || voucherCode) {
      let code = voucherCode;
      if (!code && voucherId) {
        const { rows } = await client.query(`SELECT voucher_code FROM promotions WHERE id = $1`, [voucherId]);
        code = rows[0]?.voucher_code;
      }
      if (code) {
        const v = await validateVoucherInsideTxn(code);
        if (v.ok) {
          discount = v.discount;
          appliedVoucher = v.promo;
        }
      }
    }

    // Totals
// With this:
const subtotal = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
const tax = subtotal * 0.03;
const shipping = subtotal > 5000 ? 0 : 50;        // ← FREE if > ₱5,000, else ₱50
const total = Math.max(0, subtotal - discount) + tax + shipping;
    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, order_status, payment_method, payment_status, total_amount, shipping_address)
       VALUES ($1, 'pending', $2, 'unpaid', $3, $4)
       RETURNING id`,
      [userId, paymentMethod, total, shippingAddress]
    );
    const orderId = orderResult.rows[0].id;

    // Insert order items
    for (const it of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, it.variant_id, it.quantity, it.price]
      );
    }

    if (paymentMethod === "cod") {
      // **NEW**: Reserve/deduct stock NOW (so COD also adjusts inventory)
      await reserveStockForCartItems(client, items);

      // Clear cart
      await client.query(
        `DELETE FROM cart_items WHERE cart_id = (SELECT id FROM cart WHERE user_id = $1)`,
        [userId]
      );

      await client.query("COMMIT");
      return res.json({
        success: true,
        message: "Order placed with Cash on Delivery!",
        orderId,
        total,
        voucher: appliedVoucher
      });
    }

    // PayPal path: don't touch stock here (your PayPal success webhook/controller should do it)
    await client.query("COMMIT");
    return res.json({
      success: true,
      message: "Redirect to PayPal",
      orderId,
      total,
      voucher: appliedVoucher
    });

  } catch (err) {
    // Safety: rollback if we opened a txn
    try { await db.query("ROLLBACK"); } catch {}
    console.error("Error placing order:", err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    // Release client if allocated
    try { client.release(); } catch {}
  }
};

/* ========== redeem after successful payment ========== */
// POST /api/voucher/redeem  { voucherId }
export async function redeemVoucherAfterPayment(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ ok: false, message: "Login required." });

    const vid = Number(req.body?.voucherId);
    if (!Number.isFinite(vid)) return res.status(400).json({ ok: false, message: "voucherId required." });

    const { rowCount } = await db.query(
      `
      UPDATE promotions
         SET used_count = used_count + 1
       WHERE id = $1
         AND (usage_limit IS NULL OR used_count < usage_limit)
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         AND LOWER(status) = 'active'
      `,
      [vid]
    );
    if (!rowCount) return res.status(409).json({ ok: false, message: "Voucher can no longer be redeemed." });

    return res.json({ ok: true });
  } catch (e) {
    console.error("redeemVoucherAfterPayment:", e);
    return res.status(500).json({ ok: false, message: "Server error." });
  }
}
