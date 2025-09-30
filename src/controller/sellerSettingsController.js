import db from "../database/db.js";

// Render seller settings page
export const renderSellerSettings = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const sellerRes = await db.query(
      "SELECT * FROM sellers WHERE user_id = $1 LIMIT 1",
      [userId]
    );

    res.render("seller/sellerSettings", {
      activePage: "settings",
      pageTitle: "Seller Settings",
      seller: sellerRes.rows[0] || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

// Update seller settings (including optional store icon upload)
// Update seller settings (with optional store icon upload)
export const updateSellerSettings = async (req, res) => {
  try {
    const userId = req.session.user.id;
    let { store_name, category, description, business_address, store_email, contact_number } = req.body;

    // Convert empty strings to null (so COALESCE works correctly)
    store_name = store_name?.trim() || null;
    category = category?.trim() || null;
    description = description?.trim() || null;
    business_address = business_address?.trim() || null;
    store_email = store_email?.trim() || null;
    contact_number = contact_number?.trim() || null;

    let store_icon = null;
    if (req.file) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ success: false, msg: "Invalid file type. Only JPG, PNG, WEBP allowed." });
      }
      store_icon = `/uploads/${req.file.filename}`;
    }

    await db.query(
      `UPDATE sellers
       SET store_name = COALESCE($1, store_name),
           category = COALESCE($2, category),
           description = COALESCE($3, description),
           business_address = COALESCE($4, business_address),
           store_email = COALESCE($5, store_email),
           contact_number = COALESCE($6, contact_number),
           store_icon = COALESCE($7, store_icon),
           updated_at = NOW()
       WHERE user_id = $8`,
      [store_name, category, description, business_address, store_email, contact_number, store_icon, userId]
    );

    const updatedSeller = await db.query(
      "SELECT * FROM sellers WHERE user_id = $1 LIMIT 1",
      [userId]
    );

    res.json({ success: true, msg: "Store settings updated successfully", seller: updatedSeller.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};



// // Delete seller store
// export const deleteSellerStore = async (req, res) => {
//   try {
//     const userId = req.session.user.id;

//     await db.query("DELETE FROM sellers WHERE user_id = $1", [userId]);

//     res.json({ success: true, msg: "Seller store deleted successfully" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, msg: "Server error" });
//   }
// };
