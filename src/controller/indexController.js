import db from "../database/db.js";

export const renderLandingPage = async (req, res) => {
  try {
    // --- New Arrivals ---
    const newArrivals = await db.query(
      `SELECT 
         p.id,
         p.name,
         MIN(v.price) AS price,
         pi.img_url
       FROM products p
       LEFT JOIN product_variant v ON v.product_id = p.id
       LEFT JOIN product_images pi 
         ON pi.product_id = p.id AND pi.is_primary = true
       GROUP BY p.id, p.name, pi.img_url, p.created_at
       ORDER BY p.created_at DESC
       LIMIT 4`
    );

    // --- Popular Products ---
    const popularProducts = await db.query(
      `SELECT 
         p.id,
         p.name,
         MIN(v.price) AS price,
         pi.img_url,
         COUNT(oi.id) AS order_count
       FROM products p
       LEFT JOIN product_variant v ON v.product_id = p.id
       LEFT JOIN product_images pi 
         ON pi.product_id = p.id AND pi.is_primary = true
       LEFT JOIN order_items oi ON oi.product_variant_id = v.id
       GROUP BY p.id, p.name, pi.img_url
       ORDER BY order_count DESC
       LIMIT 4`
    );

    // --- Limited Time Promotions (example: price under ₱2000) ---
    const promotions = await db.query(
      `SELECT 
         p.id,
         p.name,
         MIN(v.price) AS price,
         pi.img_url
       FROM products p
       LEFT JOIN product_variant v ON v.product_id = p.id
       LEFT JOIN product_images pi 
         ON pi.product_id = p.id AND pi.is_primary = true
       WHERE v.price <= 2000
       GROUP BY p.id, p.name, pi.img_url
       LIMIT 3`
    );

    // Render with EJS
    res.render("user/index.ejs", {
      newArrivals: newArrivals.rows,
      popularProducts: popularProducts.rows,
      promotions: promotions.rows,
    });
  } catch (err) {
    console.error("Landing page error:", err);
    res.status(500).send("Server error");
  }
};
