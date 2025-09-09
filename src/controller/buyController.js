import db from "../database/db.js";

export const renderBuyPage = async (req, res) => {
  const productId = req.params.id;

  try {
    const productResult = await db.query(
      "SELECT * FROM products WHERE id = $1", [productId]
    );

    const variantsResult = await db.query(
      "SELECT * FROM product_variant WHERE product_id = $1", [productId]
    );

    const imagesResult = await db.query(
      "SELECT * FROM product_images WHERE product_id = $1 ORDER BY position ASC", [productId]
    );

    const product = productResult.rows[0];

    res.render("user/buy", {
      product,
      variants: variantsResult.rows,
      images: imagesResult.rows
    });
  } catch (err) {
    console.error("Error fetching product details:", err);
    res.status(500).send("Error loading product");
  }
};
