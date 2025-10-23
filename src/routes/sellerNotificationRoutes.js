// src/routes/sellerNotificationRoutes.js
import express from "express";
import db from "../database/db.js";

const router = express.Router();

/**
 * POST /seller/notifications/mark-seen
 * Persists last_notif_seen_at in the sellers table.
 */
router.post("/seller/notifications/mark-seen", async (req, res) => {
  try {
    const seller = res.locals.seller || req.session?.seller;
    if (!seller) {
      return res.status(401).json({ ok: false, error: "Not a seller" });
    }

    const sellerId = seller.id;
    const now = new Date().toISOString();

    try {
      const sql = `
        UPDATE sellers
        SET last_notif_seen_at = $1
        WHERE id = $2
        RETURNING last_notif_seen_at
      `;
      const { rows } = await db.query(sql, [now, sellerId]);

      // update session immediately
      req.session.sellerNotifSeenAt = now;
      if (req.session.seller) req.session.seller.last_notif_seen_at = now;

      req.session.save(err => {
        if (err) {
          console.error("Failed to save seller session after DB update:", err);
          return res.json({ ok: true, persisted: true });
        }
        return res.json({
          ok: true,
          persisted: true,
          last_notif_seen_at: rows[0]?.last_notif_seen_at || now
        });
      });
    } catch (dbErr) {
      console.error("Seller DB update failed:", dbErr);

      // fallback to session-only
      req.session.sellerNotifSeenAt = now;
      req.session.save(err => {
        if (err) {
          console.error("Session save fallback error:", err);
          return res.status(500).json({ ok: false });
        }
        return res.json({ ok: true, persisted: false });
      });
    }
  } catch (err) {
    console.error("Unexpected seller mark-seen error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /seller/notifications
 * Optional: return all current notifications (for debugging or a view page)
 */
import sellerNotificationMiddleware from "../middleware/sellerNotificationMiddleware.js";

router.get("/seller/notifications", async (req, res) => {
  try {
    await sellerNotificationMiddleware(req, res, () => {});
    const items = res.locals.sellerNotifications || [];
    return res.json({ items });
  } catch (err) {
    console.error("GET /seller/notifications error", err);
    return res.status(500).json({ items: [] });
  }
});

export default router;
