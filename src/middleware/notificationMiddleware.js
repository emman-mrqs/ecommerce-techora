// src/middleware/notificationMiddleware.js
import db from "../database/db.js";

export default async function notificationMiddleware(req, res, next) {
  try {
    // Not logged in -> nothing to show
    if (!req.session?.user) {
      res.locals.orderNotifCount = 0;
      res.locals.orderNotifications = [];
      return next();
    }

    const userId = Number(req.session.user.id);

    // 1) Prefer the DB last_notif_seen_at; fall back to session; else 7 days ago
    let lastSeenIso = null;

    try {
      const { rows } = await db.query(
        `SELECT last_notif_seen_at
           FROM users
          WHERE id = $1
          LIMIT 1`,
        [userId]
      );

      if (rows?.[0]?.last_notif_seen_at) {
        // rows[0].last_notif_seen_at is timestamptz in DB; keep it as-is
        lastSeenIso = rows[0].last_notif_seen_at;
      }
    } catch (e) {
      // ignore and fall back
      // console.warn("read last_notif_seen_at failed:", e?.message || e);
    }

    if (!lastSeenIso && req.session.orderNotifSeenAt) {
      lastSeenIso = req.session.orderNotifSeenAt;
    }
    if (!lastSeenIso) {
      lastSeenIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    }

    // 2) Fetch order events for this user since lastSeen (created OR updated)
    // Use >= (not >) to avoid off-by-a-millisecond surprises.
    // Cast the parameter to timestamptz so Postgres compares apples to apples.
    const q = `
      SELECT id, order_status, total_amount, created_at, updated_at
        FROM orders
       WHERE user_id = $1
         AND GREATEST(created_at, updated_at) >= $2::timestamptz
       ORDER BY GREATEST(created_at, updated_at) DESC
       LIMIT 20
    `;

    const { rows: events } = await db.query(q, [userId, lastSeenIso]);

    res.locals.orderNotifications = events || [];
    res.locals.orderNotifCount = events?.length ? events.length : 0;

    return next();
  } catch (err) {
    console.error("notificationMiddleware error:", err);
    res.locals.orderNotifications = [];
    res.locals.orderNotifCount = 0;
    return next();
  }
}
