// src/controller/adminEarningsController.js
import db from "../database/db.js";

/**
 * GET /admin/earnings
 * Admin earnings view: per-seller lines, per-seller month summaries, and top KPIs
 */
export const renderAdminEarnings = async (req, res) => {
  try {
    // -------------- Line items (all time) --------------
    // Each order_item counted when the order is completed/delivered
    const linesRes = await db.query(`
      SELECT
        s.id                            AS seller_id,
        s.store_name                    AS store_name,
        o.id                            AS order_id,
        o.created_at                    AS order_date,
        p.name                          AS product_name,
        oi.unit_price::numeric          AS unit_price,
        oi.quantity::int                AS quantity,
        (oi.unit_price * oi.quantity)::numeric AS line_total
      FROM order_items oi
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p        ON p.id = v.product_id
      JOIN sellers s         ON s.id = p.seller_id
      JOIN orders  o         ON o.id = oi.order_id
      WHERE LOWER(o.order_status) IN ('completed','delivered')
      ORDER BY s.store_name ASC, o.created_at DESC, o.id DESC
    `);

    // Group lines by seller
    const bySeller = new Map();
    for (const r of linesRes.rows) {
      if (!bySeller.has(r.seller_id)) {
        bySeller.set(r.seller_id, {
          seller_id: r.seller_id,
          store_name: r.store_name,
          lines: [],
          stats: { units: 0, transactions: new Set(), gross: 0 }
        });
      }
      const s = bySeller.get(r.seller_id);
      s.lines.push({
        product_name: r.product_name,
        unit_price: Number(r.unit_price),
        quantity: Number(r.quantity),
        line_total: Number(r.line_total),
        order_id: r.order_id,
        order_date: r.order_date
      });
      s.stats.units += Number(r.quantity);
      s.stats.transactions.add(r.order_id);
      s.stats.gross += Number(r.line_total);
    }

    // -------------- Per-seller monthly summary (last 12 months) --------------
    const monthAggRes = await db.query(`
      SELECT
        s.id AS seller_id,
        date_trunc('month', o.created_at)::date AS month,
        COUNT(DISTINCT o.id)                    AS orders,
        SUM(oi.quantity)::int                   AS units,
        SUM(oi.unit_price * oi.quantity)::numeric AS gross
      FROM order_items oi
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p        ON p.id = v.product_id
      JOIN sellers s         ON s.id = p.seller_id
      JOIN orders  o         ON o.id = oi.order_id
      WHERE LOWER(o.order_status) IN ('completed','delivered')
        AND o.created_at >= (date_trunc('month', NOW()) - INTERVAL '11 months')
      GROUP BY s.id, date_trunc('month', o.created_at)
      ORDER BY s.id ASC, month DESC
    `);

    // attach month summaries to sellers
    for (const r of monthAggRes.rows) {
      const seller = bySeller.get(r.seller_id);
      if (!seller) continue;
      if (!seller.months) seller.months = [];
      const gross = Number(r.gross || 0);
      const rent  = +(gross * 0.05).toFixed(2);
      const txn   = +(gross * 0.02).toFixed(2);
      seller.months.push({
        month: r.month, // a Date
        orders: Number(r.orders || 0),
        units: Number(r.units || 0),
        gross,
        rent,
        txn,
        admin: +(rent + txn).toFixed(2),
      });
    }

    // -------------- KPIs (current month, all sellers) --------------
    const kpiRes = await db.query(`
      SELECT
        COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric AS gross
      FROM order_items oi
      JOIN product_variant v ON v.id = oi.product_variant_id
      JOIN products p        ON p.id = v.product_id
      JOIN sellers s         ON s.id = p.seller_id
      JOIN orders  o         ON o.id = oi.order_id
      WHERE LOWER(o.order_status) IN ('completed','delivered')
        AND o.created_at >= date_trunc('month', NOW())
        AND o.created_at <  (date_trunc('month', NOW()) + INTERVAL '1 month')
    `);

    const totalGross = Number(kpiRes.rows[0]?.gross || 0);
    const kpis = {
      total_sales: totalGross,
      rent_fee: +(totalGross * 0.05).toFixed(2),
      txn_fee: +(totalGross * 0.02).toFixed(2),
    };
    kpis.admin_earn = +(kpis.rent_fee + kpis.txn_fee).toFixed(2);

    // -------------- final data structure --------------
    const sellers = Array.from(bySeller.values()).map(s => {
      // mini stats: average sale (gross / transactions)
      const transactions = s.stats.transactions.size;
      const avg = transactions ? s.stats.gross / transactions : 0;
      return {
        seller_id: s.seller_id,
        store_name: s.store_name,
        lines: s.lines,            // detailed line items
        months: s.months || [],    // monthly summaries
        mini: {
          units: s.stats.units,
          avgSale: +avg.toFixed(2),
          transactions
        }
      };
    });

    res.render("admin/adminEarnings", {
      activePage: "earnings",
      pageTitle: "Earnings",
      kpis,
      sellers
    });
  } catch (err) {
    console.error("Error rendering admin earnings:", err);
    res.status(500).send("Error loading earnings");
  }
};
