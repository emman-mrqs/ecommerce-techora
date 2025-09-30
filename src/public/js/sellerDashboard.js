// public/js/sellerDashboard.js
(function renderVisitsMonthly() {
  const blob = document.getElementById("visitsByMonth");
  const barsEl = document.getElementById("visits-monthly-bars");
  const labelsEl = document.getElementById("visits-monthly-labels");
  const gridEl = document.getElementById("visits-monthly-grid");
  if (!blob || !barsEl || !labelsEl || !gridEl) return;

  let data = [];
  try { data = JSON.parse(blob.textContent || "[]"); } catch { data = []; }
  if (!Array.isArray(data) || !data.length) return;

  // Nice y-axis max (1/2/5 x 10^k)
  const maxVal = Math.max(1, ...data.map(d => Number(d.views || 0)));
  const niceMax = (function n(v){
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n1 = 1 * pow, n2 = 2 * pow, n5 = 5 * pow, n10 = 10 * pow;
    if (v <= n1) return n1;
    if (v <= n2) return n2;
    if (v <= n5) return n5;
    return n10;
  })(maxVal);

  // Gridlines at 0/25/50/75/100%
  gridEl.innerHTML = "";
  [0,25,50,75,100].forEach(p => {
    const row = document.createElement("div");
    row.className = "grid-row";
    row.style.bottom = p + "%";
    row.innerHTML = `<span class="grid-label">${Math.round(niceMax * (p/100)).toLocaleString()}</span>`;
    gridEl.appendChild(row);
  });

  // Bars with value tags
  barsEl.innerHTML = "";
  data.forEach(d => {
    const v = Number(d.views || 0);
    const h = Math.round((v / niceMax) * 100);

    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = h + "%";
    bar.title = `${d.label} — ${v.toLocaleString()} visits`;

    const val = document.createElement("div");
    val.className = "bar-value";
    val.textContent = v.toLocaleString();
    bar.appendChild(val);

    barsEl.appendChild(bar);
  });

  // X labels (Jan…Dec)
  labelsEl.innerHTML = "";
  data.forEach(d => {
    const x = document.createElement("div");
    x.className = "xlabel";
    x.textContent = d.label;
    labelsEl.appendChild(x);
  });
})();
