// src/controller/adminNotificationsController.js
import db from "../database/db.js";

/**
 * GET /admin/notifications/unread
 * Query params (all optional):
 *   - all=true        ⇒ no LIMIT (be careful if you have a lot of rows)
 *   - limit=200       ⇒ how many to return (default 200)
 *   - offset=0        ⇒ pagination offset
 *
 * Always returns:
 *   { ok: true, total: <count_of_unread>, notifications: [...] }
 */
export async function getUnreadNotifications(req, res) {
  try {
    const all = String(req.query.all || "").toLowerCase();
    const noLimit = all === "1" || all === "true";

    // sane defaults; you can tune these
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "200", 10), 2000));
    const offset = Math.max(0, parseInt(req.query.offset || "0", 10));

    // total unread for badge/pagination
    const { rows: cntRows } = await db.query(
      `SELECT COUNT(*)::int AS cnt
         FROM audit_logs
        WHERE is_read = FALSE`
    );
    const total = cntRows[0]?.cnt || 0;

    // fetch rows
    let rows;
    if (noLimit) {
      ({ rows } = await db.query(
        `SELECT id, actor_name, action, resource, created_at
           FROM audit_logs
          WHERE is_read = FALSE
          ORDER BY created_at DESC`
      ));
    } else {
      ({ rows } = await db.query(
        `SELECT id, actor_name, action, resource, created_at
           FROM audit_logs
          WHERE is_read = FALSE
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      ));
    }

    return res.json({ ok: true, total, notifications: rows });
  } catch (err) {
    console.error("getUnreadNotifications error:", err);
    return res.status(500).json({ ok: false });
  }
}

/**
 * POST /admin/notifications/read/:id
 * Mark a specific notification (audit log) as read
 */
export async function markNotificationRead(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, msg: "Invalid id" });

    await db.query(`UPDATE audit_logs SET is_read = TRUE WHERE id = $1`, [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("markNotificationRead error:", err);
    return res.status(500).json({ ok: false });
  }
}

/**
 * POST /admin/notifications/read-all
 * Mark all as read
 */
export async function markAllNotificationsRead(req, res) {
  try {
    await db.query(`UPDATE audit_logs SET is_read = TRUE WHERE is_read = FALSE`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("markAllNotificationsRead error:", err);
    return res.status(500).json({ ok: false });
  }
}
