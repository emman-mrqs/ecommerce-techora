// src/controller/sellerPromotionsController.js
import db from "../database/db.js";
import { insertAudit } from "../utils/audit.js";
import {
  checkLowPromotionQtyForSeller,
  checkExpiringPromotionsForSeller,
  checkAndMarkExpiredPromotionsForSeller,
} from "../utils/healthChecks.js";

/* ============================================================
   Controller actions
   ============================================================ */

export const renderSellerPromotions = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.redirect("/login");

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

    // Keep your background checks (safe no-op if you already run these elsewhere)
    try {
      await checkAndMarkExpiredPromotionsForSeller({ sellerId });
      await checkExpiringPromotionsForSeller({ sellerId, windowDays: 7 });
      await checkLowPromotionQtyForSeller({ sellerId, threshold: 5 });
    } catch (chkErr) {
      console.error("Promotion health check error on render:", chkErr);
    }

    // Derived fields for the UI
    const expiringWindowDays = 7;
    const lowQtyThreshold = 5;

    const promoRes = await db.query(
      `SELECT
         id,
         seller_id,
         voucher_code,
         discount_type,
         discount_value,
         usage_limit,
         COALESCE(used_count, 0) AS used_count,
         (CASE WHEN usage_limit IS NOT NULL THEN (usage_limit - COALESCE(used_count,0)) ELSE NULL END) AS remaining,
         expiry_date,
         created_at,
         updated_at,
         CASE
           WHEN expiry_date IS NOT NULL AND expiry_date < now() THEN 'expired'
           WHEN expiry_date IS NOT NULL AND expiry_date <= now() + ($2 * interval '1 day') THEN 'expiring_soon'
           ELSE COALESCE(status, 'active')
         END AS status,
         (CASE WHEN expiry_date IS NOT NULL THEN (DATE_PART('day', expiry_date::timestamp - now()::timestamp)) ELSE NULL END) AS days_to_expiry,
         (CASE WHEN usage_limit IS NOT NULL AND (usage_limit - COALESCE(used_count,0)) <= $3 THEN true ELSE false END) AS low_qty
       FROM promotions
       WHERE seller_id = $1
       ORDER BY created_at DESC
      `,
      [sellerId, expiringWindowDays, lowQtyThreshold]
    );

    const promotions = promoRes.rows.map(r => ({
      ...r,
      used_count: Number(r.used_count || 0),
      usage_limit: r.usage_limit == null ? null : Number(r.usage_limit),
      remaining: r.remaining == null ? null : Number(r.remaining),
      days_to_expiry: r.days_to_expiry == null ? null : Number(r.days_to_expiry),
      low_qty: Boolean(r.low_qty)
    }));

    return res.render("seller/sellerPromotions", {
      activePage: "promotions",
      pageTitle: "Seller Promotions",
      promotions
    });
  } catch (err) {
    console.error("renderSellerPromotions error:", err);
    return res.status(500).send("Server error");
  }
};

