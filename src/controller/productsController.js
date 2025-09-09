import db from "../database/db.js";

//loisted product
export const listProducts = async (req, res) => {
  const search = req.query.search || "";

  try {
    const result = await db.query(
      `SELECT 
         p.id,
         p.name,
         MIN(v.price) AS price,
         pi.img_url
       FROM products p
       LEFT JOIN product_variant v ON v.product_id = p.id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = true
       WHERE LOWER(p.name) LIKE LOWER($1)
       GROUP BY p.id, p.name, pi.img_url`,
      [`%${search}%`]
    );

    res.render("user/products", {
      products: result.rows,
      search
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).send("Server error");
  }
};

//Search suggestion header
export const searchSuggestions = async (req, res) => {
  const query = req.query.query;

  if (!query || query.trim() === "") {
    return res.json([]);
  }

  try {
    const result = await db.query(
      "SELECT id, name FROM products WHERE LOWER(name) LIKE LOWER($1) LIMIT 5",
      [`%${query}%`]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Search suggestion error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
