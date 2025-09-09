import db from "../database/db.js";

export const createProduct = async ({ name, description }) => {
  const result = await db.query(
    "INSERT INTO products (name, description) VALUES ($1, $2) RETURNING *",
    [name, description]
  );
  return result.rows[0];
};

export const createVariant = async ({ product_id, storage, ram, color, price, stock_quantity }) => {
  const result = await db.query(
    `INSERT INTO product_variant (product_id, storage, ram, color, price, stock_quantity)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [product_id, storage, ram, color, price, stock_quantity]
  );
  return result.rows[0];
};

export const createImage = async ({ product_id, img_url, is_primary, position }) => {
  const result = await db.query(
    `INSERT INTO product_images (product_id, img_url, is_primary, position)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [product_id, img_url, is_primary, position]
  );
  return result.rows[0];
};

export const getAllProducts = async () => {
  const result = await db.query(`
    SELECT p.*,
      COALESCE(json_agg(DISTINCT v.*) FILTER (WHERE v.id IS NOT NULL), '[]') AS variants,
      COALESCE(json_agg(DISTINCT i.*) FILTER (WHERE i.id IS NOT NULL), '[]') AS images
    FROM products p
    LEFT JOIN product_variant v ON p.id = v.product_id
    LEFT JOIN product_images i ON p.id = i.product_id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);
  return result.rows;
};

export const getProductById = async (id) => {
  const result = await db.query(`
    SELECT p.*,
      COALESCE(json_agg(DISTINCT v.*) FILTER (WHERE v.id IS NOT NULL), '[]') AS variants,
      COALESCE(json_agg(DISTINCT i.*) FILTER (WHERE i.id IS NOT NULL), '[]') AS images
    FROM products p
    LEFT JOIN product_variant v ON p.id = v.product_id
    LEFT JOIN product_images i ON p.id = i.product_id
    WHERE p.id = $1
    GROUP BY p.id
  `, [id]);
  return result.rows[0];
};

export const updateProduct = async (id, { name, description }) => {
  const result = await db.query(
    "UPDATE products SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
    [name, description, id]
  );
  return result.rows[0];
};

/**
 * Smarter search:
 * - Require at least 2 characters.
 * - Match on name/description.
 * - Also match if any variant color/storage/ram contains the term.
 * - Rank by best name match first, then created_at.
 */
export const searchProducts = async (q) => {
  const term = q.trim();
  if (term.length < 2) return [];

  // Split into words and AND them for tighter results
  const words = term.split(/\s+/).filter(Boolean);
  const ilikeClauses = [];
  const params = [];
  let idx = 1;

  // Build ANDed ILIKEs for name/description
  for (const w of words) {
    ilikeClauses.push(`(p.name ILIKE $${idx} OR p.description ILIKE $${idx})`);
    params.push(`%${w}%`);
    idx++;
  }
  const textMatch = ilikeClauses.length ? ilikeClauses.join(" AND ") : "TRUE";

  // Variant matching (color / storage / ram)
  const variantClause = `
    EXISTS (
      SELECT 1 FROM product_variant v2
      WHERE v2.product_id = p.id
      AND (
        v2.color ILIKE $${idx} OR
        CAST(v2.storage AS TEXT) ILIKE $${idx} OR
        CAST(v2.ram AS TEXT) ILIKE $${idx}
      )
    )
  `;
  params.push(`%${term}%`);
  idx++;

  const result = await db.query(
    `
    SELECT p.*,
      COALESCE(json_agg(DISTINCT v.*) FILTER (WHERE v.id IS NOT NULL), '[]') AS variants,
      COALESCE(json_agg(DISTINCT i.*) FILTER (WHERE i.id IS NOT NULL), '[]') AS images,
      -- crude ranking: name hits weigh more than description/variant hits
      (CASE WHEN p.name ILIKE $${idx} THEN 3 ELSE 0 END) +
      (CASE WHEN p.description ILIKE $${idx} THEN 1 ELSE 0 END) AS rank_score
    FROM products p
    LEFT JOIN product_variant v ON p.id = v.product_id
    LEFT JOIN product_images i ON p.id = i.product_id
    WHERE (${textMatch}) OR (${variantClause})
    GROUP BY p.id
    ORDER BY rank_score DESC, p.created_at DESC, p.name ASC
    `,
    [...params, `%${term}%`, `%${term}%`]
  );

  return result.rows;
};

export const deleteProduct = async (id) => {
  await db.query("DELETE FROM products WHERE id = $1", [id]);
};