export const createPromotion = async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.ip;
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ success: false, msg: "Login required" });

    const sellerRes = await db.query(
      "SELECT id, store_name FROM sellers WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) return res.status(403).json({ success: false, msg: "Not a seller" });

    const sellerId = sellerRes.rows[0].id;
    const storeName = sellerRes.rows[0].store_name || null;

    const { voucher_code, discount_type, discount_value, usage_limit, expiry_date } = req.body;

    // Basic validation
    if (!voucher_code || !discount_type || (discount_value == null)) {
      return res.status(400).json({ success: false, msg: "Missing required fields" });
    }

    // Duplicate check (per seller)
    const exists = await db.query(
      "SELECT id FROM promotions WHERE seller_id = $1 AND voucher_code = $2",
      [sellerId, voucher_code]
    );
    if (exists.rows.length > 0) {
      return res.json({ success: false, msg: "You already have this voucher code. Try another one." });
    }

    const newPromo = await db.query(
      `INSERT INTO promotions
         (seller_id, voucher_code, discount_type, discount_value, usage_limit, expiry_date, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'active',NOW())
       RETURNING id, voucher_code, discount_type, discount_value, usage_limit, COALESCE(used_count,0) AS used_count, expiry_date`,
      [sellerId, voucher_code, discount_type, discount_value, usage_limit || null, expiry_date || null]
    );

    const promoRow = newPromo.rows[0];

    // ✅ AUDIT: promotion_create
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: storeName,
        action: "promotion_create",
        resource: "promotions",
        details: {
          seller_id: sellerId,
          promotion_id: promoRow.id,
          voucher_code: promoRow.voucher_code,
          discount_type: promoRow.discount_type,
          discount_value: promoRow.discount_value,
          usage_limit: promoRow.usage_limit,
          used_count: Number(promoRow.used_count || 0),
          expiry_date: promoRow.expiry_date || null
        },
        ip,
        status: "success"
      });
    } catch (auditErr) {
      console.error("Audit insert error (promotion_create):", auditErr);
    }

    // (Optional) run health checks to keep badges current
    try {
      await checkLowPromotionQtyForSeller({ sellerId, threshold: 5 });
      await checkAndMarkExpiredPromotionsForSeller({ sellerId });
      await checkExpiringPromotionsForSeller({ sellerId, windowDays: 7 });
    } catch (chkErr) {
      console.error("Promotion health check error:", chkErr);
    }

    return res.status(201).json({ success: true, msg: "Voucher created successfully" });
  } catch (err) {
    console.error("createPromotion error:", err);

    // Audit failure
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: req.session?.user?.id || null,
        action: "promotion_create_error",
        resource: "promotions",
        details: { error: err.message || String(err) },
        ip,
        status: "failed"
      });
    } catch (_) {}

    return res.status(500).json({ success: false, msg: "Server error" });
  }
};

export const updatePromotion = async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.ip;
  const client = await db.connect();
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ success: false, msg: "Login required" });

    const sellerRes = await db.query(
      "SELECT id, store_name FROM sellers WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) return res.status(403).json({ success: false, msg: "Not a seller" });

    const sellerId = sellerRes.rows[0].id;
    const storeName = sellerRes.rows[0].store_name || null;

    const { id, voucher_code, discount_type, discount_value, usage_limit, expiry_date, status } = req.body;
    if (!id) return res.status(400).json({ success: false, msg: "id is required" });

    await client.query("BEGIN");

    // Lock + load old row
    const oldRes = await client.query(
      "SELECT * FROM promotions WHERE id = $1 AND seller_id = $2 LIMIT 1 FOR UPDATE",
      [id, sellerId]
    );
    const oldPromo = oldRes.rows[0];
    if (!oldPromo) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, msg: "Promotion not found" });
    }

    // Duplicate code (excluding self)
    const dup = await client.query(
      "SELECT id FROM promotions WHERE seller_id = $1 AND voucher_code = $2 AND id <> $3",
      [sellerId, voucher_code, id]
    );
    if (dup.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.json({ success: false, msg: "Another voucher with this code already exists. Try a different code." });
    }

    await client.query(
      `UPDATE promotions
       SET voucher_code = $1,
           discount_type = $2,
           discount_value = $3,
           usage_limit = $4,
           expiry_date = $5,
           status = $6,
           updated_at = NOW()
       WHERE id = $7 AND seller_id = $8`,
      [voucher_code, discount_type, discount_value, usage_limit || null, expiry_date || null, status || 'active', id, sellerId]
    );

    await client.query("COMMIT");

    // ✅ AUDIT: promotion_update
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: storeName,
        action: "promotion_update",
        resource: "promotions",
        details: {
          seller_id: sellerId,
          promotion_id: id,
          before: oldPromo,
          after: {
            voucher_code,
            discount_type,
            discount_value,
            usage_limit: usage_limit || null,
            expiry_date: expiry_date || null,
            status: status || 'active'
          }
        },
        ip,
        status: "success"
      });
    } catch (auditErr) {
      console.error("Audit insert error (promotion_update):", auditErr);
    }

    // If status changed, emit a specific audit row too
    try {
      const prev = (oldPromo.status || "active").toLowerCase();
      const next = (status || "active").toLowerCase();
      if (prev !== next) {
        if (next === "disabled") {
          await insertAudit({
            actor_type: "seller",
            actor_id: sellerId,
            actor_name: storeName,
            action: "promotion_disabled",
            resource: "promotions",
            details: {
              seller_id: sellerId,
              promotion_id: id,
              voucher_code
            },
            ip,
            status: "success"
          });
        } else if (next === "expired") {
          await insertAudit({
            actor_type: "seller",
            actor_id: sellerId,
            actor_name: storeName,
            action: "promotion_expired",
            resource: "promotions",
            details: {
              seller_id: sellerId,
              promotion_id: id,
              voucher_code,
              expiry_date: expiry_date || null
            },
            ip,
            status: "success"
          });
        }
      }
    } catch (statusAuditErr) {
      console.error("Status-change audit error:", statusAuditErr);
    }

    // Keep your checks (badge freshness)
    try {
      await checkLowPromotionQtyForSeller({ sellerId, threshold: 5 });
      await checkAndMarkExpiredPromotionsForSeller({ sellerId });
      await checkExpiringPromotionsForSeller({ sellerId, windowDays: 7 });
    } catch (chkErr) {
      console.error("Promotion health check error:", chkErr);
    }

    return res.json({ success: true, msg: "Voucher updated successfully" });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("updatePromotion error:", err);

    // Audit failure
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: req.session?.user?.id || null,
        action: "promotion_update_error",
        resource: "promotions",
        details: { error: err.message || String(err) },
        ip,
        status: "failed"
      });
    } catch (_) {}

    return res.status(500).json({ success: false, msg: "Server error" });
  } finally {
    try { client.release(); } catch {}
  }
};

