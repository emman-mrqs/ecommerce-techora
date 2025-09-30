// src/controller/wishlistController.js
import db from "../database/db.js";

/* ============ helpers ============ */
async function ensureWishlistId(userId) {
  const w = await db.query(`SELECT id FROM wishlist WHERE user_id = $1`, [userId]);
  if (w.rows.length) return w.rows[0].id;
  const ins = await db.query(
    `INSERT INTO wishlist (user_id) VALUES ($1) RETURNING id`,
    [userId]
  );
  return ins.rows[0].id;
}

// decode and normalize cookie -> [Number,...]
function parseCookieIds(req) {
  try {
    let raw = req.cookies?.wishlist ?? "[]";
    if (Array.isArray(raw)) return raw.map(Number).filter(Number.isFinite);

    if (typeof raw === "string") {
      try { raw = decodeURIComponent(raw); } catch { /* ignore */ }
      const arr = JSON.parse(raw);
      return (Array.isArray(arr) ? arr : []).map(Number).filter(Number.isFinite);
    }
    return [];
  } catch {
    return [];
  }
}

// fetch minimal variant row for cart cookie/DB cart
async function getVariantRow(variantId) {
  const { rows } = await db.query(
    `
    SELECT pv.id AS variant_id, pv.product_id, pv.price, pv.color, pv.ram, pv.storage,
           p.name,
           (
             SELECT img_url FROM product_images pi
             WHERE pi.product_id = p.id
             ORDER BY is_primary DESC, position ASC
             LIMIT 1
           ) AS image
    FROM product_variant pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.id = $1
    `,
    [variantId]
  );
  return rows[0] || null;
}

// cart cookie helpers (guest)
function getCartCookie(req) {
  try {
    let raw = req.cookies?.cart ?? '{"items":[]}';
    if (typeof raw === 'string') {
      try { raw = decodeURIComponent(raw); } catch {}
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && Array.isArray(obj.items)) return obj;
      return { items: [] };
    }
    if (raw && typeof raw === 'object' && Array.isArray(raw.items)) return raw;
    return { items: [] };
  } catch {
    return { items: [] };
  }
}
function setCartCookie(res, cartObj) {
  res.cookie('cart', JSON.stringify(cartObj), {
    maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
    httpOnly: false,
    sameSite: 'lax',
    path: '/'
  });
}

/* ============ PAGES/API ============ */

// GET /wishlist
export const viewWishlist = async (req, res) => {
  const user = req.session?.user || null;

  try {
    // ----- Guest: render from cookie -----
    if (!user) {
      const ids = parseCookieIds(req);
      if (!ids.length) {
        return res.render("user/wishlist", { wishlist: { count: 0, items: [] }, user: null });
      }

      // preserves order using array_position
      const { rows } = await db.query(
        `
        SELECT 
          pv.id   AS variant_id,
          p.id    AS product_id,
          p.name,
          pv.color, pv.ram, pv.storage,
          pv.price, pv.stock_quantity,
          (
            SELECT img_url FROM product_images pi
            WHERE pi.product_id = p.id
            ORDER BY is_primary DESC, position ASC
            LIMIT 1
          ) AS image,
          array_position($1::bigint[], pv.id) AS ord
        FROM product_variant pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id = ANY($1::bigint[])
        ORDER BY ord;
        `,
        [ids]
      );

      const items = rows.map(r => ({
        variantId: r.variant_id,
        name: r.name,
        color: r.color,
        ram: r.ram,
        storage: r.storage,
        price: Number(r.price || 0),
        image: r.image,
        stockStatus: r.stock_quantity > 0 ? "In Stock" : "Out of Stock"
      }));

      return res.render("user/wishlist", { wishlist: { count: items.length, items }, user: null });
    }

    // ----- Logged-in: merge cookie -> DB then render -----
    const wishlistId = await ensureWishlistId(user.id);

    const cookieIds = parseCookieIds(req);
    if (cookieIds.length) {
      await db.query(
        `INSERT INTO wishlist_items (wishlist_id, product_variant_id)
         SELECT $1, x FROM unnest($2::bigint[]) AS t(x)
         ON CONFLICT (wishlist_id, product_variant_id) DO NOTHING`,
        [wishlistId, cookieIds]
      );
      res.clearCookie("wishlist", { path: "/" });
    }

    const { rows } = await db.query(
      `
      SELECT 
        wi.product_variant_id AS variant_id,
        pv.product_id, p.name, pv.color, pv.ram, pv.storage,
        pv.price, pv.stock_quantity,
        (SELECT img_url FROM product_images pi 
           WHERE pi.product_id = p.id 
           ORDER BY is_primary DESC, position ASC 
           LIMIT 1) AS image
      FROM wishlist_items wi
      JOIN product_variant pv ON pv.id = wi.product_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE wi.wishlist_id = $1
      ORDER BY wi.added_at DESC, p.name ASC
      `,
      [wishlistId]
    );

    const items = rows.map(r => ({
      variantId: r.variant_id,
      name: r.name,
      color: r.color,
      ram: r.ram,
      storage: r.storage,
      price: Number(r.price || 0),
      image: r.image,
      stockStatus: r.stock_quantity > 0 ? "In Stock" : "Out of Stock"
    }));

    return res.render("user/wishlist", { wishlist: { count: items.length, items }, user });
  } catch (err) {
    console.error("viewWishlist error:", err);
    return res.render("user/wishlist", { wishlist: { count: 0, items: [] }, user: user || null });
  }
};

