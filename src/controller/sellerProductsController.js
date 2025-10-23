import db from "../database/db.js";
import fs from "fs";
import path from "path";
import { insertAudit } from "../utils/audit.js"; // ✅ audit
// If your utils/healthChecks.js also emits audits, you can keep it.
// We add a local emitter to ensure alerts are written.
import { checkLowStockForSeller } from "../utils/healthChecks.js";

/* =========================
   Helper: emit low stock audits
   ========================= */
async function emitLowStockAlerts({ client, sellerId, threshold = 10, ip }) {
  // We expect to be called AFTER a transaction is committed or with a fresh client.
  // Using a separate connection is fine; we won't wrap in a txn to avoid locking.
  const cx = client || db;

  // Pull low/zero stock variants for this seller with product name
  const { rows: lows } = await cx.query(
    `
    SELECT
      p.id         AS product_id,
      p.name       AS product_name,
      v.id         AS variant_id,
      v.stock_quantity AS current_stock
    FROM products p
    JOIN product_variant v ON v.product_id = p.id
    WHERE p.seller_id = $1
      AND COALESCE(v.stock_quantity, 0) <= $2
    ORDER BY p.id, v.id
    `,
    [sellerId, threshold]
  );

  if (!lows || !lows.length) return;

  // Optional: get store_name for actor_name
  let storeName = null;
  try {
    const s = await cx.query(`SELECT store_name FROM sellers WHERE id = $1 LIMIT 1`, [sellerId]);
    storeName = s.rows[0]?.store_name || null;
  } catch (_) {}

  // Insert one audit per low variant (idempotency: okay if you get more than once—badge collapses by ref keys)
  await Promise.all(
    lows.map((r) =>
      insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: storeName,
        action: "low_stock_alert",
        resource: "products",
        details: {
          seller_id: sellerId,
          product_id: r.product_id,
          product_name: r.product_name,
          variant_id: r.variant_id,
          current_stock: Number(r.current_stock) || 0,
          threshold: Number(threshold),
        },
        ip: ip || null,
        status: "success",
      }).catch((e) => {
        console.error("emitLowStockAlerts: insertAudit failed:", e?.message || e);
      })
    )
  );
}

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
      if (Number(p.total_stock) === 0) status = "Out of Stock";
      else if (Number(p.total_stock) < 10) status = "Low Stock";
      return { ...p, status };
    });

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
export const deleteProduct = async (req, res) => {
  const client = await db.connect();
  try {
    const productId = req.params.id;
    const userId = req.session.user.id;
    const ip = req.headers["x-forwarded-for"] || req.ip;

    await client.query("BEGIN");

    // Ensure seller
    const sellerRes = await client.query(
      "SELECT id, store_name FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Not authorized" });
    }
    const sellerId = sellerRes.rows[0].id;

    // Ensure product belongs to seller
    const productRes = await client.query(
      "SELECT id, name FROM products WHERE id = $1 AND seller_id = $2",
      [productId, sellerId]
    );
    if (productRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    // Keep for audit
    const deletedProductName = productRes.rows[0].name;

    // Collect variant ids
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

    // --- clear carts that reference these variants ---
    if (variantIds.length) {
      await client.query(
        `DELETE FROM cart_items WHERE variant_id = ANY($1::bigint[])`,
        [variantIds]
      );
    }

    // 1) Delete review replies
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

    // 3) Delete order_items
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

    // ✅ AUDIT LOG: product_delete
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: sellerRes.rows[0].store_name,
        action: "product_delete",
        resource: "products",
        details: { product_id: productId, name: deletedProductName },
        ip,
        status: "success"
      });
    } catch (auditErr) {
      console.error("Audit insert error (product_delete):", auditErr);
    }

    // 🔔 Emit low-stock alerts (harmless even after delete; keeps consistency across catalog)
    try {
      await emitLowStockAlerts({ sellerId, threshold: 10, ip });
    } catch (e) {
      console.error("emitLowStockAlerts after deleteProduct failed:", e);
    }

    // Remove image files from disk
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

    // Audit delete error
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: req.session?.user?.id || null,
        action: "product_delete_error",
        resource: "products",
        details: { error: err.message || String(err) },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "failed"
      });
    } catch (auditErr) {
      console.error("Audit insert error (product_delete_error):", auditErr);
    }

    return res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
};

/* ================
Get product details
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
    const ip = req.headers["x-forwarded-for"] || req.ip;

    await client.query("BEGIN");

    // Validate seller
    const sellerRes = await client.query(
      "SELECT id, store_name FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Not authorized" });
    }
    const sellerId = sellerRes.rows[0].id;

    // Fetch old data
    const oldRes = await client.query(
      "SELECT name, description FROM products WHERE id = $1 AND seller_id = $2",
      [id, sellerId]
    );
    if (oldRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }
    const oldProduct = oldRes.rows[0];

    const { name, description, variants = [] } = req.body;

    // Update product info
    await client.query(
      "UPDATE products SET name = $1, description = $2, updated_at = NOW() WHERE id = $3",
      [name, description, id]
    );

    const changedVariants = [];
    for (const v of variants) {
      if (v.id) {
        const oldVarRes = await client.query(
          "SELECT price, stock_quantity FROM product_variant WHERE id=$1",
          [v.id]
        );
        const oldVar = oldVarRes.rows[0];

        await client.query(
          `UPDATE product_variant 
           SET storage=$1, ram=$2, color=$3, price=$4, stock_quantity=$5, updated_at=NOW()
           WHERE id=$6 AND product_id=$7`,
          [v.storage, v.ram, v.color, v.price, v.stock_quantity, v.id, id]
        );

        if (oldVar && (Number(oldVar.price) != Number(v.price) || Number(oldVar.stock_quantity) != Number(v.stock_quantity))) {
          changedVariants.push({
            id: Number(v.id),
            price_before: Number(oldVar.price),
            price_after: Number(v.price),
            stock_before: Number(oldVar.stock_quantity),
            stock_after: Number(v.stock_quantity),
          });
        }
      }
    }

    await client.query("COMMIT");

    // ✅ AUDIT LOG: product_update
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: sellerRes.rows[0].store_name,
        action: "product_update",
        resource: "products",
        details: {
          product_id: id,
          name_before: oldProduct.name,
          name_after: name,
          description_changed: oldProduct.description !== description,
          variants_changed: changedVariants
        },
        ip,
        status: "success"
      });
    } catch (auditErr) {
      console.error("Audit insert error (product_update):", auditErr);
    }

    // ✅ Emit low-stock alerts for this seller (after successful update)
    try {
      // If you want to keep your existing helper, it can run too:
      // await checkLowStockForSeller({ sellerId, threshold: 10 });
      await emitLowStockAlerts({ sellerId, threshold: 10, ip });
    } catch (stockErr) {
      console.error("emitLowStockAlerts after updateProduct failed:", stockErr);
    }

    res.json({ success: true, message: "Product updated successfully" });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("Update product error:", err);

    // Audit update error
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: req.session?.user?.id || null,
        action: "product_update_error",
        resource: "products",
        details: { error: err.message || String(err) },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "failed"
      });
    } catch (auditErr) {
      console.error("Audit insert error (product_update_error):", auditErr);
    }

    res.status(500).json({ error: "Server error" });
  } finally {
    try { client.release(); } catch {}
  }
};

/* ================
Product Ratings
================ */
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

    // Recent reviews
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
