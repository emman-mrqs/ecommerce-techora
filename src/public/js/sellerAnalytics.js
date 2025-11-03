// /public/js/sellerAnalyticsCharts.js

(function () {
  // Helper to parse inline JSON safely
  function readJSON(id) {
    try {
      const el = document.getElementById(id);
      if (!el) return [];
      return JSON.parse(el.textContent || "[]");
    } catch {
      return [];
    }
  }

  // Helpers used by both charts
  const fmtPHP = (n, min = 0, max = 0) =>
    "₱" +
    Number(n || 0).toLocaleString("en-PH", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    });

  /* -------------------------------
   * DAILY SALES — violet area/line
   * ------------------------------- */
  (function drawDailyLine() {
    const data = readJSON("dailySalesData");
    const svg = document.getElementById("daily-line-chart");
    const meta = document.getElementById("daily-line-meta");
    const wrap = document.querySelector(".daily-line-wrap");
    if (!svg) return;

    if (!data || !data.length) {
      if (meta) meta.textContent = "No sales in the last 30 days.";
      return;
    }

    const fmtDate = (iso) => {
      const d = new Date(iso);
      return d.toLocaleDateString("en-PH", { month: "short", day: "2-digit" });
    };

    const W = 900,
      H = 320,
      pad = { top: 30, right: 20, bottom: 40, left: 48 },
      IW = W - pad.left - pad.right,
      IH = H - pad.top - pad.bottom;

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const pts = data.map((d) => ({
      xLabel: fmtDate(d.day || d.date),
      y: Number(d.revenue || 0),
      orders: Number(d.orders || 0),
      units: Number(d.units || 0),
    }));

    const n = pts.length;
    const xStep = n > 1 ? IW / (n - 1) : IW / 2;
    const maxY = Math.max(1, Math.max(...pts.map((p) => p.y)));
    const yScale = (v) => pad.top + IH - (v / maxY) * IH;
    const xScale = (i) => pad.left + (n > 1 ? i * xStep : IW / 2);

    // grid
    const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (IH / 4) * i;
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", pad.left);
      ln.setAttribute("x2", pad.left + IW);
      ln.setAttribute("y1", y);
      ln.setAttribute("y2", y);
      ln.setAttribute("class", "grid-line");
      grid.appendChild(ln);
    }
    svg.appendChild(grid);

    // area
    const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
    let dA = "";
    pts.forEach((p, i) => {
      const x = xScale(i),
        y = yScale(p.y);
      dA += (i ? " L " : "M ") + x + " " + y;
    });
    dA += ` L ${pad.left + IW} ${pad.top + IH} L ${pad.left} ${pad.top + IH} Z`;
    area.setAttribute("d", dA);
    area.setAttribute("class", "area-fill"); // style in your CSS
    svg.appendChild(area);

    // line
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    let dL = "";
    pts.forEach((p, i) => {
      const x = xScale(i),
        y = yScale(p.y);
      dL += (i ? " L " : "M ") + x + " " + y;
    });
    line.setAttribute("d", dL);
    line.setAttribute("class", "series-line"); // style in your CSS
    svg.appendChild(line);

    // x ticks
    const ticks = document.createElementNS("http://www.w3.org/2000/svg", "g");
    pts.forEach((p, i) => {
      const x = xScale(i),
        y = pad.top + IH + 18;
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.textContent = n > 12 && i % 2 ? "" : p.xLabel;
      t.setAttribute("x", x);
      t.setAttribute("y", y);
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("class", "tick");
      ticks.appendChild(t);
    });
    svg.appendChild(ticks);

    // tooltip (HTML) – stays internal, but driven by external JS
    const tip = document.createElement("div");
    tip.className = "line-tip";
    tip.style.opacity = 0;
    (wrap || document.body).appendChild(tip);

    // dots + value labels
    const dots = document.createElementNS("http://www.w3.org/2000/svg", "g");
    pts.forEach((p, i) => {
      const x = xScale(i),
        y = yScale(p.y);
      const c = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      c.setAttribute("cx", x);
      c.setAttribute("cy", y);
      c.setAttribute("r", 6);
      c.setAttribute("class", "dot");

      const lab = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      lab.textContent = fmtPHP(p.y, 2, 2);
      lab.setAttribute("x", x);
      lab.setAttribute("y", y - 12);
      lab.setAttribute("text-anchor", "middle");
      lab.setAttribute("class", "val-label");

      c.addEventListener("mouseenter", () => {
        tip.innerHTML = `${p.xLabel}<br><strong>${fmtPHP(
          p.y,
          2,
          2
        )}</strong><br>Orders: ${p.orders} • Units: ${p.units}`;
        tip.style.left = (x / W) * 100 + "%";
        tip.style.top = (y / H) * 100 + "%";
        tip.style.opacity = 1;
      });
      c.addEventListener("mouseleave", () => (tip.style.opacity = 0));

      dots.appendChild(c);
      dots.appendChild(lab);
    });
    svg.appendChild(dots);

    // footer meta
    const orders = data.reduce((s, d) => s + Number(d.orders || 0), 0);
    const units = data.reduce((s, d) => s + Number(d.units || 0), 0);
    const peak = Math.max(...pts.map((p) => p.y));
    if (meta) {
      meta.innerHTML = `
        <span class="me-3"><i class="far fa-chart-bar me-1"></i>Orders: <strong>${orders}</strong></span>
        <span class="me-3"><i class="fas fa-chart-line me-1"></i>Units: <strong>${units}</strong></span>
        <span><i class="fas fa-bolt me-1"></i>Peak Revenue: <strong>${fmtPHP(peak, 2, 2)}</strong></span>
      `;
    }
  })();

  /* -------------------------------------------
   * WEEKLY SALES — blue columns with axis/labels
   * ------------------------------------------- */
  (function drawWeeklyBars() {
    const data = readJSON("weeklySalesData");
    const svg = document.getElementById("weekly-bar-chart");
    if (!svg || !data || !data.length) return;

    const W = 620,
      H = 300;
    const pad = { top: 16, right: 16, bottom: 42, left: 56 };
    const IW = W - pad.left - pad.right;
    const IH = H - pad.top - pad.bottom;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const fmtWeek = (iso) => {
      const d = new Date(iso);
      return d.toLocaleDateString("en-PH", { month: "short", day: "2-digit" });
    };

    const rows = data.map((r) => ({
      xLabel: fmtWeek(r.week || r.date),
      y: Number(r.revenue || 0),
    }));

    // nice y ticks
    const maxYRaw = Math.max(1, Math.max(...rows.map((r) => r.y)));
    function niceNum(range, round) {
      const exp = Math.floor(Math.log10(range));
      const f = range / Math.pow(10, exp);
      let nf;
      if (round) {
        if (f < 1.5) nf = 1;
        else if (f < 3) nf = 2;
        else if (f < 7) nf = 5;
        else nf = 10;
      } else {
        if (f <= 1) nf = 1;
        else if (f <= 2) nf = 2;
        else if (f <= 5) nf = 5;
        else nf = 10;
      }
      return nf * Math.pow(10, exp);
    }
    const tickCount = 5;
    const step = niceNum(maxYRaw / (tickCount - 1), true);
    const maxY = step * (tickCount - 1);
    const yScale = (v) => pad.top + IH - (v / maxY) * IH;

    // bars sizing & centering
    const n = rows.length;
    const gap = 10;
    const maxBarW = Math.max(34, IW * 0.14);
    const minBarW = 14;
    let barW = Math.max(minBarW, Math.min(maxBarW, (IW - gap * (n - 1)) / n));
    const totalWidth = n * barW + (n - 1) * gap;
    const xStart = pad.left + Math.max(0, (IW - totalWidth) / 2);

    // grid + y labels
    const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
    for (let i = 0; i < tickCount; i++) {
      const value = i * step;
      const y = yScale(value);

      const ln = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );
      ln.setAttribute("x1", pad.left);
      ln.setAttribute("x2", pad.left + IW);
      ln.setAttribute("y1", y);
      ln.setAttribute("y2", y);
      ln.setAttribute("class", "grid-line");
      grid.appendChild(ln);

      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.textContent = value === 0 ? "0" : fmtPHP(value, 0, 0);
      t.setAttribute("x", pad.left - 8);
      t.setAttribute("y", y + 4);
      t.setAttribute("text-anchor", "end");
      t.setAttribute("class", "axis-tick");
      grid.appendChild(t);
    }
    svg.appendChild(grid);

    // bars
    const bars = document.createElementNS("http://www.w3.org/2000/svg", "g");
    rows.forEach((r, i) => {
      const x = xStart + i * (barW + gap);
      const y = yScale(r.y);
      const h = pad.top + IH - y;

      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", Math.max(0, h));
      rect.setAttribute("rx", 4);
      rect.setAttribute("class", "weekly-bar"); // style in your CSS
      bars.appendChild(rect);

      const val = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      val.textContent = fmtPHP(r.y, 0, 0);
      val.setAttribute("x", x + barW / 2);
      val.setAttribute("y", Math.max(pad.top + 12, y - 6));
      val.setAttribute("text-anchor", "middle");
      val.setAttribute("class", "value-label");
      bars.appendChild(val);

      const tick = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      tick.textContent = r.xLabel;
      tick.setAttribute("x", x + barW / 2);
      tick.setAttribute("y", pad.top + IH + 20);
      tick.setAttribute("text-anchor", "middle");
      tick.setAttribute("class", "axis-tick");
      bars.appendChild(tick);
    });
    svg.appendChild(bars);
  })();
})();



