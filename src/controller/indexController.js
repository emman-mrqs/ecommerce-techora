// src/controller/indexController.js
import db from "../database/db.js";

/**
 * Turn whatever is in image_url into a public web path:
 * - If it already starts with /uploads, keep it
 * - If it's an absolute path containing "\uploads\" or "/uploads/", strip everything before "uploads/"
 * - If it contains "\src\public\" or "/src/public/", strip that prefix
 * - Otherwise return the legacy fallback
 */
function normalizeBannerPath(row) {
  const fallback = "/uploads/img/Techora%20Banner.png";
  if (!row || !row.image_url) return fallback;

  let p = String(row.image_url);

  // If it's already a public URL under /uploads, keep it
  if (p.startsWith("/uploads/")) {
    // ok
  } else {
    // Try to locate the 'uploads' segment in either Windows or POSIX form
    const winUploads = p.toLowerCase().lastIndexOf("\\uploads\\");
    const nixUploads = p.toLowerCase().lastIndexOf("/uploads/");
    if (winUploads !== -1) {
      p = p.slice(winUploads).replaceAll("\\", "/"); // -> uploads/...
      p = "/" + p.replace(/^\/+/, "");
    } else if (nixUploads !== -1) {
      p = p.slice(nixUploads); // -> /uploads/...
      if (!p.startsWith("/")) p = "/" + p;
    } else {
      // Maybe they saved an absolute path under src/public/...
      const winPublic = p.toLowerCase().lastIndexOf("\\src\\public\\");
      const nixPublic = p.toLowerCase().lastIndexOf("/src/public/");
      if (winPublic !== -1) {
        p = p.slice(winPublic + "\\src\\public".length + 1).replaceAll("\\", "/");
        p = "/" + p.replace(/^\/+/, "");
      } else if (nixPublic !== -1) {
        p = p.slice(nixPublic + "/src/public".length);
        if (!p.startsWith("/")) p = "/" + p;
      } else {
        // Don't recognize this path shape; use fallback
        p = fallback;
      }
    }
  }

  // Encode spaces etc.
  try { p = encodeURI(p); } catch { /* ignore */ }

  // Cache-bust with updated_at if available
  if (row.updated_at) {
    const v = new Date(row.updated_at).getTime();
    p += (p.includes("?") ? "&" : "?") + "v=" + v;
  }

  return p || fallback;
}

export const renderLandingPage = async (req, res) => {
  try {
    // 1) Try to get the active banner
    let bannerRow = null;
    {
      const { rows } = await db.query(`
        SELECT image_url, updated_at
        FROM homepage_banners
        WHERE is_active = TRUE
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      `);
      bannerRow = rows?.[0] || null;
    }

    // 2) If no active banner, fall back to newest banner (so uploads immediately show)
    if (!bannerRow) {
      const { rows } = await db.query(`
        SELECT image_url, updated_at
        FROM homepage_banners
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      `);
      bannerRow = rows?.[0] || null;
    }

    const bannerUrl = normalizeBannerPath(bannerRow);

    // ---------- FEATURED PRODUCTS ----------
    const { rows: featuredProducts } = await db.query(`
      WITH sold AS (
        SELECT
          p.id              AS product_id,
          p.name            AS name,
          SUM(oi.quantity)  AS units_sold_30d
        FROM orders o
        JOIN order_items oi   ON oi.order_id = o.id
        JOIN product_variant v ON v.id = oi.product_variant_id
        JOIN products p        ON p.id = v.product_id
        WHERE o.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY p.id, p.name
      ),
      price_stock AS (
        SELECT
          v.product_id,
          MIN(v.price) AS min_price,
          SUM(CASE WHEN v.stock_quantity > 0 THEN 1 ELSE 0 END) AS variants_in_stock
        FROM product_variant v
        GROUP BY v.product_id
      ),
      img AS (
        SELECT
          p.id AS product_id,
          (
            SELECT i.img_url
            FROM product_images i
            WHERE i.product_id = p.id
            ORDER BY i.is_primary DESC, i.position ASC NULLS LAST
            LIMIT 1
          ) AS img_url
        FROM products p
      )
      SELECT
        u.id,
        u.name,
        COALESCE(ps.min_price, 0)::numeric(12,2) AS price,
        im.img_url,
        COALESCE(MAX(u.units_sold_30d), 0) AS order_count
      FROM (
        SELECT p.id, p.name, 0::bigint AS units_sold_30d
        FROM products p
        UNION
        SELECT s.product_id AS id, s.name, s.units_sold_30d
        FROM sold s
      ) u
      LEFT JOIN price_stock ps ON ps.product_id = u.id
      LEFT JOIN img im         ON im.product_id = u.id
      WHERE COALESCE(ps.variants_in_stock, 0) > 0
      GROUP BY u.id, u.name, ps.min_price, im.img_url
      ORDER BY MAX(u.units_sold_30d) DESC, u.name ASC
      LIMIT 4;
    `);

    // ---------- NEW ARRIVALS ----------
    const newArrivals = await db.query(`
      SELECT 
        p.id,
        p.name,
        MIN(v.price)::numeric(12,2) AS price,
        (
          SELECT img_url FROM product_images i
          WHERE i.product_id = p.id
          ORDER BY i.is_primary DESC, i.position ASC NULLS LAST
          LIMIT 1
        ) AS img_url
      FROM products p
      LEFT JOIN product_variant v ON v.product_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT 8;
    `);

    // ---------- POPULAR ----------
    const popularProducts = await db.query(`
      SELECT 
        p.id,
        p.name,
        MIN(v.price)::numeric(12,2) AS price,
        (
          SELECT img_url FROM product_images i
          WHERE i.product_id = p.id
          ORDER BY i.is_primary DESC, i.position ASC NULLS LAST
          LIMIT 1
        ) AS img_url,
        COUNT(*) AS order_count
      FROM order_items oi
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p        ON p.id = v.product_id
      GROUP BY p.id
      ORDER BY order_count DESC
      LIMIT 4;
    `);

    res.render("user/index.ejs", {
      bannerUrl,
      featuredProducts,
      newArrivals: newArrivals.rows,
      popularProducts: popularProducts.rows,
    });
  } catch (err) {
    console.error("Landing page error:", err);
    res.render("user/index.ejs", {
      bannerUrl: "/uploads/img/Techora%20Banner.png",
      featuredProducts: [],
      newArrivals: [],
      popularProducts: [],
    });
  }
};
