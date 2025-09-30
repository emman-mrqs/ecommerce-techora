import db from "../database/db.js";
import fs from "fs";
import path from "path";  

/* ===================
Render Seller Products
=====================*/
export const renderSellerProducts = async (req, res) => {
  try {
    const userId = req.session.user.id;

    // ✅ Find seller_id for this user
    const sellerRes = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );

    if (sellerRes.rows.length === 0) {
      return res.redirect("/seller-application");
    }

    const sellerId = sellerRes.rows[0].id;

    // ✅ Fetch products + variants + primary image
    const productsRes = await db.query(
      `
      SELECT 
        p.id, 
        p.name, 
        p.description,
        COALESCE(SUM(v.stock_quantity), 0) AS total_stock,
        COALESCE(ROUND(AVG(v.price)), 0) AS avg_price,
        COALESCE((
          SELECT img_url 
          FROM product_images 
          WHERE product_id = p.id 
          ORDER BY is_primary DESC, position ASC 
          LIMIT 1
        ), '/img/no-image.png') AS image_url
      FROM products p
      LEFT JOIN product_variant v ON p.id = v.product_id
      WHERE p.seller_id = $1
      GROUP BY p.id
      ORDER BY p.created_at DESC
      `,
      [sellerId]
    );

    const products = productsRes.rows.map(p => {
      let status = "Active";
      if (p.total_stock == 0) status = "Out of Stock";
      else if (p.total_stock < 10) status = "Low Stock";

      return { ...p, status };
    });

    // ✅ Pass products to EJS
    res.render("seller/sellerProducts", {
      pageTitle: "My Products",
      activePage: "products",
      products
    });
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).send("Server error");
  }
};