export const deletePromotion = async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.ip;
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ success: false, msg: "Login required" });

    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, msg: "id required" });

    const sellerRes = await db.query(
      "SELECT id, store_name FROM sellers WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if (sellerRes.rows.length === 0) return res.status(403).json({ success: false, msg: "Not a seller" });

    const sellerId = sellerRes.rows[0].id;
    const storeName = sellerRes.rows[0].store_name || null;

    // keep copy for audit
    const oldRes = await db.query(
      "SELECT * FROM promotions WHERE id = $1 AND seller_id = $2 LIMIT 1",
      [id, sellerId]
    );
    const deletedPromo = oldRes.rows[0] || null;

    await db.query("DELETE FROM promotions WHERE id = $1 AND seller_id = $2", [id, sellerId]);

    // ✅ AUDIT: promotion_delete
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: sellerId,
        actor_name: storeName,
        action: "promotion_delete",
        resource: "promotions",
        details: {
          seller_id: sellerId,
          promotion_id: deletedPromo?.id || id,
          ...(deletedPromo || { voucher_code: null })
        },
        ip,
        status: "success"
      });
    } catch (auditErr) {
      console.error("Audit insert error (promotion_delete):", auditErr);
    }

    // Checks to keep notifications consistent
    try {
      await checkLowPromotionQtyForSeller({ sellerId, threshold: 5 });
      await checkAndMarkExpiredPromotionsForSeller({ sellerId });
      await checkExpiringPromotionsForSeller({ sellerId, windowDays: 7 });
    } catch (chkErr) {
      console.error("Promotion health check error:", chkErr);
    }

    return res.json({ success: true, msg: "Voucher deleted successfully" });
  } catch (err) {
    console.error("deletePromotion error:", err);

    // Audit failure
    try {
      await insertAudit({
        actor_type: "seller",
        actor_id: req.session?.user?.id || null,
        action: "promotion_delete_error",
        resource: "promotions",
        details: { error: err.message || String(err) },
        ip,
        status: "failed"
      });
    } catch (_) {}

    return res.status(500).json({ success: false, msg: "Server error" });
  }
};
