// src/controller/checkoutController.js
import db from "../database/db.js";
import { insertAudit } from "../utils/audit.js";

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
function computeTotals(items, discount = 0, settings = {}) {
  const subtotal = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
  const tax = subtotal * 0.03;

  // 🔽 Shipping from admin settings
  let shipping = 0;
  if (settings.ship_free) {
    shipping = 0;
  } else if (settings.ship_flat) {
    shipping = subtotal > 0 ? Number(settings.flat_rate_amount || 0) : 0;
  } else {
    shipping = 0; // default/fallback
  }

  const total = Math.max(0, subtotal - Number(discount)) + tax + shipping;
  return { subtotal, tax, shipping, total };
}


// Validate a voucher code for this user's cart; discount applies only to that seller's items
async function validateVoucherForCart(userId, code) {
  const trimmed = String(code || "").trim();
  if (!trimmed) return { ok: false, message: "Enter a voucher code." };

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

  const now = new Date();
  const active = String(promo.status || "").toLowerCase() === "active";
  const expired = promo.expiry_date ? new Date(promo.expiry_date) < now : false;
  const capped = promo.usage_limit != null && promo.used_count >= promo.usage_limit;
  if (!active || expired || capped) return { ok: false, message: "Voucher is not usable." };

  const items = await getUserCartItems(userId);
  if (!items.length) return { ok: false, message: "Your cart is empty." };

  const sellerSubtotal = items
    .filter(it => Number(it.seller_id) === Number(promo.seller_id))
    .reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);

  if (sellerSubtotal <= 0) {
    return { ok: false, message: "This voucher does not apply to any items in your cart." };
  }

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

/**
 * Emit one audit per seller for a newly created order.
 * This is what the seller notification middleware looks for:
 *   action: 'order_placed'
 * AND details.seller_id = <seller_id>
 */
async function emitSellerOrderPlacedAudits({ orderId, items, buyer, ip }) {
  if (!Array.isArray(items) || !items.length) return;

  // group items by seller
  const bySeller = new Map(); // seller_id -> { items: [], qty, total }
  for (const it of items) {
    const sid = Number(it.seller_id);
    if (!bySeller.has(sid)) bySeller.set(sid, { items: [], qty: 0, total: 0 });
    const bucket = bySeller.get(sid);
    bucket.items.push({
      product_variant_id: Number(it.variant_id),
      qty: Number(it.quantity),
      price: Number(it.price),
    });
    bucket.qty += Number(it.quantity);
    bucket.total += Number(it.price) * Number(it.quantity);
  }

  // seller names for actor_name (Admin Audit “Actor” column)
  const sellerIds = Array.from(bySeller.keys());
  let sellerNames = new Map();
  if (sellerIds.length) {
    const { rows: srows } = await db.query(
      `SELECT id, store_name FROM sellers WHERE id = ANY($1::int[])`,
      [sellerIds]
    );
    sellerNames = new Map(srows.map(r => [Number(r.id), r.store_name || null]));
  }

  await Promise.all(
    sellerIds.map((sid) => {
      const info = bySeller.get(sid);
      return insertAudit({
        actor_type: "seller",
        actor_id: sid,
        actor_name: sellerNames.get(sid) || null,   // ✅ important for nice Actor label
        action: "order_placed",
        resource: "orders",
        details: {
          seller_id: sid,                              // ✅ important for middleware filter
          order_id: orderId,
          items: info.items,
          quantity: info.qty,
          total_amount: Number(info.total.toFixed(2)),
          buyer_id: buyer?.id || null,
          buyer_name: buyer?.name || null,
          buyer_email: buyer?.email || null,
        },
        ip: ip || null,
        status: "success",
      }).catch(e => {
        console.error("emitSellerOrderPlacedAudits: insertAudit failed for seller", sid, e);
      });
    })
  );
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

    const settings = res.locals.siteSettings || {};
    const { subtotal, tax, shipping, total } = computeTotals(items, 0, settings);

    const { rows: addresses } = await db.query(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    const defaultAddress = addresses.length ? addresses[0] : null;

    res.render("user/checkout", {
      user: req.session.user,
      items,
      subtotal, tax, shipping, total,
      addresses, defaultAddress,
      settings    // 🔽 pass to EJS so we can hide/show payment options
    });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).send("Something went wrong while loading checkout");
  }
}