/*==================
Modern Analytics Print (Techora-style)
==================*/
(function () {
  function readJSON(id) {
    try {
      const el = document.getElementById(id);
      return el ? JSON.parse(el.textContent || "[]") : [];
    } catch {
      return [];
    }
  }

  const fmtPHP = (n) =>
    "₱" +
    Number(n || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  /* ---------- Table Builders ---------- */
  function section(title, innerHTML) {
    return `
      <section class="report-section">
        <h2>${title}</h2>
        ${innerHTML}
      </section>
    `;
  }

  function buildSummary(summary, monthNow, transactionsCount) {
    return section(
      "Summary (Last 30 days & This Month)",
      `
      <table class="report-table">
        <tbody>
          <tr><th>Total Products Sold</th><td>${summary.unitsSold || 0}</td></tr>
          <tr><th>Average Sale Value</th><td>${fmtPHP(summary.avgSaleValue || 0)}</td></tr>
          <tr><th>Total Transactions</th><td>${summary.transactions || transactionsCount || 0}</td></tr>
        </tbody>
      </table>
      <h3 class="subhead">This Month (Headline)</h3>
      <table class="report-table">
        <tbody>
          <tr><th>Gross Sales</th><td>${fmtPHP(monthNow.grossSales || 0)}</td></tr>
          <tr><th>Monthly Rent Fee</th><td>${fmtPHP(monthNow.rentFee || 0)}</td></tr>
          <tr><th>Transaction Fees</th><td>${fmtPHP(monthNow.txnFees || 0)}</td></tr>
          <tr><th>Net Earning</th><td>${fmtPHP(monthNow.netEarning || 0)}</td></tr>
        </tbody>
      </table>
    `
    );
  }

  function buildTopProducts(products) {
    if (!products.length) return section("Top Products", "<p>No product data.</p>");
    return section(
      "Top Products",
      `
      <table class="report-table">
        <thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
        <tbody>
          ${products
            .map(
              (p) => `
              <tr>
                <td>${p.product_name}</td>
                <td>${p.units}</td>
                <td>${fmtPHP(p.revenue)}</td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    `
    );
  }

  function buildViews(storeViews, productViews) {
    const storeTotal = storeViews.reduce((a, b) => a + Number(b.views || 0), 0);
    const productTotal = productViews.reduce((a, b) => a + Number(b.views || 0), 0);
    return section(
      "Engagement (30 Days)",
      `
      <table class="report-table">
        <tbody>
          <tr><th>Total Store Views</th><td>${storeTotal}</td></tr>
          <tr><th>Total Product Views</th><td>${productTotal}</td></tr>
        </tbody>
      </table>
    `
    );
  }

  function buildWeekly(weekly) {
    if (!weekly.length) return section("Weekly Sales", "<p>No weekly data.</p>");
    return section(
      "Weekly Sales (Last 12 Weeks)",
      `
      <table class="report-table">
        <thead><tr><th>Week</th><th>Revenue</th><th>Orders</th><th>Units</th></tr></thead>
        <tbody>
          ${weekly
            .map(
              (w) => `
              <tr>
                <td>${new Date(w.week).toLocaleDateString("en-PH", {
                  month: "short",
                  day: "2-digit",
                })}</td>
                <td>${fmtPHP(w.revenue)}</td>
                <td>${w.orders}</td>
                <td>${w.units}</td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    `
    );
  }

  function buildDailyGrouped(daily) {
    if (!daily.length) return section("Daily Sales", "<p>No daily data.</p>");
    const months = {};
    daily.forEach((d) => {
      const m = new Date(d.day).toLocaleDateString("en-PH", {
        month: "long",
        year: "numeric",
      });
      (months[m] ||= []).push(d);
    });

    return section(
      "Daily Sales (Grouped by Month)",
      Object.entries(months)
        .map(
          ([m, arr]) => `
          <h3 class="subhead">${m}</h3>
          <table class="report-table">
            <thead><tr><th>Date</th><th>Revenue</th><th>Orders</th><th>Units</th></tr></thead>
            <tbody>
              ${arr
                .map(
                  (r) => `
                  <tr>
                    <td>${new Date(r.day).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "2-digit",
                    })}</td>
                    <td>${fmtPHP(r.revenue)}</td>
                    <td>${r.orders}</td>
                    <td>${r.units}</td>
                  </tr>
                `
                )
                .join("")}
            </tbody>
          </table>
        `
        )
        .join("")
    );
  }

  /* ---------- Report Assembly ---------- */
  function generateReportHTML() {
    const daily = readJSON("dailySalesData");
    const weekly = readJSON("weeklySalesData");
    const topProducts = readJSON("topProductsData");
    const monthNow = readJSON("monthNowData");
    const summary = readJSON("summaryData");
    const storeViews = readJSON("storeViewsData");
    const productViews = readJSON("productViewsData");
    const transactionsCount = readJSON("transactionsCountData");

    const now = new Date().toLocaleString("en-PH", { hour12: false });

    return `
      <div class="print-report">
        <header class="report-header">
          <h1>Store Analytics</h1>
          <div class="meta">Generated: ${now}</div>
          <hr>
        </header>

        ${buildSummary(summary, monthNow, transactionsCount)}
        ${buildTopProducts(topProducts)}
        ${buildViews(storeViews, productViews)}
        ${buildWeekly(weekly)}
        ${buildDailyGrouped(daily)}

        <footer class="report-footer">
          <hr>
          <div>Report generated by TECHORA Analytics — ${now}</div>
        </footer>
      </div>
    `;
  }

  /* ---------- Modal-based Print ---------- */
  function openPrintModal() {
  const container = document.getElementById("analyticsPrintContent");
  container.innerHTML = generateReportHTML();

  // add styles for clean print — REPLACE your old small style block with this
  const style = document.createElement("style");
  style.id = "analyticsPrintReportStyle";
  style.innerHTML = `
    :root { --ink:#111; --muted:#6a737d; --line:#e5e7eb; --bg:#fff; }
    .print-report { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: var(--ink); width:100%; max-width:1100px; margin:0 auto; padding:24px 28px; background:var(--bg); }
    .report-header { text-align:center; margin-bottom:10px; }
    .report-header h1 { font-size: 24px; font-weight: 700; margin-bottom:2px; }
    .report-header .meta { font-size:12px; color:var(--muted); }
    h2 { font-size:18px; margin-top:20px; margin-bottom:8px; border-bottom:2px solid #222; padding-bottom:6px; }
    .subhead { font-size:15px; margin-top:10px; color:var(--muted); }
    .report-table { width:100%; border-collapse:collapse; margin-top:6px; font-size:13px; }
    .report-table th, .report-table td { border:1px solid var(--line); padding:8px 10px; }
    .report-table th { background:#f7f7f9; text-align:left; font-weight:600; }
    .report-footer { text-align:center; font-size:11px; margin-top:18px; color:var(--muted); }

    /* Modal preview tweaks */
    #analyticsPrintModal .modal-body { padding:0 !important; }
    #analyticsPrintContent { padding:16px; }
    #analyticsPrintContent > .print-report { box-shadow:none; background:var(--bg); }

    /* ---------- Print-specific rules: show ONLY the report content ---------- */
    @media print {
      /* hide everything first */
      body * { visibility: hidden !important; }

      /* allow only the report inside the modal to be visible */
      #analyticsPrintContent, #analyticsPrintContent * { visibility: visible !important; }

      /* remove modal chrome and backdrop */
      .modal-backdrop, #analyticsPrintModal .modal-backdrop { display: none !important; visibility: hidden !important; }
      #analyticsPrintModal .modal-dialog,
      #analyticsPrintModal .modal-content,
      #analyticsPrintModal .modal-body { position: static !important; width: 100% !important; max-width: none !important; height: auto !important; overflow: visible !important; border: 0 !important; box-shadow: none !important; background: transparent !important; }

      /* hide modal header & footer chrome */
      #analyticsPrintModal .modal-header,
      #analyticsPrintModal .modal-footer,
      #analyticsPrintModal .btn-close { display: none !important; }

      /* make printed report fill page and add page padding */
      #analyticsPrintContent { padding: 0 !important; margin:0 !important; width:100% !important; }
      #analyticsPrintContent > .print-report { margin: 0 auto !important; padding: 18mm 16mm !important; max-width: 100% !important; box-shadow: none !important; background: #fff !important; }

      /* page sizing + break rules */
      @page { size: A4 portrait; margin: 0; }
      .report-table { break-inside: avoid; page-break-inside: avoid; }
      .report-table thead { display: table-header-group; } /* repeat headers across pages */
      .report-table tfoot { display: table-footer-group; }
      html, body { overflow: visible !important; height: auto !important; }
    }
  `;
  document.head.appendChild(style);

  const modalEl = document.getElementById("analyticsPrintModal");
  const bsModal = new bootstrap.Modal(modalEl, { backdrop: "static", keyboard: false });
  bsModal.show();

  const modalPrintBtn = document.getElementById("modalPrintBtn");
  modalPrintBtn.onclick = () => window.print();

  modalEl.addEventListener(
    "hidden.bs.modal",
    () => {
      container.innerHTML = "";
      // remove the injected style to avoid duplication next time
      const s = document.getElementById("analyticsPrintReportStyle");
      if (s) s.remove();
    },
    { once: true }
  );
}


  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("printAnalyticsBtn");
    if (btn) btn.addEventListener("click", openPrintModal);
  });
})();
