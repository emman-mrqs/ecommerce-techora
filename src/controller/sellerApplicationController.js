// src/controller/sellerApplicationController.js
import db from "../database/db.js";
import { insertAudit } from "../utils/audit.js"; // ✅ import audit util

// Render seller application form
export const renderSellerApplication = async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login-verify");
  }

  try {
    const seller = await db.query(
      "SELECT * FROM sellers WHERE user_id = $1 LIMIT 1",
      [req.session.user.id]
    );

    if (seller.rows.length > 0) {
      const status = seller.rows[0].status;

      if (status === "approved") {
        return res.redirect("/seller"); // already a seller
      }

      if (status === "pending") {
        // ✅ show pending message, no form
        return res.render("seller/sellerApplication", {
          pageTitle: "Seller Application",
          submitted: true,
          successMessage: "Your application is pending. Please wait for admin approval."
        });
      }

      if (status === "rejected") {
        // allow re-apply
        return res.render("seller/sellerApplication", {
          pageTitle: "Seller Application",
          submitted: false
        });
      }
    }

    // ✅ new applicant → show form
    res.render("seller/sellerApplication", { 
      pageTitle: "Seller Application",
      submitted: false
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};


// Submit seller application
export const submitSellerApplication = async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  const { storeName, category, description, address } = req.body;
  const userId = req.session.user.id;
  const ip = req.headers["x-forwarded-for"] || req.ip;

  try {
    const existing = await db.query(
      "SELECT * FROM sellers WHERE user_id = $1",
      [userId]
    );

    if (existing.rows.length > 0) {
      const old = existing.rows[0];

      // ✅ Update existing record (reset to pending)
      await db.query(
        `UPDATE sellers 
         SET store_name=$1, category=$2, description=$3, business_address=$4, status='pending', updated_at=NOW()
         WHERE user_id=$5`,
        [storeName, category, description, address, userId]
      );

      // ✅ AUDIT LOG: seller_application_update
      try {
        await insertAudit({
          actor_type: "user",
          actor_id: userId,
          actor_name: req.session.user.name || "Unknown User",
          action: "seller_application_update",
          resource: "sellers",
          details: {
            old_status: old.status,
            new_status: "pending",
            store_name: storeName,
            category,
            address
          },
          ip,
          status: "success"
        });
      } catch (auditErr) {
        console.error("Audit insert error (seller_application_update):", auditErr);
      }

      return res.render("seller/sellerApplication", {
        pageTitle: "Seller Application",
        submitted: true,
        successMessage: "Your application has been updated. Waiting for admin approval."
      });
    }

    // ✅ Insert new record
    await db.query(
      `INSERT INTO sellers (user_id, store_name, category, description, business_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, storeName, category, description, address]
    );

    // ✅ AUDIT LOG: seller_application_create
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session.user.name || "Unknown User",
        action: "seller_application_create",
        resource: "sellers",
        details: { store_name: storeName, category, description, address },
        ip,
        status: "success"
      });
    } catch (auditErr) {
      console.error("Audit insert error (seller_application_create):", auditErr);
    }

    res.render("seller/sellerApplication", {
      pageTitle: "Seller Application",
      submitted: true,
      successMessage: "Application submitted. Waiting for admin approval."
    });

  } catch (err) {
    console.error(err);

    // ❌ AUDIT LOG: seller_application_error
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: userId,
        actor_name: req.session.user.name || "Unknown User",
        action: "seller_application_error",
        resource: "sellers",
        details: { error: err.message || String(err) },
        ip,
        status: "failed"
      });
    } catch (auditErr) {
      console.error("Audit insert error (seller_application_error):", auditErr);
    }

    res.status(500).send("Error submitting application");
  }
};


// Middleware to ensure seller is approved
export const ensureSeller = async (req, res, next) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  try {
    const result = await db.query(
      "SELECT * FROM sellers WHERE user_id = $1 AND status = 'approved'",
      [req.session.user.id]
    );

    if (result.rows.length === 0) {
      return res.redirect("/seller-application");
    }

    req.seller = result.rows[0]; // attach seller info
    next();
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};
