// src/controller/sellerEarningsController.js
import db from "../database/db.js";

const TXN_FEE_RATE = 0.02;  // 2% per sale line
const RENT_FEE_RATE = 0.05; // 5% of monthly gross sales
const MONTHS_HISTORY = 6;   // how many months to show in history

export async function renderSellerEarnings(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.redirect("/login");
    }

    // Resolve seller
    const { rows: srows } = await db.query(
      "SELECT id FROM sellers WHERE user_id = $1 AND status = 'approved' LIMIT 1",
      [userId]
    );
    if (!srows.length) {
      return res.redirect("/seller-application");
    }
    const sellerId = srows[0].id;

    // Current month window
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // ---------- Monthly breakdown (line-level) ----------
    const { rows: breakdownRows } = await db.query(
      `
      SELECT
          o.id                             AS order_id,
          o.created_at::date               AS order_date,
          p.name                           AS product_name,
          oi.unit_price                    AS unit_price,
          oi.quantity                      AS quantity,
          (oi.unit_price * oi.quantity)    AS line_total
      FROM order_items oi
      JOIN orders o           ON o.id = oi.order_id
      JOIN product_variant v  ON v.id = oi.product_variant_id
      JOIN products p         ON p.id = v.product_id
      WHERE p.seller_id = $1
        AND o.created_at >= $2 AND o.created_at < $3
        AND o.order_status IN ('completed','delivered')  -- adjust if you use other "finalized" states
      ORDER BY o.created_at DESC, oi.id DESC
      `,
      [sellerId, monthStart, nextMonthStart]
    );

    // Compute per-line fees & net
    const breakdown = breakdownRows.map(r => {
      const lineTotal = Number(r.line_total || 0);
      const txnFee   = +(lineTotal * TXN_FEE_RATE).toFixed(2);
      const lineNet  = +(lineTotal - txnFee).toFixed(2);
      return {
        product_name: r.product_name,
        unit_price: +Number(r.unit_price || 0).toFixed(2),
        quantity: Number(r.quantity || 0),
        line_total: +lineTotal.toFixed(2),
        txn_fee: txnFee,
        line_net: lineNet,
        order_date: r.order_date
      };
    });

    // Monthly aggregates
    const grossSales = breakdown.reduce((s, r) => s + r.line_total, 0);
    const txnFees    = breakdown.reduce((s, r) => s + r.txn_fee, 0);
    const rentFee    = +(grossSales * RENT_FEE_RATE).toFixed(2);
    const netEarning = +(grossSales - rentFee - txnFees).toFixed(2);

    // Summary stats
    const unitsSold  = breakdown.reduce((s, r) => s + r.quantity, 0);
    // Count distinct finalized orders in month
    const { rows: orderCountRows } = await db.query(
      `
      SELECT COUNT(DISTINCT o.id) AS cnt
      FROM order_items oi
      JOIN orders o          ON o.id = oi.order_id
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p        ON p.id = v.product_id
      WHERE p.seller_id = $1
        AND o.created_at >= $2 AND o.created_at < $3
        AND o.order_status IN ('completed','delivered')
      `,
      [sellerId, monthStart, nextMonthStart]
    );
    const transactions = Number(orderCountRows[0]?.cnt || 0);
    const avgSaleValue = transactions ? +(grossSales / transactions).toFixed(2) : 0;

    // ---------- History (past MONTHS_HISTORY months, inclusive of current) ----------
    const historyStart = new Date(now.getFullYear(), now.getMonth() - (MONTHS_HISTORY - 1), 1);

    const { rows: histRows } = await db.query(
      `
      SELECT
        date_trunc('month', o.created_at)::date AS month,
        COUNT(DISTINCT o.id)                    AS orders,
        SUM(oi.quantity)                        AS units,
        SUM(oi.unit_price * oi.quantity)        AS gross_sales
      FROM order_items oi
      JOIN orders o          ON o.id = oi.order_id
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p        ON p.id = v.product_id
      WHERE p.seller_id = $1
        AND o.created_at >= $2
        AND o.order_status IN ('completed','delivered')
      GROUP BY 1
      ORDER BY 1 DESC
      `,
      [sellerId, historyStart]
    );

    const history = histRows.map(r => {
      const gs = Number(r.gross_sales || 0);
      const rf = +(gs * RENT_FEE_RATE).toFixed(2);
      const tf = +(gs * TXN_FEE_RATE).toFixed(2);
      const net = +(gs - rf - tf).toFixed(2);
      return {
        month: r.month,                   // a Date
        orders: Number(r.orders || 0),
        units: Number(r.units || 0),
        gross_sales: +gs.toFixed(2),
        rent_fee: rf,
        txn_fees: tf,
        net_earning: net
      };
    });

    res.render("seller/sellerEarnings", {
      activePage: "earnings",
      pageTitle: "Seller Earnings",
      monthNow: {
        grossSales: +grossSales.toFixed(2),
        rentFee,
        txnFees: +txnFees.toFixed(2),
        netEarning
      },
      breakdown,
      summary: {
        unitsSold,
        avgSaleValue,
        transactions
      },
      history
    });
  } catch (err) {
    console.error("renderSellerEarnings error:", err);
    res.status(500).send("Server error");
  }
}
