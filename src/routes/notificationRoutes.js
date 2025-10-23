// src/routes/notificationRoutes.js
import express from "express";
import db from "../database/db.js"; // your pg client

const router = express.Router();

/**
 * POST /notifications/mark-seen
 * - Persists last_notif_seen_at to users table (preferred)
 * - Also updates req.session.orderNotifSeenAt for immediate consistency
 * - If DB update fails, still set session timestamp to avoid breaking UX
 */
router.post("/notifications/mark-seen", async (req, res) => {
  try {
    if (!req.session?.user) {
      return res.status(401).json({ ok: false, message: "Not logged in" });
    }

    const userId = req.session.user.id;
    const now = new Date().toISOString();

    // Try to persist to DB (preferred)
    try {
      const sql = `
        UPDATE users
        SET last_notif_seen_at = $1
        WHERE id = $2
        RETURNING last_notif_seen_at
      `;
      const { rows } = await db.query(sql, [now, userId]);

      // Update session copy immediately so this session is consistent
      req.session.orderNotifSeenAt = now;
      if (req.session.user) req.session.user.last_notif_seen_at = now;

      // Save session and respond
      req.session.save(err => {
        if (err) {
          console.error("Failed to save session after DB update:", err);
          // still respond ok because DB update succeeded
          return res.json({ ok: true, persisted: true });
        }
        return res.json({ ok: true, persisted: true, last_notif_seen_at: rows[0]?.last_notif_seen_at || now });
      });
    } catch (dbErr) {
      // DB failed — fall back to session-only behavior to avoid breaking UX
      console.error("DB update failed for mark-seen, falling back to session-only:", dbErr);

      req.session.orderNotifSeenAt = now;
      if (req.session.user) req.session.user.last_notif_seen_at = now;

      req.session.save(err => {
        if (err) {
          console.error("Failed to save session in fallback mark-seen:", err);
          return res.status(500).json({ ok: false, persisted: false, message: "Failed to persist session" });
        }
        return res.json({ ok: true, persisted: false, fallback: true });
      });
    }
  } catch (err) {
    console.error("Unexpected error in /notifications/mark-seen:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;
