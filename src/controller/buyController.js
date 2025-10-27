// controller/buyController.js
import db from "../database/db.js";
import { trackProductView } from "../middleware/viewTrackers.js";


export const renderBuyPage = async (req, res) => {
  const productId = Number(req.params.id);

  try {
    const productResult = await db.query(`
      SELECT p.*, s.store_name
      FROM products p
      LEFT JOIN sellers s ON p.seller_id = s.id
      WHERE p.id = $1
    `, [productId]);
    
    const variantsResult  = await db.query("SELECT * FROM product_variant WHERE product_id = $1", [productId]);
// in renderBuyPage (imagesResult query)
const imagesResult = await db.query(
  `SELECT id, product_id, product_variant_id, img_url, is_primary, position
     FROM product_images
    WHERE product_id = $1
 ORDER BY
    CASE WHEN product_variant_id IS NOT NULL THEN 0 ELSE 1 END,  -- prefer color/variant-linked
    is_primary DESC,
    position ASC,
    id ASC`,
  [productId]
);

    const product = productResult.rows[0];
    if (!product) return res.status(404).send("Product not found");
    try { await trackProductView(productId, product.seller_id, req, res); } catch {}


    // ---------- canReview ----------
    // src/controller/buyController.js (only the canReview part needs changing)
    const userId = req.user?.id || req.session?.user?.id || null;

    let canReview = false;
    if (userId) {
      const { rows } = await db.query(
        `
        WITH eligible AS (
          SELECT oi.id AS order_item_id
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          JOIN product_variant pv ON pv.id = oi.product_variant_id
          WHERE o.user_id = $1
            AND pv.product_id = $2
            AND LOWER(o.order_status) IN ('paid','completed','delivered')
          EXCEPT
          SELECT pr.order_item_id
          FROM product_reviews pr
          WHERE pr.user_id = $1
            AND pr.product_id = $2
            AND pr.order_item_id IS NOT NULL
        )
        SELECT COUNT(*)::int AS cnt FROM eligible
        `,
        [userId, productId]
      );
      canReview = (rows[0]?.cnt || 0) > 0;
    }


    // ---------- relatedProducts ----------
    // Prefer same seller; if not enough, fill with recent others
    const related = await db.query(
      `
      WITH base AS (
        SELECT p2.id, p2.name,
               MIN(v.price) AS price,
               COALESCE( (SELECT img_url
                           FROM product_images pi
                          WHERE pi.product_id = p2.id
                            AND pi.is_primary = true
                          ORDER BY position NULLS LAST
                          LIMIT 1), NULL) AS img_url,
               (p2.seller_id = $2)::int AS same_seller
          FROM products p2
          LEFT JOIN product_variant v ON v.product_id = p2.id
         WHERE p2.id <> $1
         GROUP BY p2.id, p2.name
      )
      SELECT * FROM base
      ORDER BY same_seller DESC, id DESC
      LIMIT 8
      `,
      [productId, product.seller_id]
    );

    res.render("user/buy", {
      product,
      variants: variantsResult.rows,
      images: imagesResult.rows,
      canReview,
      relatedProducts: related.rows || []     // <<<<< pass it (empty array fallback)
    });
  } catch (err) {
    console.error("Error fetching product details:", err);
    res.status(500).send("Error loading product");
  }
};

