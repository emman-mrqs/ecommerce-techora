import db from "../database/db.js";
import fs from "fs";
import path from "path";  

// Render Seller Products
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

// Delete product
export const deleteProduct = async (req, res) => {
  const client = await db.connect();
  try {
    const productId = req.params.id;
    const userId = req.session.user.id;

    await client.query("BEGIN");

    // ✅ Make sure product belongs to logged-in seller
    const sellerRes = await client.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Not authorized" });
    }

    const sellerId = sellerRes.rows[0].id;
    const productRes = await client.query(
      "SELECT id FROM products WHERE id = $1 AND seller_id = $2",
      [productId, sellerId]
    );
    if (productRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    // ✅ Get image file paths
    const imagesRes = await client.query(
      "SELECT img_url FROM product_images WHERE product_id = $1",
      [productId]
    );

    // Delete image files
    imagesRes.rows.forEach(img => {
      const filePath = path.join(process.cwd(), "src/public", img.img_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    // Delete product-related rows
    await client.query("DELETE FROM product_images WHERE product_id = $1", [productId]);
    await client.query("DELETE FROM product_variant WHERE product_id = $1", [productId]);
    await client.query("DELETE FROM products WHERE id = $1", [productId]);

    await client.query("COMMIT");

    res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Delete product error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
};
