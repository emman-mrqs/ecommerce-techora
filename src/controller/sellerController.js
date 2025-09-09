import db from "../database/db.js";

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
      position = []
    } = req.body;

    // Make sure arrays
    const storageArr = Array.isArray(storage) ? storage : [storage];
    const ramArr = Array.isArray(ram) ? ram : [ram];
    const colorArr = Array.isArray(color) ? color : [color];
    const priceArr = Array.isArray(price) ? price : [price];
    const stockArr = Array.isArray(stock_quantity) ? stock_quantity : [stock_quantity];
    const primaryArr = Array.isArray(is_primary) ? is_primary : [is_primary];
    const posArr = Array.isArray(position) ? position : [position];

    const images = req.files || [];

    // 1. Insert product
    const productRes = await client.query(
      `INSERT INTO products (name, description, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING id`,
      [product_name, description]
    );
    const productId = productRes.rows[0].id;

    // 2. Insert variants
    for (let i = 0; i < storageArr.length; i++) {
      await client.query(
        `INSERT INTO product_variant 
         (product_id, storage, ram, color, price, stock_quantity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [
          productId,
          parseInt(storageArr[i]),
          parseInt(ramArr[i]),
          colorArr[i],
          parseFloat(priceArr[i]),
          parseInt(stockArr[i])
        ]
      );
    }

    // 3. Insert images
    for (let i = 0; i < images.length; i++) {
      await client.query(
        `INSERT INTO product_images (product_id, img_url, is_primary, position)
         VALUES ($1, $2, $3, $4)`,
        [
          productId,
          "/uploads/" + images[i].filename,
          primaryArr[i] === "true",
          parseInt(posArr[i])
        ]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "Product created successfully." });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Failed to add product:", err);
    res.status(500).json({ error: "Something went wrong." });
  } finally {
    client.release(); // very important
  }
};