// POST /api/wishlist/add  (guest cookie or DB)
export const addToWishlist = async (req, res) => {
  const userId = req.session?.user?.id || null;
  const vId = Number(req.body?.variantId);

  if (!Number.isFinite(vId)) {
    return res.status(400).json({ ok: false, message: "variantId required" });
  }

  try {
    if (userId) {
      const wishlistId = await ensureWishlistId(userId);
      await db.query(
        `INSERT INTO wishlist_items (wishlist_id, product_variant_id)
         VALUES ($1, $2)
         ON CONFLICT (wishlist_id, product_variant_id) DO NOTHING`,
        [wishlistId, vId]
      );
      const { rows: cnt } = await db.query(
        `SELECT COUNT(*)::int AS c FROM wishlist_items WHERE wishlist_id = $1`,
        [wishlistId]
      );
      return res.json({ ok: true, count: cnt[0].c, source: "db" });
    }

    // guest -> cookie
    const ids = parseCookieIds(req);
    if (!ids.includes(vId)) ids.push(vId);
    res.cookie("wishlist", JSON.stringify(ids), {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: "lax",
      path: "/"
    });
    return res.json({ ok: true, count: ids.length, source: "cookie" });
  } catch (e) {
    console.error("addToWishlist:", e);
    return res.status(500).json({ ok: false, message: "Failed to add to wishlist" });
  }
};

// DELETE /api/wishlist/:variantId  (guest cookie or DB)
export const removeFromWishlist = async (req, res) => {
  const userId = req.session?.user?.id || null;
  const vId = Number(req.params.variantId);
  if (!Number.isFinite(vId)) {
    return res.status(400).json({ ok: false, message: 'variantId required' });
  }

  try {
    if (userId) {
      const { rows } = await db.query(`SELECT id FROM wishlist WHERE user_id=$1`, [userId]);
      if (rows.length) {
        const wishlistId = rows[0].id;
        await db.query(
          `DELETE FROM wishlist_items WHERE wishlist_id=$1 AND product_variant_id=$2`,
          [wishlistId, vId]
        );
        const { rows: cnt } = await db.query(
          `SELECT COUNT(*)::int AS c FROM wishlist_items WHERE wishlist_id=$1`,
          [wishlistId]
        );
        return res.json({ ok: true, count: cnt[0].c, source: 'db' });
      }
      return res.json({ ok: true, count: 0, source: 'db' });
    }

    // guest -> cookie
    let ids = parseCookieIds(req).filter(id => id !== vId);
    res.cookie('wishlist', JSON.stringify(ids), {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: 'lax',
      path: '/'
    });
    return res.json({ ok: true, count: ids.length, source: 'cookie' });
  } catch (e) {
    console.error('removeFromWishlist:', e);
    return res.status(500).json({ ok: false, message: 'Failed to remove item' });
  }
};

// POST /api/wishlist/move-to-cart  (adds to cart then removes from wishlist)
export const moveWishlistToCart = async (req, res) => {
  const userId = req.session?.user?.id || null;
  const vId = Number(req.body?.variantId);
  const qty = Math.max(1, Number(req.body?.quantity || 1));
  if (!Number.isFinite(vId)) {
    return res.status(400).json({ ok: false, message: 'variantId required' });
  }

  try {
    const v = await getVariantRow(vId);
    if (!v) return res.status(404).json({ ok: false, message: 'Variant not found' });

    if (userId) {
    // ensure cart
    const c0 = await db.query(`SELECT id FROM cart WHERE user_id=$1`, [userId]);
    const cartId = c0.rows[0]?.id
    || (await db.query(`INSERT INTO cart(user_id) VALUES($1) RETURNING id`, [userId])).rows[0].id;

    // upsert cart_items WITHOUT unit_price (cart shows live price from product_variant)
    await db.query(
    `
    INSERT INTO cart_items (cart_id, product_id, variant_id, quantity)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (cart_id, variant_id) DO UPDATE
        SET quantity = cart_items.quantity + EXCLUDED.quantity
    `,
    [cartId, v.product_id, vId, qty]
    );


      // remove from wishlist
      const w0 = await db.query(`SELECT id FROM wishlist WHERE user_id=$1`, [userId]);
      if (w0.rows.length) {
        await db.query(
          `DELETE FROM wishlist_items WHERE wishlist_id=$1 AND product_variant_id=$2`,
          [w0.rows[0].id, vId]
        );
      }

      return res.json({ ok: true, source: 'db' });
    }

    // guest cookie path
    // 1) remove from wishlist cookie
    const newIds = parseCookieIds(req).filter(id => id !== vId);
    res.cookie('wishlist', JSON.stringify(newIds), {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: 'lax',
      path: '/'
    });

    // 2) add/increment in cart cookie
    const cart = getCartCookie(req);
    const existing = cart.items.find(it => Number(it.variantId) === vId);
    if (existing) {
      existing.quantity = Number(existing.quantity || 0) + qty;
    } else {
      cart.items.push({
        variantId: vId,
        productId: v.product_id,
        name: v.name,
        color: v.color,
        ram: v.ram,
        storage: v.storage,
        unitPrice: Number(v.price),
        quantity: qty,
        image: v.image
      });
    }
    setCartCookie(res, cart);

    return res.json({ ok: true, source: 'cookie' });
  } catch (e) {
    console.error('moveWishlistToCart:', e);
    return res.status(500).json({ ok: false, message: 'Failed to move item' });
  }
};
