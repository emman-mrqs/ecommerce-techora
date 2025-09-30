import db from "../database/db.js";

// Render promotions
export const renderSellerPromotions = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const sellerRes = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 LIMIT 1",
      [userId]
    );

    if (sellerRes.rows.length === 0) {
      return res.render("seller/sellerPromotions", {
        activePage: "promotions",
        pageTitle: "Seller Promotions",
        promotions: []
      });
    }

    const sellerId = sellerRes.rows[0].id;

    // ✅ Automatically calculate status using expiry_date
    const promoRes = await db.query(
      `SELECT 
         id, seller_id, voucher_code, discount_type, discount_value,
         usage_limit, used_count, expiry_date, created_at, updated_at,
         CASE 
           WHEN expiry_date < CURRENT_DATE THEN 'expired'
           ELSE status
         END AS status
       FROM promotions
       WHERE seller_id = $1
       ORDER BY created_at DESC`,
      [sellerId]
    );

    res.render("seller/sellerPromotions", {
      activePage: "promotions",
      pageTitle: "Seller Promotions",
      promotions: promoRes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

// Create new voucher
export const createPromotion = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const sellerRes = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      return res.status(403).json({ success: false, msg: "Not a seller" });
    }
    const sellerId = sellerRes.rows[0].id;

    const { voucher_code, discount_type, discount_value, usage_limit, expiry_date } = req.body;

    // Check if voucher already exists for this seller
    const exists = await db.query(
      "SELECT id FROM promotions WHERE seller_id = $1 AND voucher_code = $2",
      [sellerId, voucher_code]
    );

    if (exists.rows.length > 0) {
      return res.json({
        success: false,
        msg: "You already have this voucher code. Try another one."
      });
    }

    await db.query(
      `INSERT INTO promotions 
       (seller_id, voucher_code, discount_type, discount_value, usage_limit, expiry_date, status, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())`,
      [sellerId, voucher_code, discount_type, discount_value, usage_limit, expiry_date]
    );

    res.json({ success: true, msg: "Voucher created successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Update voucher
export const updatePromotion = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const sellerRes = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      return res.status(403).json({ success: false, msg: "Not a seller" });
    }
    const sellerId = sellerRes.rows[0].id;

    const { id, voucher_code, discount_type, discount_value, usage_limit, expiry_date, status } = req.body;

    // Check for duplicate voucher code
    const dup = await db.query(
      "SELECT id FROM promotions WHERE seller_id = $1 AND voucher_code = $2 AND id <> $3",
      [sellerId, voucher_code, id]
    );
    if (dup.rows.length > 0) {
      return res.json({
        success: false,
        msg: "Another voucher with this code already exists. Try a different code."
      });
    }

    await db.query(
      `UPDATE promotions
       SET voucher_code = $1,
           discount_type = $2,
           discount_value = $3,
           usage_limit = $4,
           expiry_date = $5,
           status = $6,
           updated_at = NOW()
       WHERE id = $7 AND seller_id = $8`,
      [voucher_code, discount_type, discount_value, usage_limit, expiry_date, status, id, sellerId]
    );

    res.json({ success: true, msg: "Voucher updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// Delete voucher
export const deletePromotion = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { id } = req.body;

    const sellerRes = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) {
      return res.status(403).json({ success: false, msg: "Not a seller" });
    }
    const sellerId = sellerRes.rows[0].id;

    await db.query("DELETE FROM promotions WHERE id = $1 AND seller_id = $2", [
      id,
      sellerId,
    ]);

    res.json({ success: true, msg: "Voucher deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};
