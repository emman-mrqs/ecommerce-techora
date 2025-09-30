// src/controller/sellersController.js
import db from "../database/db.js";

const PAGE_SIZE = 10;

/**
 * GET /sellers
 * Query:
 *  - page: number (default 1)
 *  - search: string (optional) — filters by seller store_name
 *  - show=all — ignores `search` and lists all sellers
 */
export const listSellers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset = (page - 1) * PAGE_SIZE;

    // If ?show=all, ignore any `search` filter
    const showAll = String(req.query.show || "").toLowerCase() === "all";
    const search = showAll ? "" : (req.query.search || "").trim();

    const where = search ? `WHERE LOWER(s.store_name) LIKE LOWER($1)` : ``;
    const args  = search ? [`%${search}%`] : [];

    // total count for pagination
    const totalRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM sellers s ${where}`,
      args
    );
    const total = totalRes.rows[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // sellers with product_count and avg_rating (static followers/response in UI)
    const sellersRes = await db.query(
      `
      WITH prod AS (
        SELECT seller_id, COUNT(*) AS product_count
          FROM products
         GROUP BY seller_id
      ),
      rate AS (
        SELECT p.seller_id, ROUND(AVG(r.rating)::numeric, 1) AS avg_rating
          FROM product_reviews r
          JOIN products p ON p.id = r.product_id
         GROUP BY p.seller_id
      )
      SELECT
        s.id,
        s.store_name,
        s.store_icon,
        COALESCE(prod.product_count, 0) AS product_count,
        COALESCE(rate.avg_rating, 0)    AS avg_rating
      FROM sellers s
      LEFT JOIN prod ON prod.seller_id = s.id
      LEFT JOIN rate ON rate.seller_id = s.id
      ${where}
      ORDER BY product_count DESC, avg_rating DESC, s.id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset};
      `,
      args
    );

    res.render("seller/sellers", {
      sellers: sellersRes.rows,
      page,
      totalPages,
      search: showAll ? "" : search,
    });
  } catch (err) {
    console.error("Error listing sellers:", err);
    res.status(500).send("Server error");
  }
};

