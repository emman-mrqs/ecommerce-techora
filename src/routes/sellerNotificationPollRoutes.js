// src/routes/sellerNotificationPollRoutes.js
import express from "express";
import db from "../database/db.js";

const router = express.Router();

/* ------------------------- helpers ------------------------- */
async function getLastSeenTs({ sellerId, session }) {
  // 1) DB column (preferred)
  try {
    const q = await db.query(
      `SELECT last_notif_seen_at FROM sellers WHERE id = $1 LIMIT 1`,
      [sellerId]
    );
    if (q.rows[0]?.last_notif_seen_at) return new Date(q.rows[0].last_notif_seen_at);
  } catch (_) {
    /* ignore, fall back below */
  }
  // 2) Session mirror
  if (session?.sellerNotifSeenAt) {
    try { return new Date(session.sellerNotifSeenAt); } catch {}
  }
  // 3) Fallback: last 7 days
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

function mapAuditRow(r) {
  const d = r.details || {};
  const safe = (k) => (d && d[k] != null ? d[k] : null);

  let title = r.action.replaceAll("_", " ");
  let body = "";
  let ref_id = null;
  let kind = "audit";

  switch (r.action) {
    case "low_promotion_qty":
      kind = "promo_low";
      title = `Promo low: ${safe("voucher_code") || "#" + (safe("promotion_id") || "")}`;
      body  = safe("remaining") != null ? `Remaining: ${safe("remaining")}` : "";
      ref_id = safe("promotion_id") || null;
      break;

    case "promotion_expiring_soon":
      kind = "promo_expiry";
      title = `Promo expiring soon: ${safe("voucher_code") || "#" + (safe("promotion_id") || "")}`;
      body  = safe("expiry_date") ? `Expires: ${new Date(safe("expiry_date")).toLocaleString()}` : "";
      ref_id = safe("promotion_id") || null;
      break;

    case "promotion_expired":
    case "promotion_disabled":
      kind  = r.action === "promotion_expired" ? "promo_expired" : "promo_disabled";
      title = `${r.action.replace("promotion_", "Promo ")}: ${
        safe("voucher_code") || "#" + (safe("promotion_id") || "")
      }`;
      ref_id = safe("promotion_id") || null;
      break;

    case "low_stock_alert":
      kind  = "low_stock";
      title = `Low stock: ${safe("product_name") || "#" + (safe("product_id") || "")}`;
      body  = safe("current_stock") != null ? `Remaining: ${safe("current_stock")}` : "";
      ref_id = safe("variant_id") || safe("product_id") || null;
      break;

    case "order_placed":
    case "order_updated":
    case "order_create": { // treat order_create as placed (back-compat)
      kind = "order";
      const placedLike = r.action === "order_placed" || r.action === "order_create";
      const oid = safe("order_id") || null;
      title = `Order #${oid || r.id} ${placedLike ? "placed" : "updated"}`;
      const parts = [];
      if (safe("buyer_name")) parts.push(`By: ${safe("buyer_name")}`);
      if (safe("total_amount") != null) parts.push(`Amount: ${Number(safe("total_amount")).toFixed(2)}`);
      if (safe("order_status")) parts.push(`Status: ${safe("order_status")}`);
      body = parts.join(" · ");
      ref_id = oid;
      break;
    }

    case "review_created":
      kind  = "review";
      title = `New review: ${safe("product_name") || "#" + (safe("product_id") || "")}`;
      body  = safe("rating") ? `Rating: ${safe("rating")}★` : "";
      ref_id = safe("review_id") || null;
      break;

    default:
      break;
  }

  return {
    id: `audit_${r.id}`,
    kind,
    ref_id,
    title,
    body,
    created_at: r.created_at,
    actor: r.actor_name ? { name: r.actor_name, type: r.actor_type } : null,
  };
}

/* ------------------------- poll JSON ------------------------- */
/**
 * GET /seller/notifications/poll-json
 * Returns **unread** seller notifications newer than last_notif_seen_at.
 * Also returns { unread: <number> } for the badge.
 */
router.get("/seller/notifications/poll-json", async (req, res) => {
  try {
    const seller = res.locals?.seller || req.session?.seller;
    if (!seller) return res.json({ ok: true, items: [], unread: 0 });

    const sellerId = Number(seller.id);
    const lastSeen = await getLastSeenTs({ sellerId, session: req.session });

    // If middleware preloaded items, filter them by lastSeen (do NOT duplicate logic)
    if (Array.isArray(res.locals?.sellerNotifications)) {
      const filtered = res.locals.sellerNotifications
        .filter(n => new Date(n.created_at) > lastSeen)
        .slice(0, 40);
      return res.json({ ok: true, items: filtered, unread: filtered.length });
    }

    // Otherwise, fetch unread directly from audit_logs
    const sql = `
      SELECT id, actor_type, actor_id, actor_name, action, resource, details, created_at
      FROM audit_logs
      WHERE created_at > $2
        AND (
              (actor_type = 'seller' AND actor_id = $1)
           OR (details ? 'seller_id' AND (details->>'seller_id')::bigint = $1)
        )
        AND action IN (
          'low_stock_alert',
          'low_promotion_qty',
          'promotion_expiring_soon',
          'promotion_expired',
          'promotion_disabled',
          'order_placed',
          'order_updated',
          'order_create',   -- backward compat
          'review_created'
        )
      ORDER BY created_at DESC
      LIMIT 40
    `;
    const { rows } = await db.query(sql, [sellerId, lastSeen]);

    const items = rows.map(mapAuditRow);
    return res.json({ ok: true, items, unread: items.length });
  } catch (err) {
    console.error("poll-json error:", err);
    return res.status(500).json({ ok: false, items: [], unread: 0 });
  }
});

/* ------------------------- mark seen ------------------------- */
/**
 * POST /seller/notifications/mark-seen
 * Persists last_notif_seen_at in sellers and mirrors it in session.
 */
router.post("/seller/notifications/mark-seen", async (req, res) => {
  try {
    const seller = req.session?.seller;
    if (!seller) return res.status(401).json({ ok: false, msg: "Not a seller" });

    const sellerId = Number(seller.id);
    const now = new Date();

    // Persist in DB if the column exists
    try {
      const col = await db.query(
        `SELECT 1
           FROM information_schema.columns
          WHERE table_name = 'sellers' AND column_name = 'last_notif_seen_at'
          LIMIT 1`
      );
      if (col.rowCount > 0) {
        await db.query(
          `UPDATE sellers SET last_notif_seen_at = $1 WHERE id = $2`,
          [now, sellerId]
        );
      }
    } catch (e) {
      console.warn("mark-seen: DB update skipped:", e?.message || e);
    }

    // Mirror in session
    req.session.sellerNotifSeenAt = now.toISOString();

    return res.json({ ok: true });
  } catch (err) {
    console.error("mark-seen error:", err);
    return res.status(500).json({ ok: false });
  }
});

export default router;