/*==============
Delete product
===============*/
/*==============
Delete product (hard delete with dependency cleanup)
===============*/
export const deleteProduct = async (req, res) => {
  const client = await db.connect();
  try {
    const productId = req.params.id;
    const userId = req.session.user.id;

    await client.query("BEGIN");

    // Ensure seller
    const sellerRes = await client.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Not authorized" });
    }
    const sellerId = sellerRes.rows[0].id;

    // Ensure product belongs to seller
    const productRes = await client.query(
      "SELECT id FROM products WHERE id = $1 AND seller_id = $2",
      [productId, sellerId]
    );
    if (productRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    // Collect variant ids for this product
    const variantsRes = await client.query(
      "SELECT id FROM product_variant WHERE product_id = $1",
      [productId]
    );
    const variantIds = variantsRes.rows.map(r => r.id);

    // Collect order_item ids linked to those variants
    let orderItemIds = [];
    if (variantIds.length) {
      const oiRes = await client.query(
        `SELECT id FROM order_items WHERE product_variant_id = ANY($1::bigint[])`,
        [variantIds]
      );
      orderItemIds = oiRes.rows.map(r => r.id);
    }

    // Collect review ids tied either to this product or to those order_items
    const reviewsRes = await client.query(
      `SELECT id FROM product_reviews
         WHERE product_id = $1
            OR ($2::bigint[] IS NOT NULL
                AND array_length($2::bigint[],1) IS NOT NULL
                AND order_item_id = ANY($2::bigint[]))`,
      [productId, orderItemIds.length ? orderItemIds : null]
    );
    const reviewIds = reviewsRes.rows.map(r => r.id);

    // --- NEW: clear carts that reference these variants (fixes FK 23503) ---
    if (variantIds.length) {
      await client.query(
        `DELETE FROM cart_items WHERE variant_id = ANY($1::bigint[])`,
        [variantIds]
      );
    }

    // 1) Delete review replies (depends on product_reviews)
    if (reviewIds.length) {
      await client.query(
        `DELETE FROM review_replies WHERE review_id = ANY($1::bigint[])`,
        [reviewIds]
      );
    }

    // 2) Delete product reviews
    if (reviewIds.length) {
      await client.query(
        `DELETE FROM product_reviews WHERE id = ANY($1::bigint[])`,
        [reviewIds]
      );
    }

    // 3) Delete order_items for these variants (your current behavior)
    if (orderItemIds.length) {
      await client.query(
        `DELETE FROM order_items WHERE id = ANY($1::bigint[])`,
        [orderItemIds]
      );
    }

    // Gather image paths before deleting DB rows
    const imagesRes = await client.query(
      "SELECT img_url FROM product_images WHERE product_id = $1",
      [productId]
    );

    // 4) Delete media + variants + product
    await client.query("DELETE FROM product_images WHERE product_id = $1", [productId]);

    if (variantIds.length) {
      await client.query(
        "DELETE FROM product_variant WHERE id = ANY($1::bigint[])",
        [variantIds]
      );
    }

    await client.query("DELETE FROM products WHERE id = $1", [productId]);

    await client.query("COMMIT");

    // Remove image files from disk (ignore errors per-file)
    imagesRes.rows.forEach(img => {
      try {
        const filePath = path.join(process.cwd(), "src/public", img.img_url);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_) {}
    });

    return res.json({ success: true, message: "Product deleted successfully." });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("❌ Delete product error:", err);
    return res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
};

/* ================
Get product details (for edit)
================ */
export const getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    // Make sure seller owns this product
    const sellerRes = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const sellerId = sellerRes.rows[0].id;

    const productRes = await db.query(
      `SELECT p.id, p.name, p.description
       FROM products p
       WHERE p.id = $1 AND p.seller_id = $2`,
      [id, sellerId]
    );

    if (productRes.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const variantsRes = await db.query(
      `SELECT id, storage, ram, color, price, stock_quantity
       FROM product_variant
       WHERE product_id = $1
       ORDER BY id ASC`,
      [id]
    );

    res.json({
      ...productRes.rows[0],
      variants: variantsRes.rows
    });
  } catch (err) {
    console.error("❌ Error fetching product details:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/* ================
Update product
================ */
export const updateProduct = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const userId = req.session.user.id;

    await client.query("BEGIN");

    // Validate seller
    const sellerRes = await client.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Not authorized" });
    }
    const sellerId = sellerRes.rows[0].id;

    // Ensure product exists
    const productRes = await client.query(
      "SELECT id FROM products WHERE id = $1 AND seller_id = $2",
      [id, sellerId]
    );
    if (productRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    // Update product basic info
    const { name, description, variants = [] } = req.body;
    await client.query(
      "UPDATE products SET name = $1, description = $2, updated_at = NOW() WHERE id = $3",
      [name, description, id]
    );

    // Update variants
    for (const v of variants) {
      if (v.id) {
        await client.query(
          `UPDATE product_variant 
           SET storage=$1, ram=$2, color=$3, price=$4, stock_quantity=$5, updated_at=NOW()
           WHERE id=$6 AND product_id=$7`,
          [v.storage, v.ram, v.color, v.price, v.stock_quantity, v.id, id]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Product updated successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update product error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
};

//Products Ratings
export const getProductRatings = async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const userId = req.session.user.id;

    // Ensure seller owns the product
    const sellerRes = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) return res.status(403).json({ error: "Not authorized" });
    const sellerId = sellerRes.rows[0].id;

    const owns = await db.query(
      "SELECT 1 FROM products WHERE id = $1 AND seller_id = $2 LIMIT 1",
      [productId, sellerId]
    );
    if (owns.rows.length === 0) return res.status(404).json({ error: "Product not found" });

    // Summary + distribution
    const sumRes = await db.query(
      `
      SELECT
        COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS avg,
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE rating=5) AS r5,
        COUNT(*) FILTER (WHERE rating=4) AS r4,
        COUNT(*) FILTER (WHERE rating=3) AS r3,
        COUNT(*) FILTER (WHERE rating=2) AS r2,
        COUNT(*) FILTER (WHERE rating=1) AS r1
      FROM product_reviews
      WHERE product_id = $1
      `,
      [productId]
    );
    const s = sumRes.rows[0] || {};
    const summary = {
      avg: Number(s.avg || 0),
      count: Number(s.count || 0),
      distribution: {
        "5": Number(s.r5 || 0),
        "4": Number(s.r4 || 0),
        "3": Number(s.r3 || 0),
        "2": Number(s.r2 || 0),
        "1": Number(s.r1 || 0),
      }
    };

    // Recent reviews with buyer names
    const revRes = await db.query(
      `
      SELECT r.id, r.rating, r.body, r.created_at,
             u.name AS buyer_name
      FROM product_reviews r
      LEFT JOIN order_items oi ON oi.id = r.order_item_id
      LEFT JOIN orders o ON o.id = oi.order_id
      LEFT JOIN users u ON u.id = o.user_id
      WHERE r.product_id = $1
      ORDER BY r.created_at DESC
      LIMIT 25
      `,
      [productId]
    );

    return res.json({ summary, reviews: revRes.rows });
  } catch (err) {
    console.error("❌ getProductRatings error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
