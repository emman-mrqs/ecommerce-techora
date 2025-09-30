    import db from "../database/db.js";

/**
 * GET /admin/products
 * Render Products Management grouped by seller
 */
export const renderAdminProducts = async (req, res) => {
  try {
    // One wide query -> group in JS
    const { rows } = await db.query(`
  WITH
  v AS (
    SELECT
      product_id,
      SUM(stock_quantity)              AS total_stock,
      MIN(price)                       AS min_price,
      MAX(price)                       AS max_price
    FROM product_variant
    GROUP BY product_id
  ),
  img AS (
    -- pick the primary image (or the first one) per product
    SELECT DISTINCT ON (product_id)
      product_id,
      img_url
    FROM product_images
    ORDER BY product_id, is_primary DESC, position NULLS FIRST, id
  )
  SELECT
    s.id           AS seller_id,
    s.store_name   AS store_name,
    u.email        AS owner_email,
    p.id           AS product_id,
    p.name         AS product_name,
    p.description  AS product_description,
    COALESCE(v.min_price, 0)  AS min_price,
    COALESCE(v.max_price, 0)  AS max_price,
    COALESCE(v.total_stock,0) AS total_stock,
    img.img_url    AS primary_image
  FROM sellers s
  JOIN users u       ON u.id = s.user_id
  LEFT JOIN products p ON p.seller_id = s.id
  LEFT JOIN v        ON v.product_id = p.id
  LEFT JOIN img      ON img.product_id = p.id
  WHERE s.status IN ('approved','suspended')
  ORDER BY s.store_name ASC, product_name ASC NULLS LAST
`);


    // Group into { seller_id, store_name, owner_email, products: [...] }
    const bySeller = new Map();
    for (const r of rows) {
    if (!bySeller.has(r.seller_id)) {
        bySeller.set(r.seller_id, {
        seller_id: r.seller_id,
        store_name: r.store_name,
        owner_email: r.owner_email,
        products: []
        });
    }
    if (r.product_id) {
        const total = Number(r.total_stock) || 0;
        let status = "active";           // ≥ 10
        if (total === 0) status = "out_of_stock";
        else if (total < 10) status = "low_stock";

        bySeller.get(r.seller_id).products.push({
        id: r.product_id,
        name: r.product_name,
        description: r.product_description,
        min_price: r.min_price,
        max_price: r.max_price,
        total_stock: total,
        status,                        // ← computed from stock thresholds
        primary_image: r.primary_image
        });
    }
    }

    const sellers = Array.from(bySeller.values());

    res.render("admin/adminProducts", {
    activePage: "products",
    pageTitle: "Products Management",
    sellers,
    toast: req.session.toast || null
    });
    delete req.session.toast;

  } catch (err) {
    console.error("Error rendering admin products:", err);
    res.status(500).send("Error loading products");
  }
};


/**
 * GET /admin/products/:id (JSON)
 * Return full product details for modal (view/edit)
 */
export const adminGetProduct = async (req, res) => {
  const { id } = req.params; // product_id
  try {
    const productRes = await db.query(
      `SELECT p.id, p.seller_id, p.name, p.description,
              s.store_name, s.id AS seller_id
       FROM products p
       JOIN sellers s ON s.id = p.seller_id
       WHERE p.id = $1`,
      [id]
    );
    if (productRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }
    const product = productRes.rows[0];

    const variantsRes = await db.query(
      `SELECT id, storage, ram, color, price, stock_quantity
       FROM product_variant
       WHERE product_id = $1
       ORDER BY id ASC`,
      [id]
    );

    const imagesRes = await db.query(
      `SELECT id, img_url, is_primary, position
       FROM product_images
       WHERE product_id = $1
       ORDER BY is_primary DESC, position ASC NULLS LAST, id ASC`,
      [id]
    );

    res.json({
      ok: true,
      product,
      variants: variantsRes.rows,
      images: imagesRes.rows
    });
  } catch (err) {
    console.error("Error fetching product details:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};


/**
 * POST /admin/products/:id/update
 * Update product basic info + optional variant edits
 * Accepts fields: name, description
 * Optional arrays for variants: variant_id[], price[], stock[]
 */
export const adminUpdateProduct = async (req, res) => {
  const { id } = req.params; // product_id
  const { name, description } = req.body;

  const variantIds = Array.isArray(req.body.variant_id) ? req.body.variant_id : (req.body.variant_id ? [req.body.variant_id] : []);
  const prices     = Array.isArray(req.body.price)      ? req.body.price      : (req.body.price ? [req.body.price] : []);
  const stocks     = Array.isArray(req.body.stock)      ? req.body.stock      : (req.body.stock ? [req.body.stock] : []);

  const client = await db.getClient?.() || db; // support both pooled and direct
  const needRelease = !!db.getClient;

  try {
    if (needRelease) await client.query("BEGIN");

    // Update product
    await client.query(
      `UPDATE products
         SET name = $1,
             description = $2,
             updated_at = NOW()
       WHERE id = $3`,
      [name?.trim() || null, description?.trim() || null, id]
    );

    // Optional inline variant edits
    if (variantIds.length) {
      for (let i = 0; i < variantIds.length; i++) {
        const vid = variantIds[i];
        const price = prices[i] !== undefined && prices[i] !== null ? Number(prices[i]) : null;
        const stock = stocks[i] !== undefined && stocks[i] !== null ? Number(stocks[i]) : null;

        await client.query(
          `UPDATE product_variant
             SET price = COALESCE($1, price),
                 stock_quantity = COALESCE($2, stock_quantity),
                 updated_at = NOW()
           WHERE id = $3 AND product_id = $4`,
          [price, stock, vid, id]
        );
      }
    }

    if (needRelease) await client.query("COMMIT");

    req.session.toast = { type: "success", message: "Product updated successfully." };
    res.redirect("/admin/products");
  } catch (err) {
    if (needRelease) await client.query("ROLLBACK");
    console.error("Error updating product:", err);
    req.session.toast = { type: "danger", message: "Error updating product." };
    res.redirect("/admin/products");
  } finally {
    if (needRelease && client.release) client.release();
  }
};


/**
 * POST /admin/products/:id/delete
 * Try to delete product (and children). Guard on FK (orders).
 */
export const adminDeleteProduct = async (req, res) => {
  const { id } = req.params; // product_id
  const client = await db.getClient?.() || db;
  const needRelease = !!db.getClient;

  try {
    if (needRelease) await client.query("BEGIN");

    // Delete children first
    await client.query(`DELETE FROM product_images WHERE product_id = $1`, [id]);
    await client.query(`DELETE FROM product_variant WHERE product_id = $1`, [id]);

    // Delete product
    await client.query(`DELETE FROM products WHERE id = $1`, [id]);

    if (needRelease) await client.query("COMMIT");

    req.session.toast = { type: "success", message: "Product deleted." };
    res.redirect("/admin/products");
  } catch (err) {
    if (needRelease) await client.query("ROLLBACK");
    // FK violation (e.g., order_items references product_variant): 23503
    if (err.code === "23503") {
      req.session.toast = { type: "danger", message: "Cannot delete: product has linked orders." };
    } else {
      console.error("Error deleting product:", err);
      req.session.toast = { type: "danger", message: "Error deleting product." };
    }
    res.redirect("/admin/products");
  } finally {
    if (needRelease && client.release) client.release();
  }
};