// Render checkout for selected cart items (POST from /cart)
export async function renderCheckoutSelected(req, res) {
  if (!req.session.user) {
    return res.send("<script>alert('You need to login first!'); window.location='/login-verify';</script>");
  }
  const userId = req.session.user.id;

  let selected = req.body?.['selected[]'] || req.body?.selected || req.body?.selectedVariantIds || null;
  if (!selected) {
    return res.send("<script>alert('No items selected for checkout.'); window.location='/cart';</script>");
  }
  if (!Array.isArray(selected)) selected = [selected];
  const selectedIds = selected.map(v => Number(v)).filter(Number.isFinite);

  if (!selectedIds.length) {
    return res.send("<script>alert('No valid items selected.'); window.location='/cart';</script>");
  }

  try {
    const allItems = await getUserCartItems(userId); // helper already in file
    const items = allItems.filter(it => selectedIds.includes(Number(it.variant_id)));

    if (!items.length) {
      return res.send("<script>alert('Selected items not found in your cart.'); window.location='/cart';</script>");
    }

    const settings = res.locals.siteSettings || {};
    const { subtotal, tax, shipping, total } = computeTotals(items, 0, settings);

    const { rows: addresses } = await db.query(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    const defaultAddress = addresses.length ? addresses[0] : null;

    res.render("user/checkout", {
      user: req.session.user,
      items,
      subtotal, tax, shipping, total,
      addresses, defaultAddress,
      settings,
      selectedVariantIds: selectedIds // pass to template for JS use
    });
  } catch (err) {
    console.error("renderCheckoutSelected error:", err);
    res.status(500).send("Something went wrong while loading checkout");
  }
}



/* ========== API: validate code (Checkout sidebar) ========== */
export async function validateCheckoutVoucher(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ ok: false, message: "Login required." });

    const out = await validateVoucherForCart(userId, req.body?.code);

    // audit attempt
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: req.session.user.id,
        actor_name: req.session.user.name || req.session.user.email,
        action: "voucher_apply_attempt",
        resource: "vouchers",
        details: { code: req.body?.code || null, result: out.ok ? "valid" : "invalid", message: out.message || null },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: out.ok ? "success" : "failed",
      });
    } catch (auditErr) {
      console.error("Audit insert error (voucher_apply_attempt):", auditErr);
    }

    return res.status(out.ok ? 200 : 400).json(out);
  } catch (e) {
    console.error("validateCheckoutVoucher:", e);
    return res.status(500).json({ ok: false, message: "Server error." });
  }
}

/* ========== NEW: stock reservation helper (transactional) ========== */
async function reserveStockForCartItems(client, items) {
  const variantIds = [...new Set(items.map(i => Number(i.variant_id)))];
  const { rows: locked } = await client.query(
    `SELECT id, stock_quantity FROM product_variant
     WHERE id = ANY($1::int[]) FOR UPDATE`,
    [variantIds]
  );

  const stockById = new Map(locked.map(r => [Number(r.id), Number(r.stock_quantity)]));

  const need = new Map();
  for (const it of items) {
    const vid = Number(it.variant_id);
    need.set(vid, (need.get(vid) || 0) + Number(it.quantity));
  }

  for (const [vid, qtyNeeded] of need.entries()) {
    const have = stockById.get(vid);
    if (have == null) throw new Error(`Variant ${vid} not found.`);
    if (have < qtyNeeded) throw new Error(`Insufficient stock for variant ${vid}. Need ${qtyNeeded}, have ${have}.`);
  }

  for (const [vid, qtyNeeded] of need.entries()) {
    await client.query(
      `UPDATE product_variant SET stock_quantity = stock_quantity - $2 WHERE id = $1`,
      [vid, qtyNeeded]
    );
  }
}

