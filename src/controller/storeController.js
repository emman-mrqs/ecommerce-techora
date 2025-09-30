// src/controller/storeController.js
import db from "../database/db.js";
import { trackStoreView } from "../middleware/viewTrackers.js";


const PAGE_SIZE = 6;

function fmtStoreAge(createdAt) {
  if (!createdAt) return "—";
  const start = new Date(createdAt);
  const now = new Date();
  const ms = now - start;
  const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  if (days < 30) return `${days}d`;

  let months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;

  if (months < 12) return `${months}m`;
  const years = Math.floor(months / 12);
  const remM = months % 12;
  return remM ? `${years}y ${remM}m` : `${years}y`;
}

export const viewStore = async (req, res) => {
  const sellerId = Number(req.params.id || req.params.sellerId);
  if (!Number.isFinite(sellerId)) return res.status(400).send("Invalid store id");

  // Query params
  const q = (req.query.q || "").trim();
  const minRating = Math.max(0, parseInt(req.query.minRating || "0", 10));
  const priceMin = req.query.priceMin !== undefined && req.query.priceMin !== ""
    ? Number(req.query.priceMin) : null;
  const priceMax = req.query.priceMax !== undefined && req.query.priceMax !== ""
    ? Number(req.query.priceMax) : null;
  const sort = (req.query.sort || "featured").toLowerCase();
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  // ORDER BY whitelist
  let orderBy = `p.created_at DESC`;
  switch (sort) {
    case "price-asc":  orderBy = `pr.min_price ASC, p.created_at DESC`; break;
    case "price-desc": orderBy = `pr.min_price DESC, p.created_at DESC`; break;
    case "rating":     orderBy = `COALESCE(rt.avg_rating,0) DESC, p.created_at DESC`; break;
    case "newest":     orderBy = `p.created_at DESC`; break;
    case "featured":   orderBy = `p.created_at DESC`; break;
    default:           orderBy = `p.created_at DESC`; break;
  }

  try {
    // ---- Seller header
    const sellerRes = await db.query(
      `
      SELECT id, store_name, store_icon, description, created_at
      FROM sellers
      WHERE id = $1::bigint
      `,
      [sellerId]
    );
    if (!sellerRes.rowCount) return res.status(404).send("Store not found");
    const seller = sellerRes.rows[0];
    // increment store views (non-blocking)
    try { await trackStoreView(seller.id, req, res); } catch {}


    // ---- Stats
    const statsRes = await db.query(
      `
      WITH prod AS (
        SELECT COUNT(*)::int AS product_count
        FROM products
        WHERE seller_id = $1::bigint
      ),
      rate AS (
        SELECT ROUND(AVG(r.rating)::numeric, 1) AS avg_rating
        FROM product_reviews r
        JOIN products p ON p.id = r.product_id
        WHERE p.seller_id = $1::bigint
      )
      SELECT 
        (SELECT product_count FROM prod) AS product_count,
        COALESCE((SELECT avg_rating FROM rate), 0) AS avg_rating
      `,
      [sellerId]
    );
    const stats = statsRes.rows[0] || { product_count: 0, avg_rating: 0 };
    stats.store_age = fmtStoreAge(seller.created_at);

    // ---- Vouchers: show only active & not expired
    const vouchersRes = await db.query(
      `
      SELECT voucher_code, discount_type, discount_value, usage_limit, used_count, expiry_date, status
      FROM promotions
      WHERE seller_id = $1::bigint
        AND COALESCE(status, 'active') NOT IN ('disabled','expired')
        AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
      ORDER BY expiry_date NULLS LAST, id DESC
      LIMIT 50
      `,
      [sellerId]
    );
    const vouchers = vouchersRes.rows;

    // ---------------- Products list w/ filters ----------------
    // Build WHERE with numbered params
    const params = [];
    let idx = 0;

    const filters = [];
    filters.push(`p.seller_id = $${++idx}::bigint`); params.push(sellerId);
    if (q)          { filters.push(`p.name ILIKE $${++idx}`);  params.push(`%${q}%`); }
    if (priceMin!=null){ filters.push(`pr.min_price >= $${++idx}::numeric`); params.push(priceMin); }
    if (priceMax!=null){ filters.push(`pr.min_price <= $${++idx}::numeric`); params.push(priceMax); }
    const ratingClause = minRating > 0 ? ` AND COALESCE(rt.avg_rating,0) >= ${minRating}` : ``;

    // ---- Count
    const totalRes = await db.query(
      `
      WITH pr AS (
        SELECT product_id, MIN(price) AS min_price
        FROM product_variant
        GROUP BY product_id
      ),
      rt AS (
        SELECT r.product_id, AVG(r.rating) AS avg_rating
        FROM product_reviews r
        GROUP BY r.product_id
      )
      SELECT COUNT(*)::int AS total
      FROM products p
      LEFT JOIN pr ON pr.product_id = p.id
      LEFT JOIN rt ON rt.product_id = p.id
      WHERE ${filters.join(" AND ")}${ratingClause}
      `,
      params
    );
    const total = Number(totalRes.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // ---- Page data
    const dataRes = await db.query(
      `
      WITH pr AS (
        SELECT product_id, MIN(price) AS min_price
        FROM product_variant
        GROUP BY product_id
      ),
      img AS (
        SELECT DISTINCT ON (product_id) product_id, img_url
        FROM product_images
        WHERE is_primary = TRUE
        ORDER BY product_id, position NULLS LAST
      ),
      rt AS (
        SELECT r.product_id, ROUND(AVG(r.rating)::numeric,1) AS avg_rating
        FROM product_reviews r
        GROUP BY r.product_id
      ),
      sold AS (
        SELECT pv.product_id, COUNT(*) AS sold
        FROM order_items oi
        JOIN product_variant pv ON pv.id = oi.product_variant_id
        GROUP BY pv.product_id
      )
      SELECT p.id, p.name, p.created_at,
             pr.min_price AS price,
             i.img_url,
             COALESCE(rt.avg_rating,0) AS avg_rating,
             COALESCE(sold.sold,0)     AS sold
      FROM products p
      LEFT JOIN pr   ON pr.product_id   = p.id
      LEFT JOIN img  i  ON i.product_id = p.id
      LEFT JOIN rt   ON rt.product_id   = p.id
      LEFT JOIN sold ON sold.product_id = p.id
      WHERE ${filters.join(" AND ")}${ratingClause}
      ORDER BY ${orderBy}
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `,
      params
    );
    const products = dataRes.rows; // <-- define products!

    // ---- Render
    res.render("seller/store", {
      seller,
      stats,
      vouchers,
      // filters + paging
      q,
      minRating,
      priceMin,
      priceMax,
      sort,
      page,
      total,
      totalPages,
      products,
      requestPath: `/store/${sellerId}`
    });
  } catch (err) {
    console.error("Store page error:", err);
    res.status(500).send("Server error");
  }
};
