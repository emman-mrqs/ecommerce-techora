// src/controller/sellerDashboardController.js
import db from "../database/db.js";

/* ---------- helpers ---------- */
async function q(sql, params = []) {
  const { rows } = await db.query(sql, params);
  return rows;
}

// pad 30-day series so charts don't have gaps
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

function pctChange(cur, prev) {
  const p = Number(prev || 0);
  if (p <= 0) return 100; // define as +100% when there was no previous
  return ((Number(cur || 0) - p) / p) * 100;
}

export async function renderSellerDashboard(req, res) {
  if (!req.session?.user?.id) {
    return res.send("<script>alert('You need to login first!'); window.location='/login-verify';</script>");
  }
  const userId = req.session.user.id;

  try {
    // Resolve seller
    const rs = await q(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (!rs.length) return res.redirect("/seller-application");
    const sellerId = rs[0].id;

    // Month boundaries
    const monthStart = `DATE_TRUNC('month', NOW())`;
    const prevMonthStart = `DATE_TRUNC('month', NOW()) - INTERVAL '1 month'`;
    const nextMonthStart = `DATE_TRUNC('month', NOW()) + INTERVAL '1 month'`;

    const orderStatusFilter = `o.order_status IN ('completed','delivered')`;

    /* --- Earnings (gross) this vs last month --- */
    const earnRows = await q(
      `
      WITH this_month AS (
        SELECT COALESCE(SUM(oi.quantity * oi.unit_price),0)::numeric(14,2) AS amt
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN product_variant v ON v.id = oi.product_variant_id
        JOIN products p ON p.id = v.product_id
        WHERE p.seller_id = $1 AND ${orderStatusFilter}
          AND o.created_at >= ${monthStart} AND o.created_at < ${nextMonthStart}
      ),
      last_month AS (
        SELECT COALESCE(SUM(oi.quantity * oi.unit_price),0)::numeric(14,2) AS amt
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN product_variant v ON v.id = oi.product_variant_id
        JOIN products p ON p.id = v.product_id
        WHERE p.seller_id = $1 AND ${orderStatusFilter}
          AND o.created_at >= ${prevMonthStart} AND o.created_at < ${monthStart}
      )
      SELECT (SELECT amt FROM this_month) AS cur,
             (SELECT amt FROM last_month) AS prev
      `,
      [sellerId]
    );
    const earningsCur = Number(earnRows[0]?.cur || 0);
    const earningsPrev = Number(earnRows[0]?.prev || 0);

    /* --- Orders total + month over month --- */
    const ordersTotals = await q(
      `
      SELECT
        (SELECT COUNT(DISTINCT o.id)
         FROM orders o
         WHERE EXISTS (
           SELECT 1 FROM order_items oi
           JOIN product_variant v ON v.id = oi.product_variant_id
           JOIN products p ON p.id = v.product_id
           WHERE oi.order_id = o.id AND p.seller_id = $1
         )) AS total_orders,

        (SELECT COUNT(DISTINCT o.id)
         FROM orders o
         WHERE EXISTS (
           SELECT 1 FROM order_items oi
           JOIN product_variant v ON v.id = oi.product_variant_id
           JOIN products p ON p.id = v.product_id
           WHERE oi.order_id = o.id AND p.seller_id = $1
         ) AND o.created_at >= ${monthStart} AND o.created_at < ${nextMonthStart}) AS cur_orders,

        (SELECT COUNT(DISTINCT o.id)
         FROM orders o
         WHERE EXISTS (
           SELECT 1 FROM order_items oi
           JOIN product_variant v ON v.id = oi.product_variant_id
           JOIN products p ON p.id = v.product_id
           WHERE oi.order_id = o.id AND p.seller_id = $1
         ) AND o.created_at >= ${prevMonthStart} AND o.created_at < ${monthStart}) AS prev_orders
      `,
      [sellerId]
    );
    const totalOrders = Number(ordersTotals[0]?.total_orders || 0);
    const ordersCur = Number(ordersTotals[0]?.cur_orders || 0);
    const ordersPrev = Number(ordersTotals[0]?.prev_orders || 0);

    /* --- Products count & last-month baseline --- */
    const prodRows = await q(
      `
      SELECT
        (SELECT COUNT(*) FROM products WHERE seller_id = $1) AS cur_count,
        (SELECT COUNT(*) FROM products
         WHERE seller_id = $1 AND created_at < ${monthStart}) AS last_month_count
      `,
      [sellerId]
    );
    const productsCur = Number(prodRows[0]?.cur_count || 0);
    const productsPrev = Number(prodRows[0]?.last_month_count || 0);

    /* --- Pending orders (define your statuses here) --- */
    const pendingRows = await q(
      `
      SELECT
        (SELECT COUNT(DISTINCT o.id) FROM orders o
         WHERE EXISTS (
           SELECT 1 FROM order_items oi
           JOIN product_variant v ON v.id = oi.product_variant_id
           JOIN products p ON p.id = v.product_id
           WHERE oi.order_id = o.id AND p.seller_id = $1
         ) AND o.order_status IN ('pending','processing','to_ship')
           AND o.created_at >= ${monthStart} AND o.created_at < ${nextMonthStart}) AS cur_pending,

        (SELECT COUNT(DISTINCT o.id) FROM orders o
         WHERE EXISTS (
           SELECT 1 FROM order_items oi
           JOIN product_variant v ON v.id = oi.product_variant_id
           JOIN products p ON p.id = v.product_id
           WHERE oi.order_id = o.id AND p.seller_id = $1
         ) AND o.order_status IN ('pending','processing','to_ship')
           AND o.created_at >= ${prevMonthStart} AND o.created_at < ${monthStart}) AS prev_pending
      `,
      [sellerId]
    );
    const pendingCur = Number(pendingRows[0]?.cur_pending || 0);
    const pendingPrev = Number(pendingRows[0]?.prev_pending || 0);

    /* --- Store visits chart (last 30 days) & this-month total --- */
    const rawStoreVisits = await q(
      `
      SELECT view_date::date AS day, SUM(views)::int AS views
      FROM store_daily_views
      WHERE seller_id = $1
        AND view_date >= CURRENT_DATE - INTERVAL '29 days'
      GROUP BY 1 ORDER BY 1 ASC
      `,
      [sellerId]
    );
    const storeVisitsLast30 = fillDailySeries(rawStoreVisits, "day", "views", 30);

    const storeVisitsThisMonthRow = await q(
      `
      SELECT COALESCE(SUM(views),0)::int AS cnt
      FROM store_daily_views
      WHERE seller_id = $1
        AND view_date >= DATE_TRUNC('month', NOW())
        AND view_date < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
      `,
      [sellerId]
    );
    const storeVisitsThisMonth = Number(storeVisitsThisMonthRow[0]?.cnt || 0);

    /* --- Store visits by month (last 12 months) --- */
    const visitsByMonth = await q(
      `
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        ) AS m
      )
      SELECT
        m.m::date                         AS month_date,
        to_char(m.m, 'Mon')               AS label,          -- e.g., Jan
        to_char(m.m, 'YYYY-MM')           AS key_ym,         -- e.g., 2025-09
        COALESCE(SUM(sdv.views), 0)::int  AS views
      FROM months m
      LEFT JOIN store_daily_views sdv
        ON sdv.seller_id = $1
       AND date_trunc('month', sdv.view_date) = m.m
      GROUP BY 1,2,3
      ORDER BY 1
      `,
      [sellerId]
    );

    /* --- Product views top (this month) --- */
    const topViewed = await q(
      `
      SELECT p.name, SUM(pdv.views)::int AS views
      FROM product_daily_views pdv
      JOIN products p ON p.id = pdv.product_id
      WHERE p.seller_id = $1
        AND pdv.view_date >= ${monthStart} AND pdv.view_date < ${nextMonthStart}
      GROUP BY p.name
      ORDER BY views DESC
      LIMIT 10
      `,
      [sellerId]
    );
    const totalProductViewsThisMonth =
      topViewed.reduce((s, r) => s + Number(r.views || 0), 0);

    /* --- Recent orders (5) --- */
    const recentOrders = await q(
      `
      SELECT
        o.id,
        o.created_at::date AS date,
        o.order_status,
        u.name AS customer,
        COALESCE((
          SELECT MIN(p.name)
          FROM order_items oi
          JOIN product_variant v ON v.id = oi.product_variant_id
          JOIN products p ON p.id = v.product_id
          WHERE oi.order_id = o.id AND p.seller_id = $1
        ), '—') AS product_name
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE EXISTS (
        SELECT 1 FROM order_items oi
        JOIN product_variant v ON v.id = oi.product_variant_id
        JOIN products p ON p.id = v.product_id
        WHERE oi.order_id = o.id AND p.seller_id = $1
      )
      ORDER BY o.created_at DESC
      LIMIT 5
      `,
      [sellerId]
    );

    /* --- Recent activity (last 30 mixed events) --- */
    const recentActivity = await q(
      `
      WITH seller_products AS (
        SELECT id FROM products WHERE seller_id = $1
      )

      /* A) New orders for this seller */
      SELECT
        'order' AS type,
        o.id::text AS ref_id,
        'New order' AS title,
        u.name AS meta1,
        o.order_status AS meta2,
        COALESCE((
          SELECT SUM(oi.quantity)
          FROM order_items oi
          JOIN product_variant v ON v.id = oi.product_variant_id
          WHERE oi.order_id = o.id AND v.product_id IN (SELECT id FROM seller_products)
        ), 0)::int AS qty,
        o.created_at AS ts
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE EXISTS (
        SELECT 1
        FROM order_items oi
        JOIN product_variant v ON v.id = oi.product_variant_id
        JOIN products p ON p.id = v.product_id
        WHERE oi.order_id = o.id AND p.seller_id = $1
      )

      UNION ALL

      /* B) Payment updates for orders of this seller */
      SELECT
        'payment' AS type,
        pay.order_id::text AS ref_id,
        'Payment update' AS title,
        pay.payment_method AS meta1,
        pay.payment_status AS meta2,
        NULL::int AS qty,
        COALESCE(pay.payment_date, NOW()) AS ts
      FROM payments pay
      WHERE pay.order_id IN (
        SELECT o.id FROM orders o WHERE EXISTS (
          SELECT 1 FROM order_items oi
          JOIN product_variant v ON v.id = oi.product_variant_id
          JOIN products p ON p.id = v.product_id
          WHERE oi.order_id = o.id AND p.seller_id = $1
        )
      )

      UNION ALL

      /* C) New product reviews on this seller's products */
      SELECT
        'review' AS type,
        pr.id::text AS ref_id,
        'New review' AS title,
        u.name AS meta1,
        ('★ ' || pr.rating)::text AS meta2,
        NULL::int AS qty,
        pr.created_at AS ts
      FROM product_reviews pr
      JOIN users u ON u.id = pr.user_id
      WHERE pr.product_id IN (SELECT id FROM seller_products)

      UNION ALL

      /* D) New products created by this seller */
      SELECT
        'product' AS type,
        p.id::text AS ref_id,
        'Product added' AS title,
        p.name AS meta1,
        NULL::text AS meta2,
        NULL::int AS qty,
        p.created_at AS ts
      FROM products p
      WHERE p.seller_id = $1

      UNION ALL

      /* E) Promotions created/updated by this seller */
      SELECT
        'promotion' AS type,
        promo.id::text AS ref_id,
        'Promotion updated' AS title,
        promo.voucher_code AS meta1,
        promo.status AS meta2,
        NULL::int AS qty,
        COALESCE(promo.updated_at, promo.created_at) AS ts
      FROM promotions promo
      WHERE promo.seller_id = $1

      ORDER BY ts DESC
      LIMIT 30
      `,
      [sellerId]
    );

    // computed deltas
    const stats = {
      earnings: {
        current: earningsCur,
        previous: earningsPrev,
        deltaPct: pctChange(earningsCur, earningsPrev),
      },
      orders: {
        total: totalOrders,
        current: ordersCur,
        previous: ordersPrev,
        deltaPct: pctChange(ordersCur, ordersPrev),
      },
      products: {
        total: productsCur,
        previousTotal: productsPrev,
        deltaPct: pctChange(productsCur, productsPrev),
      },
      pending: {
        current: pendingCur,
        previous: pendingPrev,
        deltaPct: pctChange(pendingCur, pendingPrev),
      },
      storeVisitsThisMonth,
      totalProductViewsThisMonth,
    };

    res.render("seller/sellerDashboard", {
      activePage: "overview",
      pageTitle: "Seller Dashboard",
      stats,
      topViewed,                 // [{name, views}]
      recentOrders,              // [{id, date, order_status, customer, product_name}]
      storeVisitsLast30,         // [{day:'YYYY-MM-DD', views}]
      visitsByMonth,             // [{month_date, label, key_ym, views}]
      recentActivity             // [{type, ref_id, title, meta1, meta2, qty, ts}]
    });
  } catch (err) {
    console.error("renderSellerDashboard error:", err);
    res.status(500).send("Something went wrong while loading dashboard");
  }
}
