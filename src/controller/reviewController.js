// src/controller/reviewController.js
import db from "../database/db.js";
import { insertAudit } from "../utils/audit.js";

/**
 * GET /api/reviews?product_id=123
 * Returns:
 *  - items: all reviews for this product (with verified_buyer + latest seller reply)
 *  - verified_items: only reviews from verified buyers
 *  - aggregates: { avg_rating, total, distribution: {1..5} }
 *  - can_reply (boolean), seller_of_product (boolean)
 */
export const listReviews = async (req, res) => {
  const productId = Number(req.query.product_id);
  const userId = req.user?.id || req.session?.user?.id || null;

  // Is current user the seller of this product?
  let seller_of_product = false;
  if (userId) {
    const { rows } = await db.query(
      `SELECT 1
         FROM products
        WHERE id = $1
          AND seller_id = (SELECT id FROM sellers WHERE user_id = $2)
        LIMIT 1`,
      [productId, userId]
    );
    seller_of_product = rows.length > 0;
  }

  // Reviews + verified_buyer flag + latest seller reply (if any)
  const { rows: items } = await db.query(
    `SELECT
        r.id,
        r.user_id,
        u.name AS user_name,
        r.rating,
        r.body,
        r.created_at,
        /* verified if this reviewer has a qualifying order for this product */
        EXISTS (
          SELECT 1
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            JOIN product_variant pv ON pv.id = oi.product_variant_id
           WHERE o.user_id = r.user_id
             AND pv.product_id = r.product_id
             AND LOWER(o.order_status) IN ('paid','completed','delivered')
        ) AS verified_buyer,
        (SELECT reply
           FROM review_replies
          WHERE review_id = r.id
          ORDER BY created_at DESC
          LIMIT 1) AS reply
     FROM product_reviews r
LEFT JOIN users u ON u.id = r.user_id
    WHERE r.product_id = $1
 ORDER BY r.created_at DESC`,
    [productId]
  );

  // Aggregates for header / badges
  const { rows: agg } = await db.query(
    `SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS avg_rating,
            COUNT(*) AS total
       FROM product_reviews
      WHERE product_id = $1`,
    [productId]
  );

  const { rows: distRows } = await db.query(
    `SELECT rating, COUNT(*) AS count
       FROM product_reviews
      WHERE product_id = $1
   GROUP BY rating`,
    [productId]
  );
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of distRows) distribution[r.rating] = Number(r.count);

  res.json({
    items,
    verified_items: items.filter(i => i.verified_buyer),
    aggregates: {
      avg_rating: Number(agg[0]?.avg_rating || 0),
      total: Number(agg[0]?.total || 0),
      distribution
    },
    can_reply: !!userId,
    seller_of_product
  });
};

/**
 * POST /api/reviews
 * Body: { product_id, rating, body, order_item_id? }
 */
