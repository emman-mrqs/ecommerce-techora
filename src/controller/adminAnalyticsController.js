// src/controller/adminAnalyticsController.js
import db from "../database/db.js";

const RENT_PCT = 0.05;
const TXN_PCT  = 0.02;
const num = (v) => Number(v ?? 0);

export const renderAdminAnalytics = async (req, res) => {
  try {
    // ----- Sales (unchanged)
    const { rows: sales30 } = await db.query(`
      SELECT
        DATE_TRUNC('day', o.created_at)::date AS d,
        COUNT(DISTINCT o.id)                  AS orders,
        COALESCE(SUM(oi.quantity),0)          AS units,
        COALESCE(SUM(oi.unit_price * oi.quantity),0)::numeric(12,2) AS revenue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `);

    const { rows: monthTotal } = await db.query(`
      SELECT
        COALESCE(SUM(oi.unit_price * oi.quantity),0)::numeric(12,2) AS gross,
        COUNT(DISTINCT o.id) AS orders,
        COALESCE(SUM(oi.quantity),0) AS units
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.created_at >= DATE_TRUNC('month', NOW())
    `);

    // ----- Per-seller (unchanged)
    const { rows: perSeller } = await db.query(`
      SELECT
        s.id   AS seller_id,
        s.store_name,
        COUNT(DISTINCT o.id) AS orders,
        COALESCE(SUM(oi.quantity),0) AS units,
        COALESCE(SUM(oi.unit_price * oi.quantity),0)::numeric(12,2) AS revenue
      FROM sellers s
      JOIN products p         ON p.seller_id = s.id
      JOIN product_variant v  ON v.product_id = p.id
      JOIN order_items oi     ON oi.product_variant_id = v.id
      JOIN orders o           ON o.id = oi.order_id
      WHERE o.created_at >= DATE_TRUNC('month', NOW())
      GROUP BY s.id, s.store_name
      ORDER BY revenue DESC, s.store_name ASC
    `);

    // Per-seller daily orders (last 30 days) for sparklines
const { rows: sellerTrends } = await db.query(`
  SELECT s.id AS seller_id,
         DATE_TRUNC('day', o.created_at)::date AS d,
         COUNT(DISTINCT o.id) AS orders
  FROM sellers s
  JOIN products p         ON p.seller_id = s.id
  JOIN product_variant v  ON v.product_id = p.id
  JOIN order_items oi     ON oi.product_variant_id = v.id
  JOIN orders o           ON o.id = oi.order_id
  WHERE o.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY s.id, d
  ORDER BY s.id, d
`);

// Pack into { [seller_id]: [{ d, orders }, ...] }
const trendsBySeller = {};
for (const r of sellerTrends) {
  const k = String(r.seller_id);
  (trendsBySeller[k] ||= []).push({ d: r.d, orders: Number(r.orders) });
}


    // ----- Top products / sellers (unchanged)
    const { rows: topProducts } = await db.query(`
      SELECT
        p.name AS product_name,
        s.store_name,
        COALESCE(SUM(oi.quantity),0) AS units,
        COALESCE(SUM(oi.unit_price * oi.quantity),0)::numeric(12,2) AS revenue
      FROM order_items oi
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p        ON p.id = v.product_id
      JOIN sellers  s        ON s.id = p.seller_id
      JOIN orders   o        ON o.id = oi.order_id
      WHERE o.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY p.name, s.store_name
      ORDER BY revenue DESC
      LIMIT 10
    `);

    const { rows: topSellers } = await db.query(`
      SELECT
        s.store_name,
        COUNT(DISTINCT o.id) AS orders,
        COALESCE(SUM(oi.unit_price * oi.quantity),0)::numeric(12,2) AS revenue
      FROM sellers s
      JOIN products p         ON p.seller_id = s.id
      JOIN product_variant v  ON v.product_id = p.id
      JOIN order_items oi     ON oi.product_variant_id = v.id
      JOIN orders o           ON o.id = oi.order_id
      WHERE o.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY s.store_name
      ORDER BY revenue DESC
      LIMIT 10
    `);

    // ----- Auth provider breakdown (unchanged)
    const { rows: authRows } = await db.query(`
      SELECT auth_provider, COUNT(*)::int AS c
      FROM users
      GROUP BY auth_provider
    `);
    let authBreakdown = { google: 0, local: 0, other: 0 };
    for (const r of authRows) {
      const key = (r.auth_provider || 'other').toLowerCase();
      if (key === 'google') authBreakdown.google += r.c;
      else if (key === 'local') authBreakdown.local += r.c;
      else authBreakdown.other += r.c;
    }

    // ===== ENGAGEMENT =====
    // (A) Website views (time series + total)
    const { rows: siteViews } = await db.query(`
    SELECT view_date::date AS d, views::int, uniques::int
    FROM site_daily_views
    WHERE view_date >= (CURRENT_DATE - INTERVAL '29 days')::date
    ORDER BY d;
    `);

    const { rows: siteTot } = await db.query(`
      SELECT COALESCE(SUM(views),0)::int AS total
      FROM site_daily_views
      WHERE view_date >= (CURRENT_DATE - INTERVAL '29 days')::date
    `);

    // (B) Store views (aggregate across all sellers by day + total)
    const { rows: storeViews } = await db.query(`
      SELECT view_date::date AS d, SUM(views)::int AS views
      FROM store_daily_views
      WHERE view_date >= (CURRENT_DATE - INTERVAL '29 days')::date
      GROUP BY 1
      ORDER BY 1
    `);
    const { rows: storeTot } = await db.query(`
      SELECT COALESCE(SUM(views),0)::int AS total
      FROM store_daily_views
      WHERE view_date >= (CURRENT_DATE - INTERVAL '29 days')::date
    `);

    // (C) Product views (aggregate across all products by day + total)
    const { rows: productViews } = await db.query(`
      SELECT view_date::date AS d, SUM(views)::int AS views
      FROM product_daily_views
      WHERE view_date >= (CURRENT_DATE - INTERVAL '29 days')::date
      GROUP BY 1
      ORDER BY 1
    `);
    const { rows: productTot } = await db.query(`
      SELECT COALESCE(SUM(views),0)::int AS total
      FROM product_daily_views
      WHERE view_date >= (CURRENT_DATE - INTERVAL '29 days')::date
    `);

    // Optional fallback if daily tables are empty (uses lifetime counters)
    const engagementTotals = {
      site:    num(siteTot[0]?.total),
      store:   num(storeTot[0]?.total),
      product: num(productTot[0]?.total),
    };

    if (!engagementTotals.site) {
      const { rows } = await db.query(`SELECT COALESCE(SUM(views_total),0)::int AS t FROM store_stats`);
      engagementTotals.store ||= num(rows[0]?.t);
    }
    if (!engagementTotals.product) {
      const { rows } = await db.query(`SELECT COALESCE(SUM(views_total),0)::int AS t FROM product_stats`);
      engagementTotals.product ||= num(rows[0]?.t);
    }

    // ----- admin earnings
    const gross    = num(monthTotal[0]?.gross);
    const rentFee  = gross * RENT_PCT;
    const txnFees  = gross * TXN_PCT;
    const adminRev = rentFee + txnFees;

    const sellers = perSeller.map(s => ({
      ...s,
      revenue: num(s.revenue),
      rent_fee:  num(s.revenue) * RENT_PCT,
      txn_fee:   num(s.revenue) * TXN_PCT,
      admin_take: num(s.revenue) * (RENT_PCT + TXN_PCT)
    }));

    res.render("admin/adminAnalytics", {
      kpi: { gross,
             orders: num(monthTotal[0]?.orders),
             units:  num(monthTotal[0]?.units),
             rentFee, txnFees, adminRev },
             

      dailySales: sales30,

      // engagement series
      siteViews,          // [{d,views}]
      storeViews,         // [{d,views}]
      productViews,       // [{d,views}]
      engagementTotals,   // {site, store, product}

      // auth
      authBreakdown,

      // tables
      topProducts,
      topSellers,
      sellers,
      trendsBySeller
    });
  } catch (err) {
    console.error("renderAdminAnalytics error:", err);
    res.status(500).send("Error loading analytics");
  }
};