/* ========== place order (COD/PayPal pre-create) ========== */
// Drop-in replacement for: export const placeOrder = async (req, res) => { ... }
export const placeOrder = async (req, res) => {
  const userId = req.session.user?.id;
  if (!userId) return res.status(401).json({ error: "You need to login first!" });

  const {
    paymentMethod,
    firstName, lastName, address, city, province, zipCode, phone, email,
    voucherId, voucherCode
  } = req.body;

  // Enforce admin settings for payment + shipping
  const settings = res.locals.siteSettings || {};
  if (paymentMethod === "cod" && !settings.pay_cod) {
    return res.status(400).json({ error: "COD is currently disabled." });
  }
  if (paymentMethod === "paypal" && !settings.pay_paypal) {
    return res.status(400).json({ error: "PayPal is currently disabled." });
  }

  const ip = req.headers["x-forwarded-for"] || req.ip;
  const shippingAddress =
    `${firstName} ${lastName}, ${address}, ${city}, ${province}, ${zipCode}, 📞 ${phone}, ✉ ${email}`;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Load cart items INSIDE the transaction
    // Load cart items INSIDE the transaction
    const selectedVariantIds = Array.isArray(req.body.selectedVariantIds)
      ? req.body.selectedVariantIds.map(v => Number(v)).filter(Number.isFinite)
      : (Array.isArray(req.body.selected) ? req.body.selected.map(v => Number(v)).filter(Number.isFinite) : null);

    let itemsQuery;
    let queryArgs;
    if (selectedVariantIds && selectedVariantIds.length) {
      itemsQuery = `
      SELECT 
        ci.id       AS cart_item_id,
        ci.quantity,
        pv.id       AS variant_id,
        pv.price,
        p.seller_id AS seller_id
      FROM cart_items ci
      JOIN cart c             ON ci.cart_id = c.id
      JOIN product_variant pv ON ci.variant_id = pv.id
      JOIN products p         ON pv.product_id = p.id
      WHERE c.user_id = $1
        AND ci.variant_id = ANY($2::int[])
      ORDER BY ci.id ASC
      `;
      queryArgs = [userId, selectedVariantIds];
    } else {
      itemsQuery = `
      SELECT 
        ci.id       AS cart_item_id,
        ci.quantity,
        pv.id       AS variant_id,
        pv.price,
        p.seller_id AS seller_id
      FROM cart_items ci
      JOIN cart c             ON ci.cart_id = c.id
      JOIN product_variant pv ON ci.variant_id = pv.id
      JOIN products p         ON pv.product_id = p.id
      WHERE c.user_id = $1
      ORDER BY ci.id ASC
      `;
      queryArgs = [userId];
    }

    const { rows: items } = await client.query(itemsQuery, queryArgs);


    if (!items.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Your cart is empty" });
    }

    // --- Voucher (re-)validate inside the same txn
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
        const { rows } = await client.query(
          `SELECT voucher_code FROM promotions WHERE id = $1`,
          [voucherId]
        );
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

    // --- Totals (use admin shipping rules via computeTotals)
    const { tax, shipping, total } = computeTotals(items, discount, settings);

    // --- Create order
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, order_status, payment_method, payment_status, total_amount, shipping_address)
       VALUES ($1, 'pending', $2, 'unpaid', $3, $4)
       RETURNING id`,
      [userId, paymentMethod, total, shippingAddress]
    );
    const orderId = orderResult.rows[0].id;

    // --- Insert order items
    for (const it of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, it.variant_id, it.quantity, it.price]
      );
    }

    // --- COD: reserve stock + clear cart in the same txn
    if (paymentMethod === "cod") {
await reserveStockForCartItems(client, items);

// delete only the items that were part of this order (selected variants)
const variantIds = items.map(i => Number(i.variant_id)).filter(Number.isFinite);
if (variantIds.length) {
  await client.query(
    `DELETE FROM cart_items
       WHERE cart_id = (SELECT id FROM cart WHERE user_id = $1)
         AND variant_id = ANY($2::int[])`,
    [userId, variantIds]
  );
}

await client.query("COMMIT");


      // Audit(s)
      try {
        const itemSummary = items.map(i => ({
          product_variant_id: i.variant_id,
          qty: i.quantity,
          price: i.price
        }));
        await insertAudit({
          actor_type: "user",
          actor_id: req.session.user.id,
          actor_name: req.session.user.name || req.session.user.email,
          action: "order_create",
          resource: "orders",
          details: {
            order_id: orderId,
            total,
            payment_method: "cod",
            items: itemSummary,
            voucher: appliedVoucher || null
          },
          ip,
          status: "success",
        });
      } catch (auditErr) {
        console.error("Audit insert error (order_create COD):", auditErr);
      }

      // Per-seller audits → notifications
      try {
        await emitSellerOrderPlacedAudits({
          orderId,
          items,
          buyer: {
            id: req.session.user.id,
            name: req.session.user.name || null,
            email: req.session.user.email || null,
          },
          ip,
        });
      } catch (e) {
        console.error("emitSellerOrderPlacedAudits (COD) failed:", e);
      }

      return res.json({
        success: true,
        message: "Order placed with Cash on Delivery!",
        orderId,
        total,
        voucher: appliedVoucher
      });
    }

    // --- Non-COD (e.g., PayPal pre-create): finalize order but don't reserve stock yet
    await client.query("COMMIT");

    try {
      const itemSummary = items.map(i => ({
        product_variant_id: i.variant_id,
        qty: i.quantity,
        price: i.price
      }));
      await insertAudit({
        actor_type: "user",
        actor_id: req.session.user.id,
        actor_name: req.session.user.name || req.session.user.email,
        action: "order_create",
        resource: "orders",
        details: {
          order_id: orderId,
          total,
          payment_method: paymentMethod,
          items: itemSummary,
          voucher: appliedVoucher || null,
          note: "payment_pending"
        },
        ip,
        status: "success",
      });
    } catch (auditErr) {
      console.error("Audit insert error (order_create non-cod):", auditErr);
    }

    try {
      await emitSellerOrderPlacedAudits({
        orderId,
        items,
        buyer: {
          id: req.session.user.id,
          name: req.session.user.name || null,
          email: req.session.user.email || null,
        },
        ip,
      });
    } catch (e) {
      console.error("emitSellerOrderPlacedAudits (non-COD) failed:", e);
    }

    return res.json({
      success: true,
      message: "Redirect to PayPal",
      orderId,
      total,
      voucher: appliedVoucher
    });

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("Error placing order:", err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    try { client.release(); } catch {}
  }
};


/* ========== redeem after successful payment ========== */
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

    try {
      await insertAudit({
        actor_type: "user",
        actor_id: req.session.user.id,
        actor_name: req.session.user.name || req.session.user.email,
        action: "voucher_redeemed",
        resource: "vouchers",
        details: { voucher_id: vid },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (auditErr) {
      console.error("Audit insert error (voucher_redeemed):", auditErr);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("redeemVoucherAfterPayment:", e);
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: req.session?.user?.id || null,
        actor_name: req.session?.user?.email || null,
        action: "voucher_redeem_error",
        resource: "vouchers",
        details: { voucher_id: req.body?.voucherId, error: e.message || String(e) },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "failed",
      });
    } catch (auditErr) {
      console.error("Audit insert error (voucher_redeem_error):", auditErr);
    }
    return res.status(500).json({ ok: false, message: "Server error." });
  }
}
