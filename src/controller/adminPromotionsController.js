// src/controller/adminPromotionsController.js
import db from "../database/db.js";

/**
 * Helper to compute a display status for a promotion row.
 * - disabled if status='disabled'
 * - expired if expiry_date < today OR (usage_limit reached)
 * - otherwise active
 */
function computeStatus(p) {
  if ((p.status || '').toLowerCase() === 'disabled') return 'disabled';

  const today = new Date();
  const exp = p.expiry_date ? new Date(p.expiry_date) : null;
  const limitReached =
    p.usage_limit != null &&
    p.used_count != null &&
    Number(p.used_count) >= Number(p.usage_limit);

  if ((exp && exp < new Date(today.toDateString())) || limitReached) {
    return 'expired';
  }
  return 'active';
}

/**
 * GET /admin/promotions
 * Render Promotions Management grouped by seller
 */
export const renderAdminPromotions = async (req, res) => {
  try {
    // Wide query; group in JS
    const { rows } = await db.query(`
      SELECT
        s.id                              AS seller_id,
        s.store_name                      AS store_name,
        u.email                           AS owner_email,

        p.id                              AS promotion_id,
        p.voucher_code,
        p.discount_type,
        p.discount_value,
        p.usage_limit,
        p.used_count,
        p.expiry_date,
        p.status                          AS raw_status,
        p.created_at,
        p.updated_at
      FROM sellers s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN promotions p ON p.seller_id = s.id
      WHERE s.status IN ('approved', 'suspended')
      ORDER BY s.store_name ASC, p.created_at DESC NULLS LAST
    `);

    // Group by seller
    const bySeller = new Map();
    for (const r of rows) {
      if (!bySeller.has(r.seller_id)) {
        bySeller.set(r.seller_id, {
          seller_id: r.seller_id,
          store_name: r.store_name,
          owner_email: r.owner_email,
          promotions: [],
        });
      }
      if (r.promotion_id) {
        const promo = {
          id: r.promotion_id,
          voucher_code: r.voucher_code,
          discount_type: r.discount_type,     // 'percentage' | 'fixed'
          discount_value: r.discount_value,   // number
          usage_limit: r.usage_limit,         // int or null
          used_count: r.used_count ?? 0,      // int
          expiry_date: r.expiry_date,         // date
          status: computeStatus({
            status: r.raw_status,
            expiry_date: r.expiry_date,
            usage_limit: r.usage_limit,
            used_count: r.used_count,
          }),                                 // 'active' | 'expired' | 'disabled'
          raw_status: r.raw_status,           // original DB status
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
        bySeller.get(r.seller_id).promotions.push(promo);
      }
    }

    const sellers = Array.from(bySeller.values());

    res.render("admin/adminPromotions", {
      activePage: "promotions",
      pageTitle: "Promotions Management",
      sellers,
      toast: req.session.toast || null,
    });

    delete req.session.toast;
  } catch (err) {
    console.error("Error rendering admin promotions:", err);
    res.status(500).send("Error loading promotions");
  }
};

/**
 * GET /admin/promotions/:id  (JSON)
 * Return a promotion in detail for modal view/edit
 */
export const adminGetPromotion = async (req, res) => {
  const { id } = req.params;
  try {
    const q = await db.query(
      `SELECT p.*, s.store_name, s.id AS seller_id
       FROM promotions p
       JOIN sellers s ON s.id = p.seller_id
       WHERE p.id = $1`,
      [id]
    );
    if (q.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }
    const p = q.rows[0];
    const display_status = computeStatus(p);
    res.json({
      ok: true,
      promotion: {
        id: p.id,
        seller_id: p.seller_id,
        store_name: p.store_name,
        voucher_code: p.voucher_code,
        discount_type: p.discount_type,
        discount_value: p.discount_value,
        usage_limit: p.usage_limit,
        used_count: p.used_count,
        expiry_date: p.expiry_date,
        status: display_status,
        raw_status: p.status,
        created_at: p.created_at,
        updated_at: p.updated_at,
      },
    });
  } catch (err) {
    console.error("Error fetching promotion:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};

/**
 * POST /admin/promotions/:id/update
 * Update editable fields for a promotion
 * Accepts: voucher_code, discount_type ('percentage'|'fixed'), discount_value,
 *          usage_limit (nullable), expiry_date (YYYY-MM-DD), raw_status (optional 'active'|'disabled')
 */
export const adminUpdatePromotion = async (req, res) => {
  const { id } = req.params;
  let {
    voucher_code,
    discount_type,
    discount_value,
    usage_limit,
    expiry_date,
    raw_status,
  } = req.body;

  try {
    // Normalize inputs
    voucher_code = voucher_code?.trim() || null;
    discount_type = discount_type?.trim().toLowerCase() || null; // 'percentage'|'fixed'
    discount_value = discount_value !== undefined && discount_value !== ""
      ? Number(discount_value)
      : null;
    usage_limit = usage_limit !== undefined && usage_limit !== ""
      ? parseInt(usage_limit, 10)
      : null;
    expiry_date = expiry_date?.trim() || null;
    raw_status = raw_status?.trim().toLowerCase() || null; // 'active' | 'disabled'

    await db.query(
      `UPDATE promotions
         SET voucher_code   = COALESCE($1, voucher_code),
             discount_type  = COALESCE($2, discount_type),
             discount_value = COALESCE($3, discount_value),
             usage_limit    = $4,             -- allow null explicit
             expiry_date    = $5::date,       -- allow null explicit
             status         = COALESCE($6, status),
             updated_at     = NOW()
       WHERE id = $7`,
      [voucher_code, discount_type, discount_value, usage_limit, expiry_date, raw_status, id]
    );

    req.session.toast = { type: "success", message: "Promotion updated successfully." };
    res.redirect("/admin/promotions");
  } catch (err) {
    console.error("Error updating promotion:", err);
    req.session.toast = { type: "danger", message: "Error updating promotion." };
    res.redirect("/admin/promotions");
  }
};

/**
 * POST /admin/promotions/:id/enable
 * Sets raw status to 'active'
 */
export const adminEnablePromotion = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(`UPDATE promotions SET status = 'active', updated_at = NOW() WHERE id = $1`, [id]);
    req.session.toast = { type: "success", message: "Promotion enabled." };
    res.redirect("/admin/promotions");
  } catch (err) {
    console.error("Error enabling promotion:", err);
    req.session.toast = { type: "danger", message: "Error enabling promotion." };
    res.redirect("/admin/promotions");
  }
};

/**
 * POST /admin/promotions/:id/disable
 * Sets raw status to 'disabled'
 */
export const adminDisablePromotion = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(`UPDATE promotions SET status = 'disabled', updated_at = NOW() WHERE id = $1`, [id]);
    req.session.toast = { type: "warning", message: "Promotion disabled." };
    res.redirect("/admin/promotions");
  } catch (err) {
    console.error("Error disabling promotion:", err);
    req.session.toast = { type: "danger", message: "Error disabling promotion." };
    res.redirect("/admin/promotions");
  }
};

/**
 * POST /admin/promotions/:id/delete
 */
export const adminDeletePromotion = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(`DELETE FROM promotions WHERE id = $1`, [id]);
    req.session.toast = { type: "success", message: "Promotion deleted." };
    res.redirect("/admin/promotions");
  } catch (err) {
    console.error("Error deleting promotion:", err);
    req.session.toast = { type: "danger", message: "Error deleting promotion." };
    res.redirect("/admin/promotions");
  }
};
