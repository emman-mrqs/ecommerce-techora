import db from "../database/db.js";

/**
 * Fetch unread audit notifications (last 10 max)
 */
export async function getUnreadNotifications(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, actor_name, action, resource, created_at
         FROM audit_logs
        WHERE is_read = FALSE
        ORDER BY created_at DESC
        LIMIT 10`
    );
    res.json({ ok: true, notifications: rows });
  } catch (err) {
    console.error("getUnreadNotifications error:", err);
    res.status(500).json({ ok: false });
  }
}

/**
 * Mark a specific notification (audit log) as read
 */
export async function markNotificationRead(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, msg: "Invalid id" });

    await db.query(`UPDATE audit_logs SET is_read = TRUE WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("markNotificationRead error:", err);
    res.status(500).json({ ok: false });
  }
}

/**
 * Mark all as read
 */
export async function markAllNotificationsRead(req, res) {
  try {
    await db.query(`UPDATE audit_logs SET is_read = TRUE WHERE is_read = FALSE`);
    res.json({ ok: true });
  } catch (err) {
    console.error("markAllNotificationsRead error:", err);
    res.status(500).json({ ok: false });
  }
}
