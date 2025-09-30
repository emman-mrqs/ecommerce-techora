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
