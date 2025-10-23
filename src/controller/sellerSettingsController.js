// src/controller/sellerSettingsController.js
import db from "../database/db.js";
import { insertAudit } from "../utils/audit.js"; // ✅ import audit util

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

// Update seller settings (with optional store icon upload)
export const updateSellerSettings = async (req, res) => {
  const userId = req.session.user.id;
  const ip = req.headers["x-forwarded-for"] || req.ip;

  try {
    let { store_name, category, description, business_address, store_email, contact_number } = req.body;

    // Convert empty strings to null
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

    // ✅ Update seller settings
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

    const updatedSellerRes = await db.query(
      "SELECT * FROM sellers WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    const updatedSeller = updatedSellerRes.rows[0];

    // ✅ AUDIT LOG
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: userId,
        actor_name: req.session.user?.name || "Unknown Seller",
        action: "seller_settings_update",
        resource: "sellers",
        details: {
          store_name: updatedSeller.store_name,
          category: updatedSeller.category,
          store_email: updatedSeller.store_email,
          contact_number: updatedSeller.contact_number
        },
        ip,
        status: "success"
      });
    } catch (auditErr) {
      console.error("Audit insert error (seller_settings_update):", auditErr);
    }

    res.json({ success: true, msg: "Store settings updated successfully", seller: updatedSeller });
  } catch (err) {
    console.error("❌ updateSellerSettings error:", err);

    // ❌ AUDIT LOG on error
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: userId,
        actor_name: req.session.user?.name || "Unknown Seller",
        action: "seller_settings_error",
        resource: "sellers",
        details: { error: err.message || String(err) },
        ip,
        status: "failed"
      });
    } catch (auditErr) {
      console.error("Audit insert error (seller_settings_error):", auditErr);
    }

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
