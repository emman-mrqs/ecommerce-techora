// src/controller/adminAuditController.js
import db from "../database/db.js";

/**
 * GET /admin/audit
 * Query params:
 *  - search, action, timeframe, page, perPage
 */
export async function listAudits(req, res) {
  try {
    const {
      search = "",
      action = "",
      timeframe = "30d",
      page: pageRaw = "1",
      perPage: perPageRaw = "10", // default to 10 per your request
    } = req.query;

    const page = Math.max(1, parseInt(pageRaw, 10) || 1);
    const perPage = Math.min(200, Math.max(5, parseInt(perPageRaw, 10) || 10)); // keep limits
    const offset = (page - 1) * perPage;

    const where = [];
    const params = [];
    let p = 1;

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      where.push(
        `(actor_name ILIKE $${p} OR action ILIKE $${p} OR resource ILIKE $${p} OR details::text ILIKE $${p})`
      );
      params.push(s);
      p++;
    }

    if (action && action.trim()) {
      where.push(`action = $${p}`);
      params.push(action.trim());
      p++;
    }

    if (timeframe) {
      if (timeframe === "24h") where.push(`created_at >= now() - interval '24 hours'`);
      else if (timeframe === "7d") where.push(`created_at >= now() - interval '7 days'`);
      else if (timeframe === "30d") where.push(`created_at >= now() - interval '30 days'`);
      else if (timeframe === "year") where.push(`created_at >= now() - interval '365 days'`);
      else if (/^\d+d$/.test(timeframe)) {
        const days = parseInt(timeframe.replace("d", ""), 10);
        where.push(`created_at >= now() - interval '${days} days'`);
      }
    }

    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // total count
    const countSql = `SELECT COUNT(*)::int AS total FROM audit_logs ${whereSQL};`;
    const countRes = await db.query(countSql, params);
    const total = countRes.rows[0] ? countRes.rows[0].total : 0;

    // fetch page rows (use parameterized perPage & offset)
    const fetchSql = `
      SELECT id, actor_type, actor_id, actor_name, action, resource, details, ip, status, created_at
      FROM audit_logs
      ${whereSQL}
      ORDER BY created_at DESC
      LIMIT $${p} OFFSET $${p + 1};
    `;
    params.push(perPage, offset);
    const rowsRes = await db.query(fetchSql, params);
    const audits = rowsRes.rows || [];

    const lastPage = Math.max(1, Math.ceil(total / perPage));

    // Build pages array (max 5 numeric page buttons centered on current page)
    const maxButtons = 5;
    let start = Math.max(1, page - Math.floor(maxButtons / 2));
    let end = Math.min(lastPage, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);

    // Provide query params back for EJS builder convenience
    const queryParams = { search, action, timeframe, perPage };

    return res.render("admin/adminAudit", {
      audits,
      total,
      page,
      perPage,
      search,
      action,
      timeframe,
      lastPage,
      pages,
      queryParams
    });
  } catch (err) {
    console.error("listAudits error:", err);
    return res.status(500).send("Unable to load audit logs");
  }
}
