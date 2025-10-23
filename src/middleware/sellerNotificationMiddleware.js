// src/middleware/sellerNotificationMiddleware.js
import db from "../database/db.js";

/**
 * This middleware builds seller notifications primarily from `audit_logs`,
 * plus optional `seller_notifications` if you have it.
 *
 * It covers:
 *   - low_stock_alert
 *   - low_promotion_qty
 *   - promotion_expiring_soon
 *   - promotion_expired
 *   - promotion_disabled
 *   - voucher_redeemed / promotion_used
 *   - product_created / product_updated / product_deleted
 *   - order_placed / order_updated
 *   - review_created
 */

export default async function sellerNotificationMiddleware(req, res, next) {
  try {
    const seller = res.locals.seller || req.session?.seller;
    if (!seller) {
      res.locals.sellerNotifCount = 0;
      res.locals.sellerNotifications = [];
      return next();
    }

    const sellerId = Number(seller.id);

    // Get last seen timestamp
    let lastSeen;
    try {
      const { rows } = await db.query(
        `SELECT last_notif_seen_at FROM sellers WHERE id = $1 LIMIT 1`,
        [sellerId]
      );
      if (rows[0]?.last_notif_seen_at) {
        lastSeen = new Date(rows[0].last_notif_seen_at);
      }
    } catch (_) {}
    if (!lastSeen) {
      lastSeen = req.session.sellerNotifSeenAt
        ? new Date(req.session.sellerNotifSeenAt)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }
    const lastSeenIso = lastSeen.toISOString();

    // Optional: sticky and recent persisted custom notifications
    let persistedSticky = [];
    let persistedRecent = [];
    try {
      const { rows: sticky } = await db.query(
        `
          SELECT id, kind, title, body, ref_id, created_at, is_read, is_sticky
          FROM seller_notifications
          WHERE seller_id = $1 AND COALESCE(is_sticky,false) = true
          ORDER BY created_at DESC
          LIMIT 20
        `,
        [sellerId]
      );
      persistedSticky = sticky || [];
    } catch (_) {}

    try {
      const { rows: recent } = await db.query(
        `
          SELECT id, kind, title, body, ref_id, created_at, is_read, is_sticky
          FROM seller_notifications
          WHERE seller_id = $1
            AND COALESCE(is_sticky,false) = false
            AND created_at > $2
          ORDER BY created_at DESC
          LIMIT 50
        `,
        [sellerId, lastSeenIso]
      );
      persistedRecent = recent || [];
    } catch (_) {}

    // ---- Fetch audit-based notifications ----
    const actions = [
      "low_stock_alert",
      "low_promotion_qty",
      "promotion_expiring_soon",
      "promotion_expired",
      "promotion_disabled",
      "voucher_redeemed",
      "promotion_used",
      "product_created",
      "product_updated",
      "product_deleted",
      "order_placed",
      "order_updated",
      "review_created",
    ];

    let auditRows = [];
    try {
      const { rows } = await db.query(
        `
        SELECT a.id, a.actor_type, a.actor_id, a.actor_name, a.action, a.resource, a.details, a.created_at
        FROM audit_logs a
        WHERE a.created_at > $2
          AND a.action = ANY($3::text[])
          AND (
                (a.actor_type = 'seller' AND a.actor_id = $1)
             OR (a.details ? 'seller_id' AND (a.details->>'seller_id')::bigint = $1)
             OR (
                  a.action IN ('voucher_redeemed','promotion_used')
                  AND (a.details ? 'voucher_id')
                  AND EXISTS (
                        SELECT 1 FROM promotions p
                        WHERE p.id = (a.details->>'voucher_id')::bigint
                          AND p.seller_id = $1
                  )
             )
          )
        ORDER BY a.created_at DESC
        LIMIT 200
        `,
        [sellerId, lastSeenIso, actions]
      );
      auditRows = rows || [];
    } catch (err) {
      console.warn("sellerNotificationMiddleware: audit_logs fetch failed:", err.message);
    }

    // ---- Format audit rows into notifications ----
    const toStr = (v) => (v === null || v === undefined ? "" : String(v));
    const asNum = (v) => (v === null || v === undefined ? null : Number(v));

    const auditEvents = auditRows.map((r) => {
      const d = r.details || {};
      const get = (k) => (d && d[k] !== undefined ? d[k] : null);

      let kind = "audit";
      let title = r.action.replaceAll("_", " ");
      let bodyParts = [];
      let refId = null;

      switch (r.action) {
        // ====== INVENTORY / PROMOS ======
        case "low_stock_alert": {
          kind = "low_stock";
          const name = get("product_name") || `Product #${get("product_id")}`;
          title = `Low stock: ${name}`;
          refId = get("variant_id") || get("product_id") || r.id;
          if (get("variant_id")) bodyParts.push(`Variant #${get("variant_id")}`);
          if (get("current_stock") !== null)
            bodyParts.push(`Remaining: ${get("current_stock")}`);
          if (get("threshold") !== null)
            bodyParts.push(`Threshold: ${get("threshold")}`);
          break;
        }
        case "low_promotion_qty": {
          kind = "promo_low";
          title = `Promo low: ${get("voucher_code") || `Promo #${get("promotion_id")}`}`;
          refId = get("promotion_id") || r.id;
          if (get("remaining") !== null)
            bodyParts.push(`Remaining: ${get("remaining")}`);
          if (get("threshold") !== null)
            bodyParts.push(`Threshold: ${get("threshold")}`);
          break;
        }
        case "promotion_expiring_soon": {
          kind = "promo_expiry";
          title = `Promo expiring soon: ${get("voucher_code")}`;
          refId = get("promotion_id") || r.id;
          const exp = get("expiry_date");
          if (exp) bodyParts.push(`Expires: ${new Date(exp).toLocaleString()}`);
          if (get("days_to_expiry") !== null)
            bodyParts.push(`~${get("days_to_expiry")} day(s) left`);
          break;
        }
        case "promotion_expired": {
          kind = "promo_expired";
          title = `Promo expired: ${get("voucher_code")}`;
          refId = get("promotion_id") || r.id;
          break;
        }
        case "promotion_disabled": {
          kind = "promo_disabled";
          title = `Promo disabled: ${get("voucher_code")}`;
          refId = get("promotion_id") || r.id;
          break;
        }

        // ====== PROMO USE ======
        case "voucher_redeemed":
        case "promotion_used": {
          kind = "promo_used";
          const code = get("voucher_code") || `Promo #${get("promotion_id")}`;
          const buyer =
            get("buyer_name") ||
            get("buyer_email") ||
            (get("buyer_id") ? `User #${get("buyer_id")}` : null);
          title = `Promotion used: ${code}`;
          refId = get("promotion_id") || r.id;
          if (buyer) bodyParts.push(`By: ${buyer}`);
          const remaining = get("remaining");
          if (remaining !== null) bodyParts.push(`Remaining: ${remaining}`);
          break;
        }

        // ====== PRODUCT EVENTS ======
        case "product_created": {
          kind = "product_event";
          const name = get("product_name") || `Product #${get("product_id")}`;
          title = `New product created: ${name}`;
          refId = get("product_id") || r.id;
          break;
        }
        case "product_updated": {
          kind = "product_event";
          const name = get("product_name") || `Product #${get("product_id")}`;
          title = `Product updated: ${name}`;
          refId = get("product_id") || r.id;
          break;
        }
        case "product_deleted": {
          kind = "product_event";
          const name = get("product_name") || `Product #${get("product_id")}`;
          title = `Product deleted: ${name}`;
          refId = get("product_id") || r.id;
          break;
        }

        // ====== ORDERS ======
        case "order_placed":
        case "order_updated": {
          kind = "order";
          const oid = get("order_id");
          title = `Order #${oid} ${r.action === "order_placed" ? "placed" : "updated"}`;
          refId = oid || r.id;
          const buyer =
            get("buyer_name") ||
            get("buyer_email") ||
            (get("buyer_id") ? `User #${get("buyer_id")}` : null);
          if (buyer) bodyParts.push(`By: ${buyer}`);
          if (get("order_status")) bodyParts.push(`Status: ${get("order_status")}`);
          if (asNum(get("total_amount")) !== null)
            bodyParts.push(`₱${Number(get("total_amount")).toFixed(2)}`);
          break;
        }

        // ====== REVIEWS ======
        case "review_created": {
          kind = "review";
          const rating = get("rating");
          const pname = get("product_name") || `Product #${get("product_id")}`;
          title =
            rating != null
              ? `New review (${rating}★): ${pname}`
              : `New review: ${pname}`;
          refId = get("review_id") || r.id;
          const who =
            get("reviewer_name") ||
            get("reviewer_email") ||
            (get("reviewer_id") ? `User #${get("reviewer_id")}` : null);
          const excerpt = get("body")
            ? toStr(get("body")).slice(0, 150)
            : null;
          bodyParts = [excerpt, who ? `By: ${who}` : null].filter(Boolean);
          break;
        }
      }

      return {
        kind,
        id: `audit_${r.id}`,
        ref_id: refId,
        title,
        body: bodyParts.filter(Boolean).join(" · "),
        created_at: r.created_at,
        actor: r.actor_name ? { name: r.actor_name, type: r.actor_type } : null,
        is_sticky: false,
      };
    });

    // ---- Map persisted (optional) into displayable notifications ----
    const persistedEvents = [];
    for (const r of persistedSticky) {
      persistedEvents.push({
        kind: r.kind || "custom",
        id: `persist_${r.id}`,
        db_id: r.id,
        ref_id: r.ref_id || null,
        title: r.title || "Notification",
        body: r.body || "",
        created_at: r.created_at,
        is_sticky: true,
      });
    }
    for (const r of persistedRecent) {
      persistedEvents.push({
        kind: r.kind || "custom",
        id: `persist_${r.id}`,
        db_id: r.id,
        ref_id: r.ref_id || null,
        title: r.title || "Notification",
        body: r.body || "",
        created_at: r.created_at,
        is_sticky: !!r.is_sticky,
      });
    }

    // ---- Combine all notifications ----
    const all = [
      ...persistedEvents.filter((e) => e.is_sticky),
      ...auditEvents,
      ...persistedEvents.filter((e) => !e.is_sticky),
    ]
      .filter((x) => x && x.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 40);

    res.locals.sellerNotifications = all;
    res.locals.sellerNotifCount = all.length;
    next();
  } catch (err) {
    console.error("sellerNotificationMiddleware error:", err.stack || err);
    res.locals.sellerNotifications = [];
    res.locals.sellerNotifCount = 0;
    next();
  }
}
