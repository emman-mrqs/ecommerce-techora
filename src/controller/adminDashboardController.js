// src/controller/adminDashboardController.js
import db from "../database/db.js";

const COMPLETED_STATUSES = ["completed", "shipped", "delivered"]; // adjust to your statuses

function parseRange(q) {
  const n = Number(q);
  return [7, 30, 90].includes(n) ? n : 30;
}

// reusable query to get daily sales for N days (includes zero-sales days)
async function querySalesOverview(days) {
  const statusList = COMPLETED_STATUSES.map(s => `'${s}'`).join(",");
  const sql = `
    WITH days AS (
      SELECT generate_series(
        CURRENT_DATE - INTERVAL '${days - 1} days',
        CURRENT_DATE,
        INTERVAL '1 day'
      )::date AS d
    ),
    sales AS (
      SELECT DATE(o.created_at) AS d, COALESCE(SUM(o.total_amount),0) AS amt
      FROM orders o
      WHERE LOWER(o.order_status) IN (${statusList})
        AND o.created_at >= CURRENT_DATE - INTERVAL '${days - 1} days'
      GROUP BY DATE(o.created_at)
    )
    SELECT TO_CHAR(days.d, 'YYYY-MM-DD') AS date,
           COALESCE(sales.amt, 0)::numeric AS total_sales
    FROM days
    LEFT JOIN sales ON sales.d = days.d
    ORDER BY days.d;
  `;
  const { rows } = await db.query(sql);
  return rows;
}

export async function renderAdminDashboard(req, res) {
  try {
    const salesRange = parseRange(req.query.range);

    // === Summary cards (unchanged) ===
    const [{ rows: salesRows }, { rows: orderRows }, { rows: usersRows }] =
      await Promise.all([
        db.query(`
          SELECT COALESCE(SUM(total_amount), 0) AS total_sales
          FROM orders WHERE LOWER(order_status) IN (${COMPLETED_STATUSES.map(s=>`'${s}'`).join(",")})
        `),
        db.query(`SELECT COUNT(*)::int AS total_orders FROM orders`),
        db.query(`SELECT COUNT(*)::int AS active_users FROM users WHERE is_suspended = false`)
      ]);

    const totalSales   = Number(salesRows[0]?.total_sales || 0);
    const totalOrders  = Number(orderRows[0]?.total_orders || 0);
    const totalRevenue = totalSales;
    const activeUsers  = Number(usersRows[0]?.active_users || 0);

    // === Recent orders ===
    const recentOrders = await db.query(`
      SELECT o.id AS order_id, o.created_at, o.total_amount, o.order_status,
             u.name AS customer_name, p.name AS product_name
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant pv ON pv.id = oi.product_variant_id
      JOIN products p ON p.id = pv.product_id
      JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    // === Sales overview for selected range ===
    const salesOverview = await querySalesOverview(salesRange);

    // === Top products (90 days) ===
    const topProducts = await db.query(`
      SELECT p.id, p.name, SUM(oi.quantity)::int AS units_sold
      FROM order_items oi
      JOIN product_variant pv ON pv.id = oi.product_variant_id
      JOIN products p ON p.id = pv.product_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= NOW() - INTERVAL '90 days'
        AND LOWER(o.order_status) IN (${COMPLETED_STATUSES.map(s=>`'${s}'`).join(",")})
      GROUP BY p.id, p.name
      ORDER BY units_sold DESC
      LIMIT 6
    `);

    // === Visitors (30 days) ===
    let visitors30 = await db.query(`
      SELECT TO_CHAR(view_date,'YYYY-MM-DD') AS date,
             COALESCE(views,0)::int AS views,
             COALESCE(uniques,0)::int AS uniques
      FROM site_daily_views
      WHERE view_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY view_date
    `);
    if (visitors30.rows.length === 0) {
      visitors30 = await db.query(`
        SELECT TO_CHAR(DATE(first_seen),'YYYY-MM-DD') AS date,
               COUNT(*)::int AS views,
               COUNT(*)::int AS uniques
        FROM site_visitors
        WHERE first_seen >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(first_seen)
        ORDER BY DATE(first_seen)
      `);
    }

    res.render("admin/adminDashboard", {
      totalSales,
      totalOrders,
      totalRevenue,
      activeUsers,
      recentOrders: recentOrders.rows,
      salesOverview,
      topProducts: topProducts.rows,
      visitors30: visitors30.rows,
      salesRange // pass current range to highlight active button
    });
  } catch (err) {
    console.error("Dashboard Error:", err);
    res.status(500).send("Error loading admin dashboard.");
  }
}

// JSON endpoint used by the buttons to swap the chart without reloading page
export async function getSalesOverviewJson(req, res) {
  try {
    const days = parseRange(req.query.range);
    const rows = await querySalesOverview(days);
    res.json({ range: days, rows });
  } catch (e) {
    console.error("Sales JSON error:", e);
    res.status(500).json({ error: "Failed to load sales data" });
  }
}
