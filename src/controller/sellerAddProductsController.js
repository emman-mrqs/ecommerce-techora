import db from "../database/db.js";
import { insertAudit } from "../utils/audit.js"; // ✅ Added audit import

// Render Add Product Page
export const renderAddProductPage = (req, res) => {
  res.render("seller/sellerAddProducts", {
    activePage: "addProduct",
    pageTitle: "Seller Add Products"
  });
};

// Handle POST - Add Product
export const addProduct = async (req, res) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const {
      product_name,
      description,
      storage = [],
      ram = [],
      color = [],
      price = [],
      stock_quantity = [],
      is_primary = [],
      position = [],
      variant_link_spec = [],
      variant_for_image = []
    } = req.body;

    // Normalize arrays
    const toArr = v => (Array.isArray(v) ? v : [v]);
    const storageArr  = toArr(storage);
    const ramArr      = toArr(ram);
    const colorArr    = toArr(color);
    const priceArr    = toArr(price);
    const stockArr    = toArr(stock_quantity);
    const primaryArr  = toArr(is_primary);
    const posArr      = toArr(position);
    const linkSpecArr = toArr(variant_link_spec);
    const legacyArr   = toArr(variant_for_image);

    const images = req.files || [];
    const userId = req.session.user.id;
    const ip = req.headers["x-forwarded-for"] || req.ip;

    // ✅ Get seller_id
    const sellerRes = await client.query(
      "SELECT id, store_name FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You are not an approved seller." });
    }
    const sellerId = sellerRes.rows[0].id;

    // ✅ Insert product
    const productRes = await client.query(
      `INSERT INTO products (name, description, seller_id, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id`,
      [product_name, description, sellerId]
    );
    const productId = productRes.rows[0].id;

    // ✅ Insert variants
    const variantIds = [];
    for (let i = 0; i < storageArr.length; i++) {
      const vRes = await client.query(
        `INSERT INTO product_variant
           (product_id, storage, ram, color, price, stock_quantity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING id`,
        [
          productId,
          storageArr[i] !== "" ? parseInt(storageArr[i], 10) : null,
          ramArr[i]      !== "" ? parseInt(ramArr[i], 10)      : null,
          colorArr[i] || null,
          priceArr[i]    !== "" ? parseFloat(priceArr[i])      : 0,
          stockArr[i]    !== "" ? parseInt(stockArr[i], 10)    : 0
        ]
      );
      variantIds.push(vRes.rows[0].id);
    }

    // Helper: map color -> [variantIds]
    const colorMap = new Map();
    for (let i = 0; i < colorArr.length; i++) {
      const c = String(colorArr[i] || "").toLowerCase();
      if (!c) continue;
      if (!colorMap.has(c)) colorMap.set(c, []);
      if (variantIds[i]) colorMap.get(c).push(variantIds[i]);
    }

    // ✅ Insert product images
    for (let i = 0; i < images.length; i++) {
      const imgPath = "/uploads/" + images[i].filename;
      const isPrimary = String(primaryArr[i]) === "true";
      const pos = parseInt(posArr[i], 10) || 0;

      const rawSpec = String(linkSpecArr[i] || "").trim();
      const legacy  = String(legacyArr[i] || "").trim();

      const inserts = [];

      if (rawSpec.startsWith("color:")) {
        const c = rawSpec.slice(6).trim().toLowerCase();
        const targets = colorMap.get(c) || [];
        if (targets.length) targets.forEach(vid => inserts.push({ vid }));
        else inserts.push({ vid: null });
      } else if (rawSpec.startsWith("sku:")) {
        const idxs = rawSpec
          .slice(4)
          .split("|")
          .map(s => parseInt(s, 10))
          .filter(n => !isNaN(n) && n >= 1);
        if (idxs.length) {
          idxs.forEach(oneBased => {
            const vid = variantIds[oneBased - 1];
            if (vid) inserts.push({ vid });
          });
        }
        if (!inserts.length) inserts.push({ vid: null });
      } else if (legacy) {
        const idx = parseInt(legacy, 10) - 1;
        const vid = variantIds[idx] || null;
        inserts.push({ vid });
      } else {
        inserts.push({ vid: null });
      }

      for (const { vid } of inserts) {
        await client.query(
          `INSERT INTO product_images (product_id, product_variant_id, img_url, is_primary, position)
           VALUES ($1, $2, $3, $4, $5)`,
          [productId, vid, imgPath, isPrimary, pos]
        );
      }
    }

    await client.query("COMMIT");

    // ✅ AUDIT: product_create
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: sellerRes.rows[0].store_name,
        action: "product_create",
        resource: "products",
        details: {
          product_id: productId,
          name: product_name,
          description,
          variant_count: variantIds.length,
          image_count: images.length
        },
        ip,
        status: "success"
      });
    } catch (auditErr) {
      console.error("Audit insert error (product_create):", auditErr);
    }

    return res.status(201).json({ message: "Product created successfully." });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("❌ Failed to add product:", err);

    // ✅ Audit product_create_error
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: req.session?.user?.id || null,
        action: "product_create_error",
        resource: "products",
        details: { error: err.message || String(err) },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "failed"
      });
    } catch (auditErr) {
      console.error("Audit insert error (product_create_error):", auditErr);
    }

    return res.status(500).json({ error: "Something went wrong." });
  } finally {
    client.release();
  }
};
