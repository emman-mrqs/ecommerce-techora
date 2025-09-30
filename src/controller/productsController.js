// src/controller/productsController.js
import db from "../database/db.js";

const PAGE_SIZE = 10;

export const listProducts = async (req, res) => {
  const search = (req.query.search || "").trim();
  const page   = Math.max(1, parseInt(req.query.page || "1", 10));
  const sort   = (req.query.sort || "relevance").toLowerCase(); // relevance|latest|top-sales|price-low|price-high
  const offset = (page - 1) * PAGE_SIZE;

  // --- ORDER BY switch ---
  let orderBy = `p.created_at DESC`; // default fallback
  switch (sort) {
    case "latest":     orderBy = `p.created_at DESC`; break;
    case "top-sales":  orderBy = `COALESCE(sales.cnt,0) DESC, p.created_at DESC`; break;
    case "price-low":  orderBy = `min_price ASC, p.created_at DESC`; break;
    case "price-high": orderBy = `min_price DESC, p.created_at DESC`; break;
    // "relevance": name ILIKE hits first, then recent
    default:
      orderBy = `CASE WHEN $1 <> '' AND p.name ILIKE $2 THEN 0 ELSE 1 END ASC, p.created_at DESC`;
      break;
  }

  const like = `%${search}%`;

  try {
    // Total for pagination
    const totalCountRes = await db.query(
      `SELECT COUNT(DISTINCT p.id) AS total
         FROM products p
         LEFT JOIN product_variant v ON v.product_id = p.id
        WHERE ($1 = '' OR p.name ILIKE $2)`,
      [search, like]
    );
    const total = Number(totalCountRes.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // Main list (paged)
    const productsRes = await db.query(`
      WITH price AS (
        SELECT product_id, MIN(price) AS min_price
          FROM product_variant GROUP BY product_id
      ),
      img AS (
        SELECT DISTINCT ON (product_id) product_id, img_url
          FROM product_images
         WHERE is_primary = TRUE
         ORDER BY product_id, position NULLS LAST
      ),
      sales AS (
        SELECT pv.product_id, COUNT(oi.id) AS cnt
          FROM order_items oi
          JOIN product_variant pv ON pv.id = oi.product_variant_id
         GROUP BY pv.product_id
      )
      SELECT p.id, p.name, pr.min_price AS price, i.img_url,
             COALESCE(sales.cnt,0) AS order_count, p.created_at, p.seller_id
        FROM products p
        LEFT JOIN price pr ON pr.product_id = p.id
        LEFT JOIN img   i  ON i.product_id  = p.id
        LEFT JOIN sales ON sales.product_id = p.id
       WHERE ($1 = '' OR p.name ILIKE $2)
       ORDER BY ${orderBy}
       LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `, [search, like]);

    // --------- Top seller card (within current search scope) ---------
    // Pick seller with the most products in this result set (ties -> higher avg rating)
    let sellerCard = null;
    const { rows: topSeller } = await db.query(`
      WITH filtered_products AS (
        SELECT p.id, p.seller_id
          FROM products p
         WHERE ($1 = '' OR p.name ILIKE $2)
      ),
      product_counts AS (
        SELECT seller_id, COUNT(*) AS product_count
          FROM filtered_products
         GROUP BY seller_id
      ),
      rating_per AS (
        SELECT p.seller_id, COALESCE(AVG(r.rating),0) AS avg_rating
          FROM products p
          LEFT JOIN product_reviews r ON r.product_id = p.id
         WHERE p.seller_id IN (SELECT seller_id FROM product_counts)
         GROUP BY p.seller_id
      )
      SELECT s.id AS seller_id, s.store_name, s.store_icon,
             pc.product_count, COALESCE(rp.avg_rating,0) AS avg_rating
        FROM sellers s
        JOIN product_counts pc ON pc.seller_id = s.id
        LEFT JOIN rating_per rp ON rp.seller_id = s.id
       ORDER BY pc.product_count DESC, rp.avg_rating DESC
       LIMIT 1
    `, [search, like]);

    if (topSeller.length) sellerCard = topSeller[0];

    res.render("user/products", {
      products: productsRes.rows,
      search,
      page,
      totalPages,
      sort,
      sellerCard,   // {store_name, store_icon, product_count, avg_rating}
      PAGE_SIZE
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).send("Server error");
  }
};

// searchSuggestions stays the same
export const searchSuggestions = async (req, res) => {
  const query = req.query.query;
  if (!query || query.trim() === "") return res.json([]);
  try {
    const result = await db.query(
      "SELECT id, name FROM products WHERE LOWER(name) LIKE LOWER($1) LIMIT 5",
      [`%${query}%`]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Search suggestion error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
