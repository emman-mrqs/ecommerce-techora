import db from "../database/db.js";

export const renderLandingPage = async (req, res) => {
  try {
    // ---------- FEATURED PRODUCTS (Top-sellers last 30d, in-stock, with image; fallback-safe) ----------
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
        -- union makes sure products with zero recent sales can still appear (fallback)
        SELECT p.id, p.name, 0::bigint AS units_sold_30d
        FROM products p
        UNION
        SELECT s.product_id AS id, s.name, s.units_sold_30d
        FROM sold s
      ) u
      LEFT JOIN price_stock ps ON ps.product_id = u.id
      LEFT JOIN img im         ON im.product_id = u.id
      WHERE COALESCE(ps.variants_in_stock, 0) > 0          -- must have stock
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

    // ---------- POPULAR PRODUCTS (lifetime orders) ----------
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

    // Render with EJS
    res.render("user/index.ejs", {
      featuredProducts,
      newArrivals: newArrivals.rows,
      popularProducts: popularProducts.rows
    });
  } catch (err) {
    console.error("Landing page error:", err);
    res.render("user/index.ejs", {
      featuredProducts: [],
      newArrivals: [],
      popularProducts: []
    });
  }
};