export const createReview = async (req, res) => {
  const userId = req.user?.id || req.session?.user?.id;
  if (!userId) return res.status(401).json({ ok:false, reason:'auth' });

  const { product_id, rating, body, order_item_id } = req.body || {};
  if (!product_id || !rating || !body)
    return res.status(400).json({ ok:false, reason:'missing' });

  // 1) find an eligible order_item (completed/paid/delivered) for this product & user
  //    If client provided order_item_id, validate it; otherwise pick the most recent one not yet reviewed.
  const params = [userId, Number(product_id)];
  const whereSpecific = order_item_id ? `AND oi.id = $3` : ``;
  if (order_item_id) params.push(Number(order_item_id));

  const { rows: elig } = await db.query(
    `
    WITH eligible AS (
      SELECT oi.id AS order_item_id
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant pv ON pv.id = oi.product_variant_id
      WHERE o.user_id = $1
        AND pv.product_id = $2
        AND LOWER(o.order_status) IN ('paid','completed','delivered')
        ${whereSpecific}
      EXCEPT
      SELECT pr.order_item_id
      FROM product_reviews pr
      WHERE pr.user_id = $1
        AND pr.product_id = $2
        AND pr.order_item_id IS NOT NULL
    )
    SELECT order_item_id FROM eligible
    ORDER BY order_item_id DESC
    LIMIT 1
    `,
    params
  );

  if (!elig.length) {
    // Either user has no completed order for this product, or all of them are already reviewed
    return res.status(403).json({ ok:false, reason:'no-eligible-order-item' });
  }

  const pickedOrderItemId = elig[0].order_item_id;

  // 2) insert review bound to that order_item_id and return new id
  try {
    const insertRes = await db.query(
      `INSERT INTO product_reviews (product_id, user_id, rating, body, order_item_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [Number(product_id), userId, Number(rating), String(body).trim(), pickedOrderItemId]
    );
    const reviewId = insertRes.rows[0].id;

    // AUDIT: user created review
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session?.user?.name || req.session?.user?.email || null,
        action: "review_create",
        resource: "product_reviews",
        details: {
          review_id: reviewId,
          product_id: Number(product_id),
          order_item_id: pickedOrderItemId,
          rating: Number(rating),
          excerpt: String(body).slice(0, 300) // small preview
        },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (auditErr) {
      console.error("Audit insert error (review_create):", auditErr);
    }

    return res.json({ ok:true, reviewId });
  } catch (err) {
    console.error("createReview error:", err);
    // Audit failure
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session?.user?.name || req.session?.user?.email || null,
        action: "review_create_error",
        resource: "product_reviews",
        details: { product_id: Number(product_id), error: err.message || String(err) },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "failed",
      });
    } catch (auditErr) {
      console.error("Audit insert error (review_create_error):", auditErr);
    }
    return res.status(500).json({ ok:false, reason:'server' });
  }
};


/**
 * POST /api/reviews/:id/reply   (seller only)
 * Body: { body }
 */
export const replyReview = async (req, res) => {
  const userId = req.user?.id || req.session?.user?.id;
  if (!userId) return res.status(401).json({ ok: false });
  const reviewId = Number(req.params.id);
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ ok: false });

  // ensure current user is the seller of that product
  const { rows } = await db.query(
    `SELECT p.seller_id, p.id as product_id
       FROM product_reviews r
       JOIN products p ON p.id = r.product_id
      WHERE r.id = $1`,
    [reviewId]
  );
  if (!rows.length) return res.status(404).json({ ok: false });

  const seller = await db.query(
    `SELECT id, store_name FROM sellers WHERE user_id=$1 LIMIT 1`,
    [userId]
  );
  if (!seller.rowCount || seller.rows[0].id !== rows[0].seller_id) {
    return res.status(403).json({ ok: false });
  }

  try {
    const insertRes = await db.query(
      `INSERT INTO review_replies (review_id, seller_id, reply)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [reviewId, seller.rows[0].id, String(body).trim()]
    );
    const replyId = insertRes.rows[0].id;

    // AUDIT: seller replied to review
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: seller.rows[0].id,
        actor_name: seller.rows[0].store_name || null,
        action: "review_reply",
        resource: "review_replies",
        details: {
          reply_id: replyId,
          review_id: reviewId,
          product_id: rows[0].product_id,
          excerpt: String(body).slice(0, 300)
        },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
    } catch (auditErr) {
      console.error("Audit insert error (review_reply):", auditErr);
    }

    return res.json({ ok: true, replyId });
  } catch (err) {
    console.error("replyReview error:", err);
    // Audit failure to reply
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: seller.rows[0].id,
        actor_name: seller.rows[0].store_name || null,
        action: "review_reply_error",
        resource: "review_replies",
        details: { review_id: reviewId, error: err.message || String(err) },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "failed",
      });
    } catch (auditErr) {
      console.error("Audit insert error (review_reply_error):", auditErr);
    }
    return res.status(500).json({ ok: false });
  }
};
