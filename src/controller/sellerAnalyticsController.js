// src/controller/sellerAnalyticsController.js
import db from "../database/db.js";

/* ---------- helpers ---------- */
async function safeQuery(sql, params = []) {
  try {
    const { rows } = await db.query(sql, params);
    return rows || [];
  } catch (_) {
    return [];
  }
}

// create a 30-day (or N-day) series and fill missing dates with 0
function fillDailySeries(rows, key = "day", valKey = "views", daysBack = 30) {
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - (daysBack - 1));

  const map = new Map(
    rows.map(r => [new Date(r[key]).toISOString().slice(0, 10), Number(r[valKey] || 0)])
  );

  const out = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    out.push({ day: iso, views: map.get(iso) ?? 0 });
  }
  return out;
}

export async function renderSellerAnalytics(req, res) {
  if (!req.session?.user?.id) {
    return res.send("<script>alert('You need to login first!'); window.location='/login-verify';</script>");
  }
  const userId = req.session.user.id;

  try {
    // 1) resolve seller
    const s = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (!s.rows.length) return res.redirect("/seller-application");
    const sellerId = s.rows[0].id;

    const orderStatusFilter = `o.order_status IN ('completed','delivered')`;

    // 2) daily sales (last 30 days)
    const dailySales = await safeQuery(
      `
      SELECT
        DATE_TRUNC('day', o.created_at)::date AS day,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0)::numeric(12,2) AS revenue,
        COUNT(DISTINCT o.id) AS orders,
        COALESCE(SUM(oi.quantity), 0) AS units
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p ON p.id = v.product_id
      WHERE p.seller_id = $1
        AND ${orderStatusFilter}
        AND o.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      [sellerId]
    );

    // 3) weekly sales (last 12 weeks)
    const weeklySales = await safeQuery(
      `
      SELECT
        DATE_TRUNC('week', o.created_at)::date AS week,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0)::numeric(12,2) AS revenue,
        COUNT(DISTINCT o.id) AS orders,
        COALESCE(SUM(oi.quantity), 0) AS units
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p ON p.id = v.product_id
      WHERE p.seller_id = $1
        AND ${orderStatusFilter}
        AND o.created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      [sellerId]
    );

    // 4) top products (last 30 days)
    const topProducts = await safeQuery(
      `
      SELECT
        p.name AS product_name,
        COALESCE(SUM(oi.quantity),0) AS units,
        COALESCE(SUM(oi.quantity * oi.unit_price),0)::numeric(12,2) AS revenue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p ON p.id = v.product_id
      WHERE p.seller_id = $1
        AND ${orderStatusFilter}
        AND o.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY p.name
      ORDER BY revenue DESC
      LIMIT 10
      `,
      [sellerId]
    );

    // 5) transactions (last 30 days)
    const transactions = await safeQuery(
      `
      SELECT COUNT(DISTINCT pay.id) AS completed_payments
      FROM payments pay
      JOIN orders o ON o.id = pay.order_id
      WHERE pay.payment_status = 'completed'
        AND EXISTS (
          SELECT 1
          FROM order_items oi
          JOIN product_variant v ON v.id = oi.product_variant_id
          JOIN products p ON p.id = v.product_id
          WHERE oi.order_id = o.id
            AND p.seller_id = $1
        )
        AND pay.payment_date >= NOW() - INTERVAL '30 days'
      `,
      [sellerId]
    );

    /* 6) VIEWS — now from rollups that already enforce the 30-minute dedupe
          - store_daily_views(seller_id, view_date, views)
          - product_daily_views(product_id, view_date, views)
    */
    const rawStoreViews = await safeQuery(
      `
      SELECT view_date::date AS day, SUM(views)::int AS views
      FROM store_daily_views
      WHERE seller_id = $1
        AND view_date >= CURRENT_DATE - INTERVAL '29 days'
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      [sellerId]
    );

    const rawProductViews = await safeQuery(
      `
      SELECT pv.view_date::date AS day, SUM(pv.views)::int AS views
      FROM product_daily_views pv
      JOIN products p ON p.id = pv.product_id
      WHERE p.seller_id = $1
        AND pv.view_date >= CURRENT_DATE - INTERVAL '29 days'
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      [sellerId]
    );

    // pad to full 30-day series (charts & rings expect arrays)
    const storeViewsDaily  = fillDailySeries(rawStoreViews,  "day", "views", 30);
    const productViewsDaily = fillDailySeries(rawProductViews, "day", "views", 30);

    // 7) headline cards (this month)
    const monthNowRows = await safeQuery(
      `
      WITH seller_sales AS (
        SELECT COALESCE(SUM(oi.quantity * oi.unit_price),0)::numeric(12,2) AS gross
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN product_variant v ON v.id = oi.product_variant_id
        JOIN products p ON p.id = v.product_id
        WHERE p.seller_id = $1
          AND ${orderStatusFilter}
          AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NOW())
      )
      SELECT
        gross AS "grossSales",
        (gross * 0.05)::numeric(12,2) AS "rentFee",
        (gross * 0.02)::numeric(12,2) AS "txnFees",
        (gross - (gross * 0.05) - (gross * 0.02))::numeric(12,2) AS "netEarning"
      FROM seller_sales
      `,
      [sellerId]
    );
    const monthNow = monthNowRows[0] || { grossSales: 0, rentFee: 0, txnFees: 0, netEarning: 0 };

    // 8) summary (last 30 days)
    const summaryRows = await safeQuery(
      `
      SELECT
        COALESCE(SUM(oi.quantity),0)::int AS "unitsSold",
        COALESCE(AVG(oi.unit_price * oi.quantity),0)::numeric(12,2) AS "avgSaleValue",
        COUNT(DISTINCT o.id)::int AS "transactions"
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p ON p.id = v.product_id
      WHERE p.seller_id = $1
        AND ${orderStatusFilter}
        AND o.created_at >= NOW() - INTERVAL '30 days'
      `,
      [sellerId]
    );
    const summary = summaryRows[0] || { unitsSold: 0, avgSaleValue: 0, transactions: 0 };

    res.render("seller/sellerAnalytics", {
      activePage: "analytics",
      pageTitle: "Store Analytics",
      dailySales,
      weeklySales,
      topProducts,
      transactionsCount: Number(transactions[0]?.completed_payments || 0),
      // engagement series (30-min dedupe already applied by rollup tables)
      storeViewsDaily,
      productViewsDaily,
      monthNow,
      summary
    });
  } catch (err) {
    console.error("renderSellerAnalytics error:", err);
    res.status(500).send("Something went wrong while loading analytics");
  }
}
