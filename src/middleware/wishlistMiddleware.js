// src/middleware/wishlistMiddleware.js
import db from "../database/db.js";

// read wishlist cookie safely -> array<number>
function readWishlistCookie(req) {
  try {
    let raw = req.cookies?.wishlist ?? "[]";
    if (Array.isArray(raw)) return raw.map(Number).filter(Number.isFinite);

    if (typeof raw === "string") {
      try { raw = decodeURIComponent(raw); } catch {}
      const arr = JSON.parse(raw);
      return (Array.isArray(arr) ? arr : []).map(Number).filter(Number.isFinite);
    }
    return [];
  } catch {
    return [];
  }
}

export async function wishlistCountMiddleware(req, res, next) {
  try {
    const cookieIds = readWishlistCookie(req);
    const user = req.session?.user || null;

    // default to cookie count for guests
    if (!user) {
      res.locals.wishlistCount = cookieIds.length;
      return next();
    }

    // logged in: union(DB ids, cookie ids) to avoid double counting
    let dbIds = [];
    const { rows: w } = await db.query(`SELECT id FROM wishlist WHERE user_id=$1`, [user.id]);
    if (w.length) {
      const wishlistId = w[0].id;
      const { rows } = await db.query(
        `SELECT product_variant_id FROM wishlist_items WHERE wishlist_id=$1`,
        [wishlistId]
      );
      dbIds = rows.map(r => Number(r.product_variant_id)).filter(Number.isFinite);
    }

    const set = new Set([...dbIds, ...cookieIds]);
    res.locals.wishlistCount = set.size;
    return next();
  } catch (e) {
    console.error("wishlistCountMiddleware:", e);
    res.locals.wishlistCount = 0;
    return next();
  }
}
